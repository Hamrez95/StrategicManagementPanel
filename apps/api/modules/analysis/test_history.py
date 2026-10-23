from copy import deepcopy

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.analysis.models import AnalysisRevision
from modules.analysis.services import create_analysis, delete_analysis, update_analysis
from modules.workspaces.models import BillingAccount, Membership, Workspace


class AnalysisHistoryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user('history-owner@example.test', email_verified_at=timezone.now())
        cls.viewer = User.objects.create_user('history-viewer@example.test', email_verified_at=timezone.now())
        cls.other = User.objects.create_user('history-other@example.test', email_verified_at=timezone.now())
        cls.workspace = Workspace.objects.create(owner=cls.owner, billing_account=BillingAccount.objects.create(owner=cls.owner), name='A')
        cls.foreign = Workspace.objects.create(owner=cls.other, billing_account=BillingAccount.objects.create(owner=cls.other), name='B')
        Membership.objects.create(workspace=cls.workspace, user=cls.viewer, role='viewer')

    def test_saved_revisions_are_frozen_and_survive_editor_row_deletion(self):
        body = {'kind': 'efe', 'schema_version': 1, 'method_version': 'efe-v1', 'inputs': {'rows': []}, 'state': 'draft', 'revision': 1}
        record = create_analysis(self.owner, self.workspace, body)
        first = deepcopy(AnalysisRevision.objects.get().snapshot)
        update_analysis(self.owner, self.workspace, record['id'], body)
        self.assertEqual(list(AnalysisRevision.objects.order_by('revision').values_list('revision', flat=True)), [1, 2])
        self.assertEqual(AnalysisRevision.objects.get(revision=1).snapshot, first)
        history = AnalysisRevision.objects.get(revision=1)
        history.snapshot = {}
        with self.assertRaises(ValidationError):
            history.save()
        delete_analysis(self.owner, self.workspace, record['id'])
        self.assertEqual(AnalysisRevision.objects.count(), 2)
        endpoint = f'/api/v1/workspaces/{self.workspace.pk}/analyses/{record["id"]}/revisions/'
        self.client.force_login(self.viewer)
        response = self.client.get(endpoint)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['revision'] for row in response.json()['items']], [2, 1])
        self.assertEqual(response['Cache-Control'], 'no-store, private')
        self.assertEqual(self.client.post(endpoint).status_code, 405)
        self.assertEqual(self.client.get(endpoint, {'before': 'bad'}).status_code, 400)
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(endpoint).status_code, 404)
        self.assertEqual(self.client.get(endpoint.replace(str(self.workspace.pk), str(self.foreign.pk))).status_code, 404)
