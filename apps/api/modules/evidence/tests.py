from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import Http404
from django.test import TransactionTestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.customer_context.models import Segment
from modules.workspaces.models import BillingAccount, Membership, Workspace
from modules.workspaces.services import WorkspaceActionError

from .confidence import (
    CONFIDENCE_AXES,
    ConfidenceReviewError,
    evaluate_claim_confidence,
)
from .models import (
    Claim,
    ClaimEvidenceLink,
    ConfidenceAssessment,
    Evidence,
    ScopeKind,
)
from .services import create_confidence_assessment, link_claim_evidence


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

    def confidence_axes(self, default="adequate"):
        return {
            axis: {"state": default, "reason": f"بازبینی {axis} انجام شد."}
            for axis in CONFIDENCE_AXES
        }

    def review_confidence(self, *, actor=None, contradiction_status="none", **changes):
        values = {
            "claim_id": self.claim.pk,
            "expected_claim_revision": self.claim.revision,
            "axis_reviews": self.confidence_axes(),
            "contradiction_status": contradiction_status,
            "contradiction_reason": "تعارض‌های پیوندخورده بررسی شدند.",
            "essential_information_missing": False,
            "limitations_known": True,
            "limitations_reason": "محدودیت نمونه ثبت شد.",
            "rationale": "ارزیابی با توجه به دامنه و منبع انجام شد.",
        }
        values.update(changes)
        return create_confidence_assessment(
            actor or self.editor, self.workspace, **values
        )

    def test_ordinal_rubric_requires_reasons_and_has_no_numeric_score(self):
        evidence = self.create_evidence(
            "interview-001", review_due=timezone.localdate() + timedelta(days=2)
        )
        self.link(evidence)
        assessment = self.review_confidence()

        self.assertEqual(assessment["confidence"], "high")
        self.assertEqual(assessment["freshness"], "current")
        self.assertEqual(assessment["rule_revision"], "editorial-v0.1")
        self.assertEqual(assessment["source_trace"][0]["evidence_revision"], 1)
        self.assertNotIn("score", assessment)
        saved = ConfidenceAssessment.objects.get(pk=assessment["id"])
        with self.assertRaises(ValidationError):
            saved.save()

    def test_unresolved_material_contradiction_caps_confidence_at_low(self):
        evidence = self.create_evidence(
            "interview-001", review_due=timezone.localdate() + timedelta(days=2)
        )
        self.link(evidence)

        assessment = self.review_confidence(contradiction_status="unresolved")

        self.assertEqual(assessment["confidence"], "low")
        self.assertEqual(assessment["revision"], 1)

    def test_essential_missing_or_stale_evidence_yields_insufficient(self):
        missing = self.review_confidence(
            essential_information_missing=True,
            missing_information_reason="بازهٔ زمانی لازم ثبت نشده است.",
        )
        self.assertEqual(missing["confidence"], "insufficient")
        self.assertEqual(missing["freshness"], "unknown")

        stale = self.create_evidence(
            "interview-001", review_due=timezone.localdate() - timedelta(days=1)
        )
        self.link(stale)
        stale_assessment = self.review_confidence()
        self.assertEqual(stale_assessment["confidence"], "insufficient")
        self.assertEqual(stale_assessment["freshness"], "stale")

    def test_medium_requires_direct_provenance_recency_and_disclosed_limits(self):
        evidence = self.create_evidence(
            "interview-001", review_due=timezone.localdate() + timedelta(days=2)
        )
        self.link(evidence)
        axes = self.confidence_axes(default="limited")
        for axis in ("provenance_quality", "directness_to_decision", "recency"):
            axes[axis] = {
                "state": "adequate",
                "reason": "با دامنهٔ تصمیم هم‌خوان است.",
            }

        assessment = self.review_confidence(axis_reviews=axes)

        self.assertEqual(assessment["confidence"], "medium")

    def test_future_observations_are_rejected_and_missing_review_due_is_unknown(self):
        with self.assertRaises(ValidationError):
            self.create_evidence(
                "future-interview",
                observed_at=timezone.now() + timedelta(days=1),
            )
        unknown = self.create_evidence("undated-review")
        self.link(unknown)

        assessment = self.review_confidence()

        self.assertEqual(assessment["confidence"], "insufficient")
        self.assertEqual(assessment["freshness"], "unknown")

    def test_viewer_cannot_review_and_assessments_are_versioned(self):
        evidence = self.create_evidence(
            "interview-001", review_due=timezone.localdate() + timedelta(days=2)
        )
        self.link(evidence)
        with self.assertRaises(WorkspaceActionError) as error:
            self.review_confidence(actor=self.viewer)
        self.assertEqual(error.exception.code, "workspace_permission_denied")

        first = self.review_confidence()
        second = self.review_confidence(contradiction_status="resolved")
        self.assertEqual((first["revision"], second["revision"]), (1, 2))
        self.assertEqual(ConfidenceAssessment.objects.count(), 2)

    def test_incomplete_axis_review_is_rejected_without_synthesizing_a_score(self):
        with self.assertRaises(ConfidenceReviewError):
            evaluate_claim_confidence(
                axis_reviews={
                    "provenance_quality": {"state": "adequate", "reason": "ok"}
                },
                contradiction_status="none",
                contradiction_reason="تعارض‌ها بررسی شد.",
                essential_information_missing=False,
                missing_information_reason="",
                limitations_known=False,
                limitations_reason="",
                rationale="review",
                linked_evidence=[],
            )
