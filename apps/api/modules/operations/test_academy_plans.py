from unittest.mock import patch
from uuid import uuid4
from django.contrib.auth.models import Permission
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from modules.accounts.models import User
from modules.academy.models import AcademyPlan, AcademyOrder, AcademyOrderItem
from .models import OperatorAccess, OperatorActionEvent


@patch('modules.operations.academy_plans.operator_mfa_verified', return_value=True)
class AcademyPlanEditTests(TestCase):
    def setUp(self):
        self.actor = User.objects.create_user('editor@plans.test', is_staff=True, email_verified_at=timezone.now())
        self.access = OperatorAccess.objects.create(user=self.actor, role='admin')
        self.actor.user_permissions.add(
            Permission.objects.get(codename='operator_view_academy_plans'),
            Permission.objects.get(codename='change_academyplan'))
        self.client.force_login(self.actor)
        self.plan = AcademyPlan.objects.create(code='full', title='Before', kind='full', price=100000, sale_price=90000, duration_days=365)
        self.url = f'/api/v1/operator/academy_plans/{self.plan.pk}/'

    def data(self, **changes):
        data = self.client.get(self.url).json()
        return {**{key: data[key] for key in ('title', 'is_active', 'price', 'sale_price', 'duration_days', 'version')}, 'reason': 'Catalog update', **changes}

    def save(self, data):
        return self.client.patch(self.url, data, content_type='application/json')

    def test_edit_is_audited_and_public_catalog_reads_same_values(self, _mfa):
        response = self.save(self.data(title='New title', price=200000, sale_price=160000, duration_days=365))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        event = OperatorActionEvent.objects.get(event_type='academy_plan_updated')
        self.assertEqual(event.actor, self.actor)
        self.assertEqual(event.details['before']['price'], 100000)
        self.assertEqual(event.details['after']['price'], 200000)
        public = self.client.get('/api/v1/academy/plans/').json()['plans'][0]
        self.assertEqual((public['title'], public['price'], public['sale_price'], public['duration_days']), ('New title', 200000, 160000, 365))

    def test_existing_purchase_snapshot_is_preserved(self, _mfa):
        order = AcademyOrder.objects.create(user=self.actor, request_id=uuid4())
        item = AcademyOrderItem.objects.create(order=order, plan=self.plan, plan_title='Purchased', plan_kind='full', original_unit_price=100000, unit_price=90000, subtotal=90000, total=90000, currency='IRR', duration_days=30)
        self.assertEqual(self.save(self.data(price=300000, sale_price=None, duration_days=365)).status_code, 200)
        item.refresh_from_db()
        self.assertEqual((item.plan_title, item.unit_price, item.duration_days), ('Purchased', 90000, 30))

    def test_stale_editor_cannot_overwrite_and_retry_is_not_duplicated(self, _mfa):
        stale = self.data()
        self.assertEqual(self.save({**stale, 'price': 200000}).status_code, 200)
        self.assertEqual(self.save({**stale, 'price': 400000}).status_code, 409)
        self.assertEqual(self.save(self.data()).status_code, 200)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.price, 200000)
        self.assertEqual(OperatorActionEvent.objects.filter(event_type='academy_plan_updated').count(), 1)

    def test_invalid_values_leave_plan_and_audit_unchanged(self, _mfa):
        for change in ({'price': -1}, {'price': True}, {'price': 1.5}, {'price': '200'}, {'price': 10**16}, {'price': None}, {'sale_price': 200000}, {'duration_days': 0}, {'duration_days': True}, {'duration_days': 36501}, {'title': ''}, {'reason': ''}, {'currency': 'USD'}, {'kind': 'free'}):
            with self.subTest(change=change):
                self.assertEqual(self.save(self.data(**change)).status_code, 400)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.price, 100000)
        self.assertFalse(OperatorActionEvent.objects.exists())

    def test_clear_price_discount_duration_and_inactive_catalog(self, _mfa):
        self.assertEqual(self.save(self.data(price=None, sale_price=None, duration_days=365, is_active=False)).status_code, 200)
        self.assertEqual(self.client.get('/api/v1/academy/plans/').json()['plans'], [])

    def test_nonannual_special_plan_update_is_rejected_without_audit(self, _mfa):
        for days in (None, 30, 366):
            self.assertEqual(self.save(self.data(duration_days=days)).status_code, 400)
        self.assertFalse(OperatorActionEvent.objects.exists())

    def test_free_plan_cannot_gain_a_price(self, _mfa):
        self.plan.kind = 'free'
        self.plan.price = None
        self.plan.sale_price = None
        self.plan.save()
        self.assertEqual(self.save(self.data(price=100)).status_code, 400)

    def test_read_only_admin_cannot_edit(self, _mfa):
        self.actor.user_permissions.remove(Permission.objects.get(codename='change_academyplan'))
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.save({}).status_code, 403)

    def test_edit_permission_without_section_does_not_grant_access(self, _mfa):
        self.actor.user_permissions.remove(Permission.objects.get(codename='operator_view_academy_plans'))
        self.assertEqual(self.client.get(self.url).status_code, 403)

    @override_settings(OPERATOR_OWNER_EMAILS=('editor@plans.test',))
    def test_approved_founder_can_edit_without_extra_grant(self, _mfa):
        self.access.role = 'owner'
        self.access.save()
        self.actor.user_permissions.remove(Permission.objects.get(codename='change_academyplan'))
        self.assertEqual(self.save(self.data(title='Founder update')).status_code, 200)

    def test_mfa_and_active_approval_are_required(self, _mfa):
        with patch('modules.operations.academy_plans.operator_mfa_verified', return_value=False):
            self.assertEqual(self.client.get(self.url).status_code, 403)
        self.access.is_active = False
        self.access.save()
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_csrf_and_authentication_are_required(self, _mfa):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.actor)
        self.assertEqual(client.patch(self.url, {}, content_type='application/json').status_code, 403)
        self.client.logout()
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_audit_failure_rolls_back_the_edit(self, _mfa):
        data = self.data(price=200000)
        with patch('modules.operations.academy_plans.OperatorActionEvent.objects.create', side_effect=RuntimeError('audit unavailable')):
            with self.assertRaises(RuntimeError):
                self.save(data)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.price, 100000)
