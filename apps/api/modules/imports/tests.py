import json

from django.test import TestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.imports.models import WorkspaceImportBatch
from modules.imports.services import ImportValidationError, inspect_legacy_backup, parse_import_request
from modules.workspaces.models import BillingAccount, Membership, Workspace


def legacy_backup(**changes):
    state = {
        'version': 1,
        'org': {'name': 'Sample company'},
        'completed': [False] * 6,
        'external': [{'id': 'market-1', 'title': 'Market signal'}],
        'internal': [{'id': 'strength-1', 'title': 'Capability'}],
        'qScores': {'option-a': 2},
        'space': {'x': 1, 'y': 2},
        'fin': {'margin': 0.2},
        'investment': {'amount': 1000},
        'trend': {'months': ['1405-01'], 'revenue': [10], 'target': [12]},
        'objectives': [{'id': 'objective-1'}],
        'initiatives': [],
        'risks': [],
        'journal': [{'id': 'decision-1'}],
        'pestel': [],
        'forces': [1, 2, 3, 4, 5],
        'competitors': [],
        'vrio': [],
        'swot': [],
        'options': [{'id': 'a'}, {'id': 'b'}, {'id': 'c'}],
        'products': [],
        'scenario': {'name': 'base'},
        'bcgThreshold': 10,
        'learning': True,
        'mode': 'startup',
        'period': 'quarter',
        'notes': 'Preserve this note',
    }
    state.update(changes)
    return state


class LegacyImportMappingTests(TestCase):
    def test_mapping_preserves_analysis_decisions_and_metadata_without_file_bytes(self):
        state = legacy_backup(attachments=[{
            'file_name': 'plan.pdf',
            'mime_type': 'application/pdf',
            'size': 2048,
            'data_url': 'data:application/pdf;base64,not-real-file-content',
        }])

        result = inspect_legacy_backup(state)

        self.assertEqual(result['data']['analysis']['qspm_scores'], {'option-a': 2})
        self.assertEqual(result['data']['decisions'], [{'id': 'decision-1'}])
        self.assertEqual(result['data']['execution']['objectives'], [{'id': 'objective-1'}])
        self.assertEqual(result['record_counts']['file_metadata'], 1)
        self.assertEqual(result['missing_attachment_bytes'], 1)
        self.assertNotIn('data_url', result['source_backup']['attachments'][0])
        self.assertNotIn('data_url', result['data']['document_metadata'][0])
        without_bytes = inspect_legacy_backup(legacy_backup(attachments=[{
            'file_name': 'plan.pdf', 'mime_type': 'application/pdf', 'size': 2048,
        }]))
        self.assertEqual(result['source_digest'], without_bytes['source_digest'])
        self.assertIn('data_url', state['attachments'][0], 'preview must not mutate the uploaded source')

    def test_rejects_unknown_or_non_finite_and_oversized_payloads(self):
        with self.assertRaises(ImportValidationError):
            inspect_legacy_backup(legacy_backup(unmapped_section={'secret': True}))
        with self.assertRaises(ImportValidationError):
            inspect_legacy_backup(legacy_backup(mode=[]))
        with self.assertRaises(ImportValidationError):
            inspect_legacy_backup({'schema': [], 'schema_version': 1, 'data': legacy_backup()})
        with self.assertRaises(ImportValidationError):
            parse_import_request(b'{"schema_version":1,"data":{"value":NaN}}')
        with self.assertRaises(ImportValidationError):
            parse_import_request(b'{"schema_version":1,"schema_version":1,"data":{}}')
        with self.assertRaises(ImportValidationError):
            parse_import_request(json.dumps({'schema_version': 1, 'data': legacy_backup(notes='\ud800')}).encode('utf-8'))
        with self.assertRaises(ImportValidationError) as oversized:
            parse_import_request(b' ' * 1_001_025)
        self.assertEqual(oversized.exception.code, 'import_too_large')

    def test_schema_envelope_maps_to_the_same_digest_as_direct_state(self):
        state = legacy_backup()
        direct = inspect_legacy_backup(state)
        enveloped = inspect_legacy_backup({
            'schema': 'royesh-strategy-v1',
            'schema_version': 1,
            'data': state,
        })
        self.assertEqual(direct['source_digest'], enveloped['source_digest'])
        self.assertEqual(enveloped['source_backup']['schema'], 'royesh-strategy-v1')
        self.assertIn('data', enveloped['source_backup'])


