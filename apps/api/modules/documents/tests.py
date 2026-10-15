from django.test import TestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.documents.catalog import document_catalog
from modules.documents.models import DocumentEvent, DocumentRecord
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
