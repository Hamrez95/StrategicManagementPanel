import hashlib
import io
import struct
import tempfile
import uuid
from threading import Barrier, Thread
from unittest.mock import MagicMock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connections
from django.test import SimpleTestCase, TestCase, TransactionTestCase
from django.test.client import BOUNDARY, encode_multipart
from django.test.utils import override_settings
from django.utils import timezone

from modules.accounts.models import User
from modules.documents.catalog import document_catalog
from modules.documents.attachments.scanner import MalwareFound, ScanUnavailable
from modules.documents.models import DocumentAttachment, DocumentEvent, DocumentRecord
from modules.workspaces.models import BillingAccount, Membership, Workspace


class DocumentLibraryApiTests(TestCase):
    def setUp(self):
        self.owner = self.user('docs-owner@example.test', 'مالک مدارک')
        self.editor = self.user('docs-editor@example.test', 'بازبین')
        self.viewer = self.user('docs-viewer@example.test', 'بیننده')
        self.outsider = self.user('docs-outsider@example.test', 'بیرونی')
        account = BillingAccount.objects.create(owner=self.owner)
        self.workspace = Workspace.objects.create(owner=self.owner, billing_account=account, name='Workspace docs')
        Membership.objects.create(workspace=self.workspace, user=self.editor, role=Membership.Role.EDITOR)
        Membership.objects.create(workspace=self.workspace, user=self.viewer, role=Membership.Role.VIEWER)
        self.root = f'/api/v1/workspaces/{self.workspace.pk}/documents/'

    @staticmethod
    def user(email, display_name):
        return User.objects.create_user(
            email,
            password='not-a-real-user-password',
            display_name=display_name,
            email_verified_at=timezone.now(),
        )

    def body(self, **updates):
        values = {
            'template_id': 'executive-onepage',
            'stage': 'mvp',
            'industry': 'general',
            'owner_id': str(self.editor.pk),
            'reviewer_id': str(self.editor.pk),
            'status': 'draft',
            'content': 'پیشنویس اختصاصی و تأییدنشده',
        }
        return {**values, **updates}

    def create_record(self, **updates):
        return self.client.post(self.root, data=self.body(**updates), content_type='application/json')

    def test_catalog_inventory_is_generic_bilingual_and_limits_full_guides_to_five(self):
        catalog = document_catalog()
        self.assertEqual(len(catalog['documents']), 60)
        self.assertEqual(len({item['id'] for item in catalog['documents']}), 60)
        self.assertEqual(sum(item['catalog_state'] == 'mvp' for item in catalog['documents']), 5)
        self.assertTrue(all(item['structure']['fa'] and item['structure']['en'] for item in catalog['documents']))
        serialized = str(catalog).lower()
        for term in (
            'lifemate',
            'medmate',
            'caremate',
            'drive.google.com',
            'google drive',
            'source-folder',
            'source folder',
            'پوشه منبع',
            'گوگل درایو',
        ):
            self.assertNotIn(term, serialized)
        self.assertTrue(all(item['example'] for item in catalog['documents'][:5]))
        self.assertTrue(all(item['example'] is None for item in catalog['documents'][5:]))

    def test_catalog_filters_and_workspace_records_are_isolated(self):
        self.assertEqual(self.client.get(self.root).status_code, 401)
        self.client.force_login(self.owner)
        response = self.client.get(self.root, {'stage': 'growth', 'industry': 'technology'})
        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(response.json()['items']), 0)
        self.assertTrue(all(item['record'] is None for item in response.json()['items']))
        self.assertEqual(response.json()['role'], 'owner')

        created = self.create_record()
        self.assertEqual(created.status_code, 201, created.content)
        record = created.json()
        self.client.force_login(self.viewer)
        board = self.client.get(self.root).json()
        item = next(item for item in board['items'] if item['id'] == 'executive-onepage')
        self.assertEqual(item['record']['id'], record['id'])
        self.assertEqual(item['record']['owner_id'], str(self.editor.pk))
        self.client.force_login(self.outsider)
        self.assertEqual(self.client.get(self.root).status_code, 404)

    def test_record_owner_reviewer_content_versions_and_read_only_access(self):
        self.client.force_login(self.owner)
        created = self.create_record()
        self.assertEqual(created.status_code, 201, created.content)
        record = created.json()
        self.assertEqual(record['content_version'], 1)
        self.assertEqual(DocumentEvent.objects.count(), 1)

        self.client.force_login(self.viewer)
        denied = self.client.patch(
            self.root + f"{record['id']}/",
            data={'revision': 1, 'status': 'review'},
            content_type='application/json',
        )
        self.assertEqual(denied.status_code, 403)

        self.client.force_login(self.editor)
        missing_reviewer = self.client.patch(
            self.root + f"{record['id']}/",
            data={'revision': 1, 'reviewer_id': None, 'status': 'review'},
            content_type='application/json',
        )
        self.assertEqual(missing_reviewer.status_code, 400)
        self.assertIn('reviewer_id', missing_reviewer.json()['fields'])

        changed = self.client.patch(
            self.root + f"{record['id']}/",
            data={'revision': 1, 'content': 'نسخه دوم محتوا'},
            content_type='application/json',
        )
        self.assertEqual(changed.status_code, 200, changed.content)
        self.assertEqual(changed.json()['content_version'], 2)
        self.assertEqual(changed.json()['revision'], 2)
        self.assertNotIn('نسخه دوم محتوا', str(DocumentEvent.objects.latest('created_at').changes))

        ready = self.client.patch(
            self.root + f"{record['id']}/",
            data={'revision': 2, 'status': 'ready'},
            content_type='application/json',
        )
        self.assertEqual(ready.status_code, 200, ready.content)
        self.assertEqual(ready.json()['status'], DocumentRecord.Status.READY)
        self.client.force_login(self.editor)
        changed_ready = self.client.patch(
            self.root + f"{record['id']}/",
            data={'revision': 3, 'status': 'ready', 'content': 'نسخه سوم نیازمند بازبینی دوباره است'},
            content_type='application/json',
        )
        self.assertEqual(changed_ready.status_code, 200, changed_ready.content)
        self.assertEqual(changed_ready.json()['status'], DocumentRecord.Status.DRAFT)
        self.assertEqual(changed_ready.json()['content_version'], 3)
        self.assertNotIn('نسخه سوم نیازمند بازبینی دوباره است', str(DocumentEvent.objects.latest('created_at').changes))

    def test_foreign_members_and_non_mvp_content_are_rejected(self):
        self.client.force_login(self.owner)
        malformed_stage = self.create_record(stage=[])
        self.assertEqual(malformed_stage.status_code, 400)
        malformed_industry = self.create_record(industry=[])
        self.assertEqual(malformed_industry.status_code, 400)
        outside_owner = self.create_record(owner_id=str(self.outsider.pk))
        self.assertEqual(outside_owner.status_code, 400)
        self.assertIn('owner_id', outside_owner.json()['fields'])

        catalog_only = self.create_record(template_id='founder-agreements', content='متن تولیدی خارج از MVP')
        self.assertEqual(catalog_only.status_code, 400)
        self.assertIn('content', catalog_only.json()['fields'])

        created = self.create_record()
        self.assertEqual(created.status_code, 201, created.content)
        missing_owner = self.client.patch(
            self.root + f"{created.json()['id']}/",
            data={'revision': 1, 'owner_id': None},
            content_type='application/json',
        )
        self.assertEqual(missing_owner.status_code, 400)
        self.assertIn('owner_id', missing_owner.json()['fields'])

    def test_ready_requires_assigned_reviewer_and_revision_conflicts_are_reported(self):
        self.client.force_login(self.owner)
        created = self.create_record(reviewer_id=str(self.owner.pk))
        record_id = created.json()['id']
        self.client.force_login(self.editor)
        wrong_reviewer = self.client.patch(
            self.root + f'{record_id}/',
            data={'revision': 1, 'status': 'ready', 'reviewer_id': str(self.owner.pk)},
            content_type='application/json',
        )
        self.assertEqual(wrong_reviewer.status_code, 403)
        self_self_review = self.client.patch(
            self.root + f'{record_id}/',
            data={'revision': 1, 'status': 'ready', 'reviewer_id': str(self.editor.pk)},
            content_type='application/json',
        )
        self.assertEqual(self_self_review.status_code, 403)
        conflict = self.client.patch(
            self.root + f'{record_id}/',
            data={'revision': 8, 'status': 'review'},
            content_type='application/json',
        )
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()['code'], 'revision_conflict')


