import json
from io import StringIO

from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from modules.accounts.models import User
from modules.core.integrity import audit_data, schema_inventory
from modules.customer_context.models import IdealCustomerProfile, Segment
from modules.strategy.models import StrategyFactor, StrategyOption, StrategyOptionFactor
from modules.workspaces.models import BillingAccount, Membership, Workspace


class ModelIntegrityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user('integrity-owner@example.test', email_verified_at=timezone.now())
        cls.other = User.objects.create_user('integrity-other@example.test', email_verified_at=timezone.now())
        cls.a = Workspace.objects.create(owner=cls.owner, billing_account=BillingAccount.objects.create(owner=cls.owner), name='Private secret company')
        cls.b = Workspace.objects.create(owner=cls.other, billing_account=BillingAccount.objects.create(owner=cls.other), name='Another company')

    def reject_at_commit(self, operation):
        with self.assertRaises(IntegrityError), transaction.atomic():
            operation()
            with connection.cursor() as cursor:
                cursor.execute('SET CONSTRAINTS ALL IMMEDIATE')

    def test_direct_orm_cross_workspace_foreign_key_is_rejected(self):
        segment = Segment.objects.create(workspace=self.b, name='B customers')
        self.reject_at_commit(lambda: IdealCustomerProfile.objects.create(workspace=self.a, segment=segment, name='Mismatch'))
        self.assertFalse(IdealCustomerProfile.objects.exists())

    def test_bulk_bridge_cannot_connect_different_workspaces(self):
        option = StrategyOption.objects.create(workspace=self.a, created_by=self.owner, category='SO', title='Option')
        factor = StrategyFactor.objects.create(workspace=self.b, created_by=self.other, factor_type='strength', title='Factor')
        self.reject_at_commit(lambda: StrategyOptionFactor.objects.bulk_create([StrategyOptionFactor(option=option, factor=factor)]))
        self.assertFalse(StrategyOptionFactor.objects.exists())

    def test_bulk_reparent_of_canonical_record_is_rejected(self):
        segment = Segment.objects.create(workspace=self.a, name='A customers')
        self.reject_at_commit(lambda: Segment.objects.filter(pk=segment.pk).update(workspace=self.b))
        segment.refresh_from_db()
        self.assertEqual(segment.workspace_id, self.a.pk)

    def test_billing_owner_and_membership_ownership_are_database_invariants(self):
        self.reject_at_commit(lambda: Workspace.objects.create(owner=self.owner, billing_account=self.b.billing_account, name='Wrong owner'))
        self.reject_at_commit(lambda: Membership.objects.create(workspace=self.a, user=self.owner, role='viewer'))
        self.reject_at_commit(lambda: BillingAccount.objects.filter(pk=self.a.billing_account_id).update(owner=self.other))
        self.reject_at_commit(lambda: Workspace.objects.filter(pk=self.a.pk).update(owner=self.other, billing_account=self.b.billing_account))

    def test_invalid_choices_cannot_be_written_through_queryset_update(self):
        self.reject_at_commit(lambda: BillingAccount.objects.filter(pk=self.a.billing_account_id).update(status='invented'))
        factor = StrategyFactor.objects.create(workspace=self.a, created_by=self.owner, factor_type='strength', title='Factor')
        self.reject_at_commit(lambda: StrategyFactor.objects.filter(pk=factor.pk).update(factor_type='invented'))

    def test_audit_is_read_only_and_never_emits_private_values(self):
        with CaptureQueriesContext(connection) as queries:
            result = audit_data()
        self.assertEqual(result['violations'], 0)
        self.assertGreater(result['checks_run'], 100)
        self.assertTrue(all(query['sql'].lstrip().upper().startswith('SELECT') for query in queries))
        output = StringIO()
        call_command('audit_model_integrity', summary=True, stdout=output)
        self.assertEqual(json.loads(output.getvalue())['violations'], 0)
        self.assertNotIn('Private secret company', output.getvalue())
        self.assertNotIn(self.owner.email, output.getvalue())
        self.assertTrue(any(row['model'] == 'analysis.AnalysisRevision' for row in schema_inventory()))
