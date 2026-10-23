import json
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import Client, TestCase
from django.utils import timezone
from modules.accounts.models import AccountAvatar
from modules.academy.models import AcademyPlan, AcademySubscription, SubscriptionArea, AcademyOrder, AcademyOrderItem
from modules.academy.subscriptions import fulfill_paid_order
from modules.academy.access import AcademyAccess


class AvatarAndSubscriptionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('sync_academy_catalog', seed_free_samples=True, verbosity=0)
        cls.user = get_user_model().objects.create_user('profile-reader@example.test', first_name='ندا', last_name='احمدی', email_verified_at=timezone.now(), phone_number='+989121234567', phone_verified_at=timezone.now(), profile_completed_at=timezone.now())
        cls.other = get_user_model().objects.create_user('profile-other@example.test', email_verified_at=timezone.now())

    def setUp(self):
        self.client.force_login(self.user)

    def patch(self, data, client=None):
        return (client or self.client).patch('/api/v1/account/profile/', json.dumps(data), content_type='application/json')

    def grant(self, coverage, **extra):
        return AcademySubscription.objects.create(user=self.user, plan=AcademyPlan.objects.get(code=coverage), coverage=coverage, starts_at=timezone.now()-timedelta(days=1), reason='Test grant', **extra)

    def test_catalog_has_twenty_valid_choices_and_avatar_survives_profile_and_session(self):
        rows = Client().get('/api/v1/account/avatars/').json()['avatars']
        self.assertEqual(len(rows), 20)
        self.assertEqual({row['sprite_index'] for row in rows}, set(range(20)))
        response = self.patch({'avatar_id': rows[7]['id'], 'phone_number': '۰۹۱۲۱۲۳۴۵۶۷', 'expected_user_id': str(self.user.pk)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['avatar']['sprite_index'], 7)
        self.assertTrue(response.json()['phone_verified'], 'Equivalent phone formatting must not discard verification')
        self.assertEqual(self.client.get('/api/v1/session/').json()['user']['avatar']['id'], rows[7]['id'])
        self.other.refresh_from_db()
        self.assertIsNone(self.other.avatar_id)
        self.assertIn('no-store', self.client.get('/api/v1/account/profile/')['Cache-Control'])

    def test_invalid_inactive_or_cross_account_update_never_partially_saves(self):
        avatar = AccountAvatar.objects.get(sprite_index=2, is_active=True)
        avatar.is_active = False; avatar.save()
        for data in [{'avatar_id': 'https://untrusted.example/photo.png'}, {'avatar_id': avatar.pk}, {'avatar_id': 'elon-musk', 'first_name': ''}, {'avatar_id': 'elon-musk', 'is_staff': True}]:
            self.assertEqual(self.patch(data).status_code, 400)
        self.assertEqual(self.patch({'avatar_id': 'elon-musk', 'expected_user_id': str(self.other.pk)}).status_code, 409)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.avatar_id)
        self.assertEqual(self.user.first_name, 'ندا')
        self.assertEqual(Client().get('/api/v1/account/subscriptions/').status_code, 401)
        csrf_client = Client(enforce_csrf_checks=True); csrf_client.force_login(self.user)
        self.assertEqual(self.patch({'avatar_id': 'elon-musk'}, csrf_client).status_code, 403)

    def test_changing_phone_resets_verification_and_onboarding_can_store_avatar(self):
        response = self.patch({'phone_number': '09121112222'})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['phone_verified'])
        self.client.force_login(self.other)
        response = self.client.post('/api/v1/account/complete-profile/', json.dumps({'first_name':'سامان','last_name':'رضایی','phone_number':'09121112222','avatar_id':'melinda-french-gates','expected_user_id':str(self.other.pk)}), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.other.refresh_from_db()
        self.assertEqual(self.other.avatar_id, 'melinda-french-gates')
        self.assertFalse(self.other.requires_profile_completion)
        self.assertIsNone(self.other.phone_verified_at)

    def test_subscription_summary_is_owner_scoped_and_matches_actual_access(self):
        for area in ['S01', 'S02']:
            sub = self.grant('specialty')
            SubscriptionArea.objects.create(subscription=sub, area_id=area)
        self.grant('general', ends_at=timezone.now()-timedelta(hours=1))
        future = self.grant('full', status='revoked')
        future.starts_at = timezone.now()+timedelta(days=1); future.save()
        hidden = AcademySubscription.objects.create(user=self.other, plan=AcademyPlan.objects.get(code='full'), coverage='full', starts_at=timezone.now(), reason='Other owner')
        other_order = AcademyOrder.objects.create(user=self.other, request_id=__import__('uuid').uuid4())
        response = self.client.get('/api/v1/account/subscriptions/')
        data = response.json()['academy']
        self.assertEqual(data['access_summary']['area_ids'], ['S01', 'S02'])
        self.assertFalse(data['access_summary']['general'])
        self.assertEqual(next(row['status'] for row in data['subscriptions'] if row['id']==str(future.pk)), 'revoked')
        self.assertNotIn(str(hidden.pk), [row['id'] for row in data['subscriptions']])
        self.assertNotIn(str(other_order.pk), [row['id'] for row in data['orders']])
        self.assertTrue(AcademyAccess(self.user).has_full_course('S01-C1'))
        self.assertFalse(AcademyAccess(self.user).has_full_course('C01'))
        self.assertIn('no-store', response['Cache-Control'])
        self.assertEqual(response['Vary'], 'Cookie')

    def test_purchase_snapshot_and_refund_status_are_used_in_account(self):
        plan = AcademyPlan.objects.get(code='general')
        order = AcademyOrder.objects.create(user=self.user, request_id=__import__('uuid').uuid4(), status='paid', paid_at=timezone.now())
        item = AcademyOrderItem.objects.create(order=order, plan=plan, plan_title='عنوان زمان خرید', plan_kind='general', unit_price=100, total=90, discount_amount=10, currency='IRR', duration_days=30)
        sub = fulfill_paid_order(order.pk)[0]
        plan.title = 'عنوان جدید'; plan.save()
        data = self.client.get('/api/v1/account/subscriptions/').json()['academy']
        self.assertEqual(data['subscriptions'][0]['title'], 'عنوان زمان خرید')
        self.assertEqual(data['orders'][0]['items'][0]['total'], 90)
        self.assertTrue(data['access_summary']['general'])
        order.status='refunded'; order.save()
        data = self.client.get('/api/v1/account/subscriptions/').json()['academy']
        self.assertEqual(next(row['status'] for row in data['subscriptions'] if row['id']==str(sub.pk)), 'revoked')
        self.assertFalse(data['access_summary']['general'])
        self.assertFalse(AcademyAccess(self.user).has_full_course('C01'))
