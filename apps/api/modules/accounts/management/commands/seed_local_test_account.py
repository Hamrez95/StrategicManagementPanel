from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from modules.accounts.models import User

TEST_EMAIL = "hamrez95@stratino.test"
TEST_PASSWORD = "123456"
TEST_NAME = "Hamidreza Pakpour"


def require_local_development(*, environment, debug, acknowledged):
    if environment != "development" or not debug:
        raise CommandError(
            "The test account can only be created in DEBUG development mode."
        )
    if not acknowledged:
        raise CommandError(
            "Set STRATINO_ALLOW_TEST_ACCOUNT=1 to confirm this is a disposable local database."
        )


class Command(BaseCommand):
    help = "Create or verify the non-privileged local Stratino test account."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset-password",
            action="store_true",
            help="Explicitly set the local test account password to 123456.",
        )

    def handle(self, *args, **options):
        require_local_development(
            environment=settings.ENVIRONMENT,
            debug=settings.DEBUG,
            acknowledged=getattr(settings, "STRATINO_ALLOW_TEST_ACCOUNT", False),
        )
        user = User.objects.filter(email__iexact=TEST_EMAIL).first()
        if user is None:
            user = User.objects.create_user(
                email=TEST_EMAIL,
                password=TEST_PASSWORD,
                display_name=TEST_NAME,
                is_active=True,
                is_staff=False,
                is_superuser=False,
                email_verified_at=timezone.now(),
            )
            self.stdout.write(
                self.style.SUCCESS(f"Created local test account: {TEST_EMAIL}")
            )
            return

        if user.is_staff or user.is_superuser:
            raise CommandError(
                "Refusing to modify a privileged account with the test email."
            )
        changed_fields = []
        if not user.is_active:
            user.is_active = True
            changed_fields.append("is_active")
        if user.email_verified_at is None:
            user.email_verified_at = timezone.now()
            changed_fields.append("email_verified_at")
        if not user.display_name:
            user.display_name = TEST_NAME
            changed_fields.append("display_name")
        if options.get("reset_password") and not user.check_password(TEST_PASSWORD):
            user.set_password(TEST_PASSWORD)
            changed_fields.append("password")
        if changed_fields:
            user.save(update_fields=changed_fields)
        self.stdout.write(
            self.style.SUCCESS(
                f"Local test account is ready: {TEST_EMAIL}; "
                + (
                    "password was set to 123456."
                    if options.get("reset_password")
                    else "existing password was preserved."
                )
            )
        )
