"""Real persistence and negative permission/retry tests for operator Academy actions."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import Permission
from django.db import close_old_connections, connection
from django.test import Client, TestCase, TransactionTestCase
from django.utils import timezone

from modules.academy.access import AcademyAccess
from modules.academy.account_summary import plans_payload
from modules.academy.models import (
    AcademyArea,
    AcademyCard,
    AcademyCourse,
    AcademyOrder,
    AcademyOrderItem,
    AcademyPlan,
    AcademySubscription,
    AcademyUnit,
    FreeSample,
)
from modules.accounts.models import User

from .models import OperatorAccess, OperatorActionEvent


@patch('modules.operations.academy_access.operator_mfa_verified', return_value=True)
class AcademyOperatorAccessTests(TestCase):
    def setUp(self):
        self.actor = User.objects.create_user('operator@academy.test', is_staff=True, email_verified_at=timezone.now())
        OperatorAccess.objects.create(user=self.actor, role='admin')
        for code in ('operator_view_academy_samples', 'operator_view_academy_subscriptions', 'add_freesample',
                     'change_freesample', 'add_academysubscription', 'change_academysubscription'):
            self.actor.user_permissions.add(Permission.objects.get(codename=code))
        self.client.force_login(self.actor)
        self.user = User.objects.create_user('learner@academy.test', email_verified_at=timezone.now())
        self.general = AcademyArea.objects.create(id='GENERAL', title='General', kind='general')
        self.area = AcademyArea.objects.create(id='strategy', title='Strategy', kind='specialty')
        self.other_area = AcademyArea.objects.create(id='finance', title='Finance', kind='specialty')
        self.units = []
        for n, area in enumerate((self.general, self.area, self.other_area)):
            course = AcademyCourse.objects.create(id=f'C{n}', title='Course', area=area)
            unit = AcademyUnit.objects.create(id=f'L{n}', title=f'Lesson {n}', course=course, kind='lesson')
            for i in range(3):
                AcademyCard.objects.create(id=f'L{n}-C{i}', title=f'Card {i}', unit=unit, order=i)
            self.units.append(unit)
        self.plan = AcademyPlan.objects.create(code='general-manual', title='General', kind='general')
        self.specialty_plan = AcademyPlan.objects.create(code='specialty-manual', title='Specialty', kind='specialty')
        self.samples = '/api/v1/operator/academy_samples/configure/'
        self.grants = '/api/v1/operator/academy_subscriptions/grant/'

    def grant_data(self, **changes):
        return {'request_id': str(uuid4()), 'user_id': str(self.user.pk), 'plan_id': self.plan.pk, 'areas': [],
                'starts_at': (timezone.now() - timedelta(minutes=1)).isoformat(),
                'ends_at': (timezone.now() + timedelta(days=10)).isoformat(), 'reason': 'Manual approval', 'confirm': True, **changes}

    def post(self, path, data):
        return self.client.post(path, data, content_type='application/json')

    def sample_data(self, unit='L0', **changes):
        current = self.client.get(self.samples, {'unit_id': unit}).json()
        return {'unit_id': unit, 'version': current['version'], 'count': 2, 'reason': 'Sample approval', **changes}

    def test_sample_prefix_is_exact_and_learner_projection_changes(self, _mfa):
        self.assertEqual(self.post(self.samples, self.sample_data()).status_code, 200)
        self.assertEqual(set(FreeSample.objects.filter(is_active=True).values_list('card_id', flat=True)), {'L0-C0', 'L0-C1'})
        catalog = {'courses': [{'id': 'C0', 'path_id': 'GENERAL'}]}
        with patch('modules.academy.access.curriculum', return_value=(catalog, {})):
            access = AcademyAccess(self.user)
            projected = access.project_unit({'id': 'L0', 'course_id': 'C0', 'learning_cards': [{'id': f'L0-C{i}'} for i in range(3)], 'questions': [{'secret': True}], 'activity': {'secret': True}})
        self.assertEqual([c['id'] for c in projected['learning_cards']], ['L0-C0', 'L0-C1'])
        self.assertEqual(projected['questions'], [])
        self.assertNotIn('activity', projected)
        self.assertEqual(OperatorActionEvent.objects.get().event_type, 'academy_samples_updated')

    def test_specialty_selection_replaces_previous_lesson_and_rejects_stale_editor(self, _mfa):
        stale = self.sample_data('L2')
        self.assertEqual(self.post(self.samples, self.sample_data('L1')).status_code, 200)
        self.assertEqual(self.post(self.samples, stale).status_code, 409)
        self.assertEqual(self.post(self.samples, self.sample_data('L2', count=1)).status_code, 200)
        self.assertEqual(list(FreeSample.objects.filter(is_active=True).values_list('card_id', flat=True)), ['L2-C0'])
        self.assertEqual(self.post(self.samples, self.sample_data('L2', count=0)).status_code, 200)
        self.assertFalse(FreeSample.objects.filter(is_active=True).exists())

    def test_samples_noop_is_not_a_second_audit_and_invalid_count_is_rejected(self, _mfa):
        self.assertEqual(self.post(self.samples, self.sample_data()).status_code, 200)
        self.assertEqual(self.post(self.samples, self.sample_data()).status_code, 200)
        self.assertEqual(OperatorActionEvent.objects.count(), 1)
        for value in (-1, True, '2', 4, 1.5, None):
            self.assertEqual(self.post(self.samples, self.sample_data(count=value)).status_code, 400)
        self.assertEqual(FreeSample.objects.filter(is_active=True).count(), 2)

    def test_search_and_detail_only_expose_metadata_and_exclude_reviews(self, _mfa):
        AcademyUnit.objects.create(id='review', title='Review', course=self.units[0].course, kind='final_review')
        response = self.client.get(self.samples, {'q': 'Lesson'})
        self.assertEqual(len(response.json()['units']), 3)
        self.assertEqual(set(response.json()['units'][0]), {'id', 'title', 'course_id'})
        self.assertEqual(self.client.get(self.samples, {'unit_id': 'review'}).status_code, 404)
        self.assertEqual(self.client.get(self.samples, {'q': 'x' * 161}).status_code, 400)

    def test_grant_retry_is_bound_to_actor_user_and_payload(self, _mfa):
        data = self.grant_data()
        self.assertEqual(self.post(self.grants, data).status_code, 201)
        self.assertEqual(self.post(self.grants, data).status_code, 200)
        self.assertEqual(self.post(self.grants, {**data, 'reason': 'Another approval'}).status_code, 409)
        self.assertEqual(AcademySubscription.objects.count(), 1)
        self.assertEqual(OperatorActionEvent.objects.count(), 1)
        self.assertEqual(plans_payload(self.user)['access_summary']['general'], True)
        self.assertFalse(AcademyOrder.objects.exists())
        self.assertEqual(self.client.post(self.grants, data, content_type='application/json')['Cache-Control'], 'private, no-store')

    def test_specialty_grant_preserves_selected_coverage_after_plan_edit(self, _mfa):
        data = self.grant_data(plan_id=self.specialty_plan.pk, areas=['strategy', 'finance'])
        self.assertEqual(self.post(self.grants, data).status_code, 201)
        self.specialty_plan.kind = 'full'
        self.specialty_plan.save()
        self.assertEqual(plans_payload(self.user)['access_summary']['area_ids'], ['finance', 'strategy'])
        self.assertFalse(plans_payload(self.user)['access_summary']['full'])
        self.assertEqual(self.post(self.grants, data).status_code, 200)

    def test_invalid_grants_do_not_create_access(self, _mfa):
        for change in ({'plan_id': True}, {'areas': ['strategy']}, {'confirm': False}, {'reason': ''},
                       {'starts_at': '2026-10-26T12:00:00'}, {'ends_at': '2000-01-01T00:00:00Z'},
                       {'user_id': 'not-uuid'}, {'plan_id': self.specialty_plan.pk},
                       {'plan_id': self.specialty_plan.pk, 'areas': ['missing']},
                       {'plan_id': self.specialty_plan.pk, 'areas': ['strategy', 'strategy']},
                       {'plan_id': self.specialty_plan.pk, 'areas': ['GENERAL']}):
            with self.subTest(change=change):
                self.assertEqual(self.post(self.grants, self.grant_data(**change)).status_code, 400)
        self.assertFalse(AcademySubscription.objects.exists())
        self.assertFalse(OperatorActionEvent.objects.exists())

    def test_scheduled_expired_and_revoked_grants_are_not_effective(self, _mfa):
        now = timezone.now()
        scheduled = self.grant_data(starts_at=(now + timedelta(days=1)).isoformat(), ends_at=None)
        expired = self.grant_data(starts_at=(now - timedelta(days=3)).isoformat(), ends_at=(now - timedelta(days=1)).isoformat())
        for data in (scheduled, expired):
            self.assertEqual(self.post(self.grants, data).status_code, 201)
        summary = plans_payload(self.user)
        self.assertFalse(summary['access_summary']['general'])
        self.assertEqual({s['status'] for s in summary['subscriptions']}, {'expired', 'scheduled'})

    def test_revoke_is_revision_checked_audited_and_preserves_order(self, _mfa):
        order = AcademyOrder.objects.create(user=self.user, request_id=uuid4(), status='paid')
        item = AcademyOrderItem.objects.create(order=order, plan=self.plan, plan_title='Purchased', plan_kind='general', currency='IRR')
        row = AcademySubscription.objects.create(user=self.user, plan=self.plan, coverage='general', order_item=item, starts_at=timezone.now())
        url = f'/api/v1/operator/academy_subscriptions/{row.pk}/'
        data = {'version': self.client.get(url).json()['version'], 'reason': 'Explicit revocation', 'confirm': True}
        self.assertEqual(self.post(url, {**data, 'version': 'stale'}).status_code, 409)
        self.assertEqual(self.post(url, data).status_code, 200)
        self.assertEqual(self.post(url, data).status_code, 409)
        data['version'] = self.client.get(url).json()['version']
        self.assertEqual(self.post(url, data).status_code, 200)
        self.assertEqual(OperatorActionEvent.objects.filter(event_type='academy_access_revoked').count(), 1)
        order.refresh_from_db()
        self.assertEqual(order.status, 'paid')
        self.assertFalse(plans_payload(self.user)['access_summary']['general'])

    def test_read_and_write_permissions_are_both_required(self, _mfa):
        self.actor.user_permissions.remove(Permission.objects.get(codename='change_freesample'))
        self.assertEqual(self.client.get(self.samples).status_code, 403)
        self.actor.user_permissions.remove(Permission.objects.get(codename='operator_view_academy_subscriptions'))
        self.assertEqual(self.post(self.grants, self.grant_data()).status_code, 403)
        self.actor.is_superuser = True
        self.actor.save()
        self.assertEqual(self.client.get(self.grants).status_code, 403)

    def test_inventory_effective_access_matches_refunded_purchase_and_inactive_specialty(self, _mfa):
        self.assertEqual(self.post(self.grants, self.grant_data(plan_id=self.specialty_plan.pk, areas=['strategy'])).status_code, 201)
        self.area.is_active = False
        self.area.save()
        order = AcademyOrder.objects.create(user=self.user, request_id=uuid4(), status='paid')
        item = AcademyOrderItem.objects.create(order=order, plan=self.plan, plan_title='Purchased', plan_kind='general', currency='IRR')
        AcademySubscription.objects.create(user=self.user, plan=self.plan, coverage='general', order_item=item, starts_at=timezone.now())
        order.status = 'refunded'
        order.save()
        with patch('modules.operations.views.operator_mfa_verified', return_value=True):
            rows = self.client.get('/api/v1/operator/academy_subscriptions/').json()['results']
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(not row['is_effective'] for row in rows))

    def test_no_mfa_or_inactive_approval_cannot_read_or_mutate(self, _mfa):
        with patch('modules.operations.academy_access.operator_mfa_verified', return_value=False):
            self.assertEqual(self.client.get(self.grants).status_code, 403)
            self.assertEqual(self.post(self.grants, self.grant_data()).status_code, 403)
        OperatorAccess.objects.filter(user=self.actor).update(is_active=False)
        self.assertEqual(self.client.get(self.samples).status_code, 403)

    def test_anonymous_csrf_and_unknown_fields_are_rejected(self, _mfa):
        self.assertEqual(self.post(self.grants, {**self.grant_data(), 'status': 'paid'}).status_code, 400)
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.actor)
        self.assertEqual(client.post(self.grants, self.grant_data(), content_type='application/json').status_code, 403)
        self.client.logout()
        self.assertEqual(self.client.get(self.samples).status_code, 401)

    def test_audit_failure_rolls_back_sample_and_grant(self, _mfa):
        sample = self.sample_data()
        with patch('modules.operations.academy_access.OperatorActionEvent.objects.create', side_effect=RuntimeError('audit unavailable')):
            with self.assertRaises(RuntimeError):
                self.post(self.samples, sample)
            with self.assertRaises(RuntimeError):
                self.post(self.grants, self.grant_data())
        self.assertFalse(FreeSample.objects.exists())
        self.assertFalse(AcademySubscription.objects.exists())


class AcademyOperatorConcurrencyTests(TransactionTestCase):
    def setUp(self):
        AcademyOperatorAccessTests.setUp(self)

    def concurrently(self, url, payloads):
        def send(payload):
            close_old_connections()
            try:
                client = Client()
                client.force_login(self.actor)
                return client.post(url, payload, content_type='application/json').status_code
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as executor:
            return list(executor.map(send, payloads))

    @patch('modules.operations.academy_access.operator_mfa_verified', return_value=True)
    def test_simultaneous_identical_grants_create_one_subscription(self, _mfa):
        if connection.vendor != 'postgresql':
            self.skipTest('PostgreSQL row-locking acceptance')
        data = AcademyOperatorAccessTests.grant_data(self)
        self.assertEqual(sorted(self.concurrently(self.grants, [data, data])), [200, 201])
        self.assertEqual(AcademySubscription.objects.count(), 1)
        self.assertEqual(OperatorActionEvent.objects.count(), 1)

    @patch('modules.operations.academy_access.operator_mfa_verified', return_value=True)
    def test_simultaneous_specialty_edits_cannot_enable_two_lessons(self, _mfa):
        if connection.vendor != 'postgresql':
            self.skipTest('PostgreSQL row-locking acceptance')
        payloads = [AcademyOperatorAccessTests.sample_data(self, unit) for unit in ('L1', 'L2')]
        self.assertEqual(sorted(self.concurrently(self.samples, payloads)), [200, 409])
        self.assertEqual(FreeSample.objects.filter(is_active=True).values('card__unit').distinct().count(), 1)
