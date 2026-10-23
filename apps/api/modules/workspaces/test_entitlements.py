import json
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

from django.core.exceptions import PermissionDenied
from django.db import IntegrityError, transaction, close_old_connections, connections
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from modules.accounts.models import User
from modules.analysis.services import create_analysis, update_analysis
from modules.core.resources import resource_path
from modules.workspaces.entitlements import grant_management_subscription, management_access, revoke_management_subscription
from modules.workspaces.models import ManagementPlan, ManagementSubscriptionEvent, Membership, Workspace
from modules.workspaces.services import WorkspaceActionError, create_owned_workspace, update_workspace


class ManagementEntitlementTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user('free-owner@example.test', email_verified_at=timezone.now())
        self.other = User.objects.create_user('other-owner@example.test', email_verified_at=timezone.now())
        self.operator = User.objects.create_superuser('operator@example.test', password='synthetic-only-test-password')
        self.workspace = create_owned_workspace(self.owner, 'Free workspace')
        self.billing = self.workspace.billing_account
        self.plan = ManagementPlan.objects.create(code='special-test', title='Special test', is_active=True, owned_workspace_limit=3, can_finalize_analysis=True, can_calculate_metrics=True, can_generate_reports=True, duration_days=30)

    def grant(self, request_id=None):
        return grant_management_subscription(self.operator, self.billing, self.plan, request_id=request_id or uuid4(), reason='Synthetic approved grant')

    def test_free_has_one_owned_workspace_and_joined_workspaces_do_not_consume_it(self):
        access = management_access(self.owner)
        self.assertEqual(access['owned_workspace_limit'], 1)
        self.assertFalse(access['can_create_workspace'])
        with self.assertRaises(WorkspaceActionError) as failure:
            create_owned_workspace(self.owner, 'Second')
        self.assertEqual(failure.exception.code, 'workspace_subscription_limit')
        joined = create_owned_workspace(self.other, 'Joined workspace')
        Membership.objects.create(workspace=joined, user=self.owner, role='editor')
        self.assertEqual(management_access(self.owner)['owned_workspaces'], 1)
        self.assertEqual(Workspace.objects.count(), 2)

    def test_archiving_frees_capacity_and_restore_checks_current_limit(self):
        update_workspace(self.owner, self.workspace, revision=1, archived=True)
        create_owned_workspace(self.owner, 'Replacement')
        with self.assertRaises(WorkspaceActionError):
            update_workspace(self.owner, self.workspace, revision=2, archived=False)
        self.workspace.refresh_from_db()
        self.assertIsNotNone(self.workspace.archived_at)

    def test_drafts_and_personal_export_are_free_but_finalization_is_checked_on_server(self):
        rows = json.loads(resource_path('fixtures/efe-ife.json').read_text(encoding='utf-8'))['efe']['rows']
        body = {'kind': 'efe', 'schema_version': 1, 'method_version': 'efe-v1', 'inputs': {'rows': rows}, 'state': 'draft', 'revision': 1}
        draft = create_analysis(self.owner, self.workspace, body)
        with self.assertRaises(WorkspaceActionError) as failure:
            update_analysis(self.owner, self.workspace, draft['id'], {**body, 'state': 'finalized'})
        self.assertEqual(failure.exception.code, 'management_subscription_required')
        grant = self.grant()
        finalized = update_analysis(self.owner, self.workspace, draft['id'], {**body, 'state': 'finalized'})
        self.assertEqual(finalized['state'], 'finalized')
        revoke_management_subscription(self.operator, grant, reason='Synthetic downgrade')
        self.assertFalse(management_access(self.owner)['features']['can_finalize_analysis'])
        self.client.force_login(self.owner)
        # Raw export remains independent from management output entitlements.
        from modules.exports.services import create_snapshot
        with tempfile.TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            snapshot = create_snapshot(self.owner, self.workspace, 'free-personal-export')
            self.assertIsNotNone(snapshot)

    def test_grants_are_idempotent_frozen_audited_and_require_authorized_operator(self):
        with self.assertRaises(PermissionDenied):
            grant_management_subscription(self.owner, self.billing, self.plan, request_id=uuid4(), reason='Not authorized')
        key = uuid4()
        grant = self.grant(key)
        self.assertEqual(self.grant(key).pk, grant.pk)
        self.assertEqual(ManagementSubscriptionEvent.objects.count(), 1)
        self.plan.title = 'Changed catalog title'
        self.plan.owned_workspace_limit = 100
        self.plan.save()
        self.assertEqual(management_access(self.owner)['owned_workspace_limit'], 3)
        self.assertEqual(management_access(self.owner)['subscriptions'][0]['title'], 'Special test')
        with self.assertRaises(IntegrityError), transaction.atomic():
            type(grant).objects.filter(pk=grant.pk).update(owned_workspace_limit=100)
        revoke_management_subscription(self.operator, grant, reason='Synthetic revocation')
        revoke_management_subscription(self.operator, grant, reason='Synthetic revocation')
        self.assertFalse(management_access(self.owner)['features']['can_finalize_analysis'])
        self.assertEqual(ManagementSubscriptionEvent.objects.count(), 2)

    def test_capabilities_follow_workspace_owner_and_never_leak_billing_to_members(self):
        self.grant()
        Membership.objects.create(workspace=self.workspace, user=self.other, role='editor')
        self.client.force_login(self.other)
        endpoint = f'/api/v1/workspaces/{self.workspace.pk}/entitlements/'
        response = self.client.get(endpoint)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['features']['can_finalize_analysis'])
        self.assertNotIn('subscriptions', response.json())
        self.assertNotIn('owned_workspaces', response.json())
        Membership.objects.filter(workspace=self.workspace, user=self.other).delete()
        self.assertEqual(self.client.get(endpoint).status_code, 404)

    def test_future_and_expired_grants_do_not_unlock_features(self):
        # Immutable grants are inserted as historical fixtures, never edited into new periods.
        from .models import ManagementSubscription
        for start, end in [(timezone.now()+timedelta(days=1), None), (timezone.now()-timedelta(days=2), timezone.now()-timedelta(days=1))]:
            ManagementSubscription.objects.create(billing_account=self.billing, plan=self.plan, request_id=uuid4(), starts_at=start, ends_at=end, plan_title=self.plan.title, plan_revision=1, granted_by=self.operator, reason='Historical synthetic fixture', can_finalize_analysis=True)
        self.assertFalse(management_access(self.owner)['features']['can_finalize_analysis'])


class ManagementQuotaRaceTests(TransactionTestCase):
    def test_two_concurrent_creates_cannot_bypass_the_free_workspace_limit(self):
        owner = User.objects.create_user('race-owner@example.test', email_verified_at=timezone.now())

        def create_one(index):
            close_old_connections()
            try:
                user = User.objects.get(pk=owner.pk)
                create_owned_workspace(user, f'Concurrent workspace {index}')
                return 'created'
            except WorkspaceActionError as error:
                return error.code
            finally:
                connections['default'].close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(create_one, [1, 2]))
        self.assertEqual(sorted(results), ['created', 'workspace_subscription_limit'])
        self.assertEqual(Workspace.objects.filter(owner=owner).count(), 1)
