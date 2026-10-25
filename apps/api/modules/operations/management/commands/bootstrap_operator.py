"""Explicit owner provisioning. Never runs during migrations, signup or startup."""
from getpass import getpass

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from modules.accounts.models import User
from modules.operations.administrators import grantable_permissions
from modules.operations.models import OperatorAccess, OperatorActionEvent


class Command(BaseCommand):
    help = 'Approve one configured owner; new-account password is read privately and must change at first login.'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        email = options['email'].strip().lower()
        if email not in settings.OPERATOR_OWNER_EMAILS:
            raise CommandError('Email is not a configured owner.')
        user = User.objects.select_for_update().filter(email__iexact=email).first()
        if user and OperatorAccess.objects.filter(user=user).exists():
            raise CommandError('Access already exists; no password or permissions were reset.')
        if user and (not user.is_active or not user.email_verified_at):
            raise CommandError('Existing account must be active and verified. It was not changed.')
        created = user is None
        if created:
            password = getpass('Temporary password (hidden): ')
            confirmation = getpass('Repeat temporary password: ')
            if not password or password != confirmation or len(password) > 1024:
                raise CommandError('Passwords must match and must not be empty.')
            user = User.objects.create_user(email, password, email_verified_at=timezone.now())
        user.is_staff = True
        user.save(update_fields=['is_staff'])
        OperatorAccess.objects.create(user=user, role='owner', must_change_password=created)
        user.user_permissions.add(*grantable_permissions())
        OperatorActionEvent.objects.create(actor=user, event_type='operator_access_changed', target=str(user.pk),
                                           before='0', after='1', reason='Explicit owner bootstrap')
        self.stdout.write(self.style.SUCCESS('Owner approved. No existing password was reset.'))
