import io
import json
import tempfile
import uuid
import zipfile
from datetime import date, timedelta

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings
from django.utils import timezone

from modules.accounts.models import User
from modules.analysis.models import Analysis
from modules.documents.models import DocumentAttachment, DocumentRecord
from modules.execution.models import Action, Decision, Goal
from modules.imports.models import WorkspaceImportBatch
from modules.strategy.models import StrategyFactor, StrategyOption
from modules.workspaces.models import BillingAccount, Membership, Workspace, WorkspaceProfile

from .models import ExportSnapshot
from .services import EXPORT_SCOPE


class WorkspaceExportApiTests(TestCase):
    @staticmethod
    def create_user(email, name):
        return User.objects.create_user(
            email,
            password='not-a-real-user-password',
            display_name=name,
            email_verified_at=timezone.now(),
        )

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.storage_override = override_settings(MEDIA_ROOT=self.temp_dir.name)
        self.storage_override.enable()
        self.addCleanup(self.storage_override.disable)
        self.addCleanup(self.temp_dir.cleanup)

        self.owner = self.create_user('report-owner@example.test', 'Project owner')
        self.viewer = self.create_user('report-viewer@example.test', 'Project viewer')
        self.outsider = self.create_user('report-outsider@example.test', 'Outsider')
        self.workspace = Workspace.objects.create(
            owner=self.owner,
            billing_account=BillingAccount.objects.create(owner=self.owner),
            name='Quarterly strategy',
        )
        WorkspaceProfile.objects.create(
            workspace=self.workspace,
            company_name='Sample company',
            industry='Technology',
            mission='Build a reliable planning service.',
        )
        Membership.objects.create(workspace=self.workspace, user=self.viewer, role=Membership.Role.VIEWER)
        self.path = f'/api/v1/workspaces/{self.workspace.pk}/exports/'

    def create_project_records(self):
        analysis = Analysis.objects.create(
            workspace=self.workspace,
            created_by=self.owner,
            kind=Analysis.Kind.EFE,
            method_version='efe-v1',
            inputs={'rows': [{'id': 'market-1', 'title': 'Market signal', 'weight': 100, 'rating': 3, 'evidence': 'Interview notes'}]},
            output={'score': 3.0, 'rounded_score': 3.0, 'midpoint': 2.5, 'ready': True},
            state=Analysis.State.FINALIZED,
        )
        factor = StrategyFactor.objects.create(
            workspace=self.workspace,
            created_by=self.owner,
            factor_type=StrategyFactor.Type.OPPORTUNITY,
            title='New segment',
            evidence='Confirmed interest',
            owner='Research team',
            priority=4,
        )
        option = StrategyOption.objects.create(
            workspace=self.workspace,
            created_by=self.owner,
            category=StrategyOption.Category.SO,
            title='Enter a focused segment',
            action='Run a scoped pilot.',
            rationale='Evidence indicates demand.',
            hypothesis='The segment will retain.',
        )
        option.factors.add(factor)
        decision = Decision.objects.create(
            workspace=self.workspace,
            created_by=self.owner,
            title='Run a pilot',
            rationale='Validate demand before expansion.',
            assumptions='The current team can serve five customers.',
            review_trigger='Review after six weeks.',
            source_analysis=analysis,
            status=Decision.Status.APPROVED,
        )
        goal = Goal.objects.create(
            workspace=self.workspace,
            created_by=self.owner,
            title='Validate retention',
            description='Measure repeat use.',
            due_on=date.today() + timedelta(days=30),
        )
        Action.objects.create(
            workspace=self.workspace,
            decision=decision,
            goal=goal,
            owner=self.owner,
            created_by=self.owner,
            title='Interview pilot users',
            description='Record evidence after each interview.',
            due_on=date.today() + timedelta(days=7),
        )
        document = DocumentRecord.objects.create(
            workspace=self.workspace,
            template_id='executive-onepage',
            stage='mvp',
            industry='technology',
            owner=self.owner,
            created_by=self.owner,
            updated_by=self.owner,
            status=DocumentRecord.Status.READY,
            content='One-page company summary',
        )
        file_content = b'allowed attachment'
        stored_key = default_storage.save('quarantine/test-report-file.txt', ContentFile(file_content))
        attachment = DocumentAttachment.objects.create(
            workspace=self.workspace,
            document=document,
            created_by=self.owner,
            request_id=uuid.uuid4(),
            original_name='strategy-notes.txt',
            extension='txt',
            media_type='text/plain',
            version=1,
            reserved_size_bytes=len(file_content),
            size_bytes=len(file_content),
            sha256='a' * 64,
            storage_key=stored_key,
            status=DocumentAttachment.Status.READY,
            expires_at=timezone.now() + timedelta(minutes=30),
        )
        return analysis, factor, option, decision, goal, document, attachment

    def create_export(self, actor, *, key='report-key-1'):
        self.client.force_login(actor)
        return self.client.post(
            self.path,
            data='{}',
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY=key,
        )

    def test_viewer_can_create_versioned_immutable_export_and_download_scoped_files(self):
        self.create_project_records()
        response = self.create_export(self.viewer)

        self.assertEqual(response.status_code, 201, response.content)
        payload = response.json()
        self.assertEqual(payload['snapshot']['schema'], 'stratino-workspace-v1')
        self.assertEqual(payload['snapshot']['scope'], EXPORT_SCOPE)
        data = payload['snapshot']['data']
        self.assertEqual(data['workspace']['name'], 'Quarterly strategy')
        self.assertEqual(data['analyses'][0]['output']['rounded_score'], 3.0)
        self.assertEqual(data['strategy_options'][0]['factor_ids'], [str(StrategyFactor.objects.get().pk)])
        self.assertEqual(data['documents'][0]['attachments'][0]['name'], 'strategy-notes.txt')
        self.assertNotIn('storage_key', json.dumps(data))
        self.assertNotIn('billing_account_id', data['workspace'])
        self.assertNotIn('email', json.dumps(data))

        snapshot = ExportSnapshot.objects.get(pk=payload['id'])
        original_digest = snapshot.artifact_sha256
        self.workspace.name = 'Changed later'
        self.workspace.save(update_fields=['name'])
        detail = self.client.get(self.path + f'{snapshot.pk}/')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()['snapshot']['data']['workspace']['name'], 'Quarterly strategy')
        self.assertEqual(ExportSnapshot.objects.get(pk=snapshot.pk).artifact_sha256, original_digest)

        archive_response = self.client.get(self.path + f'{snapshot.pk}/download/?format=zip')
        self.assertEqual(archive_response.status_code, 200)
        self.assertEqual(archive_response['ETag'], f'"{original_digest}"')
        with zipfile.ZipFile(io.BytesIO(b''.join(archive_response.streaming_content))) as archive:
            members = archive.namelist()
            self.assertIn('workspace.json', members)
            self.assertIn('records.csv', members)
            attachment_path = next(name for name in members if name.endswith('/strategy-notes.txt'))
            self.assertEqual(archive.read(attachment_path), b'allowed attachment')
            exported = json.loads(archive.read('workspace.json'))
            self.assertEqual(exported['schema'], 'stratino-workspace-v1')

        json_response = self.client.get(self.path + f'{snapshot.pk}/download/?format=json')
        self.assertEqual(json_response.status_code, 200)
        self.assertEqual(json.loads(json_response.content)['data']['workspace']['name'], 'Quarterly strategy')
        csv_response = self.client.get(self.path + f'{snapshot.pk}/download/?format=csv')
        self.assertEqual(csv_response.status_code, 200)
        self.assertIn(b'schema_version,section,record_id,record_json', csv_response.content)

    def test_idempotency_reuses_snapshot_and_unauthorized_workspace_access_is_hidden(self):
        created = self.create_export(self.viewer)
        repeated = self.create_export(self.viewer)
        self.assertEqual(created.status_code, 201)
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(created.json()['id'], repeated.json()['id'])
        self.assertEqual(ExportSnapshot.objects.count(), 1)

        other = Workspace.objects.create(
            owner=self.outsider,
            billing_account=BillingAccount.objects.create(owner=self.outsider),
            name='Other project',
        )
        self.client.force_login(self.viewer)
        foreign_path = f'/api/v1/workspaces/{other.pk}/exports/{created.json()["id"]}/'
        self.assertEqual(self.client.get(foreign_path).status_code, 404)
        self.assertEqual(self.client.post(f'/api/v1/workspaces/{other.pk}/exports/', data='{}', content_type='application/json', HTTP_IDEMPOTENCY_KEY='foreign').status_code, 404)

        Membership.objects.filter(workspace=self.workspace, user=self.viewer).delete()
        self.assertEqual(self.client.get(self.path + f'{created.json()["id"]}/').status_code, 404)
        self.assertEqual(
            self.client.get(self.path + f'{created.json()["id"]}/download/?format=zip').status_code,
            404,
        )

    def test_export_requires_a_verified_member_and_valid_format_and_key(self):
        self.assertEqual(self.client.get(self.path).status_code, 401)

        unverified = User.objects.create_user(
            'report-unverified@example.test',
            password='not-a-real-user-password',
            display_name='Unverified user',
        )
        self.client.force_login(unverified)
        rejected = self.client.post(
            self.path,
            data='{}',
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='unverified-key',
        )
        self.assertEqual(rejected.status_code, 401)

        self.client.force_login(self.viewer)
        invalid_key = self.client.post(
            self.path,
            data='{}',
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='contains spaces',
        )
        self.assertEqual(invalid_key.status_code, 400)
        self.assertEqual(invalid_key.json()['code'], 'invalid_idempotency_key')

        created = self.client.post(
            self.path,
            data='{}',
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='valid-key',
        )
        self.assertEqual(created.status_code, 201, created.content)
        invalid_format = self.client.get(
            self.path + f'{created.json()["id"]}/download/?format=xml',
        )
        self.assertEqual(invalid_format.status_code, 400)
        self.assertEqual(invalid_format.json()['code'], 'invalid_export_format')

    def test_missing_private_archive_returns_recoverable_error(self):
        created = self.create_export(self.owner, key='missing-archive')
        self.assertEqual(created.status_code, 201, created.content)
        snapshot = ExportSnapshot.objects.get(pk=created.json()['id'])
        default_storage.delete(snapshot.artifact_key)

        response = self.client.get(self.path + f'{snapshot.pk}/download/?format=zip')
        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.json()['code'], 'export_file_unavailable')

    def test_generated_json_export_roundtrips_to_a_non_destructive_import_archive(self):
        self.create_project_records()
        exported = self.create_export(self.owner, key='roundtrip-export')
        self.assertEqual(exported.status_code, 201, exported.content)
        envelope = exported.json()['snapshot']
        self.assertIn('workspace', envelope['scope'])

        import_path = f'/api/v1/workspaces/{self.workspace.pk}/imports/'
        request_body = json.dumps({'schema_version': 1, 'data': envelope})
        preview = self.client.post(
            import_path + 'preview/',
            data=request_body,
            content_type='application/json',
        )
        self.assertEqual(preview.status_code, 200, preview.content)
        self.assertEqual(preview.json()['record_counts']['analysis_records'], 1)
        self.assertEqual(WorkspaceImportBatch.objects.count(), 0)

        saved = self.client.post(
            import_path,
            data=request_body,
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='roundtrip-import',
        )
        self.assertEqual(saved.status_code, 201, saved.content)
        batch = WorkspaceImportBatch.objects.get(pk=saved.json()['id'])
        self.assertEqual(batch.source_backup, envelope)
        self.assertEqual(batch.data['source_workspace']['id'], str(self.workspace.pk))
        self.assertEqual(Workspace.objects.get(pk=self.workspace.pk).name, 'Quarterly strategy')

    def test_only_scanned_ready_attachments_are_exported(self):
        self.create_project_records()
        document = DocumentRecord.objects.get(workspace=self.workspace)
        file_content = b'quarantined'
        stored_key = default_storage.save('quarantine/not-ready.txt', ContentFile(file_content))
        DocumentAttachment.objects.create(
            workspace=self.workspace,
            document=document,
            created_by=self.owner,
            request_id=uuid.uuid4(),
            original_name='pending.txt',
            extension='txt',
            media_type='text/plain',
            version=2,
            reserved_size_bytes=len(file_content),
            size_bytes=len(file_content),
            sha256='b' * 64,
            storage_key=stored_key,
            status=DocumentAttachment.Status.QUARANTINED,
            expires_at=timezone.now() + timedelta(minutes=30),
        )
        response = self.create_export(self.owner)
        self.assertEqual(response.status_code, 201, response.content)
        names = [item['name'] for item in response.json()['snapshot']['data']['ready_attachments']]
        self.assertEqual(names, ['strategy-notes.txt'])
        archive_response = self.client.get(
            self.path + f'{response.json()["id"]}/download/?format=zip',
        )
        self.assertEqual(archive_response.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(b''.join(archive_response.streaming_content))) as archive:
            self.assertTrue(any(name.endswith('/strategy-notes.txt') for name in archive.namelist()))
            self.assertFalse(any(name.endswith('/pending.txt') for name in archive.namelist()))
