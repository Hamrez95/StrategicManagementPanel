import json
from pathlib import Path

from django.test import TestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.workspaces.models import BillingAccount, Membership, Workspace


FIXTURES = json.loads((Path(__file__).resolve().parents[4] / 'docs' / 'fixtures' / 'efe-ife.json').read_text(encoding='utf-8'))


class AnalysisMatrixApiTests(TestCase):
    def setUp(self):
        self.owner = self.user('matrix-owner@example.test')
        self.editor = self.user('matrix-editor@example.test')
        self.viewer = self.user('matrix-viewer@example.test')
        self.outsider = self.user('matrix-outsider@example.test')
        self.workspace = self.make_workspace(self.owner, 'Workspace A')
        self.other_workspace = self.make_workspace(self.outsider, 'Workspace B')
        Membership.objects.create(workspace=self.workspace, user=self.editor, role=Membership.Role.EDITOR)
        Membership.objects.create(workspace=self.workspace, user=self.viewer, role=Membership.Role.VIEWER)
        Membership.objects.create(workspace=self.other_workspace, user=self.editor, role=Membership.Role.EDITOR)

    @staticmethod
    def user(email):
        return User.objects.create_user(email, password='not-a-real-user-password', email_verified_at=timezone.now())

    @staticmethod
    def make_workspace(owner, name):
        billing = BillingAccount.objects.create(owner=owner)
        return Workspace.objects.create(owner=owner, billing_account=billing, name=name)

    def body(self, kind='efe', *, state='draft', rows=None, revision=1):
        fixture = FIXTURES[kind]
        return {
            'revision': revision,
            'kind': kind,
            'schema_version': 1,
            'method_version': f'{kind}-v1',
            'inputs': {'rows': rows if rows is not None else fixture['rows']},
            'state': state,
        }

    def create(self, *, actor=None, body=None):
        self.client.force_login(actor or self.owner)
        return self.client.post(
            f'/api/v1/workspaces/{self.workspace.pk}/analyses/',
            data=body or self.body(),
            content_type='application/json',
        )

    def test_shared_golden_fixture_is_calculated_and_survives_refresh(self):
        response = self.create(body=self.body(state='finalized'))
        self.assertEqual(response.status_code, 201, response.content)
        payload = response.json()
        self.assertEqual(payload['output']['rounded_score'], FIXTURES['efe']['expected']['rounded_score'])
        self.assertEqual(payload['method_version'], 'efe-v1')
        self.assertEqual(payload['state'], 'finalized')
        listed = self.client.get(f'/api/v1/workspaces/{self.workspace.pk}/analyses/').json()['items']
        self.assertEqual(listed[0]['output'], payload['output'])

    def test_draft_can_be_saved_but_missing_evidence_cannot_be_finalized(self):
        rows = json.loads(json.dumps(FIXTURES['efe']['rows']))
        rows[0]['evidence'] = ''
        created = self.create(body=self.body(rows=rows))
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()['output']['rounded_score'], 2.82)
        body = self.body(state='finalized', rows=rows, revision=1)
        finalized = self.client.patch(
            f"/api/v1/workspaces/{self.workspace.pk}/analyses/{created.json()['id']}/",
            data=body,
            content_type='application/json',
        )
        self.assertEqual(finalized.status_code, 422)
        self.assertEqual(finalized.json()['code'], 'incomplete_calculation')

    def test_weights_and_ife_ratings_are_required_to_finalize(self):
        rows = json.loads(json.dumps(FIXTURES['efe']['rows']))
        rows[0]['weight'] = 14
        invalid_weights = self.create(body=self.body(state='finalized', rows=rows))
        self.assertEqual(invalid_weights.status_code, 422)

        rows = json.loads(json.dumps(FIXTURES['ife']['rows']))
        rows[0]['rating'] = 2
        invalid_rating = self.create(body=self.body(kind='ife', state='finalized', rows=rows))
        self.assertEqual(invalid_rating.status_code, 422)
        self.assertIn('ife_rating_mismatch', str(invalid_rating.json()['fields']))

    def test_versions_are_registered_and_other_matrix_kinds_fail_closed(self):
        unsupported = self.body()
        unsupported.update(kind='qspm', method_version='qspm-v1')
        response = self.create(body=unsupported)
        self.assertEqual(response.status_code, 400)
        unsupported = self.body()
        unsupported['method_version'] = 'efe-v2'
        response = self.create(body=unsupported)
        self.assertEqual(response.status_code, 400)

    def test_workspace_isolation_roles_and_revision_conflicts(self):
        created = self.create()
        record_id = created.json()['id']
        self.client.force_login(self.viewer)
        self.assertEqual(self.client.get(f'/api/v1/workspaces/{self.workspace.pk}/analyses/').status_code, 200)
        denied = self.client.patch(
            f'/api/v1/workspaces/{self.workspace.pk}/analyses/{record_id}/',
            data=self.body(revision=1),
            content_type='application/json',
        )
        self.assertEqual(denied.status_code, 403)
        self.client.force_login(self.editor)
        outsider_read = self.client.get(f'/api/v1/workspaces/{self.other_workspace.pk}/analyses/{record_id}/')
        self.assertEqual(outsider_read.status_code, 404)
        updated = self.client.patch(
            f'/api/v1/workspaces/{self.workspace.pk}/analyses/{record_id}/',
            data=self.body(revision=1),
            content_type='application/json',
        )
        self.assertEqual(updated.status_code, 200)
        stale = self.client.patch(
            f'/api/v1/workspaces/{self.workspace.pk}/analyses/{record_id}/',
            data=self.body(revision=1),
            content_type='application/json',
        )
        self.assertEqual(stale.status_code, 409)

    def test_empty_draft_persists_incomplete_state_and_delete_is_scoped(self):
        created = self.create(body=self.body(rows=[]))
        self.assertEqual(created.status_code, 201)
        self.assertIsNone(created.json()['output']['score'])
        deleted = self.client.delete(f"/api/v1/workspaces/{self.workspace.pk}/analyses/{created.json()['id']}/")
        self.assertEqual(deleted.status_code, 200)
        self.assertTrue(deleted.json()['deleted'])
