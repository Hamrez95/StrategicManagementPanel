from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import Permission
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from modules.accounts.models import User

from .models import (
    BillingAccount,
    ManagementPlan,
    ManagementSubscription,
    ManagementSubscriptionEvent,
)


@override_settings(PRODUCTION=False, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ManagementAdminTests(TestCase):
    def setUp(self):
        self.operator = User.objects.create_user('management-operator@example.test', is_staff=True,
                                                 email_verified_at=timezone.now())
        permissions = Permission.objects.filter(content_type__app_label='workspaces', codename__in=[
            'view_managementplan', 'view_billingaccount', 'view_managementsubscription',
            'view_managementsubscriptionevent', 'add_managementsubscription', 'change_managementsubscription',
        ])
        self.operator.user_permissions.set(permissions)
        self.operator.user_permissions.add(*Permission.objects.filter(
            content_type__app_label='accounts', codename__in=[
                'operator_view_plans', 'operator_view_subscriptions', 'operator_view_access', 'operator_view_audit',
            ]))
        self.owner = User.objects.create_user('management-owner@example.test', email_verified_at=timezone.now())
        self.billing = BillingAccount.objects.create(owner=self.owner)
        self.plan = ManagementPlan.objects.create(code='operator-test', title='Synthetic approved plan',
            is_active=True, owned_workspace_limit=3, can_finalize_analysis=True, duration_days=7)
        self.client.force_login(self.operator)
        # This suite isolates admin permissions; real MFA is tested in operations.test_mfa.
        self.mfa = patch('modules.workspaces.admin.operator_mfa_verified', return_value=True)
        self.mfa.start()
        self.addCleanup(self.mfa.stop)
        self.grant_url = reverse('management_admin:workspaces_managementsubscription_grant')
        self.list_url = reverse('management_admin:workspaces_managementsubscription_changelist')

    def payload(self, **kwargs):
        return {'billing_account': str(self.billing.pk), 'plan': self.plan.pk, 'request_id': str(uuid4()),
                'reason': 'Synthetic authorized operation', 'confirm': 'on', **kwargs}

    def grant(self):
        response = self.client.post(self.grant_url, self.payload())
        self.assertEqual(response.status_code, 302)
        return ManagementSubscription.objects.get(billing_account=self.billing)

    def test_grant_replay_revoke_and_history_use_frozen_service_snapshot(self):
        payload = self.payload()
        response = self.client.post(self.grant_url, payload)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(self.client.post(self.grant_url, payload).status_code, 302)
        grant = ManagementSubscription.objects.get(billing_account=self.billing)
        self.assertEqual(grant.granted_by_id, self.operator.pk)
        self.assertEqual(grant.reason, payload['reason'])
        self.assertEqual(grant.owned_workspace_limit, 3)
        self.assertEqual(grant.plan_revision, self.plan.revision)
        self.assertEqual(grant.ends_at - grant.starts_at, timedelta(days=7))
        self.assertEqual(grant.events.count(), 1)
        detail = reverse('management_admin:workspaces_managementsubscription_change', args=[grant.pk])
        self.assertContains(self.client.get(detail), payload['reason'])
        self.assertNotContains(self.client.get(detail), self.owner.email)
        self.plan.owned_workspace_limit = 99
        self.plan.save()
        revoke = reverse('management_admin:workspaces_managementsubscription_revoke', args=[grant.pk])
        self.assertEqual(self.client.get(revoke).status_code, 200)
        grant.refresh_from_db()
        self.assertEqual(grant.status, 'active')
        for _ in range(2):
            self.assertEqual(self.client.post(revoke, {'reason': 'Synthetic revocation', 'confirm': 'on'}).status_code, 302)
        grant.refresh_from_db()
        self.assertEqual(grant.status, 'revoked')
        self.assertEqual(grant.owned_workspace_limit, 3)
        self.assertEqual(list(grant.events.order_by('pk').values_list('event_type', flat=True)), ['granted', 'revoked'])
        self.assertEqual(grant.events.last().actor_id, self.operator.pk)

    def test_normal_owner_unverified_staff_and_inactive_staff_cannot_enter(self):
        for actor in [self.owner,
                      User.objects.create_user('unverified-staff@example.test', is_staff=True),
                      User.objects.create_user('inactive-staff@example.test', is_staff=True, is_active=False,
                                               email_verified_at=timezone.now())]:
            self.client.force_login(actor)
            for url in [self.list_url, self.grant_url]:
                self.assertEqual(self.client.get(url).status_code, 302)
                self.assertEqual(self.client.post(url, self.payload()).status_code, 302)
        self.assertFalse(ManagementSubscription.objects.exists())

    def test_each_action_requires_current_explicit_permission(self):
        grant = self.grant()
        revoke = reverse('management_admin:workspaces_managementsubscription_revoke', args=[grant.pk])
        self.operator.user_permissions.remove(Permission.objects.get(codename='add_managementsubscription'))
        self.assertEqual(self.client.post(self.grant_url, self.payload()).status_code, 403)
        self.operator.user_permissions.remove(Permission.objects.get(codename='change_managementsubscription'))
        self.assertEqual(self.client.post(revoke, {'reason': 'Blocked', 'confirm': 'on'}).status_code, 403)
        self.operator.user_permissions.remove(Permission.objects.get(codename='view_managementsubscriptionevent'))
        detail = reverse('management_admin:workspaces_managementsubscription_change', args=[grant.pk])
        self.assertEqual(self.client.get(detail).context['inline_admin_formsets'], [])
        self.assertEqual(grant.events.count(), 1)

    def test_invalid_missing_confirmation_reason_key_and_inactive_plan_are_errors(self):
        inactive = ManagementPlan.objects.get(code='management-special')
        self.assertFalse(inactive.is_active)
        self.assertIsNone(inactive.price)
        for overrides in [{'confirm': ''}, {'reason': ' '}, {'reason': 'x' * 501}, {'request_id': 'invalid'},
                          {'billing_account': str(uuid4())}, {'plan': inactive.pk}]:
            response = self.client.post(self.grant_url, self.payload(**overrides))
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.context['form'].errors)
            self.assertFalse(ManagementSubscription.objects.exists())
        grant = self.grant()
        collision = self.payload(request_id=str(grant.request_id), reason='Different operation')
        response = self.client.post(self.grant_url, collision)
        self.assertTrue(response.context['form'].errors)
        self.assertEqual(ManagementSubscription.objects.count(), 1)

    def test_revocation_requires_confirmation_reason_and_preserves_status_on_error(self):
        grant = self.grant()
        revoke = reverse('management_admin:workspaces_managementsubscription_revoke', args=[grant.pk])
        for payload in [{'reason': ''}, {'reason': 'Valid reason'}, {'reason': ' ', 'confirm': 'on'}]:
            response = self.client.post(revoke, payload)
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.context['form'].errors)
        grant.refresh_from_db()
        self.assertEqual(grant.status, 'active')
        self.assertEqual(grant.events.count(), 1)

    def test_snapshot_and_catalog_cannot_be_edited_or_deleted_even_by_superuser(self):
        grant = self.grant()
        superuser = User.objects.create_superuser('management-super@example.test', password='test-only')
        self.client.force_login(superuser)
        self.assertEqual(self.client.get(self.list_url).status_code, 302)
        superuser.user_permissions.set(self.operator.user_permissions.all())
        detail = reverse('management_admin:workspaces_managementsubscription_change', args=[grant.pk])
        response = self.client.get(detail)
        self.assertContains(response, 'readonly')
        self.assertNotContains(response, 'name="owned_workspace_limit"')
        self.assertEqual(self.client.post(detail, {'status': 'revoked', 'owned_workspace_limit': 999}).status_code, 403)
        self.assertEqual(self.client.post(reverse('management_admin:workspaces_managementsubscription_delete', args=[grant.pk])).status_code, 403)
        plan_url = reverse('management_admin:workspaces_managementplan_change', args=[self.plan.pk])
        self.assertEqual(self.client.post(plan_url, {'is_active': False}).status_code, 403)
        self.assertEqual(self.client.post(reverse('management_admin:workspaces_managementsubscription_add'), self.payload()).status_code, 403)
        grant.refresh_from_db()
        self.assertEqual(grant.status, 'active')
        self.assertEqual(grant.owned_workspace_limit, 3)
        self.assertEqual(ManagementSubscriptionEvent.objects.count(), 1)

    def test_csrf_methods_and_production_gate(self):
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.force_login(self.operator)
        self.assertEqual(csrf_client.post(self.grant_url, self.payload()).status_code, 403)
        self.assertEqual(self.client.put(self.grant_url, {}).status_code, 405)
        self.mfa.stop()
        for production in (False, True):
            with override_settings(PRODUCTION=production):
                self.assertEqual(self.client.get(self.list_url).status_code, 302)
                self.assertEqual(self.client.post(self.grant_url, self.payload()).status_code, 302)
        self.assertFalse(ManagementSubscription.objects.exists())

    def test_forged_mfa_and_superuser_do_not_bypass_closed_verifier(self):
        self.mfa.stop()
        self.client.force_login(User.objects.create_superuser('closed-super@example.test', password='test-only'))
        session = self.client.session
        session['operator_mfa_verified'] = True
        session['mfa_verified'] = True
        session.save()
        self.assertEqual(self.client.get(self.list_url, HTTP_X_OPERATOR_MFA_VERIFIED='true').status_code, 302)
        self.assertEqual(self.client.post(self.grant_url, self.payload(), HTTP_X_OPERATOR_MFA_VERIFIED='true').status_code, 302)
        self.assertFalse(ManagementSubscription.objects.exists())

    def test_grant_requires_billing_and_plan_read_permissions_and_active_billing(self):
        for code in ('view_billingaccount', 'view_managementplan', 'view_managementsubscription'):
            permission = Permission.objects.get(codename=code)
            self.operator.user_permissions.remove(permission)
            self.assertEqual(self.client.post(self.grant_url, self.payload()).status_code, 403)
            self.operator.user_permissions.add(permission)
        self.billing.status = 'suspended'
        self.billing.save()
        response = self.client.post(self.grant_url, self.payload())
        self.assertTrue(response.context['form'].errors)
        self.assertFalse(ManagementSubscription.objects.exists())

    def test_unknown_subscription_and_read_only_filters(self):
        url = reverse('management_admin:workspaces_managementsubscription_revoke', args=[uuid4()])
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertContains(self.client.get(self.list_url), 'فعال‌سازی اشتراک')
        self.assertEqual(self.client.get(self.list_url, {'status__exact': 'revoked', 'q': str(self.billing.pk)}).status_code, 200)
