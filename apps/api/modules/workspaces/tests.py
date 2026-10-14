from datetime import timedelta
from urllib.parse import parse_qs, urlencode, urlsplit
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.db import connection
from django.db.models.deletion import ProtectedError
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied

from modules.accounts.models import User
from modules.workspaces.models import BillingAccount, Membership, Workspace, WorkspaceInvitation, WorkspaceProfile
from modules.workspaces.models import WorkspaceProfileRevision
from modules.workspaces.permissions import get_workspace_child_or_404
from modules.workspaces.services import (
    WorkspaceActionError,
    accept_workspace_invitation,
    accessible_workspaces_for,
    create_owned_workspace,
    create_workspace_invitation,
    grant_workspace_membership,
    remove_workspace_membership,
    require_workspace_role,
    workspace_role,
    update_workspace,
    revoke_workspace_invitation,
)


class WorkspaceAuthorizationTests(TestCase):
    def setUp(self):
        self.owner = self.create_user('owner@example.test')
        self.editor = self.create_user('editor@example.test')
        self.viewer = self.create_user('viewer@example.test')
        self.outsider = self.create_user('outsider@example.test')

        self.owner_billing = BillingAccount.objects.create(owner=self.owner)
        self.other_billing = BillingAccount.objects.create(owner=self.outsider)
        self.workspace = Workspace.objects.create(
            owner=self.owner,
            billing_account=self.owner_billing,
            name='Private workspace',
        )
        self.other_workspace = Workspace.objects.create(
            owner=self.outsider,
            billing_account=self.other_billing,
            name='Other private workspace',
        )
        self.editor_membership = Membership.objects.create(
            workspace=self.workspace,
            user=self.editor,
            role=Membership.Role.EDITOR,
        )
        self.viewer_membership = Membership.objects.create(
            workspace=self.workspace,
            user=self.viewer,
            role=Membership.Role.VIEWER,
        )
        self.other_membership = Membership.objects.create(
            workspace=self.other_workspace,
            user=self.editor,
            role=Membership.Role.VIEWER,
        )

    @staticmethod
    def create_user(email, **fields):
        return User.objects.create_user(
            email,
            password='not-a-real-user-password',
            email_verified_at=timezone.now(),
            **fields,
        )

    def test_owner_and_members_only_see_their_authorized_workspaces(self):
        self.assertEqual(
            set(accessible_workspaces_for(self.owner).values_list('pk', flat=True)),
            {self.workspace.pk},
        )
        self.assertEqual(
            set(accessible_workspaces_for(self.editor).values_list('pk', flat=True)),
            {self.workspace.pk, self.other_workspace.pk},
        )
        self.assertFalse(accessible_workspaces_for(self.outsider).filter(pk=self.workspace.pk).exists())

    def test_owner_is_derived_and_operator_flag_does_not_grant_membership(self):
        self.outsider.is_staff = True
        self.outsider.save(update_fields=['is_staff'])
        self.assertEqual(workspace_role(self.owner, self.workspace), 'owner')
        self.assertFalse(Membership.objects.filter(workspace=self.workspace, user=self.owner).exists())
        self.assertIsNone(workspace_role(self.outsider, self.workspace))

    def test_viewer_can_read_but_cannot_write(self):
        self.assertEqual(require_workspace_role(self.viewer, self.workspace, {'viewer', 'editor', 'owner'}), 'viewer')
        with self.assertRaises(PermissionDenied):
            require_workspace_role(self.viewer, self.workspace, {'editor', 'owner'})

    def test_nested_resource_lookup_is_bound_to_route_workspace(self):
        self.assertEqual(
            get_workspace_child_or_404(
                self.owner,
                self.workspace,
                Membership.objects.all(),
                self.editor_membership.pk,
            ),
            self.editor_membership,
        )
        with self.assertRaises(NotFound):
            get_workspace_child_or_404(
                self.owner,
                self.workspace,
                Membership.objects.all(),
                self.other_membership.pk,
            )

    def test_owner_can_grant_only_editor_or_viewer_and_cannot_be_demoted(self):
        self.assertEqual(
            grant_workspace_membership(self.owner, self.workspace, self.viewer, Membership.Role.EDITOR).role,
            Membership.Role.EDITOR,
        )
        with self.assertRaises(ValidationError):
            grant_workspace_membership(self.owner, self.workspace, self.owner, Membership.Role.VIEWER)
        with self.assertRaises(ValidationError):
            grant_workspace_membership(self.editor, self.workspace, self.outsider, Membership.Role.VIEWER)

    def test_member_removal_requires_owner_and_cannot_remove_owner(self):
        with self.assertRaises(PermissionDenied):
            remove_workspace_membership(self.editor, self.workspace, self.viewer)
        with self.assertRaises(ValidationError):
            remove_workspace_membership(self.owner, self.workspace, self.owner)
        remove_workspace_membership(self.owner, self.workspace, self.viewer)
        self.assertIsNone(workspace_role(self.viewer, self.workspace))

    def test_owner_can_change_and_revoke_member_access_through_api(self):
        self.client.force_login(self.owner)
        changed = self.client.patch(
            f'/api/v1/workspaces/{self.workspace.pk}/members/{self.editor.pk}/',
            data={'role': Membership.Role.VIEWER},
            content_type='application/json',
        )
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(changed.json()['role'], Membership.Role.VIEWER)

        removed = self.client.delete(
            f'/api/v1/workspaces/{self.workspace.pk}/members/{self.editor.pk}/'
        )
        self.assertEqual(removed.status_code, 204)
        self.assertIsNone(workspace_role(self.editor, self.workspace))

    def test_owned_workspace_prevents_deleting_its_owner(self):
        with self.assertRaises(ProtectedError):
            self.owner.delete()

    def test_workspace_creation_uses_an_owner_matched_billing_identity(self):
        new_owner = self.create_user('new-owner@example.test')
        workspace = create_owned_workspace(new_owner, '  New workspace  ')
        self.assertEqual(workspace.name, 'New workspace')
        self.assertEqual(workspace.billing_account.owner_id, new_owner.pk)
        self.assertEqual(workspace.revision, 1)

    def test_workspace_creation_endpoint_uses_the_verified_owner_account(self):
        self.client.force_login(self.owner)
        response = self.client.post(
            '/api/v1/workspaces/',
            data={'name': '  API project  '},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        workspace = Workspace.objects.get(pk=response.json()['id'])
        self.assertEqual(workspace.name, 'API project')
        self.assertEqual(workspace.billing_account.owner_id, self.owner.pk)
        self.assertEqual(response['Cache-Control'], 'no-store, private')
        self.assertTrue(WorkspaceProfile.objects.filter(workspace=workspace).exists())

    def test_workspace_endpoints_return_only_member_data_and_disable_caching(self):
        self.assertEqual(self.client.get('/api/v1/workspaces/').status_code, 401)
        self.client.force_login(self.owner)
        response = self.client.get('/api/v1/workspaces/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['id'] for item in response.json()['items']], [str(self.workspace.pk)])
        self.assertEqual(response['Cache-Control'], 'no-store, private')

        self.client.force_login(self.outsider)
        response = self.client.get(f'/api/v1/workspaces/{self.workspace.pk}/')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['code'], 'workspace_not_found')

    def test_workspace_list_cursor_is_signed_and_bound_to_the_account(self):
        create_owned_workspace(self.owner, 'Another workspace')
        create_owned_workspace(self.owner, 'Third workspace')
        self.client.force_login(self.owner)
        first = self.client.get('/api/v1/workspaces/?limit=1')
        self.assertEqual(first.status_code, 200)
        self.assertIsNotNone(first.json()['next_cursor'])
        first_id = first.json()['items'][0]['id']
        cursor = first.json()['next_cursor']

        second = self.client.get(
            '/api/v1/workspaces/?' + urlencode({'limit': 1, 'cursor': cursor})
        )
        self.assertEqual(second.status_code, 200)
        self.assertNotEqual(second.json()['items'][0]['id'], first_id)

        self.client.force_login(self.outsider)
        rejected = self.client.get('/api/v1/workspaces/?' + urlencode({'cursor': cursor}))
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(rejected.json()['code'], 'invalid_cursor')

    def test_session_excludes_archived_workspaces_and_revocation_is_immediate(self):
        self.workspace.archived_at = timezone.now()
        self.workspace.save(update_fields=['archived_at'])
        self.client.force_login(self.viewer)
        response = self.client.get('/api/v1/session/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['workspaces'], [])

        self.workspace.archived_at = None
        self.workspace.save(update_fields=['archived_at'])
        remove_workspace_membership(self.owner, self.workspace, self.viewer)
        self.assertEqual(self.client.get('/api/v1/session/').json()['workspaces'], [])
        self.assertEqual(self.client.get(f'/api/v1/workspaces/{self.workspace.pk}/').status_code, 404)

    def test_session_role_is_derived_from_membership(self):
        self.client.force_login(self.viewer)
        response = self.client.get('/api/v1/session/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['workspaces'], [
            {'id': str(self.workspace.pk), 'name': self.workspace.name, 'role': 'viewer'},
        ])

    def test_workspace_updates_require_owner_and_reject_stale_revisions(self):
        saved = update_workspace(self.owner, self.workspace, revision=1, name='Renamed project')
        self.assertEqual(saved.name, 'Renamed project')
        self.assertEqual(saved.revision, 2)

        with self.assertRaises(WorkspaceActionError) as conflict:
            update_workspace(self.owner, saved, revision=1, name='Lost update')
        self.assertEqual(conflict.exception.code, 'revision_conflict')

        self.client.force_login(self.owner)
        stale = self.client.patch(
            f'/api/v1/workspaces/{self.workspace.pk}/',
            data={'revision': 1, 'name': 'Stale API update'},
            content_type='application/json',
        )
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json()['code'], 'revision_conflict')

        self.client.force_login(self.editor)
        response = self.client.patch(
            f'/api/v1/workspaces/{self.workspace.pk}/',
            data={'revision': 2, 'name': 'Not allowed'},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Workspace.objects.get(pk=self.workspace.pk).name, 'Renamed project')

    def test_project_profile_is_scoped_editable_and_revision_protected(self):
        endpoint = f'/api/v1/workspaces/{self.workspace.pk}/profile/'
        self.client.force_login(self.owner)
        initial = self.client.get(endpoint)
        self.assertEqual(initial.status_code, 200)
        self.assertEqual(initial.json()['revision'], 1)
        self.assertEqual(initial.json()['industry'], '')
        self.assertEqual(initial.json()['company_name'], '')
        self.assertEqual(initial.json()['products'], [])
        self.assertEqual(initial.json()['icps'], [])
        self.assertEqual(initial['Cache-Control'], 'no-store, private')

        owner_update = self.client.patch(
            endpoint,
            data={'revision': 1, 'industry': 'فناوری', 'stage': 'آغاز', 'mission': 'افزایش فروش'},
            content_type='application/json',
        )
        self.assertEqual(owner_update.status_code, 200)
        self.assertEqual(owner_update.json()['revision'], 2)
        self.assertEqual(owner_update.json()['mission'], 'افزایش فروش')

        self.client.force_login(self.editor)
        editor_update = self.client.patch(
            endpoint,
            data={'revision': 2, 'stage': 'رشد'},
            content_type='application/json',
        )
        self.assertEqual(editor_update.status_code, 200)
        self.assertEqual(editor_update.json()['stage'], 'رشد')
        self.assertEqual(editor_update.json()['revision'], 3)
        cannot_complete = self.client.patch(
            endpoint,
            data={'revision': 3, 'complete': True},
            content_type='application/json',
        )
        self.assertEqual(cannot_complete.status_code, 403)

        self.client.force_login(self.viewer)
        self.assertEqual(self.client.get(endpoint).status_code, 200)
        denied = self.client.patch(
            endpoint,
            data={'revision': 3, 'mission': 'غیرمجاز'},
            content_type='application/json',
        )
        self.assertEqual(denied.status_code, 403)

        self.client.force_login(self.owner)
        stale = self.client.patch(
            endpoint,
            data={'revision': 2, 'mission': 'تغییر قدیمی'},
            content_type='application/json',
        )
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json()['code'], 'revision_conflict')

        self.client.force_login(self.outsider)
        hidden = self.client.get(endpoint)
        self.assertEqual(hidden.status_code, 404)

    def test_strategy_profile_icp_evidence_and_revisions_are_workspace_scoped(self):
        endpoint = f'/api/v1/workspaces/{self.workspace.pk}/profile/'
        icp = {
            'id': 'icp-saas',
            'name': 'تیم مالی شرکت‌های نرم‌افزاری',
            'segment': {
                'industry': 'نرم‌افزار', 'organization_size': '۲۰ تا ۱۰۰ نفر',
                'geography': 'ایران', 'buying_context': 'گزارش مالی ماهانه',
            },
            'persona': {
                'role': 'مدیر مالی', 'decision_role': 'تصمیم‌گیر خرید',
                'goals': 'کاهش زمان بستن ماه', 'pains': 'اطلاعات در چند فایل پراکنده است',
            },
            'problem': 'گزارش قابل اتکا دیر آماده می‌شود.',
            'evidence': [{
                'id': 'evidence-1', 'source_type': 'interview', 'reference': 'مصاحبه ۱۴۰۵-۰۷',
                'statement': 'سه مدیر مالی زمان زیادی برای تطبیق داده‌ها صرف می‌کنند.',
                'date': '1405-07-01', 'confidence': 'medium',
            }],
            'assumptions': [{
                'id': 'assumption-1', 'statement': 'این تیم‌ها برای گزارش خودکار بودجه دارند.',
                'confidence': 'low', 'test': 'پرسش درباره بودجه در مصاحبه بعدی', 'status': 'untested',
            }],
        }
        self.client.force_login(self.owner)
        first = self.client.patch(
            endpoint,
            data={
                'revision': 1,
                'company_name': 'راهکار مالی آفتاب',
                'problem_statement': 'تطبیق دستی داده‌ها کند است.',
                'products': [{
                    'id': 'product-finance', 'name': 'گزارش‌یار', 'description': 'گزارش مالی',
                    'problem_solved': 'تطبیق دستی', 'target_customer': 'تیم مالی',
                }],
                'customer_segments': [{
                    'id': 'segment-software', 'name': 'شرکت نرم‌افزاری', 'description': 'تیم رشد',
                    'needs': 'گزارش سریع', 'buying_roles': 'مدیر مالی',
                }],
                'goals': [{'id': 'goal-close', 'title': 'کاهش زمان گزارش', 'success_signal': 'دو روز زودتر', 'timeframe': 'فصل جاری'}],
                'icps': [icp],
            },
            content_type='application/json',
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()['revision'], 2)
        self.assertEqual(first.json()['icps'][0]['evidence'][0]['confidence'], 'medium')
        self.assertEqual(first.json()['icps'][0]['assumptions'][0]['status'], 'untested')

        history = self.client.get(f'/api/v1/workspaces/{self.workspace.pk}/profile/revisions/')
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.json()['items'][0]['revision'], 2)
        self.assertEqual(history.json()['items'][0]['snapshot']['company_name'], 'راهکار مالی آفتاب')
        self.assertEqual(WorkspaceProfileRevision.objects.filter(profile__workspace=self.workspace).count(), 1)

        other_endpoint = f'/api/v1/workspaces/{self.other_workspace.pk}/profile/'
        self.client.force_login(self.outsider)
        other = self.client.patch(
            other_endpoint,
            data={'revision': 1, 'company_name': 'کارگاه چوب', 'industry': 'تولید', 'icps': []},
            content_type='application/json',
        )
        self.assertEqual(other.status_code, 200)
        self.assertEqual(other.json()['icps'], [])
        self.assertEqual(self.client.get(endpoint).status_code, 404)

    def test_strategy_profile_rejects_invalid_icp_structure_without_revision_change(self):
        endpoint = f'/api/v1/workspaces/{self.workspace.pk}/profile/'
        self.client.force_login(self.owner)
        response = self.client.patch(
            endpoint,
            data={'revision': 1, 'icps': [{'id': 'bad', 'name': 'نامعتبر', 'evidence': []}]},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('icps.0', response.json()['fields'])
        profile = WorkspaceProfile.objects.get(workspace=self.workspace)
        self.assertEqual(profile.revision, 1)
        self.assertEqual(profile.icps, [])
        self.assertEqual(WorkspaceProfileRevision.objects.count(), 0)

    def test_owner_can_complete_profile_with_optional_fields_empty(self):
        endpoint = f'/api/v1/workspaces/{self.workspace.pk}/profile/'
        self.client.force_login(self.owner)
        completed = self.client.patch(
            endpoint,
            data={'revision': 1, 'industry': '', 'stage': '', 'mission': '', 'complete': True},
            content_type='application/json',
        )
        self.assertEqual(completed.status_code, 200)
        self.assertIsNotNone(completed.json()['onboarding_completed_at'])
        self.assertEqual(completed.json()['revision'], 2)

    def test_project_profile_rejects_oversized_optional_fields(self):
        self.client.force_login(self.owner)
        response = self.client.patch(
            f'/api/v1/workspaces/{self.workspace.pk}/profile/',
            data={'revision': 1, 'industry': 'x' * 201},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('industry', response.json()['fields'])

    def test_archived_workspace_profile_cannot_be_changed(self):
        endpoint = f'/api/v1/workspaces/{self.workspace.pk}/profile/'
        self.client.force_login(self.owner)
        update_workspace(self.owner, self.workspace, revision=1, archived=True)
        response = self.client.patch(
            endpoint,
            data={'revision': 1, 'industry': 'تغییر بعد از بایگانی'},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['code'], 'workspace_archived')

    @patch('modules.workspaces.services.deliver_email', return_value=True)
    def test_archive_keeps_workspace_and_revokes_pending_invitations(self, _deliver_email):
        invitation = create_workspace_invitation(
            self.owner, self.workspace, 'invitee@example.test', Membership.Role.VIEWER
        )
        saved = update_workspace(self.owner, self.workspace, revision=1, archived=True)

        self.assertIsNotNone(saved.archived_at)
        self.assertTrue(Workspace.objects.filter(pk=self.workspace.pk).exists())
        invitation.refresh_from_db()
        self.assertIsNotNone(invitation.revoked_at)

        self.client.force_login(self.owner)
        rows = self.client.get('/api/v1/workspaces/').json()['items']
        self.assertEqual([row['id'] for row in rows], [str(self.workspace.pk)])
        self.client.force_login(self.viewer)
        self.assertEqual(self.client.get('/api/v1/session/').json()['workspaces'], [])

    @patch('modules.workspaces.services.deliver_email', return_value=True)
    def test_invitation_token_is_one_use_hmac_backed_and_email_bound(self, deliver_email):
        invitation = create_workspace_invitation(
            self.owner, self.workspace, '  INVITEE@example.test ', Membership.Role.EDITOR
        )
        self.assertEqual(invitation.email, 'invitee@example.test')
        self.assertEqual(invitation.role, Membership.Role.EDITOR)
        self.assertEqual(len(invitation.token_digest), 64)
        message = deliver_email.call_args.args[1]
        link = next(line for line in message.splitlines() if '#token=' in line)
        token = parse_qs(urlsplit(link).fragment)['token'][0]
        self.assertNotEqual(invitation.token_digest, token)

        wrong_account = self.create_user('wrong@example.test')
        with self.assertRaises(ValidationError):
            accept_workspace_invitation(wrong_account, token)
        self.assertIsNone(workspace_role(wrong_account, self.workspace))

        invitee = self.create_user('invitee@example.test')
        workspace, membership = accept_workspace_invitation(invitee, token)
        self.assertEqual(workspace.pk, self.workspace.pk)
        self.assertEqual(membership.role, Membership.Role.EDITOR)
        invitation.refresh_from_db()
        self.assertIsNotNone(invitation.accepted_at)
        with self.assertRaises(ValidationError):
            accept_workspace_invitation(invitee, token)

    @patch('modules.workspaces.services.deliver_email', return_value=True)
    def test_expired_and_revoked_invitations_cannot_be_accepted(self, _deliver_email):
        expired = create_workspace_invitation(
            self.owner, self.workspace, 'expired@example.test', Membership.Role.VIEWER
        )
        expired_user = self.create_user('expired@example.test')
        expired.expires_at = timezone.now() - timedelta(seconds=1)
        expired.save(update_fields=['expires_at'])
        expired_token = next(
            parse_qs(urlsplit(line).fragment)['token'][0]
            for line in _deliver_email.call_args.args[1].splitlines()
            if '#token=' in line
        )
        with self.assertRaises(ValidationError):
            accept_workspace_invitation(expired_user, expired_token)

        active = create_workspace_invitation(
            self.owner, self.workspace, 'revoked@example.test', Membership.Role.EDITOR
        )
        revoked_token = next(
            parse_qs(urlsplit(line).fragment)['token'][0]
            for line in _deliver_email.call_args.args[1].splitlines()
            if '#token=' in line
        )
        revoke_workspace_invitation(self.owner, self.workspace, active.pk)
        revoked_user = self.create_user('revoked@example.test')
        with self.assertRaises(ValidationError):
            accept_workspace_invitation(revoked_user, revoked_token)

    @patch('modules.workspaces.services.deliver_email', return_value=False)
    def test_failed_delivery_revokes_the_new_invitation(self, _deliver_email):
        with self.assertRaises(WorkspaceActionError) as error:
            create_workspace_invitation(
                self.owner, self.workspace, 'undelivered@example.test', Membership.Role.EDITOR
            )
        self.assertEqual(error.exception.code, 'email_unavailable')
        invitation = WorkspaceInvitation.objects.get(email='undelivered@example.test')
        self.assertIsNotNone(invitation.revoked_at)

    @patch('modules.workspaces.services.deliver_email', return_value=True)
    def test_invitation_endpoints_are_owner_only_and_support_revocation(self, deliver_email):
        self.client.force_login(self.editor)
        denied = self.client.get(f'/api/v1/workspaces/{self.workspace.pk}/invitations/')
        self.assertEqual(denied.status_code, 403)

        self.client.force_login(self.owner)
        created = self.client.post(
            f'/api/v1/workspaces/{self.workspace.pk}/invitations/',
            data={'email': 'new-member@example.test', 'role': 'viewer'},
            content_type='application/json',
        )
        self.assertEqual(created.status_code, 202)
        self.assertEqual(created['Cache-Control'], 'no-store, private')
        listing = self.client.get(f'/api/v1/workspaces/{self.workspace.pk}/invitations/')
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json()['items'][0]['email'], 'new-member@example.test')
        invitation_id = listing.json()['items'][0]['id']
        revoked = self.client.delete(
            f'/api/v1/workspaces/{self.workspace.pk}/invitations/{invitation_id}/'
        )
        self.assertEqual(revoked.status_code, 204)
        self.assertEqual(self.client.get(f'/api/v1/workspaces/{self.workspace.pk}/invitations/').json()['items'], [])

    @patch('modules.workspaces.services.deliver_email', return_value=True)
    def test_duplicate_invites_invalid_addresses_and_owner_roles_are_rejected(self, deliver_email):
        self.client.force_login(self.owner)
        endpoint = f'/api/v1/workspaces/{self.workspace.pk}/invitations/'
        first = self.client.post(
            endpoint,
            data={'email': 'new-member@example.test', 'role': Membership.Role.EDITOR},
            content_type='application/json',
        )
        self.assertEqual(first.status_code, 202)
        duplicate = self.client.post(
            endpoint,
            data={'email': 'NEW-MEMBER@example.test', 'role': Membership.Role.VIEWER},
            content_type='application/json',
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.json()['code'], 'duplicate_invitation')

        invalid_email = self.client.post(
            endpoint,
            data={'email': 'not-an-email', 'role': Membership.Role.EDITOR},
            content_type='application/json',
        )
        self.assertEqual(invalid_email.status_code, 400)
        owner_role = self.client.post(
            endpoint,
            data={'email': 'new-member@example.test', 'role': 'owner'},
            content_type='application/json',
        )
        self.assertEqual(owner_role.status_code, 400)
        self.assertEqual(deliver_email.call_count, 1)

    @patch('modules.workspaces.services.deliver_email', return_value=True)
    def test_invitation_accept_endpoint_adds_only_matching_verified_account(self, deliver_email):
        create_workspace_invitation(
            self.owner, self.workspace, 'accept@example.test', Membership.Role.VIEWER
        )
        token = next(
            parse_qs(urlsplit(line).fragment)['token'][0]
            for line in deliver_email.call_args.args[1].splitlines()
            if '#token=' in line
        )
        invitee = self.create_user('accept@example.test')
        self.client.force_login(invitee)
        response = self.client.post(
            '/api/v1/workspace-invitations/accept/',
            data={'token': token},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['membership']['role'], Membership.Role.VIEWER)
        self.assertEqual(response['Cache-Control'], 'no-store, private')
        self.assertEqual(self.client.get('/api/v1/session/').json()['workspaces'][0]['id'], str(self.workspace.pk))


class WorkspaceProfileMigrationTests(TransactionTestCase):
    reset_sequences = True

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def test_existing_workspaces_receive_an_empty_profile(self):
        executor = MigrationExecutor(connection)
        executor.migrate([('workspaces', '0002_workspace_invitations')])

        owner = User.objects.create_user(
            'migration-owner@example.test',
            password='not-a-real-user-password',
            email_verified_at=timezone.now(),
        )
        billing = BillingAccount.objects.create(owner=owner)
        workspace = Workspace.objects.create(owner=owner, billing_account=billing, name='Legacy project')

        executor = MigrationExecutor(connection)
        executor.migrate([('workspaces', '0003_workspace_profile')])
        historical_apps = executor.loader.project_state([('workspaces', '0003_workspace_profile')]).apps
        historical_profile = historical_apps.get_model('workspaces', 'WorkspaceProfile')
        profile = historical_profile.objects.get(workspace_id=workspace.pk)

        self.assertEqual(profile.industry, '')
        self.assertEqual(profile.stage, '')
        self.assertEqual(profile.mission, '')
        self.assertEqual(profile.revision, 1)
        self.assertIsNone(profile.onboarding_completed_at)

