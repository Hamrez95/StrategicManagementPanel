"""Explicit owner provisioning. Never runs during migrations, signup or startup."""
from getpass import getpass

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from modules.accounts.models import User
from modules.operations.administrators import grantable_permissions
from modules.operations.models import OperatorAccess, OperatorActionEvent, OperatorProof


class Command(BaseCommand):
    help = 'Approve one configured owner; new-account password is read privately and must change at first login.'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True)
        parser.add_argument('--set-temporary-password', action='store_true', help='Explicitly replace an existing password; strong replacement is mandatory at next login.')

    @transaction.atomic
    def handle(self, *args, **options):
        email = options['email'].strip().lower()
        if email not in settings.OPERATOR_OWNER_EMAILS:
            raise CommandError('Email is not a configured owner.')
        user = User.objects.select_for_update().filter(email__iexact=email).first()
        access = OperatorAccess.objects.select_for_update().filter(user=user).first() if user else None
        reset = options['set_temporary_password']
        if access and not reset:
            raise CommandError('Access already exists; no password or permissions were reset.')
        if user and (not user.is_active or not user.email_verified_at):
            raise CommandError('Existing account must be active and verified. It was not changed.')
        if user and not user.has_usable_password() and not reset:
            raise CommandError('Google-only owner requires explicit --set-temporary-password for manual login.')
        created = user is None
        if created or reset:
            password = getpass('Temporary password (hidden): ')
            confirmation = getpass('Repeat temporary password: ')
            if not password or password != confirmation or len(password) > 1024:
                raise CommandError('Passwords must match and must not be empty.')
            if created:
                user = User.objects.create_user(email, password, email_verified_at=timezone.now())
            else:
                user.set_password(password)
                user.save(update_fields=['password'])
                OperatorProof.objects.filter(factor__user=user).delete()
        user.is_staff = True
        user.save(update_fields=['is_staff'])
        previous = access.revision if access else 0
        if access is None:
            access = OperatorAccess(user=user, revision=0)
        access.role = 'owner'
        access.is_active = True
        access.must_change_password = created or reset
        access.revision += 1
        access.save()
        user.user_permissions.add(*grantable_permissions())
        OperatorActionEvent.objects.create(actor=user, event_type='operator_access_changed', target=str(user.pk),
                                           before=str(previous), after=str(access.revision), reason='Explicit owner bootstrap with temporary password' if created or reset else 'Explicit owner bootstrap')
        self.stdout.write(self.style.SUCCESS('Owner approved. Temporary credentials must be replaced before admin access.' if created or reset else 'Owner approved. Existing password unchanged.'))
