from importlib import import_module
from types import SimpleNamespace
from uuid import uuid4

from django.apps import apps
from django.db import connection
from django.test import TestCase

from modules.academy.models import AcademyOrder, AcademyOrderItem, AcademyPlan
from modules.accounts.models import User
from modules.workspaces.models import ManagementPlan


class AnnualCatalogMigrationTests(TestCase):
    def test_academy_changes_offers_only_and_preserves_old_purchase(self):
        user = User.objects.create_user('annual-migration@example.test')
        plan = AcademyPlan.objects.create(code='old-offer', title='Old offer', kind='full', duration_days=30)
        free = AcademyPlan.objects.create(code='free-offer', title='Free', kind='free', duration_days=None)
        order = AcademyOrder.objects.create(user=user, request_id=uuid4())
        item = AcademyOrderItem.objects.create(order=order, plan=plan, plan_title='Old purchase', plan_kind='full', currency='IRR', duration_days=30)
        migrate = import_module('modules.academy.migrations.0006_annual_catalog').annual_catalog
        migrate(apps, SimpleNamespace(connection=connection))
        plan.refresh_from_db()
        free.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(plan.duration_days, 365)
        self.assertIsNone(free.duration_days)
        self.assertEqual((item.duration_days, item.plan_title), (30, 'Old purchase'))

    def test_management_offer_revision_changes_only_once_and_preserves_free(self):
        plan = ManagementPlan.objects.create(code='old-annual', title='Old offer', duration_days=None, revision=3)
        free = ManagementPlan.objects.get(is_default=True)
        before = (free.duration_days, free.revision)
        migrate = import_module('modules.workspaces.migrations.0010_annual_catalog').annual_catalog
        migrate(apps, SimpleNamespace(connection=connection))
        migrate(apps, SimpleNamespace(connection=connection))
        plan.refresh_from_db()
        free.refresh_from_db()
        self.assertEqual((plan.duration_days, plan.revision), (365, 4))
        self.assertEqual((free.duration_days, free.revision), before)
