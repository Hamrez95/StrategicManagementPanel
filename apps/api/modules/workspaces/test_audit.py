from datetime import timedelta
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from django.utils.crypto import salted_hmac
from rest_framework.exceptions import PermissionDenied

from modules.accounts.models import User
from .models import WorkspaceEvent, WorkspaceInvitation
from .services import INVITATION_SALT, WorkspaceActionError, accept_workspace_invitation, create_owned_workspace, create_workspace_invitation, grant_workspace_membership, remove_workspace_membership, update_workspace


class WorkspaceAuditTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user('audit-owner@example.test', email_verified_at=timezone.now())
        self.member = User.objects.create_user('audit-member@example.test', email_verified_at=timezone.now())
        self.workspace = create_owned_workspace(self.owner, 'Audit workspace')

    def test_access_changes_are_audited_once_and_denials_do_not_create_events(self):
        self.assertEqual(WorkspaceEvent.objects.get().event_type, 'created')
        grant_workspace_membership(self.owner, self.workspace, self.member, 'viewer')
        grant_workspace_membership(self.owner, self.workspace, self.member, 'viewer')
        self.assertEqual(WorkspaceEvent.objects.count(), 2)
        with self.assertRaises(PermissionDenied):
            grant_workspace_membership(self.member, self.workspace, self.owner, 'editor')
        self.assertEqual(WorkspaceEvent.objects.count(), 2)
        grant_workspace_membership(self.owner, self.workspace, self.member, 'editor')
        remove_workspace_membership(self.owner, self.workspace, self.member)
        self.assertEqual(WorkspaceEvent.objects.count(), 4)
        self.assertEqual(WorkspaceEvent.objects.filter(event_type='member_changed').order_by('created_at').last().changes, {'before': 'viewer', 'after': 'editor'})
        event = WorkspaceEvent.objects.first()
        with self.assertRaises(ValidationError):
            event.save()

    def test_archive_update_and_invitation_failure_leave_private_audit_metadata(self):
        with patch('modules.workspaces.services.deliver_email', return_value=False):
            with self.assertRaises(WorkspaceActionError) as failure:
                create_workspace_invitation(self.owner, self.workspace, self.member.email, 'viewer')
        self.assertEqual(failure.exception.code, 'email_unavailable')
        self.assertTrue(WorkspaceInvitation.objects.get().revoked_at)
        self.assertTrue(WorkspaceEvent.objects.filter(event_type='invite_revoked', changes__reason='delivery_failed').exists())
        update_workspace(self.owner, self.workspace, revision=1, archived=True)
        self.assertTrue(WorkspaceEvent.objects.filter(event_type='updated', changes__archived=True).exists())
        self.assertNotIn(self.member.email, str(list(WorkspaceEvent.objects.values_list('changes', flat=True))))

    def test_existing_sha1_invitation_survives_transition_and_remains_one_use(self):
        token = 'legacy-test-token-with-more-than-thirty-two-characters'
        WorkspaceInvitation.objects.create(workspace=self.workspace, invited_by=self.owner, email=self.member.email, role='viewer', token_digest=salted_hmac(INVITATION_SALT, token, algorithm='sha1').hexdigest(), expires_at=timezone.now() + timedelta(days=1))
        _, membership = accept_workspace_invitation(self.member, token)
        self.assertEqual(membership.role, 'viewer')
        self.assertTrue(WorkspaceEvent.objects.filter(event_type='invite_accepted', actor=self.member).exists())
        with self.assertRaises(ValidationError):
            accept_workspace_invitation(self.member, token)
