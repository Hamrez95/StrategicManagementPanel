"""A deploy-time gate, not an automatic bootstrap or an HTTP recovery bypass."""
import json

from cryptography.fernet import InvalidToken
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from modules.accounts.models import User
from modules.operations.administrators import grantable_permissions
from modules.operations.mfa import cipher
from modules.operations.models import OperatorAccess, OperatorFactor
from modules.operations.security import explicit_permission


class Command(BaseCommand):
    help = 'Fail until every configured owner is approved, has replaced temporary credentials, and enrolled encrypted MFA.'

    def handle(self, *args, **options):
        problems = []
        encryption = cipher()
        if not settings.PRODUCTION:
            problems.append('production_settings_required')
        if encryption is None:
            problems.append('mfa_key_required')
        permissions = list(grantable_permissions().select_related('content_type'))
        ready = 0
        for email in settings.OPERATOR_OWNER_EMAILS:
            user = User.objects.filter(email__iexact=email, is_active=True, is_staff=True,
                                       email_verified_at__isnull=False).first()
            access = OperatorAccess.objects.filter(user=user, role='owner', is_active=True,
                                                    must_change_password=False).first() if user else None
            factor = OperatorFactor.objects.filter(user=user, enabled_at__isnull=False).first() if access else None
            if not access or not factor or encryption is None or not user.has_usable_password():
                continue
            if any(not explicit_permission(user, permission.content_type.app_label + '.' + permission.codename)
                   for permission in permissions):
                continue
            try:
                encryption.decrypt(factor.encrypted_secret.encode('ascii'))
                ready += 1
            except (InvalidToken, ValueError, UnicodeError):
                continue
        if not settings.OPERATOR_OWNER_EMAILS or ready != len(settings.OPERATOR_OWNER_EMAILS):
            problems.append('owner_setup_incomplete')
        self.stdout.write(json.dumps({'ready': not problems, 'configured_owners': len(settings.OPERATOR_OWNER_EMAILS),
                                      'ready_owners': ready, 'blockers': problems}))
        if problems:
            raise CommandError('Operator launch gate is closed. No account or secret was changed.')
