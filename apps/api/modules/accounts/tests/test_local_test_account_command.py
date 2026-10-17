import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

API_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(API_ROOT))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from django.conf import settings
from django.core.management.base import CommandError

from modules.accounts.management.commands.seed_local_test_account import (
    Command,
    require_local_development,
)
from modules.accounts.models import User


class LocalTestAccountCommandTests(unittest.TestCase):
    def test_production_environment_is_rejected_before_database_access(self):
        with (
            patch.object(settings, "ENVIRONMENT", "production"),
            patch.object(User.objects, "filter") as find_user,
        ):
            with self.assertRaises(CommandError):
                Command().handle()
            find_user.assert_not_called()

    def test_debug_off_is_rejected_before_database_access(self):
        with (
            patch.object(settings, "DEBUG", False),
            patch.object(User.objects, "filter") as find_user,
        ):
            with self.assertRaises(CommandError):
                Command().handle()
            find_user.assert_not_called()

    def test_missing_local_database_acknowledgement_is_rejected(self):
        with (
            patch.object(settings, "STRATINO_ALLOW_TEST_ACCOUNT", False),
            self.assertRaises(CommandError),
        ):
            Command().handle()

    def test_development_requires_all_three_gates(self):
        require_local_development(
            environment="development", debug=True, acknowledged=True
        )
        for environment, debug, acknowledged in (
            ("production", True, True),
            ("test", True, True),
            ("development", False, True),
            ("development", True, False),
        ):
            with (
                self.subTest(
                    environment=environment, debug=debug, acknowledged=acknowledged
                ),
                self.assertRaises(CommandError),
            ):
                require_local_development(
                    environment=environment, debug=debug, acknowledged=acknowledged
                )


if __name__ == "__main__":
    unittest.main()
