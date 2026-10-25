from io import StringIO
from unittest.mock import patch

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client, TestCase
from django.utils import timezone

from modules.accounts.models import User

from .administrators import grantable_permissions
from .models import OperatorAccess, OperatorActionEvent


class AdministratorTests(TestCase):
    def setUp(self):
        self.password = 'A-synthetic-only-password-2048'
        self.owner = User.objects.create_user(settings.OPERATOR_OWNER_EMAILS[0], self.password,
                                             is_staff=True, email_verified_at=timezone.now())
        self.access = OperatorAccess.objects.create(user=self.owner, role='owner')
        self.owner.user_permissions.add(*grantable_permissions())
        self.user = User.objects.create_user('new-admin@example.test', self.password,
                                            email_verified_at=timezone.now())

    def post(self, path, body):
        return self.client.post('/api/v1/operator/' + path + '/', body, content_type='application/json')

    def test_manual_login_requires_approved_identity_not_only_staff_or_permissions(self):
        self.user.is_staff = True
        self.user.save()
        self.user.user_permissions.add(*grantable_permissions())
        self.assertEqual(self.post('login', {'email': self.user.email, 'password': self.password}).status_code, 401)
        self.assertEqual(self.post('login', {'email': self.owner.email, 'password': self.password}).status_code, 200)
        self.access.is_active = False
        self.access.save()
        self.assertEqual(self.client.get('/api/v1/operator/status/').status_code, 403)
        self.assertEqual(self.post('login', {'email': self.owner.email, 'password': self.password}).status_code, 401)

    def test_temporary_password_blocks_reads_until_strong_replacement_and_invalidates_other_session(self):
        self.access.must_change_password = True
        self.access.save()
        self.client.force_login(self.owner)
        other = Client()
        other.force_login(self.owner)
        self.assertTrue(self.client.get('/api/v1/operator/status/').json()['must_change_password'])
        self.assertEqual(self.client.get('/api/v1/operator/accounts/').status_code, 403)
        body = {'current_password': self.password, 'new_password': '123456', 'confirmation': '123456'}
        self.assertEqual(self.post('password', body).status_code, 400)
        body.update(new_password='A-new-synthetic-password-3072', confirmation='A-new-synthetic-password-3072')
        self.assertEqual(self.post('password', body).status_code, 200)
        self.owner.refresh_from_db()
        self.access.refresh_from_db()
        self.assertFalse(self.access.must_change_password)
        self.assertTrue(self.owner.check_password(body['new_password']))
        self.assertEqual(other.get('/api/v1/operator/status/').status_code, 401)
        self.assertEqual(self.client.get('/api/v1/operator/accounts/').status_code, 403)
        self.assertFalse(self.client.get('/api/v1/operator/status/').json()['mfa_ready'])
        event = OperatorActionEvent.objects.get(event_type='operator_password_changed')
        self.assertNotIn('password-', event.reason + event.before + event.after)

    @patch('modules.operations.administrators.operator_mfa_verified', return_value=True)
    def test_owner_can_approve_restrict_and_disable_but_cannot_create_another_owner(self, _mfa):
        self.client.force_login(self.owner)
        payload = {'email': self.user.email, 'permissions': ['operator_view_academy'],
                   'is_active': True, 'revision': 0, 'reason': 'Synthetic owner approval', 'current_password': self.password}
        self.assertEqual(self.post('team', payload).status_code, 200)
        self.assertEqual(self.post('team', payload).status_code, 409)
        self.user.refresh_from_db()
        row = OperatorAccess.objects.get(user=self.user)
        self.assertEqual(row.role, 'admin')
        self.assertEqual(self.user.user_permissions.count(), 1)
        self.client.force_login(self.user)
        self.assertEqual(self.client.get('/api/v1/operator/team/').status_code, 403)
        self.assertEqual(self.post('team', payload).status_code, 403)
        self.client.force_login(self.owner)
        self.assertEqual(len(self.client.get('/api/v1/operator/team/').json()['results']), 2)
        payload.update(is_active=False, revision=1)
        self.assertEqual(self.post('team', payload).status_code, 200)
        self.client.force_login(self.user)
        self.assertEqual(self.client.get('/api/v1/operator/status/').status_code, 403)
        self.client.force_login(self.owner)
        payload.update(email=settings.OPERATOR_OWNER_EMAILS[0], revision=1)
        self.assertEqual(self.post('team', payload).status_code, 403)
        payload.update(email=self.user.email, revision=2, permissions=['is_superuser'])
        self.assertEqual(self.post('team', payload).status_code, 400)

    def test_csrf_mfa_and_current_password_are_required(self):
        self.client.force_login(self.owner)
        csrf = Client(enforce_csrf_checks=True)
        csrf.force_login(self.owner)
        self.assertEqual(csrf.post('/api/v1/operator/password/', {}).status_code, 403)
        self.assertEqual(self.client.get('/api/v1/operator/team/').status_code, 403)
        self.assertEqual(self.post('password', {'current_password': self.password,
                         'new_password': 'Another-test-only-password', 'confirmation': 'Another-test-only-password'}).status_code, 403)

    def test_bootstrap_is_owner_only_explicit_and_never_resets_existing_password(self):
        with self.assertRaises(CommandError):
            call_command('bootstrap_operator', email=self.user.email)
        with self.assertRaises(CommandError):
            call_command('bootstrap_operator', email=self.owner.email)
        with patch('modules.operations.management.commands.bootstrap_operator.getpass', return_value=self.password):
            call_command('bootstrap_operator', email=settings.OPERATOR_OWNER_EMAILS[1], stdout=StringIO())
        user = User.objects.get(email=settings.OPERATOR_OWNER_EMAILS[1])
        self.assertTrue(OperatorAccess.objects.get(user=user).must_change_password)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.check_password(self.password))

    def test_profile_gate_remains_for_workspace_apis_but_not_independent_admin(self):
        self.owner.requires_profile_completion = True
        self.owner.save()
        self.client.force_login(self.owner)
        self.assertEqual(self.client.get('/api/v1/operator/status/').status_code, 200)
        self.assertEqual(self.client.get('/api/v1/workspaces/').status_code, 403)
