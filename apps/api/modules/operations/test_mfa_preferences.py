import os
import subprocess
import sys
from datetime import timedelta
from unittest.mock import patch

import pyotp
from cryptography.fernet import Fernet
from django.contrib.auth.models import Permission
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from modules.accounts.models import User

from .models import OperatorAccess, OperatorActionEvent, OperatorFactor, OperatorProof


@override_settings(ENVIRONMENT='development', PRODUCTION=False, DEBUG=True,
                   OPERATOR_MFA_OPTIONAL_IN_DEVELOPMENT=True,
                   OPERATOR_MFA_KEYS=(Fernet.generate_key().decode(),))
class OperatorMfaPreferenceTests(TestCase):
    url = '/api/v1/operator/mfa-settings/'

    def setUp(self):
        self.actor = User.objects.create_user('mfa-settings@example.test', 'synthetic-password', is_staff=True, email_verified_at=timezone.now())
        self.access = OperatorAccess.objects.create(user=self.actor, role='admin')
        self.actor.user_permissions.add(Permission.objects.get(codename='operator_view_accounts'))
        self.client.force_login(self.actor)

    def change(self, selected, **changes):
        self.access.refresh_from_db()
        return self.client.patch(self.url, {'enabled': selected, 'revision': self.access.revision,
            'password': 'synthetic-password', 'code': '', 'confirm': True, **changes}, content_type='application/json')

    def enroll(self):
        response = self.client.post('/api/v1/operator/mfa/enroll/', {'password': 'synthetic-password'}, content_type='application/json')
        self.assertEqual(response.status_code, 201)
        return response.json()['secret']

    def test_default_is_on_and_disable_enable_are_audited_and_effective(self):
        status = self.client.get(self.url)
        self.assertTrue(status.json()['enabled'])
        self.assertIn('no-store', status['Cache-Control'])
        self.assertEqual(self.client.get('/api/v1/operator/accounts/').status_code, 403)
        self.assertEqual(self.change(False, password='wrong').status_code, 403)
        self.assertEqual(self.change(False).status_code, 200)
        self.assertEqual(self.client.get('/api/v1/operator/accounts/').status_code, 200)
        state = self.client.get('/api/v1/operator/status/').json()
        self.assertTrue(state['mfa_ready'])
        self.assertFalse(state['mfa_enabled'])
        self.assertEqual(self.change(True).status_code, 200)
        self.assertEqual(self.client.get('/api/v1/operator/accounts/').status_code, 403)
        self.assertEqual(OperatorActionEvent.objects.filter(details__setting='mfa_enabled').count(), 2)

    def test_enrolled_factor_requires_fresh_code_and_consumes_localized_digits(self):
        secret = self.enroll()
        now = timezone.now()
        code = pyotp.TOTP(secret).at(now).translate(str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹'))
        with patch('modules.operations.mfa.timezone.now', return_value=now):
            response = self.client.post('/api/v1/operator/mfa/verify/', {'password': 'synthetic-password', 'code': code}, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        with patch('modules.operations.mfa_preferences.timezone.now', return_value=now):
            self.assertEqual(self.change(False, code=code).status_code, 403)
        later = now + timedelta(seconds=30)
        code = pyotp.TOTP(secret).at(later).translate(str.maketrans('0123456789', '٠١٢٣٤٥٦٧٨٩'))
        with patch('modules.operations.mfa_preferences.timezone.now', return_value=later):
            self.assertEqual(self.change(False, code=code).status_code, 200)
        self.assertTrue(OperatorFactor.objects.filter(user=self.actor).exists())
        self.assertFalse(OperatorProof.objects.exists())

    def test_production_and_nonopted_development_fail_closed_even_with_saved_false(self):
        OperatorAccess.objects.filter(user=self.actor).update(mfa_enabled=False)
        for config in ({'ENVIRONMENT': 'production', 'PRODUCTION': True, 'DEBUG': False},
                       {'OPERATOR_MFA_OPTIONAL_IN_DEVELOPMENT': False}, {'DEBUG': False}, {'ENVIRONMENT': 'test'}):
            with self.subTest(config=config), override_settings(**config):
                state = self.client.get(self.url).json()
                self.assertFalse(state['can_disable'])
                self.assertTrue(state['enabled'])
                self.assertEqual(self.client.get('/api/v1/operator/accounts/').status_code, 403)
                self.assertEqual(self.change(False).status_code, 403)

    def test_permission_revocation_and_csrf_still_apply(self):
        self.assertEqual(self.change(False).status_code, 200)
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.actor)
        self.assertEqual(client.patch(self.url, {}, content_type='application/json').status_code, 403)
        self.actor.user_permissions.clear()
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.get('/api/v1/operator/accounts/').status_code, 403)
        self.client.logout()
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_stale_revision_unknown_fields_and_missing_confirmation_do_not_write(self):
        for invalid in ({'enabled': 0}, {'confirm': False}, {'user_id': str(self.actor.pk)}, {'revision': '1'}):
            self.assertEqual(self.change(False, **invalid).status_code, 400)
        self.assertFalse(OperatorActionEvent.objects.exists())
        self.assertEqual(self.change(False).status_code, 200)
        self.assertEqual(self.change(True, revision=1).status_code, 409)
        self.assertEqual(OperatorActionEvent.objects.count(), 1)

    def test_audit_failure_rolls_back_preference_and_revision(self):
        with patch('modules.operations.mfa_preferences.OperatorActionEvent.objects.create', side_effect=RuntimeError('audit failed')):
            with self.assertRaises(RuntimeError):
                self.change(False)
        self.access.refresh_from_db()
        self.assertTrue(self.access.mfa_enabled)
        self.assertEqual(self.access.revision, 1)

    def test_temporary_password_cannot_change_setting(self):
        self.access.must_change_password = True
        self.access.save()
        self.assertEqual(self.change(False).status_code, 403)

    def test_production_settings_reject_optional_flag_at_startup(self):
        environment = {**os.environ, 'STRATINO_ENV': 'production', 'DJANGO_DEBUG': '0',
            'DJANGO_SECRET_KEY': 'synthetic-production-check-only-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            'DJANGO_ALLOWED_HOSTS': 'example.invalid', 'STRATINO_OPERATOR_MFA_OPTIONAL_IN_DEVELOPMENT': '1'}
        result = subprocess.run([sys.executable, 'manage.py', 'check'], env=environment, capture_output=True, text=True, timeout=20, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Optional operator MFA is restricted to local development', result.stderr)