class WorkspaceImportApiTests(TestCase):
    @staticmethod
    def create_user(email):
        return User.objects.create_user(
            email,
            password='not-a-real-user-password',
            email_verified_at=timezone.now(),
        )

    def setUp(self):
        self.owner = self.create_user('owner@example.test')
        self.editor = self.create_user('editor@example.test')
        self.viewer = self.create_user('viewer@example.test')
        self.outsider = self.create_user('outsider@example.test')
        self.workspace = Workspace.objects.create(
            owner=self.owner,
            billing_account=BillingAccount.objects.create(owner=self.owner),
            name='Import destination',
        )
        Membership.objects.create(workspace=self.workspace, user=self.editor, role=Membership.Role.EDITOR)
        Membership.objects.create(workspace=self.workspace, user=self.viewer, role=Membership.Role.VIEWER)
        self.path = f'/api/v1/workspaces/{self.workspace.pk}/imports/'
        self.body = {'schema_version': 1, 'data': legacy_backup()}

    def post_import(self, actor, *, key='import-1', body=None):
        self.client.force_login(actor)
        return self.client.post(
            self.path,
            data=json.dumps(body if body is not None else self.body),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY=key,
        )

    def test_preview_is_dry_run_and_import_requires_owner_or_editor(self):
        self.client.force_login(self.owner)
        preview = self.client.post(
            self.path + 'preview/',
            data=json.dumps(self.body),
            content_type='application/json',
        )
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.json()['workspace_name'], self.workspace.name)
        self.assertEqual(WorkspaceImportBatch.objects.count(), 0)

        denied = self.post_import(self.viewer)
        self.assertEqual(denied.status_code, 403)
        invisible = self.post_import(self.outsider)
        self.assertEqual(invisible.status_code, 404)
        self.assertEqual(WorkspaceImportBatch.objects.count(), 0)

    def test_commit_is_idempotent_and_undo_keeps_recoverable_snapshot(self):
        created = self.post_import(self.owner)
        self.assertEqual(created.status_code, 201)
        batch_id = created.json()['id']

        repeated_key = self.post_import(self.owner)
        self.assertEqual(repeated_key.status_code, 200)
        self.assertTrue(repeated_key.json()['duplicate'])
        self.assertEqual(repeated_key.json()['id'], batch_id)

        repeated_payload = self.post_import(self.owner, key='import-2')
        self.assertEqual(repeated_payload.status_code, 200)
        self.assertEqual(repeated_payload.json()['id'], batch_id)
        self.assertEqual(WorkspaceImportBatch.objects.count(), 1)

        detail = self.client.get(self.path + f'{batch_id}/')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()['data']['financial']['trend']['months'], ['1405-01'])
        self.assertEqual(detail.json()['source_backup']['notes'], 'Preserve this note')

        self.client.force_login(self.viewer)
        self.assertEqual(self.client.delete(self.path + f'{batch_id}/').status_code, 403)
        self.client.force_login(self.owner)
        undone = self.client.delete(self.path + f'{batch_id}/')
        self.assertEqual(undone.status_code, 204)
        batch = WorkspaceImportBatch.objects.get(pk=batch_id)
        self.assertIsNotNone(batch.undone_at)
        self.assertEqual(batch.source_backup['notes'], 'Preserve this note')

    def test_invalid_and_oversized_requests_do_not_create_partial_batches(self):
        invalid = self.post_import(self.owner, body={'schema_version': 1, 'data': {'version': 999}})
        self.assertEqual(invalid.status_code, 400)

        self.client.force_login(self.owner)
        oversized = self.client.generic(
            'POST',
            self.path,
            b' ' * 1_001_025,
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='large-file',
        )
        self.assertEqual(oversized.status_code, 400)
        self.assertEqual(WorkspaceImportBatch.objects.count(), 0)

    def test_editor_can_import_and_same_key_with_different_data_conflicts(self):
        created = self.post_import(self.editor)
        self.assertEqual(created.status_code, 201)
        different = legacy_backup(notes='Different source')
        conflict = self.post_import(self.editor, body={'schema_version': 1, 'data': different})
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(WorkspaceImportBatch.objects.count(), 1)
