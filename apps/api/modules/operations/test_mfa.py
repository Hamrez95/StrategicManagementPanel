from datetime import timedelta
from unittest.mock import patch

import pyotp
from cryptography.fernet import Fernet
from django.contrib.auth.models import Permission
from django.db import IntegrityError, transaction
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from modules.accounts.models import User

from .models import OperatorFactor, OperatorProof, OperatorSecurityEvent


@override_settings(OPERATOR_MFA_KEYS=(Fernet.generate_key().decode('ascii'),))
class OperatorMfaTests(TestCase):
    def setUp(self):
        self.actor = User.objects.create_user(
            'operator@mfa.test', 'test-only-password', is_staff=True, email_verified_at=timezone.now(),
        )
        self.permission = Permission.objects.get(codename='operator_view_accounts')
        self.actor.user_permissions.add(self.permission)
        self.client.force_login(self.actor)
        self.now = timezone.now().replace(second=5, microsecond=0)

    def post(self, action, *, code='', password='test-only-password', client=None):
        return (client or self.client).post('/api/v1/operator/mfa/' + action + '/',
                                           {'password': password, 'code': code}, content_type='application/json')

    def enroll(self):
        response = self.post('enroll')
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()['secret']

    def enable(self):
        secret = self.enroll()
        self.now = timezone.now()
        with patch('modules.operations.mfa.timezone.now', return_value=self.now):
            response = self.post('verify', code=pyotp.TOTP(secret).at(self.now))
        self.assertEqual(response.status_code, 200, response.content)
        return secret

    def test_encryption_session_rotation_proof_and_privacy(self):
        before = self.client.session.session_key
        secret = self.enable()
        factor = OperatorFactor.objects.get(user=self.actor)
        self.assertNotIn(secret, factor.encrypted_secret)
        self.assertNotEqual(before, self.client.session.session_key)
        self.assertEqual(OperatorProof.objects.count(), 1)
        self.assertTrue(self.client.get('/api/v1/operator/status/').json()['mfa_ready'])
        self.assertEqual(self.client.get('/api/v1/operator/accounts/').status_code, 200)
        status = self.client.get('/api/v1/operator/status/')
        self.assertNotIn(secret, status.content.decode())
        self.assertIn('no-store', status['Cache-Control'])
        self.assertEqual(list(OperatorSecurityEvent.objects.order_by('created_at').values_list('event_type', flat=True)),
                         ['enrollment_started', 'enrolled'])

    def test_unauthorized_staff_and_superuser_have_no_bypass(self):
        for user in (User.objects.create_user('other@mfa.test', is_staff=True),
                     User.objects.create_superuser('super@mfa.test', 'test-only-password')):
            self.client.force_login(user)
            self.assertEqual(self.post('enroll').status_code, 403)
        self.assertFalse(OperatorFactor.objects.exists())

    def test_password_required_and_rate_limit_is_shared_across_sessions(self):
        for _ in range(8):
            self.assertEqual(self.post('enroll', password='wrong').status_code, 403)
        self.assertEqual(self.post('enroll').status_code, 429)
        self.assertFalse(OperatorFactor.objects.exists())

    def test_replay_rejected_across_browsers_and_lock_revokes_current_proof(self):
        secret = self.enable()
        other = Client()
        other.force_login(self.actor)
        with patch('modules.operations.mfa.timezone.now', return_value=self.now):
            self.assertEqual(self.post('verify', code=pyotp.TOTP(secret).at(self.now), client=other).status_code, 403)
        self.assertEqual(self.post('lock').status_code, 200)
        self.assertFalse(self.client.get('/api/v1/operator/status/').json()['mfa_ready'])

    def test_enrollment_is_bound_to_original_session_and_expiry(self):
        secret = self.enroll()
        other = Client()
        other.force_login(self.actor)
        self.assertEqual(self.post('verify', code=pyotp.TOTP(secret).now(), client=other).status_code, 409)
        OperatorFactor.objects.filter(user=self.actor).update(pending_until=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.post('verify', code=pyotp.TOTP(secret).now()).status_code, 409)

    def test_proof_expires_and_password_or_permission_changes_take_effect(self):
        self.enable()
        proof = OperatorProof.objects.get()
        proof.verified_at = timezone.now() - timedelta(minutes=30)
        proof.expires_at = timezone.now() - timedelta(seconds=1)
        proof.save()
        self.assertEqual(self.client.get('/api/v1/operator/accounts/').status_code, 403)
        proof.expires_at = timezone.now() + timedelta(minutes=10)
        proof.save()
        self.actor.set_password('different-test-password')
        self.actor.save(update_fields=['password'])
        # force_login creates a new authenticated session, never reuses the old proof.
        self.client.force_login(self.actor)
        self.assertFalse(self.client.get('/api/v1/operator/status/').json()['mfa_ready'])
        self.actor.user_permissions.clear()
        self.assertEqual(self.client.get('/api/v1/operator/status/').status_code, 403)

    def test_factor_removal_revokes_all_proofs_and_records_event(self):
        secret = self.enable()
        with patch('modules.operations.mfa.timezone.now', return_value=self.now + timedelta(seconds=30)):
            self.assertEqual(self.post('remove', code=pyotp.TOTP(secret).at(self.now + timedelta(seconds=30))).status_code, 200)
        self.assertFalse(OperatorFactor.objects.exists())
        self.assertFalse(OperatorProof.objects.exists())
        self.assertTrue(OperatorSecurityEvent.objects.filter(event_type='factor_removed').exists())

    @override_settings(OPERATOR_MFA_KEYS=())
    def test_missing_encryption_key_fails_closed_even_with_forged_session_flags(self):
        session = self.client.session
        session['operator_mfa_verified'] = True
        session.save()
        self.assertEqual(self.post('enroll').status_code, 503)
        self.assertEqual(self.client.get('/api/v1/operator/accounts/', HTTP_X_OPERATOR_MFA='true').status_code, 403)

    def test_wrong_key_and_corrupt_secret_cannot_preserve_proof(self):
        self.enable()
        with override_settings(OPERATOR_MFA_KEYS=(Fernet.generate_key().decode('ascii'),)):
            self.assertFalse(self.client.get('/api/v1/operator/status/').json()['mfa_ready'])
        OperatorFactor.objects.update(encrypted_secret='corrupted')
        self.assertFalse(self.client.get('/api/v1/operator/status/').json()['mfa_ready'])

    def test_csrf_required_and_get_cannot_mutate(self):
        strict = Client(enforce_csrf_checks=True)
        strict.force_login(self.actor)
        self.assertEqual(self.post('enroll', client=strict).status_code, 403)
        self.assertEqual(self.client.get('/api/v1/operator/mfa/enroll/').status_code, 405)
        self.assertFalse(OperatorFactor.objects.exists())

    def test_overview_does_not_reveal_unauthorized_counts(self):
        self.enable()
        response = self.client.get('/api/v1/operator/overview/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()['counts']), {'accounts'})

    def test_feedback_is_not_available_to_ordinary_staff_or_wrong_section(self):
        self.enable()
        self.assertEqual(self.client.get('/api/v1/academy/feedback/inbox/').status_code, 403)
        self.actor.user_permissions.add(Permission.objects.get(codename='operator_view_feedback'))
        self.assertEqual(self.client.get('/api/v1/academy/feedback/inbox/').status_code, 200)
        self.assertEqual(self.client.patch('/api/v1/academy/feedback/1/', {'status': 'reviewed'},
                                          content_type='application/json').status_code, 403)

    def test_invalid_enrollment_does_not_replace_active_factor(self):
        self.enable()
        before = OperatorFactor.objects.get().generation
        self.assertEqual(self.post('enroll').status_code, 409)
        self.assertEqual(OperatorFactor.objects.get().generation, before)

    def test_database_constraints_reject_invalid_factor_and_proof_states(self):
        self.enable()
        with self.assertRaises(IntegrityError), transaction.atomic():
            OperatorFactor.objects.filter(user=self.actor).update(last_counter=-1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            OperatorProof.objects.update(expires_at=self.now - timedelta(seconds=1))
