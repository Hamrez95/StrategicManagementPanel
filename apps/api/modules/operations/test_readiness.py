import json
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

import pyotp
from cryptography.fernet import Fernet
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone

from modules.accounts.models import User

from .administrators import grantable_permissions
from .models import OperatorAccess, OperatorActionEvent, OperatorFactor, OperatorProof


@override_settings(PRODUCTION=True, OPERATOR_OWNER_EMAILS=('owner@example.test',),
                   OPERATOR_MFA_KEYS=(Fernet.generate_key().decode(),))
class OperatorReadinessTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user('owner@example.test', 'Synthetic-owner-password-2048',
                                             is_staff=True, email_verified_at=timezone.now())
        self.owner.user_permissions.add(*grantable_permissions())
        self.access = OperatorAccess.objects.create(user=self.owner, role='owner')

    def factor(self):
        from .mfa import cipher
        now = timezone.now()
        return OperatorFactor.objects.create(user=self.owner, encrypted_secret=cipher().encrypt(pyotp.random_base32().encode()).decode(),
                                              pending_until=now, enabled_at=now, last_counter=1)

    def test_launch_gate_requires_enrollment_current_key_and_no_temporary_password(self):
        with self.assertRaises(CommandError):
            call_command('check_operator_readiness', stdout=StringIO())
        self.factor()
        output = StringIO()
        call_command('check_operator_readiness', stdout=output)
        self.assertTrue(json.loads(output.getvalue())['ready'])
        self.access.must_change_password = True
        self.access.save()
        with self.assertRaises(CommandError):
            call_command('check_operator_readiness', stdout=StringIO())
        self.access.must_change_password = False
        self.access.save()
        with override_settings(OPERATOR_MFA_KEYS=(Fernet.generate_key().decode(),)):
            with self.assertRaises(CommandError):
                call_command('check_operator_readiness', stdout=StringIO())

    def test_missing_owner_permission_keeps_gate_closed(self):
        self.factor()
        self.owner.user_permissions.clear()
        with self.assertRaises(CommandError):
            call_command('check_operator_readiness', stdout=StringIO())

    def test_console_recovery_requires_password_and_confirmation_and_invalidates_proofs(self):
        factor = self.factor()
        now = timezone.now()
        OperatorProof.objects.create(session_digest='a' * 64, factor=factor, generation=factor.generation,
                                      auth_digest='b' * 64, verified_at=now, expires_at=now + timedelta(minutes=10))
        module = 'modules.operations.management.commands.recover_operator_factor'
        with patch(module + '.getpass', return_value='wrong-password'):
            with self.assertRaises(CommandError):
                call_command('recover_operator_factor', email=self.owner.email, reason='Lost device', stdout=StringIO())
        with patch(module + '.getpass', return_value='Synthetic-owner-password-2048'), patch('builtins.input', return_value='CANCEL'):
            with self.assertRaises(CommandError):
                call_command('recover_operator_factor', email=self.owner.email, reason='Lost device', stdout=StringIO())
        self.assertEqual(OperatorProof.objects.count(), 1)
        with patch(module + '.getpass', return_value='Synthetic-owner-password-2048'), patch('builtins.input', return_value='RECOVER'):
            call_command('recover_operator_factor', email=self.owner.email, reason='Lost device', stdout=StringIO())
        self.assertFalse(OperatorFactor.objects.exists())
        self.assertFalse(OperatorProof.objects.exists())
        self.assertEqual(OperatorActionEvent.objects.get().reason, 'Authenticator recovery: Lost device')
