"""Explicit, private-console owner recovery; no universal key or public route."""
from getpass import getpass

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from modules.accounts.models import User
from modules.operations.models import (
    OperatorAccess,
    OperatorActionEvent,
    OperatorFactor,
    OperatorSecurityEvent,
)


class Command(BaseCommand):
    help = 'Remove a lost owner Authenticator from a trusted private console with password, reason and explicit confirmation.'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True)
        parser.add_argument('--reason', required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        email = options['email'].strip().lower()
        reason = options['reason'].strip()
        if email not in settings.OPERATOR_OWNER_EMAILS or not 3 <= len(reason) <= 470:
            raise CommandError('Configured owner email and a reason of 3–470 characters are required.')
        user = User.objects.select_for_update().filter(email__iexact=email, is_active=True, is_staff=True,
                                                       email_verified_at__isnull=False).first()
        access = OperatorAccess.objects.select_for_update().filter(user=user, role='owner', is_active=True).first() if user else None
        if not access or not user.check_password(getpass('Current owner password (hidden): ')):
            raise CommandError('Owner authentication failed; nothing changed.')
        factor = OperatorFactor.objects.select_for_update().filter(user=user).first()
        if factor is None:
            raise CommandError('No factor exists; nothing changed.')
        if input('Type RECOVER to remove this factor and all its proofs: ').strip() != 'RECOVER':
            raise CommandError('Recovery cancelled; nothing changed.')
        factor.delete()
        previous = access.revision
        access.revision += 1
        access.save(update_fields=['revision', 'updated_at'])
        OperatorSecurityEvent.objects.create(actor=user, event_type='factor_removed')
        OperatorActionEvent.objects.create(actor=user, event_type='operator_access_changed', target=str(user.pk),
                                           before=str(previous), after=str(access.revision), reason='Authenticator recovery: ' + reason)
        self.stdout.write(self.style.SUCCESS('Factor and all its proofs removed. Enroll a new Authenticator before accessing admin data.'))
