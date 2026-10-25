from unittest import skipUnless
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import Permission
from django.db import DatabaseError, connection, transaction
from django.test import Client, TestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.operations.models import OperatorAccess
from modules.workspaces.models import (
    BillingAccount,
    ManagementPlan,
    ManagementSubscription,
)

from .models import OperatorActionEvent, OperatorSecurityEvent


class OperatorActionTests(TestCase):
    def setUp(self):
        self.actor = User.objects.create_user('actor@actions.test', is_staff=True, email_verified_at=timezone.now())
        OperatorAccess.objects.create(user=self.actor, role="admin")
        self.actor.user_permissions.add(*Permission.objects.filter(codename__in=[
            'operator_view_accounts', 'operator_view_plans', 'operator_view_subscriptions', 'operator_view_audit',
            'operator_manage_accounts', 'add_managementsubscription', 'change_managementsubscription',
        ]))
        self.owner = User.objects.create_user('owner@actions.test', email_verified_at=timezone.now())
        self.billing = BillingAccount.objects.create(owner=self.owner)
        self.plan = ManagementPlan.objects.create(code='actions-test', title='Synthetic test plan',
                                                  is_active=True, owned_workspace_limit=3)
        self.client.force_login(self.actor)
        self.proof = patch('modules.operations.actions.operator_mfa_verified', return_value=True)
        self.verify = self.proof.start()
        self.addCleanup(self.proof.stop)

    def grant(self, **overrides):
        payload = {'owner_id': str(self.owner.pk), 'plan_id': str(self.plan.pk),
                   'request_id': str(uuid4()), 'reason': 'Synthetic approved operation', 'confirm': True, **overrides}
        return self.client.post('/api/v1/operator/subscriptions/grant/', payload, content_type='application/json'), payload

    def toggle(self, target=None, **overrides):
        return self.client.post(f'/api/v1/operator/accounts/{target or self.owner.pk}/status/',
                                {'is_active': False, 'reason': 'Synthetic review', 'confirm': True, **overrides},
                                content_type='application/json')

    def test_grant_replay_and_revoke_use_existing_frozen_service(self):
        response, payload = self.grant()
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(self.client.post('/api/v1/operator/subscriptions/grant/', payload,
                                          content_type='application/json').status_code, 201)
        self.assertEqual(ManagementSubscription.objects.count(), 1)
        row = ManagementSubscription.objects.get()
        self.assertEqual(row.owned_workspace_limit, 3)
        self.assertEqual(row.events.count(), 1)
        url = f'/api/v1/operator/subscriptions/{row.pk}/revoke/'
        self.assertEqual(self.client.get(url).status_code, 405)
        self.assertEqual(self.client.post(url, {'reason': 'Synthetic revocation', 'confirm': True},
                                          content_type='application/json').status_code, 200)
        row.refresh_from_db()
        self.assertEqual(row.status, 'revoked')
        self.assertEqual(row.events.count(), 2)

    def test_mfa_and_each_action_permission_are_required(self):
        self.verify.return_value = False
        self.assertEqual(self.grant()[0].status_code, 403)
        self.assertEqual(self.toggle().status_code, 403)
        self.verify.return_value = True
        self.actor.user_permissions.remove(Permission.objects.get(codename='operator_manage_accounts'))
        self.assertEqual(self.toggle().status_code, 403)
        self.assertFalse(OperatorActionEvent.objects.exists())
        self.assertFalse(ManagementSubscription.objects.exists())

    def test_customer_status_changes_are_audited_and_idempotent(self):
        self.assertEqual(self.toggle().status_code, 200)
        self.owner.refresh_from_db()
        self.assertFalse(self.owner.is_active)
        self.assertEqual(self.toggle().status_code, 200)
        self.assertEqual(OperatorActionEvent.objects.count(), 1)
        self.assertEqual(OperatorActionEvent.objects.get().target, str(self.owner.pk))
        self.assertEqual(self.toggle(is_active=True).status_code, 200)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.is_active)

    def test_self_staff_and_superuser_accounts_are_protected(self):
        staff = User.objects.create_user('staff@actions.test', is_staff=True)
        superuser = User.objects.create_superuser('super@actions.test')
        for target in (self.actor, staff, superuser):
            self.assertEqual(self.toggle(target.pk).status_code, 403)
            target.refresh_from_db()
            self.assertTrue(target.is_active)

    def test_explicit_identity_permission_controls_contact_fields(self):
        with patch('modules.operations.views.operator_mfa_verified', return_value=True):
            url = f'/api/v1/operator/accounts/?q={self.owner.pk}'
            response = self.client.get(url)
            self.assertNotIn('email', response.json()['results'][0])
            self.actor.user_permissions.add(Permission.objects.get(codename='operator_view_identity'))
            self.assertEqual(self.client.get(url).json()['results'][0]['email'], self.owner.email)

    def test_confirmation_reason_invalid_ids_and_closed_plan_are_rejected(self):
        self.assertEqual(self.toggle(confirm=False).status_code, 400)
        self.assertEqual(self.toggle(reason='').status_code, 400)
        self.assertEqual(self.toggle(is_active='false').status_code, 400)
        self.assertEqual(self.grant(owner_id='invalid')[0].status_code, 400)
        self.plan.is_active = False
        self.plan.save(update_fields=['is_active'])
        self.assertEqual(self.grant()[0].status_code, 400)
        self.assertFalse(ManagementSubscription.objects.exists())

    def test_superuser_without_explicit_action_permission_has_no_bypass(self):
        user = User.objects.create_superuser('unassigned@actions.test')
        self.client.force_login(user)
        self.assertEqual(self.toggle().status_code, 403)
        self.assertEqual(self.grant()[0].status_code, 403)

    def test_csrf_and_private_responses(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.actor)
        self.assertEqual(client.post(f'/api/v1/operator/accounts/{self.owner.pk}/status/',
                                     {}, content_type='application/json').status_code, 403)
        response = self.toggle()
        self.assertIn('no-store', response['Cache-Control'])

    def test_audit_excludes_free_text_reason_and_contact_data(self):
        self.toggle(reason='Private reason that must not appear in list summaries')
        with patch('modules.operations.views.operator_mfa_verified', return_value=True):
            response = self.client.get('/api/v1/operator/audit/')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertNotIn('Private reason', response.content.decode())
        self.assertNotIn(self.owner.email, response.content.decode())
        self.assertTrue(any(row['event_type'] == 'account_status_changed' for row in response.json()['results']))

    @skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL append-only triggers')
    def test_bulk_updates_and_deletes_cannot_rewrite_operator_events(self):
        self.toggle()
        OperatorSecurityEvent.objects.create(actor=self.actor, event_type='verified')
        for model in (OperatorActionEvent, OperatorSecurityEvent):
            with self.subTest(model=model.__name__):
                with self.assertRaises(DatabaseError), transaction.atomic():
                    model.objects.all().update(created_at=timezone.now())
                with self.assertRaises(DatabaseError), transaction.atomic():
                    model.objects.all().delete()
