import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from modules.workspaces.services import workspace_role


class ScopedEvidenceRecord(models.Model):
    """Identity, Workspace scope, revision, and audit timestamps for evidence."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="%(class)s_records",
    )
    revision = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ScopeKind(models.TextChoices):
    WORKSPACE = "workspace", "Workspace"
    SEGMENT = "segment", "Segment"


class Claim(ScopedEvidenceRecord):
    class Type(models.TextChoices):
        FACT = "fact", "Fact"
        ESTIMATE = "estimate", "Estimate"
        HYPOTHESIS = "hypothesis", "Hypothesis"
        ASSUMPTION = "assumption", "Assumption"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUPERSEDED = "superseded", "Superseded"
        ARCHIVED = "archived", "Archived"

    statement = models.CharField(max_length=2000)
    claim_type = models.CharField(max_length=16, choices=Type.choices)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="owned_claims",
    )
    scope_kind = models.CharField(
        max_length=16, choices=ScopeKind.choices, default=ScopeKind.WORKSPACE
    )
    segment = models.ForeignKey(
        "customer_context.Segment",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="claims",
    )
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-updated_at", "id")
        indexes = [
            models.Index(
                fields=("workspace", "status"), name="evidence_claim_status_idx"
            )
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(revision__gte=1), name="evidence_claim_revision_gte1"
            ),
            models.CheckConstraint(
                condition=Q(
                    claim_type__in=("fact", "estimate", "hypothesis", "assumption")
                ),
                name="evidence_claim_type_valid",
            ),
            models.CheckConstraint(
                condition=Q(status__in=("active", "superseded", "archived")),
                name="evidence_claim_status_valid",
            ),
            models.CheckConstraint(
                condition=Q(scope_kind="workspace", segment__isnull=True)
                | Q(scope_kind="segment", segment__isnull=False),
                name="evidence_claim_scope_valid",
            ),
            models.CheckConstraint(
                condition=(Q(period_start__isnull=True) & Q(period_end__isnull=True))
                | (
                    Q(period_start__isnull=False)
                    & Q(period_end__isnull=False)
                    & Q(period_start__lt=models.F("period_end"))
                ),
                name="evidence_claim_period_valid",
            ),
        ]

    def clean(self):
        super().clean()
        if self.owner_id and workspace_role(self.owner, self.workspace) not in {
            "owner",
            "editor",
        }:
            raise ValidationError({"owner": "Claim owner must be a Workspace editor."})
        if (self.scope_kind == ScopeKind.SEGMENT) != (self.segment_id is not None):
            raise ValidationError(
                {"segment": "Segment scope requires exactly one Segment."}
            )
        if self.segment_id and self.segment.workspace_id != self.workspace_id:
            raise ValidationError(
                {"segment": "The Segment must belong to this Workspace."}
            )
        if (self.period_start is None) != (self.period_end is None):
            raise ValidationError(
                {"period_start": "Both period boundaries must be provided together."}
            )
        if self.period_start and self.period_end <= self.period_start:
            raise ValidationError({"period_end": "Period end must follow its start."})


class Evidence(ScopedEvidenceRecord):
    class Origin(models.TextChoices):
        INTERNAL_DATA = "internal_data", "Internal data"
        EXTERNAL_EVIDENCE = "external_evidence", "External evidence"
        EXPERIMENT = "experiment", "Experiment"
        CUSTOMER_INTERVIEW = "customer_interview", "Customer interview"
        EXPERT_JUDGMENT = "expert_judgment", "Expert judgment"

    class PermissionStatus(models.TextChoices):
        UNVERIFIED = "unverified", "Unverified"
        AVAILABLE = "available", "Available"
        REVOKED = "revoked", "Revoked"

    origin = models.CharField(max_length=24, choices=Origin.choices)
    source_id = models.CharField(max_length=160)
    source_revision = models.CharField(max_length=80, blank=True, default="")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="owned_evidence",
    )
    provenance = models.TextField(max_length=2000)
    method = models.CharField(max_length=160, blank=True, default="")
    observed_at = models.DateTimeField()
    imported_at = models.DateTimeField(auto_now_add=True)
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    sample = models.CharField(max_length=500, blank=True, default="")
    population = models.CharField(max_length=500, blank=True, default="")
    geography = models.CharField(max_length=160, blank=True, default="")
    limitations = models.TextField(max_length=2000, blank=True, default="")
    permission_scope = models.CharField(max_length=120)
    permission_status = models.CharField(
        max_length=16,
        choices=PermissionStatus.choices,
        default=PermissionStatus.UNVERIFIED,
    )
    scope_kind = models.CharField(
        max_length=16, choices=ScopeKind.choices, default=ScopeKind.WORKSPACE
    )
    segment = models.ForeignKey(
        "customer_context.Segment",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="evidence_records",
    )

    class Meta:
        ordering = ("-observed_at", "id")
        indexes = [
            models.Index(
                fields=("workspace", "origin", "observed_at"),
                name="evidence_source_time_idx",
            ),
            models.Index(
                fields=("workspace", "permission_status"),
                name="evidence_permission_idx",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("workspace", "origin", "source_id"),
                name="evidence_source_identity_uniq",
            ),
            models.CheckConstraint(
                condition=Q(revision__gte=1), name="evidence_record_revision_gte1"
            ),
            models.CheckConstraint(
                condition=Q(
                    origin__in=(
                        "internal_data",
                        "external_evidence",
                        "experiment",
                        "customer_interview",
                        "expert_judgment",
                    )
                ),
                name="evidence_origin_valid",
            ),
            models.CheckConstraint(
                condition=Q(
                    permission_status__in=("unverified", "available", "revoked")
                ),
                name="evidence_permission_status_valid",
            ),
            models.CheckConstraint(
                condition=Q(scope_kind="workspace", segment__isnull=True)
                | Q(scope_kind="segment", segment__isnull=False),
                name="evidence_scope_valid",
            ),
            models.CheckConstraint(
                condition=(Q(period_start__isnull=True) & Q(period_end__isnull=True))
                | (
                    Q(period_start__isnull=False)
                    & Q(period_end__isnull=False)
                    & Q(period_start__lt=models.F("period_end"))
                ),
                name="evidence_period_valid",
            ),
        ]

    def clean(self):
        super().clean()
        if self.owner_id and workspace_role(self.owner, self.workspace) not in {
            "owner",
            "editor",
        }:
            raise ValidationError(
                {"owner": "Evidence owner must be a Workspace editor."}
            )
        if not self.source_id or self.source_id != self.source_id.strip():
            raise ValidationError(
                {"source_id": "A stable, trimmed source identity is required."}
            )
        if not self.provenance or not self.provenance.strip():
            raise ValidationError({"provenance": "Source provenance is required."})
        if not self.permission_scope or not self.permission_scope.strip():
            raise ValidationError(
                {"permission_scope": "Source permission scope is required."}
            )
        if (self.scope_kind == ScopeKind.SEGMENT) != (self.segment_id is not None):
            raise ValidationError(
                {"segment": "Segment scope requires exactly one Segment."}
            )
        if self.segment_id and self.segment.workspace_id != self.workspace_id:
            raise ValidationError(
                {"segment": "The Segment must belong to this Workspace."}
            )
        if (self.period_start is None) != (self.period_end is None):
            raise ValidationError(
                {"period_start": "Both period boundaries must be provided together."}
            )
        if self.period_start and self.period_end <= self.period_start:
            raise ValidationError({"period_end": "Period end must follow its start."})


class ClaimEvidenceLink(models.Model):
    class Polarity(models.TextChoices):
        SUPPORTS = "supports", "Supports"
        REFUTES = "refutes", "Refutes"
        QUALIFIES = "qualifies", "Qualifies"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="claim_evidence_links",
    )
    claim = models.ForeignKey(
        Claim, on_delete=models.CASCADE, related_name="evidence_links"
    )
    evidence = models.ForeignKey(
        Evidence, on_delete=models.PROTECT, related_name="claim_links"
    )
    polarity = models.CharField(max_length=12, choices=Polarity.choices)
    rationale = models.CharField(max_length=1000)
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reviewed_evidence_links",
    )
    revision = models.PositiveIntegerField(default=1)
    reviewed_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("workspace", "claim", "evidence"),
                name="evidence_claim_source_link_uniq",
            ),
            models.CheckConstraint(
                condition=Q(revision__gte=1), name="evidence_link_revision_gte1"
            ),
            models.CheckConstraint(
                condition=Q(polarity__in=("supports", "refutes", "qualifies")),
                name="evidence_link_polarity_valid",
            ),
            models.CheckConstraint(
                condition=~Q(rationale=""), name="evidence_link_rationale_required"
            ),
        ]

    def clean(self):
        super().clean()
        if not self.rationale or not self.rationale.strip():
            raise ValidationError({"rationale": "A review rationale is required."})
        if self.reviewer_id and workspace_role(self.reviewer, self.workspace) not in {
            "owner",
            "editor",
        }:
            raise ValidationError(
                {"reviewer": "Reviewer must be a Workspace editor."}
            )
        if self.claim_id and self.claim.workspace_id != self.workspace_id:
            raise ValidationError({"claim": "Claim belongs to another Workspace."})
        if self.evidence_id and self.evidence.workspace_id != self.workspace_id:
            raise ValidationError(
                {"evidence": "Evidence belongs to another Workspace."}
            )
        if self.claim_id and self.evidence_id:
            if self.claim.workspace_id != self.evidence.workspace_id:
                raise ValidationError(
                    {"evidence": "Claim and Evidence must share a Workspace."}
                )
