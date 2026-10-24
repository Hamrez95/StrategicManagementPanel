import io
import hashlib
import json
import tempfile
import uuid
import zipfile
from unittest.mock import patch
from datetime import date, timedelta

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings
from django.utils import timezone

from modules.accounts.models import User
from modules.analysis.models import Analysis, AnalysisRevision
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
        attachment_id = uuid.uuid4()
        stored_key = default_storage.save(f'attachments/{attachment_id.hex}', ContentFile(file_content))
        attachment = DocumentAttachment.objects.create(
            id=attachment_id,
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
            sha256=hashlib.sha256(file_content).hexdigest(),
            storage_key=stored_key,
            status=DocumentAttachment.Status.READY,
            expires_at=timezone.now() + timedelta(minutes=30),
        )
        return analysis, factor, option, decision, goal, document, attachment

    def create_export(self, actor, *, key='report-key-1', body=None):
        self.client.force_login(actor)
        return self.client.post(
            self.path,
            data=json.dumps(body or {}),
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

    def test_v2_includes_canonical_unknown_zero_and_deleted_analysis_history(self):
        from modules.metrics.models import InputObservation
        from modules.customer_context.models import Product
        Product.objects.create(workspace=self.workspace, name='محصول واقعی')
        for state, value in [('observed', 0), ('unknown', None)]:
            InputObservation.objects.create(workspace=self.workspace, recorded_by=self.owner,
                binding_id='net_revenue', period_start='2026-01-01', period_end='2026-02-01',
                state=state, value=value, unit='currency', currency='IRR', accounting_basis='cash',
                source_kind='owner_reported', source_id=state, source_revision='1', reason='نامشخص' if value is None else '')
        source_id = uuid.uuid4()
        AnalysisRevision.objects.create(workspace=self.workspace, source_record_id=source_id, revision=1,
            snapshot={'kind': 'ife', 'state': 'draft', 'inputs': {'rows': []}}, is_backfill=True)
        created = self.create_export(self.viewer, body={'schema_version': 2})
        self.assertEqual(created.status_code, 201, created.content)
        envelope = created.json()['snapshot']
        self.assertEqual(envelope['schema'], 'stratino-workspace-v2')
        self.assertEqual(len(envelope['scope']), 29)
        data = envelope['data']
        self.assertEqual(data['products'][0]['name'], 'محصول واقعی')
        self.assertEqual({row['state']: row['value'] for row in data['observations']}, {'observed': '0.000000', 'unknown': None})
        self.assertEqual(data['analysis_history'][0]['source_record_id'], str(source_id))
        self.assertIsNone(data['report_verification'])
        self.assertNotIn('storage_key', json.dumps(data))
        imported = self.client.post(f'/api/v1/workspaces/{self.workspace.pk}/imports/',
            data=json.dumps({'schema_version': 1, 'data': envelope}), content_type='application/json', HTTP_IDEMPOTENCY_KEY='v2-import')
        self.client.force_login(self.owner)
        imported = self.client.post(f'/api/v1/workspaces/{self.workspace.pk}/imports/',
            data=json.dumps({'schema_version': 1, 'data': envelope}), content_type='application/json', HTTP_IDEMPOTENCY_KEY='v2-import')
        self.assertEqual(imported.status_code, 201, imported.content)
        self.assertEqual(WorkspaceImportBatch.objects.get().source_backup, envelope)
        original = self.create_export(self.viewer, key='legacy')
        self.assertEqual(set(original.json()['snapshot']['data']), set(EXPORT_SCOPE))

    def special_grant(self):
        from modules.workspaces.models import ManagementPlan, ManagementSubscription
        plan = ManagementPlan.objects.create(code='report-test', title='Test special', is_active=True, can_generate_reports=True)
        return ManagementSubscription.objects.create(billing_account=self.workspace.billing_account, plan=plan,
            request_id=uuid.uuid4(), starts_at=timezone.now() - timedelta(minutes=1), plan_title=plan.title,
            plan_revision=plan.revision, can_generate_reports=True, granted_by=self.owner, reason='Synthetic report test')

    def test_professional_requires_entitlement_and_recalculates_without_mutating_inputs(self):
        analysis, *_ = self.create_project_records()
        analysis.inputs['rows'][0]['factor_type'] = 'opportunity'
        analysis.output = {'score': 99, 'ready': True}
        analysis.save()
        body = {'schema_version': 2, 'purpose': 'professional'}
        denied = self.create_export(self.viewer, body=body)
        self.assertEqual(denied.status_code, 403, denied.content)
        self.assertEqual(ExportSnapshot.objects.count(), 0)
        grant = self.special_grant()
        created = self.create_export(self.viewer, body=body)
        self.assertEqual(created.status_code, 201, created.content)
        data = created.json()['snapshot']['data']
        self.assertEqual(data['analyses'][0]['output']['score'], 99)
        self.assertEqual(data['report_verification']['analyses'][0]['output']['score'], 3)
        self.assertTrue(data['report_verification']['calculated_server_side'])
        analysis.inputs['rows'][0]['rating'] = 1
        analysis.save()
        detail = self.client.get(self.path + created.json()['id'] + '/')
        self.assertEqual(detail.json()['snapshot']['data']['report_verification']['analyses'][0]['output']['score'], 3)
        grant.status = 'revoked'
        grant.save(update_fields=['status'])
        for suffix in ('/', '/download/?format=json', '/download/?format=csv', '/download/?format=zip'):
            self.assertEqual(self.client.get(self.path + created.json()['id'] + suffix).status_code, 403)
        self.assertEqual(self.create_export(self.viewer, key='raw-after-revoke', body={'schema_version': 2}).status_code, 201)

    def test_unsupported_professional_method_fails_without_storing_artifact(self):
        self.special_grant()
        analysis, *_ = self.create_project_records()
        analysis.method_version = 'unsupported'
        analysis.save()
        response = self.create_export(self.owner, body={'schema_version': 2, 'purpose': 'professional'})
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()['code'], 'report_verification_failed')
        self.assertEqual(ExportSnapshot.objects.count(), 0)

    def test_archive_rechecks_membership_after_build_and_does_not_publish(self):
        from .services import _build_archive
        def revoked(*args):
            result = _build_archive(*args)
            Membership.objects.filter(workspace=self.workspace, user=self.viewer).delete()
            return result
        with patch('modules.exports.services._build_archive', side_effect=revoked):
            self.assertEqual(self.create_export(self.viewer).status_code, 404)
        self.assertEqual(ExportSnapshot.objects.count(), 0)

    def test_archive_checks_canonical_storage_path_and_file_checksum(self):
        *_, attachment = self.create_project_records()
        DocumentAttachment.objects.filter(pk=attachment.pk).update(storage_key='../unsafe')
        denied = self.create_export(self.owner)
        self.assertEqual(denied.status_code, 400)
        self.assertEqual(denied.json()['code'], 'unsafe_attachment_path')
        DocumentAttachment.objects.filter(pk=attachment.pk).update(storage_key=attachment.storage_key, sha256='0' * 64)
        denied = self.create_export(self.owner)
        self.assertEqual(denied.status_code, 400)
        self.assertEqual(denied.json()['code'], 'attachment_integrity_failed')
        self.assertEqual(ExportSnapshot.objects.count(), 0)

    def test_schema_selection_is_explicit_and_idempotency_cannot_change_contract(self):
        first = self.create_export(self.viewer)
        self.assertEqual(first.status_code, 201)
        conflict = self.create_export(self.viewer, body={'schema_version': 2})
        self.assertEqual(conflict.status_code, 400)
        self.assertEqual(conflict.json()['code'], 'export_idempotency_conflict')
        for body in ({'schema_version': True}, {'schema_version': 3}, {'purpose': 'professional'}, {'inputs': {}}):
            self.assertEqual(self.create_export(self.viewer, key='invalid', body=body).status_code, 400)
