
"""Synthetic tests only: no real operator, grant or MFA assertion is provisioned."""
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import Group, Permission
from django.test import RequestFactory, TestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.operations.models import OperatorAccess
from modules.operations.security import SECTIONS, operator_sections
from modules.workspaces.entitlements import (
    grant_management_subscription,
    management_access,
)
from modules.workspaces.models import ManagementPlan, Membership, WorkspaceEvent
from modules.workspaces.services import create_owned_workspace


class OperatorReadTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user('owner@operator.test', email_verified_at=timezone.now())
        self.actor = User.objects.create_user('staff@operator.test', is_staff=True, email_verified_at=timezone.now())
        OperatorAccess.objects.create(user=self.actor, role="admin")
        self.workspace = create_owned_workspace(self.owner, 'Private business name')
        self.plan = ManagementPlan.objects.create(code='operator-test', title='Synthetic grant plan',
                                                  is_active=True, owned_workspace_limit=4,
                                                  can_calculate_metrics=True)

    def grant_permission(self, section, user=None):
        permission = Permission.objects.get(content_type__app_label='accounts',
                                            codename=f'operator_view_{section}')
        (user or self.actor).user_permissions.add(permission)
        return permission

    def get(self, section, suffix=''):
        return self.client.get(f'/api/v1/operator/{section}/{suffix}')

    def assert_private(self, response):
        self.assertIn('private', response['Cache-Control'])
        self.assertIn('no-store', response['Cache-Control'])
        self.assertIn('Cookie', response['Vary'])

    def test_anonymous_owner_staff_and_superuser_without_explicit_permissions_are_denied(self):
        superuser = User.objects.create_superuser('super@operator.test')
        for actor in (None, self.owner, self.actor, superuser):
            self.client.logout()
            if actor:
                self.client.force_login(actor)
            for section in (*SECTIONS, 'status'):
                with self.subTest(actor=actor.pk if actor else None, section=section):
                    response = self.get(section)
                    self.assertEqual(response.status_code, 403 if actor else 401)
                    self.assert_private(response)

    def test_inactive_and_unverified_staff_with_permissions_are_denied(self):
        self.grant_permission('accounts')
        self.client.force_login(self.actor)
        self.actor.email_verified_at = None
        self.actor.save(update_fields=['email_verified_at'])
        self.assertEqual(self.get('accounts').status_code, 403)
        self.actor.email_verified_at = timezone.now()
        self.actor.is_active = False
        self.actor.save(update_fields=['email_verified_at', 'is_active'])
        self.assertNotEqual(self.get('accounts').status_code, 200)

    def test_mfa_unavailable_closes_all_sections_before_customer_queries(self):
        for section in SECTIONS:
            self.grant_permission(section)
        self.client.force_login(self.actor)
        session = self.client.session
        session['operator_mfa_verified'] = True
        session['mfa_verified_at'] = timezone.now().isoformat()
        session.save()
        with patch('modules.operations.views._rows', side_effect=AssertionError('Customer read')):
            for section in SECTIONS:
                response = self.client.get(f'/api/v1/operator/{section}/', HTTP_X_OPERATOR_MFA='true')
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json()['code'], 'operator_mfa_unavailable')
                self.assert_private(response)
        status = self.get('status')
        self.assertFalse(status.json()['mfa_ready'])
        self.assertEqual(set(status.json()['sections']), set(SECTIONS))

    def test_section_permissions_are_independent_and_group_revocation_is_immediate(self):
        permission = self.grant_permission('plans')
        self.actor.user_permissions.clear()
        group = Group.objects.create(name='Synthetic plan readers')
        group.permissions.add(permission)
        self.actor.groups.add(group)
        self.client.force_login(self.actor)
        with patch('modules.operations.views.operator_mfa_verified', return_value=True):
            self.assertEqual(self.get('plans').status_code, 200)
            for section in set(SECTIONS) - {'plans'}:
                self.assertEqual(self.get(section).status_code, 403)
            group.permissions.clear()
            self.assertEqual(self.get('plans').status_code, 403)

    def test_cached_identity_flags_and_permission_cache_are_not_trusted(self):
        self.grant_permission('accounts')
        self.actor.has_perm('accounts.operator_view_accounts')
        request = RequestFactory().get('/api/v1/operator/accounts/')
        request.user = self.actor
        self.actor.user_permissions.clear()
        self.assertEqual(operator_sections(request)[1], ())
        self.grant_permission('accounts')
        User.objects.filter(pk=self.actor.pk).update(is_staff=False)
        self.assertIsNone(operator_sections(request)[0])

    @patch('modules.operations.views.operator_mfa_verified', return_value=True)
    def test_minimal_accounts_exact_search_and_bounded_pagination(self, _mfa):
        self.grant_permission('accounts')
        self.client.force_login(self.actor)
        for index in range(27):
            User.objects.create_user(f'page-{index}@operator.test')
        first = self.get('accounts')
        self.assertEqual(len(first.json()['results']), 25)
        self.assertTrue(first.json()['has_next'])
        second = self.get('accounts', '?page=2')
        self.assertEqual(len(second.json()['results']), 4)
        self.assertTrue(second.json()['has_previous'])
        for row in first.json()['results']:
            self.assertEqual(set(row), {'id', 'is_active', 'verified', 'date_joined'})
        result = self.get('accounts', '?q=owner@operator.test').json()
        self.assertEqual(result['count'], 1)
        self.assertEqual(result['results'][0]['id'], str(self.owner.pk))
        self.assertEqual(self.get('accounts', '?q=owner').json()['count'], 0)
        self.assertEqual(self.get('accounts', '?q=' + str(self.owner.pk)).json()['count'], 1)
        for suffix, expected in [('?page=0', 400), ('?page=no', 400), ('?page=99', 404),
                                 ('?q=' + 'x' * 255, 400), ('?state=unknown', 400)]:
            response = self.get('accounts', suffix)
            self.assertEqual(response.status_code, expected)
            self.assert_private(response)
        self.assertEqual(self.get('accounts', '?state=inactive').json()['results'], [])

    @patch('modules.operations.views.operator_mfa_verified', return_value=True)
    def test_six_summaries_are_redacted_and_access_uses_canonical_resolver(self, _mfa):
        for section in SECTIONS:
            self.grant_permission(section)
        self.actor.is_superuser = True
        self.actor.save(update_fields=['is_superuser'])
        grant = grant_management_subscription(self.actor, self.workspace.billing_account, self.plan,
                                              request_id=uuid4(), reason='Secret grant reason')
        WorkspaceEvent.objects.create(workspace=self.workspace, actor=self.owner, event_type='updated',
                                      changes={'secret': 'Private business payload'})
        self.client.force_login(self.actor)
        for section in (value for value in SECTIONS if value != 'feedback'):
            response = self.get(section)
            self.assertEqual(response.status_code, 200, response.content)
            self.assert_private(response)
            body = response.content.decode()
            for secret in ('Private business name', 'Private business payload', 'Secret grant reason',
                           'owner@operator.test', 'staff@operator.test', 'password', 'phone_number'):
                self.assertNotIn(secret, body)
        audit = self.get('audit').json()['results']
        self.assertEqual({row['source'] for row in audit}, {'workspace', 'subscription'})
        self.assertEqual(self.get('audit', '?q=' + str(grant.pk)).json()['count'], 1)
        self.assertEqual(self.get('workspaces', '?q=' + str(self.workspace.pk)).json()['count'], 1)
        self.assertEqual(self.get('subscriptions', '?q=' + str(self.owner.pk)).json()['count'], 1)
        self.assertEqual(self.get('plans', '?q=operator-test').json()['count'], 1)
        row = self.get('access', '?q=' + str(self.owner.pk)).json()['results'][0]
        canonical = management_access(self.owner)
        self.assertEqual(row['features'], canonical['features'])
        self.assertEqual(row['owned_workspace_limit'], 4)
        self.assertNotIn('subscriptions', row)
        # No operator read grants membership or exposes ordinary tenant data.
        self.assertFalse(Membership.objects.filter(workspace=self.workspace, user=self.actor).exists())
        self.assertEqual(self.client.get(f'/api/v1/workspaces/{self.workspace.pk}/').status_code, 404)

    def test_all_mutations_and_legacy_admin_are_closed(self):
        self.client.force_login(self.actor)
        for section in (*SECTIONS, 'status'):
            for method in ('post', 'put', 'patch', 'delete'):
                response = getattr(self.client, method)(f'/api/v1/operator/{section}/', {}, content_type='application/json')
                self.assertEqual(response.status_code, 405)
                self.assertEqual(response['Allow'], 'GET')
                self.assert_private(response)
        for path in ('/internal/django-admin/', '/internal/django-admin/academy/academysubscription/'):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 503)
            self.assert_private(response)