class DocumentAttachmentApiTests(TestCase):
    def setUp(self):
        self.owner = self.user('files-owner@example.test', 'مالک فایل')
        self.editor = self.user('files-editor@example.test', 'ویرایشگر فایل')
        self.viewer = self.user('files-viewer@example.test', 'بیننده فایل')
        self.outsider = self.user('files-outsider@example.test', 'کاربر بیرونی')
        account = BillingAccount.objects.create(owner=self.owner)
        self.workspace = Workspace.objects.create(owner=self.owner, billing_account=account, name='Workspace files')
        Membership.objects.create(workspace=self.workspace, user=self.editor, role=Membership.Role.EDITOR)
        Membership.objects.create(workspace=self.workspace, user=self.viewer, role=Membership.Role.VIEWER)
        self.record = DocumentRecord.objects.create(
            workspace=self.workspace,
            template_id='executive-onepage',
            stage='mvp',
            industry='general',
            owner=self.owner,
            reviewer=self.editor,
            created_by=self.owner,
            updated_by=self.owner,
        )
        self.root = f'/api/v1/workspaces/{self.workspace.pk}/documents/{self.record.pk}/attachments/'
        self.storage_dir = tempfile.TemporaryDirectory()
        self.media_settings = override_settings(MEDIA_ROOT=self.storage_dir.name)
        self.media_settings.enable()
        self.addCleanup(self.media_settings.disable)
        self.addCleanup(self.storage_dir.cleanup)

    @staticmethod
    def user(email, display_name):
        return User.objects.create_user(
            email,
            password='not-a-real-user-password',
            display_name=display_name,
            email_verified_at=timezone.now(),
        )

    def reserve(self, name='board.pdf', size=16):
        self.client.force_login(self.owner)
        return self.client.post(
            self.root,
            data={'name': name, 'size_bytes': size, 'request_id': str(uuid.uuid4())},
            content_type='application/json',
        )

    def upload(self, attachment_id, content=b'%PDF-1.7\nprivate'):
        self.client.force_login(self.owner)
        path = f'{self.root}{attachment_id}/content/'
        body = encode_multipart(BOUNDARY, {'file': SimpleUploadedFile('ignored.pdf', content)})
        return self.client.generic('PUT', path, data=body, content_type=f'multipart/form-data; boundary={BOUNDARY}')

    def test_reservation_upload_scan_download_checksum_and_private_headers(self):
        reservation = self.reserve(size=16)
        self.assertEqual(reservation.status_code, 201, reservation.content)
        attachment_id = reservation.json()['id']
        with patch('modules.documents.attachments.services.scan_stream', return_value=None):
            uploaded = self.upload(attachment_id)
        self.assertEqual(uploaded.status_code, 201, uploaded.content)
        self.assertEqual(uploaded.json()['status'], DocumentAttachment.Status.READY)
        self.assertEqual(uploaded.json()['sha256'], hashlib.sha256(b'%PDF-1.7\nprivate').hexdigest())
        self.assertEqual(uploaded.json()['version'], 1)
        self.assertFalse(DocumentEvent.objects.filter(changes__contains={'sha256': uploaded.json()['sha256']}).exists())

        self.client.force_login(self.viewer)
        response = self.client.get(f'{self.root}{attachment_id}/download/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/octet-stream')
        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(response['Cache-Control'], 'no-store, private')
        self.assertEqual(b''.join(response.streaming_content), b'%PDF-1.7\nprivate')
        self.assertEqual(self.client.get('/media/attachments/private.pdf').status_code, 404)
        Membership.objects.filter(workspace=self.workspace, user=self.viewer).delete()
        self.assertEqual(self.client.get(f'{self.root}{attachment_id}/download/').status_code, 404)

    def test_scanner_failure_keeps_bytes_quarantined_and_retry_finalizes(self):
        reservation = self.reserve(size=16)
        attachment_id = reservation.json()['id']
        with patch('modules.documents.attachments.services.scan_stream', side_effect=ScanUnavailable):
            pending = self.upload(attachment_id)
            self.assertEqual(pending.status_code, 202, pending.content)
            self.assertEqual(pending.json()['status'], DocumentAttachment.Status.QUARANTINED)
            self.client.force_login(self.owner)
            blocked = self.client.get(f'{self.root}{attachment_id}/download/')
            self.assertEqual(blocked.status_code, 404)
        with patch('modules.documents.attachments.services.scan_stream', return_value=None):
            finalized = self.client.post(f'{self.root}{attachment_id}/scan/')
        self.assertEqual(finalized.status_code, 200, finalized.content)
        self.assertEqual(finalized.json()['status'], DocumentAttachment.Status.READY)

    def test_malware_and_signature_mismatch_never_become_downloadable(self):
        reservation = self.reserve(size=16)
        attachment_id = reservation.json()['id']
        with patch('modules.documents.attachments.services.scan_stream', side_effect=MalwareFound):
            rejected = self.upload(attachment_id)
        self.assertEqual(rejected.status_code, 422, rejected.content)
        self.assertEqual(self.client.get(f'{self.root}{attachment_id}/download/').status_code, 404)

        bad_reservation = self.reserve(name='report.pdf', size=4)
        bad_id = bad_reservation.json()['id']
        bad_content = self.upload(bad_id, b'NOPE')
        self.assertEqual(bad_content.status_code, 400, bad_content.content)
        self.assertEqual(DocumentAttachment.objects.get(pk=bad_id).status, DocumentAttachment.Status.REJECTED)

    def test_workspace_roles_quota_limits_and_nested_identifiers_are_enforced(self):
        self.client.force_login(self.outsider)
        self.assertEqual(self.client.get(self.root).status_code, 404)
        self.client.force_login(self.viewer)
        denied = self.client.post(self.root, data={'name': 'a.pdf', 'size_bytes': 1, 'request_id': str(uuid.uuid4())}, content_type='application/json')
        self.assertEqual(denied.status_code, 403)
        self.client.force_login(self.owner)

        with self.settings(DOCUMENT_WORKSPACE_QUOTA_BYTES=10):
            first = self.reserve(name='a.pdf', size=8)
            self.assertEqual(first.status_code, 201)
            second = self.reserve(name='b.pdf', size=3)
            self.assertEqual(second.status_code, 409)
            self.assertEqual(second.json()['code'], 'workspace_storage_quota')

        wrong_record = f'/api/v1/workspaces/{self.workspace.pk}/documents/{uuid.uuid4()}/attachments/'
        self.assertEqual(self.client.get(wrong_record).status_code, 404)
        self.assertEqual(self.client.get(f'{self.root}{uuid.uuid4()}/download/').status_code, 404)

    def test_delete_releases_quota_and_each_attachment_gets_a_version(self):
        self.client.force_login(self.owner)
        first = self.reserve(name='a.pdf', size=15)
        second = self.reserve(name='b.pdf', size=15)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.json()['version'], 1)
        self.assertEqual(second.json()['version'], 2)
        response = self.client.delete(f"{self.root}{first.json()['id']}/")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(DocumentAttachment.objects.filter(pk=first.json()['id']).exists(), False)

    def test_large_multipart_upload_is_stopped_before_storage(self):
        reservation = self.reserve(size=16)
        attachment_id = reservation.json()['id']
        with self.settings(DOCUMENT_ATTACHMENT_MAX_BYTES=8):
            response = self.upload(attachment_id)
        self.assertEqual(response.status_code, 413, response.content)
        self.assertFalse(DocumentAttachment.objects.filter(pk=attachment_id, status=DocumentAttachment.Status.READY).exists())

    def test_reservation_retries_are_idempotent(self):
        self.client.force_login(self.owner)
        request_id = str(uuid.uuid4())
        body = {'name': 'same-request.pdf', 'size_bytes': 10, 'request_id': request_id}
        first = self.client.post(self.root, data=body, content_type='application/json')
        repeated = self.client.post(self.root, data=body, content_type='application/json')
        self.assertEqual(first.status_code, 201)
        self.assertEqual(repeated.status_code, 201)
        self.assertEqual(first.json()['id'], repeated.json()['id'])
        self.assertEqual(DocumentAttachment.objects.filter(request_id=request_id).count(), 1)
        conflict = self.client.post(self.root, data={**body, 'name': 'other.pdf'}, content_type='application/json')
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()['code'], 'attachment_request_conflict')

        other_record = DocumentRecord.objects.create(
            workspace=self.workspace,
            template_id='market-sizing',
            stage='mvp',
            industry='general',
            owner=self.owner,
            reviewer=self.editor,
            created_by=self.owner,
            updated_by=self.owner,
        )
        other_root = f'/api/v1/workspaces/{self.workspace.pk}/documents/{other_record.pk}/attachments/'
        cross_document = self.client.post(other_root, data=body, content_type='application/json')
        self.assertEqual(cross_document.status_code, 409)
        self.assertEqual(cross_document.json()['code'], 'attachment_request_conflict')
        self.assertEqual(DocumentAttachment.objects.filter(request_id=request_id).count(), 1)

    def test_canceling_an_inflight_upload_keeps_its_quota_reserved(self):
        reservation = self.reserve(size=16)
        attachment_id = reservation.json()['id']
        DocumentAttachment.objects.filter(pk=attachment_id).update(status=DocumentAttachment.Status.UPLOADING)
        with self.settings(DOCUMENT_WORKSPACE_QUOTA_BYTES=16):
            canceled = self.client.delete(f'{self.root}{attachment_id}/')
            self.assertEqual(canceled.status_code, 204)
            item = DocumentAttachment.objects.get(pk=attachment_id)
            self.assertEqual(item.status, DocumentAttachment.Status.CANCEL_REQUESTED)
            blocked = self.reserve(name='second.pdf', size=1)
            self.assertEqual(blocked.status_code, 409)
            self.assertEqual(blocked.json()['code'], 'workspace_storage_quota')


class DocumentAttachmentQuotaConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def test_concurrent_reservations_cannot_overdraw_workspace_quota(self):
        owner = User.objects.create_user('parallel-owner@example.test', password='not-a-real-user-password', email_verified_at=timezone.now())
        editor = User.objects.create_user('parallel-editor@example.test', password='not-a-real-user-password', email_verified_at=timezone.now())
        account = BillingAccount.objects.create(owner=owner)
        workspace = Workspace.objects.create(owner=owner, billing_account=account, name='Concurrent quota')
        Membership.objects.create(workspace=workspace, user=editor, role=Membership.Role.EDITOR)
        record = DocumentRecord.objects.create(
            workspace=workspace,
            template_id='executive-onepage',
            stage='mvp',
            industry='general',
            owner=owner,
            reviewer=editor,
            created_by=owner,
            updated_by=owner,
        )
        barrier = Barrier(2)
        outcomes = []

        def reserve(actor):
            connections.close_all()
            barrier.wait(timeout=5)
            try:
                from modules.documents.attachments.services import reserve_attachment
                from modules.workspaces.services import WorkspaceActionError

                reserve_attachment(actor, workspace, record.pk, {'name': f'{actor.pk}.pdf', 'size_bytes': 6, 'request_id': str(uuid.uuid4())})
                outcomes.append('reserved')
            except WorkspaceActionError as error:
                outcomes.append(error.code)
            finally:
                connections.close_all()

        with self.settings(DOCUMENT_WORKSPACE_QUOTA_BYTES=10):
            workers = [Thread(target=reserve, args=(actor,)) for actor in (owner, editor)]
            for worker in workers:
                worker.start()
            for worker in workers:
                worker.join(timeout=10)

        self.assertTrue(all(not worker.is_alive() for worker in workers))
        self.assertEqual(outcomes.count('reserved'), 1)
        self.assertEqual(outcomes.count('workspace_storage_quota'), 1)

