from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.analysis.models import Analysis
from modules.documents.models import DocumentRecord
from modules.execution.models import Action, Decision
from modules.workspaces.models import (
    BillingAccount,
    Membership,
    Workspace,
    WorkspaceProfile,
)


class WorkspaceSummaryApiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            'summary-owner@example.test',
            password='not-a-real-user-password',
            email_verified_at=timezone.now(),
        )
        self.viewer = User.objects.create_user(
            'summary-viewer@example.test',
            password='not-a-real-user-password',
            email_verified_at=timezone.now(),
        )
        self.outsider = User.objects.create_user(
            'summary-outsider@example.test',
            password='not-a-real-user-password',
            email_verified_at=timezone.now(),
        )
        self.workspace = Workspace.objects.create(
            owner=self.owner,
            billing_account=BillingAccount.objects.create(owner=self.owner),
            name='Test Workspace',
        )
        WorkspaceProfile.objects.create(workspace=self.workspace)
        Membership.objects.create(workspace=self.workspace, user=self.viewer, role='viewer')

    def url(self):
        return f'/api/v1/workspaces/{self.workspace.pk}/summary/'

    def test_empty_workspace_reports_setup_without_fabricated_progress(self):
        self.client.force_login(self.owner)
        response = self.client.get(self.url())

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['workspace_id'], str(self.workspace.pk))
        self.assertEqual(payload['role'], 'owner')
        self.assertEqual(payload['profile'], {'state': 'empty', 'provided_fields': []})
        self.assertEqual(payload['objective'], None)
        self.assertEqual(payload['unknowns'], ['objective'])
        self.assertEqual(payload['analyses'], {'draft_count': 0, 'finalized_count': 0})
        self.assertEqual(payload['next_action']['kind'], 'complete_profile')
        self.assertEqual(response['Cache-Control'], 'no-store, private')

    def test_summary_uses_scoped_records_and_bounds_attention_and_shortcuts(self):
        WorkspaceProfile.objects.filter(workspace=self.workspace).update(mission='Grow with customer evidence')
        decision = Decision.objects.create(
            workspace=self.workspace,
            title='Review market entry',
            rationale='Evidence is incomplete',
            assumptions='The segment is reachable',
            review_trigger='New customer evidence',
            created_by=self.owner,
        )
        today = timezone.localdate()
        for index in range(5):
            Action.objects.create(
                workspace=self.workspace,
                decision=decision,
                owner=self.owner,
                title=f'Action {index}',
                due_on=today - timedelta(days=1),
                created_by=self.owner,
            )
        for index in range(5):
            DocumentRecord.objects.create(
                workspace=self.workspace,
                template_id=f'doc-{index}',
                stage='unknown',
                industry='general',
                owner=self.owner,
                status=DocumentRecord.Status.DRAFT,
                created_by=self.owner,
                updated_by=self.owner,
            )
        Analysis.objects.create(
            workspace=self.workspace,
            created_by=self.owner,
            kind=Analysis.Kind.IFE,
            method_version='reviewed-fixture',
            inputs={},
            output={},
            state=Analysis.State.FINALIZED,
        )

        self.client.force_login(self.viewer)
        payload = self.client.get(self.url()).json()

        self.assertEqual(payload['role'], 'viewer')
        self.assertEqual(payload['profile']['state'], 'started')
        self.assertEqual(payload['analyses']['finalized_count'], 1)
        self.assertEqual(payload['next_action']['kind'], 'overdue_action')
        self.assertTrue(all(item['is_overdue'] for item in payload['open_actions']))
        self.assertLessEqual(len(payload['open_actions']), 3)
        self.assertLessEqual(len(payload['attention_items']), 3)
        self.assertLessEqual(len(payload['shortcuts']), 3)
        self.assertTrue(all(item['destination'] in {'execution', 'documents'} for item in payload['attention_items']))

    def test_summary_hides_another_workspace_and_rejects_anonymous_requests(self):
        self.assertEqual(self.client.get(self.url()).status_code, 401)
        self.client.force_login(self.outsider)
        response = self.client.get(self.url())
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['code'], 'workspace_not_found')
