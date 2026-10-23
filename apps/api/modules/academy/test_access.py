from datetime import timedelta
from uuid import uuid4
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .access import AcademyAccess
from .models import AcademyArea, AcademyPlan, AcademySubscription, SubscriptionArea, AcademyOrder, AcademyOrderItem, AcademyOrderArea, FreeSample, LearningProgress
from .projection import curriculum
from .subscriptions import fulfill_paid_order


class AcademyAccessTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('sync_academy_catalog', seed_free_samples=True, verbosity=0)
        cls.user = get_user_model().objects.create_user('access-reader@example.test')
        cls.other = get_user_model().objects.create_user('access-other@example.test')

    def setUp(self):
        self.client = APIClient()

    def grant(self, kind, user=None, **extra):
        return AcademySubscription.objects.create(user=user or self.user, plan=AcademyPlan.objects.get(code=kind), coverage=kind, starts_at=timezone.now()-timedelta(minutes=1), reason='Test grant', **extra)

    def get_unit(self, id):
        return self.client.get(f'/api/v1/academy/content/{id}/')

    def test_guest_and_free_user_receive_only_selected_cards(self):
        for user in [None, self.user]:
            self.client.force_authenticate(user)
            response = self.get_unit('C01-ST01-L01')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['access']['accessLevel'], 'sample')
            self.assertEqual(len(response.data['learning_cards']), 2)
            self.assertEqual(response.data['questions'], [])
            self.assertNotIn('practice_activity', response.data)
            self.assertIn('no-store', response['Cache-Control'])
        self.assertEqual(self.get_unit('S07-C1-ST01-L01').data['learning_cards'], [])

    def test_general_plan_and_full_plan_have_distinct_scope(self):
        self.grant('general')
        self.client.force_authenticate(self.user)
        self.assertTrue(self.get_unit('C03-ST01-L01').data['access']['hasFullAccess'])
        self.assertFalse(self.get_unit('S07-C1-ST01-L01').data['access']['hasAccess'])
        self.grant('full')
        self.assertTrue(self.get_unit('S07-C1-ST01-L01').data['access']['hasFullAccess'])
        self.client.force_authenticate(self.other)
        self.assertFalse(self.get_unit('S07-C1-ST01-L01').data['access']['hasAccess'])

    def test_multiple_specializations_union_without_unlocking_general(self):
        for area in ['S01', 'S07']:
            sub = self.grant('specialty')
            SubscriptionArea.objects.create(subscription=sub, area_id=area)
        access = AcademyAccess(self.user)
        self.assertTrue(access.has_full_course('S01-C1'))
        self.assertTrue(access.has_full_course('S07-C1'))
        self.assertFalse(access.has_full_course('C01'))
        self.assertFalse(access.has_full_course('S02-C1'))

    def test_expiry_revocation_future_dates_and_disabled_area(self):
        for kwargs in [{'ends_at': timezone.now()-timedelta(seconds=1)}, {'status': 'revoked'}]:
            self.grant('full', **kwargs)
        future = self.grant('full')
        future.starts_at = timezone.now()+timedelta(days=1)
        future.save()
        self.assertFalse(AcademyAccess(self.user).has_full_course('S07-C1'))
        self.grant('full')
        AcademyArea.objects.filter(pk='S07').update(is_active=False)
        self.assertFalse(AcademyAccess(self.user).has_full_course('S07-C1'))

    def test_assessment_and_paid_cards_reject_direct_requests(self):
        unit = curriculum()[1]['C01-ST01-L01']
        response = self.client.post('/api/v1/academy/units/C01-ST01-L01/answer/', {'content_revision': unit['revision'], 'question_id': 'activity', 'answer': 'anything'}, format='json')
        self.assertEqual(response.status_code, 403)
        self.client.force_authenticate(self.user)
        response = self.client.patch('/api/v1/academy/units/C01-ST01-L01/', {'content_revision': unit['revision'], 'revision': 0, 'expected_user_id': str(self.user.pk), 'card_id': unit['learning_cards'][3]['id']}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_catalog_reports_real_access_and_preserves_all_content_ids(self):
        response = self.client.get('/api/v1/academy/catalog/')
        self.assertEqual(len(response.data['courses']), 44)
        self.assertEqual(sum(len(s['lessons']) for c in response.data['courses'] for s in c['stages']), 592)
        general_lessons = [l for c in response.data['courses'] if c['path_id'] == 'GENERAL' for s in c['stages'] for l in s['lessons']]
        self.assertTrue(all(l['access']['accessLevel'] == 'sample' for l in general_lessons))
        specialty_samples = [l for c in response.data['courses'] if c['path_id'].startswith('S') for s in c['stages'] for l in s['lessons'] if l['access']['hasAccess']]
        self.assertEqual(len(specialty_samples), 1)

    def test_full_projection_never_discloses_assessment_keys(self):
        self.grant('full')
        self.client.force_authenticate(self.user)
        def check(value):
            if isinstance(value, dict):
                self.assertFalse({'correct_option_id', 'answer', 'solution', 'rubric', 'feedback'} & value.keys())
                for child in value.values(): check(child)
            elif isinstance(value, list):
                for child in value: check(child)
        for unit in curriculum()[1].values(): check(unit)

    def test_media_is_guarded_by_unit_and_card(self):
        unit = next(u for u in curriculum()[1].values() if u.get('media_plan', {}).get('assets') and u['course_id'].startswith('S07'))
        name = unit['media_plan']['assets'][0]['asset_ref'].split('/')[-1]
        self.assertEqual(self.client.get(f"/api/v1/academy/media/{unit['id']}/{name}/").status_code, 403)
        self.grant('full')
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(f"/api/v1/academy/media/{unit['id']}/{name}/").status_code, 200)

    def test_pending_order_cannot_grant_access_and_request_is_idempotent(self):
        self.client.force_authenticate(self.user)
        data = {'request_id': str(uuid4()), 'plan_id': AcademyPlan.objects.get(code='specialty').pk, 'area_ids': ['S07', 'S01']}
        response = self.client.post('/api/v1/academy/orders/', data, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.post('/api/v1/academy/orders/', data, format='json').data['id'], response.data['id'])
        self.assertEqual(AcademyOrder.objects.count(), 1)
        self.assertFalse(AcademyAccess(self.user).has_full_course('S07-C1'))
        with self.assertRaises(ValidationError): fulfill_paid_order(response.data['id'])
        data['area_ids'] = ['GENERAL']
        self.assertEqual(self.client.post('/api/v1/academy/orders/', data, format='json').status_code, 400)

    def test_paid_order_fulfillment_uses_immutable_snapshot_and_is_idempotent(self):
        plan = AcademyPlan.objects.get(code='specialty')
        order = AcademyOrder.objects.create(user=self.user, request_id=uuid4(), status='paid', paid_at=timezone.now())
        item = AcademyOrderItem.objects.create(order=order, plan=plan, plan_title=plan.title, plan_kind='specialty', unit_price=100, currency='IRR', duration_days=30)
        AcademyOrderArea.objects.create(item=item, area_id='S07')
        plan.kind = 'full'; plan.save()
        first = fulfill_paid_order(order.pk)[0]
        self.assertEqual(fulfill_paid_order(order.pk)[0].pk, first.pk)
        self.assertTrue(AcademyAccess(self.user).has_full_course('S07-C1'))
        self.assertFalse(AcademyAccess(self.user).has_full_course('S02-C1'))
        order.status = 'refunded'; order.save()
        self.assertFalse(AcademyAccess(self.user).has_full_course('S07-C1'))

    def test_expired_subscription_does_not_reveal_previous_answer_keys(self):
        unit = curriculum()[1]['C01-ST01-L01']
        LearningProgress.objects.create(user=self.user, unit_id=unit['id'], content_revision=unit['revision'], note='My note', responses={'q': {'result': {'correct_option_id': 'secret'}}})
        self.client.force_authenticate(self.user)
        row = self.client.get('/api/v1/academy/state/').data['units'][unit['id']]
        self.assertEqual(row['responses'], {})
        self.assertEqual(row['note'], 'My note')

    def test_csrf_and_cross_account_order_replay_are_rejected(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.user)
        data = {'request_id': str(uuid4()), 'plan_id': AcademyPlan.objects.get(code='full').pk, 'area_ids': []}
        self.assertEqual(client.post('/api/v1/academy/orders/', data, format='json').status_code, 403)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.post('/api/v1/academy/orders/', data, format='json').status_code, 201)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post('/api/v1/academy/orders/', data, format='json').status_code, 409)

    def test_paid_specialty_cannot_expand_beyond_purchased_scope(self):
        plan = AcademyPlan.objects.get(code='specialty')
        order = AcademyOrder.objects.create(user=self.user, request_id=uuid4(), status='paid', paid_at=timezone.now())
        item = AcademyOrderItem.objects.create(order=order, plan=plan, plan_title=plan.title, plan_kind='specialty', unit_price=100, currency='IRR', duration_days=30)
        AcademyOrderArea.objects.create(item=item, area_id='S07')
        sub = fulfill_paid_order(order.pk)[0]
        SubscriptionArea.objects.create(subscription=sub, area_id='S02')
        self.assertFalse(AcademyAccess(self.user).has_full_course('S02-C1'))
