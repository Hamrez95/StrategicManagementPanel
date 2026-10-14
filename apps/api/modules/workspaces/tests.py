from urllib.parse import urlencode

from django.core.exceptions import ValidationError
from django.db.models.deletion import ProtectedError
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied

from modules.accounts.models import User
from modules.workspaces.models import BillingAccount, Membership, Workspace
from modules.workspaces.permissions import get_workspace_child_or_404
from modules.workspaces.services import (
    accessible_workspaces_for,
    create_owned_workspace,
    grant_workspace_membership,
    remove_workspace_membership,
    require_workspace_role,
    workspace_role,
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

    def test_owned_workspace_prevents_deleting_its_owner(self):
        with self.assertRaises(ProtectedError):
            self.owner.delete()

    def test_workspace_creation_uses_an_owner_matched_billing_identity(self):
        new_owner = self.create_user('new-owner@example.test')
        workspace = create_owned_workspace(new_owner, '  New workspace  ')
        self.assertEqual(workspace.name, 'New workspace')
        self.assertEqual(workspace.billing_account.owner_id, new_owner.pk)
        self.assertEqual(workspace.revision, 1)

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

