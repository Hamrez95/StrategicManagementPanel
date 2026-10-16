from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import Http404
from django.test import TransactionTestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.customer_context.models import Segment
from modules.workspaces.models import BillingAccount, Membership, Workspace
from modules.workspaces.services import WorkspaceActionError

from .models import Claim, ClaimEvidenceLink, Evidence, ScopeKind
from .services import link_claim_evidence


class EvidencePersistenceTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.owner = self.create_user("owner@example.test")
        self.editor = self.create_user("editor@example.test")
        self.viewer = self.create_user("viewer@example.test")
        self.outsider = self.create_user("outsider@example.test")
        self.workspace = self.create_workspace(self.owner, "Workspace")
        self.other_workspace = self.create_workspace(self.outsider, "Other workspace")
        Membership.objects.create(
            workspace=self.workspace,
            user=self.editor,
            role=Membership.Role.EDITOR,
        )
        Membership.objects.create(
            workspace=self.workspace,
            user=self.viewer,
            role=Membership.Role.VIEWER,
        )
        self.claim = self.create_claim()

    @staticmethod
    def create_user(email):
        return User.objects.create_user(
            email,
            password="not-a-real-user-password",
            email_verified_at=timezone.now(),
        )

    @staticmethod
    def create_workspace(owner, name):
        billing = BillingAccount.objects.create(owner=owner)
        return Workspace.objects.create(
            owner=owner,
            billing_account=billing,
            name=name,
        )

    def create_claim(self, **changes):
        values = {
            "workspace": self.workspace,
            "statement": "مدیران فروشگاه با کمبود پیش‌بینی تقاضا روبه‌رو هستند.",
            "claim_type": Claim.Type.HYPOTHESIS,
            "owner": self.owner,
        }
        values.update(changes)
        claim = Claim(**values)
        claim.full_clean()
        claim.save()
        return claim

    def create_evidence(self, source_id, **changes):
        values = {
            "workspace": self.workspace,
            "origin": Evidence.Origin.CUSTOMER_INTERVIEW,
            "source_id": source_id,
            "owner": self.owner,
            "provenance": "مصاحبهٔ ثبت‌شده در سامانهٔ تحقیق",
            "method": "مصاحبهٔ نیمه‌ساختاریافته",
            "observed_at": timezone.now(),
            "sample": "۸ مدیر فروشگاه",
            "population": "مشتریان فعال Workspace",
            "permission_scope": "workspace",
            "permission_status": Evidence.PermissionStatus.AVAILABLE,
        }
        values.update(changes)
        evidence = Evidence(**values)
        evidence.full_clean()
        evidence.save()
        return evidence

    def link(
        self, evidence, *, actor=None, polarity=ClaimEvidenceLink.Polarity.SUPPORTS
    ):
        return link_claim_evidence(
            actor or self.editor,
            self.workspace,
            claim_id=self.claim.pk,
            evidence_id=evidence.pk,
            polarity=polarity,
            rationale="بازبینی در دامنهٔ این ادعا انجام شد.",
            expected_claim_revision=self.claim.revision,
            expected_evidence_revision=evidence.revision,
        )

    def test_claim_type_and_evidence_origin_are_independent_axes(self):
        evidence = self.create_evidence(
            "interview-001",
            origin=Evidence.Origin.CUSTOMER_INTERVIEW,
        )
        second = self.create_evidence(
            "internal-row-001",
            origin=Evidence.Origin.INTERNAL_DATA,
        )

        self.assertEqual(self.claim.claim_type, Claim.Type.HYPOTHESIS)
        self.assertEqual(evidence.origin, Evidence.Origin.CUSTOMER_INTERVIEW)
        self.assertEqual(second.origin, Evidence.Origin.INTERNAL_DATA)
        self.assertNotEqual(self.claim.claim_type, evidence.origin)

    def test_duplicate_source_import_is_rejected_but_origin_is_distinct(self):
        self.create_evidence("interview-001")

        with self.assertRaises(IntegrityError), transaction.atomic():
            Evidence.objects.create(
                workspace=self.workspace,
                origin=Evidence.Origin.CUSTOMER_INTERVIEW,
                source_id="interview-001",
                provenance="duplicate import",
                observed_at=timezone.now(),
                permission_scope="workspace",
            )

        other_origin = self.create_evidence(
            "interview-001",
            origin=Evidence.Origin.EXTERNAL_EVIDENCE,
        )
        self.assertEqual(other_origin.source_id, "interview-001")

    def test_support_and_refutation_are_both_preserved_with_review_trace(self):
        supporting = self.create_evidence("interview-001")
        refuting = self.create_evidence(
            "sales-row-001", origin=Evidence.Origin.INTERNAL_DATA
        )

        support_link = self.link(supporting)
        refute_link = self.link(refuting, polarity=ClaimEvidenceLink.Polarity.REFUTES)

        self.assertTrue(support_link["created"])
        self.assertTrue(refute_link["created"])
        links = list(self.claim.evidence_links.order_by("polarity"))
        self.assertEqual(
            {item.polarity for item in links},
            {ClaimEvidenceLink.Polarity.SUPPORTS, ClaimEvidenceLink.Polarity.REFUTES},
        )
        self.assertTrue(all(item.reviewer_id == self.editor.pk for item in links))
        self.assertTrue(all(item.reviewed_at is not None for item in links))
        self.assertEqual(len(links), 2)

    def test_link_retry_is_idempotent_and_revision_tracks_review_changes(self):
        evidence = self.create_evidence("interview-001")

        first = self.link(evidence)
        repeated = self.link(evidence)
        revised = self.link(evidence, polarity=ClaimEvidenceLink.Polarity.QUALIFIES)

        self.assertTrue(first["created"])
        self.assertFalse(repeated["created"])
        self.assertEqual(first["id"], repeated["id"])
        self.assertEqual(repeated["revision"], 1)
        self.assertEqual(revised["revision"], 2)
        self.assertEqual(ClaimEvidenceLink.objects.count(), 1)

    def test_cross_workspace_segment_and_link_are_rejected(self):
        foreign_segment = Segment.objects.create(
            workspace=self.other_workspace,
            name="Segment",
        )
        with self.assertRaises(ValidationError):
            self.create_claim(
                scope_kind=ScopeKind.SEGMENT,
                segment=foreign_segment,
            )

        foreign_claim = Claim(
            workspace=self.other_workspace,
            statement="ادعای فضای دیگر",
            claim_type=Claim.Type.FACT,
            owner=self.outsider,
        )
        foreign_claim.full_clean()
        foreign_claim.save()
        evidence = self.create_evidence("interview-001")

        with self.assertRaises(Http404):
            link_claim_evidence(
                self.editor,
                self.workspace,
                claim_id=foreign_claim.pk,
                evidence_id=evidence.pk,
                polarity=ClaimEvidenceLink.Polarity.SUPPORTS,
                rationale="پیوند نباید بین دو فضای کار ساخته شود.",
                expected_claim_revision=1,
                expected_evidence_revision=1,
            )

    def test_viewer_and_unavailable_source_cannot_create_links(self):
        evidence = self.create_evidence("interview-001")
        with self.assertRaises(WorkspaceActionError) as error:
            self.link(evidence, actor=self.viewer)
        self.assertEqual(error.exception.code, "workspace_permission_denied")

        evidence.permission_status = Evidence.PermissionStatus.REVOKED
        evidence.revision += 1
        evidence.save(update_fields=("permission_status", "revision", "updated_at"))
        with self.assertRaises(WorkspaceActionError) as error:
            self.link(evidence)
        self.assertEqual(error.exception.code, "evidence_permission_unavailable")
        self.assertEqual(
            Evidence.objects.get(pk=evidence.pk).permission_status, "revoked"
        )
        self.assertFalse(ClaimEvidenceLink.objects.exists())
