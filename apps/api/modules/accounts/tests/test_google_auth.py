import json
import time
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch
from django.test import TestCase, Client, override_settings
from django.utils import timezone
from modules.accounts.models import User, GoogleIdentity, GoogleLoginChallenge
from modules.accounts.google_auth import verify_credential
from modules.accounts.profile_completion import normalize_phone

CLIENT_ID = 'stratino-test.apps.googleusercontent.com'


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
class GoogleAuthTests(TestCase):
    def post(self, path, data, client=None):
        return (client or self.client).post('/api/v1/'+path, json.dumps(data), content_type='application/json')

    def challenge(self, client=None):
        response = self.post('accounts/google/challenge/', {}, client)
        self.assertEqual(response.status_code, 200)
        return response.json()

    def signin(self, claims=None, challenge=None, client=None):
        challenge = challenge or self.challenge(client)
        token = {'sub': 'google-stable-subject', 'email': 'manager@gmail.com', 'email_verified': True, 'nonce': challenge['nonce'], 'given_name': 'نام', 'family_name': 'خانوادگی', **(claims or {})}
        with patch('modules.accounts.google_auth.verify_credential', return_value=token):
            return self.post('accounts/google/login/', {'challenge_id': challenge['challenge_id'], 'credential': 'test-credential-'*8}, client)

    def test_new_google_user_must_complete_profile_and_phone_stays_unverified(self):
        response = self.signin()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['profile_required'])
        user = User.objects.get()
        self.assertFalse(user.has_usable_password())
        self.assertIsNotNone(user.email_verified_at)
        self.assertEqual(self.client.get('/api/v1/academy/state/').status_code, 403)
        self.assertEqual(self.client.get('/api/v1/session/').json()['user']['profile_required'], True)
        data = {'expected_user_id': str(user.pk), 'first_name': 'حمید', 'last_name': 'پاکپور', 'phone_number': '۰۹۱۲ ۱۲۳ ۴۵۶۷', 'marketing_opt_in': False}
        self.assertEqual(self.post('account/complete-profile/', {**data, 'last_name': ''}).status_code, 400)
        self.assertEqual(self.post('account/complete-profile/', {**data, 'expected_user_id': 'wrong'}).status_code, 409)
        self.assertEqual(self.post('account/complete-profile/', data).status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.phone_number, '+989121234567')
        self.assertIsNone(user.phone_verified_at)
        self.assertIsNone(user.marketing_consent_at)
        self.assertFalse(user.requires_profile_completion)
        self.assertEqual(self.client.get('/api/v1/academy/state/').status_code, 200)
        self.assertFalse(self.signin().json()['profile_required'])
        self.assertEqual(User.objects.count(), 1)

    def test_nonce_is_single_use_expiring_and_browser_bound(self):
        challenge = self.challenge()
        self.assertEqual(self.signin(challenge=challenge).status_code, 200)
        self.assertEqual(self.signin(challenge=challenge).status_code, 400)
        other = Client()
        challenge = self.challenge()
        self.assertEqual(self.signin(challenge=challenge, client=other).status_code, 400)
        self.assertEqual(self.signin({'nonce': 'wrong'}, challenge).status_code, 400)
        GoogleLoginChallenge.objects.filter(pk=challenge['challenge_id']).update(expires_at=timezone.now()-timedelta(seconds=1))
        self.assertEqual(self.signin(challenge=challenge).status_code, 400)

    def test_same_email_does_not_automatically_link_accounts(self):
        user = User.objects.create_user('manager@gmail.com', 'Some-long-password-386!', email_verified_at=timezone.now())
        response = self.signin()
        self.assertEqual(response.json()['status'], 'link_required')
        self.assertFalse(GoogleIdentity.objects.exists())
        self.assertNotIn('_auth_user_id', self.client.session)
        self.assertEqual(self.post('accounts/google/link/', {'password': 'wrong'}).status_code, 400)
        response = self.post('accounts/google/link/', {'password': 'Some-long-password-386!'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(GoogleIdentity.objects.get().user_id, user.pk)
        self.assertEqual(User.objects.count(), 1)

    def test_external_email_needs_own_proof_and_linked_subject_survives_email_change(self):
        response = self.signin({'email': 'manager@example.test'})
        self.assertEqual(response.json()['status'], 'email_proof_required')
        self.assertFalse(User.objects.exists())
        self.assertEqual(self.signin({'email_verified': False}).status_code, 400)
        self.signin()
        original = User.objects.get()
        self.signin({'email': 'changed@gmail.com'})
        self.assertEqual(User.objects.get().pk, original.pk)
        self.assertEqual(User.objects.get().email, 'manager@gmail.com')

    def test_disabled_identity_and_unconfigured_service_cannot_authenticate(self):
        with override_settings(GOOGLE_OAUTH_CLIENT_ID=''):
            self.assertFalse(self.client.get('/api/v1/accounts/google/config/').json()['enabled'])
            self.assertEqual(self.post('accounts/google/challenge/', {}).status_code, 503)
            self.assertEqual(self.post('accounts/google/login/', {}).status_code, 503)
        self.signin()
        user = User.objects.get(); user.is_active = False; user.save(update_fields=['is_active'])
        self.assertEqual(self.signin().status_code, 403)

    def test_csrf_is_required_and_phone_validation_is_not_ownership_verification(self):
        strict = Client(enforce_csrf_checks=True)
        self.assertEqual(self.post('accounts/google/challenge/', {}, strict).status_code, 403)
        self.assertEqual(normalize_phone('0098 912-123-4567'), '+989121234567')
        self.assertIsNone(normalize_phone('+98 02112345678'))
        self.assertIsNone(normalize_phone('0912-not-phone'))
        self.assertIsNone(normalize_phone(True))

    def test_email_login_also_requires_profile_and_preserves_native_registration(self):
        user = User.objects.create_user('email@example.test', 'Long-password-for-email-782!', email_verified_at=timezone.now())
        response = self.post('accounts/login/', {'email': user.email, 'password': 'Long-password-for-email-782!'})
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.requires_profile_completion)
        self.assertEqual(self.client.get('/api/v1/workspaces/').status_code, 403)
        self.assertEqual(self.client.get('/api/v1/account/completion/').status_code, 200)
        with patch('modules.accounts.auth_views._send_verification') as send:
            response = self.post('accounts/signup/', {'email': 'new@example.test', 'password': 'Other-strong-password-879!', 'next': '/academy/lesson/C01-ST01-L01'})
            self.assertEqual(response.status_code, 202)
            self.assertTrue(User.objects.get(email='new@example.test').requires_profile_completion)
            self.assertEqual(send.call_args.args[1], '/academy/lesson/C01-ST01-L01')

    def test_real_signature_audience_issuer_and_expiry_are_verified(self):
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
        from google.auth import crypt, jwt
        private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        public = private.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        signer = crypt.RSASigner.from_string(pem, key_id='test-key')
        claims = {'iss': 'https://accounts.google.com', 'aud': CLIENT_ID, 'sub': 'test', 'iat': int(time.time())-5, 'exp': int(time.time())+300}
        cert_response = SimpleNamespace(status=200, data=json.dumps({'test-key': public}).encode())
        def encoded(overrides):
            return jwt.encode(signer, {**claims, **overrides}).decode()
        with patch('google.auth.transport.requests.Request.__call__', return_value=cert_response):
            self.assertEqual(verify_credential(encoded({}))['sub'], 'test')
            parts = encoded({}).split('.')
            parts[-1] = ('A' if parts[-1][0] != 'A' else 'B') + parts[-1][1:]
            with self.assertRaises(ValueError):
                verify_credential('.'.join(parts))
            for changes in [{'aud': 'another-client'}, {'iss': 'https://example.test'}, {'iat': int(time.time())-600, 'exp': int(time.time())-300}]:
                with self.assertRaises(ValueError):
                    verify_credential(encoded(changes))
