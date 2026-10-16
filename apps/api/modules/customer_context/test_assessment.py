from django.http import Http404
from django.test import TransactionTestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.workspaces.models import (
    BillingAccount,
    Membership,
    Workspace,
    WorkspaceProfile,
)

from .assessment import build_context_assessment, read_context_assessment
from .models import Segment


class ContextAssessmentTests(TransactionTestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            "assessment-owner@example.test",
            password="not-a-real-user-password",
            email_verified_at=timezone.now(),
        )
        self.viewer = User.objects.create_user(
            "assessment-viewer@example.test",
            password="not-a-real-user-password",
            email_verified_at=timezone.now(),
        )
        billing = BillingAccount.objects.create(owner=self.owner)
        self.workspace = Workspace.objects.create(
            owner=self.owner, billing_account=billing, name="Assessment workspace"
        )
        Membership.objects.create(
            workspace=self.workspace,
            user=self.viewer,
            role=Membership.Role.VIEWER,
        )

    def test_empty_founder_profile_stays_unknown_without_financial_questions(self):
        profile = WorkspaceProfile.objects.create(workspace=self.workspace)

        result = read_context_assessment(self.owner, self.workspace)

        self.assertEqual(result["stage"]["status"], "unknown")
        self.assertIsNone(result["stage"]["stage_id"])
        self.assertEqual(result["stage"]["evidence_refs"], [])
        self.assertEqual(result["context"]["profile"]["revision"], profile.revision)

    def test_large_company_size_does_not_infer_a_stage(self):
        segment = Segment.objects.create(
            workspace=self.workspace,
            name="Enterprise venture",
            organization_size="2000 employees",
        )

        result = read_context_assessment(
            self.owner, self.workspace, segment_id=segment.pk
        )

        self.assertEqual(result["stage"]["status"], "unknown")
        self.assertIsNone(result["stage"]["stage_id"])
        self.assertEqual(result["context"]["scope"]["kind"], "segment")

    def test_self_reported_alias_is_preserved_as_provisional_not_normalized(self):
        profile = WorkspaceProfile.objects.create(
            workspace=self.workspace, stage="  رشد / traction  "
        )

        result = read_context_assessment(self.owner, self.workspace)

        self.assertEqual(result["stage"]["status"], "provisional")
        self.assertIsNone(result["stage"]["stage_id"])
        self.assertEqual(result["stage"]["reported_value"], profile.stage)
        self.assertEqual(result["stage"]["evidence_refs"], [])
        self.assertEqual(result["stage"]["source_trace"][0]["revision"], 1)

    def test_whitespace_only_legacy_stage_is_not_treated_as_a_report(self):
        profile = WorkspaceProfile.objects.create(workspace=self.workspace, stage="   ")

        result = build_context_assessment(workspace=self.workspace, profile=profile)

        self.assertEqual(result["context"]["profile"]["reported_stage"], "   ")
        self.assertEqual(result["stage"]["status"], "unknown")
        self.assertIsNone(result["stage"]["reported_value"])

    def test_profile_from_another_workspace_cannot_be_mapped(self):
        profile = WorkspaceProfile.objects.create(
            workspace=self.workspace, stage="discovery"
        )
        other_billing = BillingAccount.objects.create(owner=self.viewer)
        other_workspace = Workspace.objects.create(
            owner=self.viewer, billing_account=other_billing, name="Other"
        )

        with self.assertRaisesRegex(ValueError, "Profile must belong"):
            build_context_assessment(workspace=other_workspace, profile=profile)

    def test_segment_does_not_inherit_whole_business_reported_stage(self):
        profile = WorkspaceProfile.objects.create(
            workspace=self.workspace, stage="growth"
        )
        segment = Segment.objects.create(workspace=self.workspace, name="New venture")

        result = build_context_assessment(
            workspace=self.workspace, profile=profile, segment=segment
        )

        self.assertEqual(result["stage"]["status"], "unknown")
        self.assertIsNone(result["stage"]["reported_value"])
        self.assertEqual(
            result["stage"]["reason_code"], "profile_stage_is_not_segment_scoped"
        )

    def test_viewer_can_read_but_foreign_workspace_and_segment_are_hidden(self):
        self.assertEqual(
            read_context_assessment(self.viewer, self.workspace)["stage"]["status"],
            "unknown",
        )
        foreign_billing = BillingAccount.objects.create(owner=self.viewer)
        foreign_workspace = Workspace.objects.create(
            owner=self.viewer, billing_account=foreign_billing, name="Foreign"
        )
        foreign_segment = Segment.objects.create(
            workspace=foreign_workspace, name="Private segment"
        )

        with self.assertRaises(Http404):
            read_context_assessment(self.owner, foreign_workspace)
        with self.assertRaises(Http404):
            read_context_assessment(
                self.owner, self.workspace, segment_id=foreign_segment.pk
            )

    def test_read_does_not_create_a_missing_profile(self):
        result = read_context_assessment(self.owner, self.workspace)

        self.assertIsNone(result["context"]["profile"])
        self.assertFalse(
            WorkspaceProfile.objects.filter(workspace=self.workspace).exists()
        )