class AttachmentScannerProtocolTests(SimpleTestCase):
    def scanner_client(self, response):
        client = MagicMock()
        client.__enter__.return_value = client
        client.recv.return_value = response
        return client

    def test_clamd_instream_frames_chunks_and_requires_clean_reply(self):
        client = self.scanner_client(b'stream: OK\0')
        with self.settings(CLAMAV_HOST='clamav', CLAMAV_PORT=3310, CLAMAV_TIMEOUT_SECONDS=3):
            with patch('modules.documents.attachments.scanner.socket.create_connection', return_value=client):
                from modules.documents.attachments.scanner import scan_stream

                scan_stream(io.BytesIO(b'file bytes'))
        sent = b''.join(call.args[0] for call in client.sendall.call_args_list)
        self.assertEqual(sent, b'zINSTREAM\0' + struct.pack('!I', 10) + b'file bytes' + struct.pack('!I', 0))
        client.settimeout.assert_called_once_with(3)

    def test_clamd_malware_and_unavailable_results_fail_closed(self):
        client = self.scanner_client(b'stream: Eicar-Test-Signature FOUND\0')
        with self.settings(CLAMAV_HOST='clamav', CLAMAV_PORT=3310, CLAMAV_TIMEOUT_SECONDS=3):
            with patch('modules.documents.attachments.scanner.socket.create_connection', return_value=client):
                from modules.documents.attachments.scanner import scan_stream

                with self.assertRaises(MalwareFound):
                    scan_stream(io.BytesIO(b'unsafe bytes'))
            with patch('modules.documents.attachments.scanner.socket.create_connection', side_effect=OSError('unavailable')):
                with self.assertRaises(ScanUnavailable):
                    scan_stream(io.BytesIO(b'unsafe bytes'))
