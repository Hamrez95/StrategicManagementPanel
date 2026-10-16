import uuid
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from modules.evidence.models import ScopeKind
from modules.workspaces.services import workspace_role

from .bindings import NUMERIC_INPUT_BINDINGS


class ObservationState(models.TextChoices):
    OBSERVED = "observed", "Observed"
    UNKNOWN = "unknown", "Unknown"
    NOT_APPLICABLE = "not_applicable", "Not applicable"
    INVALID = "invalid", "Invalid"


class ObservationSource(models.TextChoices):
    OWNER_REPORTED = "owner_reported", "Owner reported"
    VERIFIED_IMPORT = "verified_import", "Verified import"


class InputObservation(models.Model):
    """Immutable, typed numeric fact bound to a reviewed business input."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace", on_delete=models.CASCADE, related_name="metric_inputs"
    )
    binding_id = models.CharField(max_length=64)
    scope_kind = models.CharField(
        max_length=16, choices=ScopeKind.choices, default=ScopeKind.WORKSPACE
    )
    segment = models.ForeignKey(
        "customer_context.Segment",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="metric_observations",
    )
    period_start = models.DateField()
    period_end = models.DateField()
    value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    state = models.CharField(max_length=16, choices=ObservationState.choices)
    unit = models.CharField(max_length=32)
    currency = models.CharField(max_length=3)
    accounting_basis = models.CharField(max_length=64)
    source_kind = models.CharField(max_length=24, choices=ObservationSource.choices)
    source_id = models.CharField(max_length=160)
    source_revision = models.CharField(max_length=80)
    reason = models.CharField(max_length=1000, blank=True, default="")
    revision = models.PositiveIntegerField(default=1)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="recorded_metric_observations",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-period_end", "binding_id", "id")
        indexes = [
            models.Index(
                fields=("workspace", "binding_id", "period_end"),
                name="metric_input_period_idx",
            )
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(revision__gte=1), name="metric_input_rev_gte1"
            ),
            models.CheckConstraint(
                condition=Q(period_start__lt=models.F("period_end")),
                name="metric_input_period_valid",
            ),
            models.CheckConstraint(
                condition=(
                    Q(state="observed", value__isnull=False)
                    | Q(
                        state__in=("unknown", "not_applicable", "invalid"),
                        value__isnull=True,
                    )
                ),
                name="metric_input_state_value_valid",
            ),
            models.CheckConstraint(
                condition=Q(
                    state__in=("observed", "unknown", "not_applicable", "invalid")
                ),
                name="metric_input_state_valid",
            ),
            models.CheckConstraint(
                condition=Q(scope_kind="workspace", segment__isnull=True)
                | Q(scope_kind="segment", segment__isnull=False),
                name="metric_input_scope_valid",
            ),
        ]

    def clean(self):
        super().clean()
        if self.binding_id not in NUMERIC_INPUT_BINDINGS:
            raise ValidationError(
                {"binding_id": "This numeric input binding is not reviewed."}
            )
        if (self.scope_kind == ScopeKind.SEGMENT) != (self.segment_id is not None):
            raise ValidationError(
                {"segment": "Segment scope requires exactly one Segment."}
            )
        if self.segment_id and self.segment.workspace_id != self.workspace_id:
            raise ValidationError(
                {"segment": "The Segment must belong to this Workspace."}
            )
        if self.state == ObservationState.OBSERVED and self.value is None:
            raise ValidationError(
                {"value": "Observed inputs require a numeric value, including zero."}
            )
        if self.state != ObservationState.OBSERVED and self.value is not None:
            raise ValidationError(
                {
                    "value": "Unknown, invalid and not-applicable inputs cannot contain a value."
                }
            )
        if self.state != ObservationState.OBSERVED and not self.reason.strip():
            raise ValidationError(
                {"reason": "A reason is required when the value is not observed."}
            )
        if (
            not self.unit.strip()
            or not self.currency.strip()
            or not self.accounting_basis.strip()
        ):
            raise ValidationError(
                {"unit": "Unit, currency and accounting basis are required."}
            )
        if self.currency != self.currency.upper() or len(self.currency) != 3:
            raise ValidationError(
                {"currency": "Currency must be a three-letter uppercase code."}
            )
        if not self.source_id.strip() or not self.source_revision.strip():
            raise ValidationError(
                {"source_id": "A stable source identity and revision are required."}
            )
        if self.recorded_by_id and workspace_role(
            self.recorded_by, self.workspace
        ) not in {"owner", "editor"}:
            raise ValidationError(
                {"recorded_by": "The recorder must be an active Workspace editor."}
            )

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError(
                "Input observations are immutable; record a new revision instead."
            )
        return super().save(*args, **kwargs)


class InputObservationEvidence(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    observation = models.ForeignKey(
        InputObservation, on_delete=models.CASCADE, related_name="evidence_links"
    )
    evidence = models.ForeignKey(
        "evidence.Evidence", on_delete=models.PROTECT, related_name="input_links"
    )
    evidence_revision = models.PositiveIntegerField(default=1)
    permission_status = models.CharField(max_length=16, default="available")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("observation", "evidence"), name="metric_input_evidence_uniq"
            )
        ]

    def clean(self):
        super().clean()
        if (
            self.observation_id
            and self.evidence_id
            and self.observation.workspace_id != self.evidence.workspace_id
        ):
            raise ValidationError(
                {"evidence": "Evidence must belong to the observation Workspace."}
            )
        if self.evidence_id and self.evidence.permission_status != "available":
            raise ValidationError(
                {"evidence": "Unavailable evidence cannot support a new input link."}
            )
        if self.evidence_id and self._state.adding:
            self.evidence_revision = self.evidence.revision
            self.permission_status = self.evidence.permission_status

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError(
                "Evidence links are immutable; create a new reviewed link instead."
            )
        if self.evidence_id:
            self.evidence_revision = self.evidence.revision
            self.permission_status = self.evidence.permission_status
        return super().save(*args, **kwargs)


class CalculationRun(models.Model):
    """Append-only context and input trace for one allowlisted calculation."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="calculation_runs",
    )
    metric_id = models.CharField(max_length=80)
    method_revision = models.CharField(max_length=40)
    knowledge_release_id = models.CharField(max_length=100)
    knowledge_release_hash = models.CharField(max_length=64)
    variant = models.CharField(max_length=64)
    scope_kind = models.CharField(
        max_length=16, choices=ScopeKind.choices, default=ScopeKind.WORKSPACE
    )
    segment = models.ForeignKey(
        "customer_context.Segment",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="calculation_runs",
    )
    period_start = models.DateField()
    period_end = models.DateField()
    currency = models.CharField(max_length=3)
    accounting_basis = models.CharField(max_length=64)
    input_revision = models.PositiveIntegerField()
    input_snapshot = models.JSONField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_calculation_runs",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "id")
        indexes = [
            models.Index(
                fields=("workspace", "metric_id", "period_end"),
                name="metric_run_period_idx",
            )
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(input_revision__gte=1), name="metric_run_input_rev_gte1"
            ),
            models.CheckConstraint(
                condition=Q(period_start__lt=models.F("period_end")),
                name="metric_run_period_valid",
            ),
            models.CheckConstraint(
                condition=Q(scope_kind="workspace", segment__isnull=True)
                | Q(scope_kind="segment", segment__isnull=False),
                name="metric_run_scope_valid",
            ),
        ]

    def clean(self):
        super().clean()
        if self.metric_id != "MET-CONTRIBUTION-MARGIN":
            raise ValidationError(
                {"metric_id": "This metric is outside the reviewed calculation slice."}
            )
        if (self.scope_kind == ScopeKind.SEGMENT) != (self.segment_id is not None):
            raise ValidationError(
                {"segment": "Segment scope requires exactly one Segment."}
            )
        if self.segment_id and self.segment.workspace_id != self.workspace_id:
            raise ValidationError(
                {"segment": "The Segment must belong to this Workspace."}
            )
        if (
            not self.method_revision.strip()
            or not self.knowledge_release_id.strip()
            or not self.knowledge_release_hash.strip()
            or not self.variant.strip()
        ):
            raise ValidationError(
                {"method_revision": "Method, release, hash and variant must be pinned."}
            )
        if self.currency != self.currency.upper() or len(self.currency) != 3:
            raise ValidationError(
                {"currency": "Currency must be a three-letter uppercase code."}
            )
        if not isinstance(self.input_snapshot, list):
            raise ValidationError(
                {
                    "input_snapshot": "Input trace must be an ordered list of typed snapshots."
                }
            )
        binding_ids = [
            item.get("binding_id")
            for item in self.input_snapshot
            if isinstance(item, dict)
        ]
        if len(binding_ids) != len(self.input_snapshot) or len(set(binding_ids)) != len(
            binding_ids
        ):
            raise ValidationError(
                {
                    "input_snapshot": "Input trace entries must be unique typed snapshots."
                }
            )
        if any(binding_id not in NUMERIC_INPUT_BINDINGS for binding_id in binding_ids):
            raise ValidationError(
                {"input_snapshot": "Input trace contains an unreviewed binding."}
            )
        required_fields = {
            "binding_id",
            "observation_id",
            "revision",
            "state",
            "value",
            "unit",
            "currency",
            "accounting_basis",
            "source_id",
            "source_kind",
            "source_revision",
            "reason",
            "scope_kind",
            "segment_id",
            "period_start",
            "period_end",
            "evidence",
        }
        for snapshot in self.input_snapshot:
            if set(snapshot) != required_fields:
                raise ValidationError(
                    {
                        "input_snapshot": "Each input trace must preserve its typed source and context."
                    }
                )
            if snapshot["state"] == ObservationState.OBSERVED:
                try:
                    numeric_value = Decimal(snapshot["value"])
                except (InvalidOperation, TypeError):
                    numeric_value = None
                if numeric_value is None or not numeric_value.is_finite():
                    raise ValidationError(
                        {
                            "input_snapshot": "An observed input must preserve its numeric value, including zero."
                        }
                    )
            elif snapshot["state"] in {
                item.value
                for item in ObservationState
                if item != ObservationState.OBSERVED
            }:
                if snapshot["value"] is not None:
                    raise ValidationError(
                        {
                            "input_snapshot": "An unknown or invalid input cannot preserve a numeric value."
                        }
                    )
                if (
                    not isinstance(snapshot["reason"], str)
                    or not snapshot["reason"].strip()
                ):
                    raise ValidationError(
                        {
                            "input_snapshot": "A missing or invalid input must preserve its reason."
                        }
                    )
            else:
                raise ValidationError(
                    {"input_snapshot": "Input state is not recognized."}
                )
            if (
                snapshot["scope_kind"] != self.scope_kind
                or snapshot["segment_id"]
                != (str(self.segment_id) if self.segment_id else None)
                or snapshot["period_start"] != self.period_start.isoformat()
                or snapshot["period_end"] != self.period_end.isoformat()
                or snapshot["currency"] != self.currency
                or snapshot["accounting_basis"] != self.accounting_basis
            ):
                raise ValidationError(
                    {
                        "input_snapshot": "Every input must match the run's scope, period, currency and accounting basis."
                    }
                )
            if not all(
                isinstance(snapshot[field], str) and snapshot[field].strip()
                for field in (
                    "observation_id",
                    "unit",
                    "currency",
                    "accounting_basis",
                    "source_id",
                    "source_kind",
                    "source_revision",
                )
            ):
                raise ValidationError(
                    {
                        "input_snapshot": "Input identity, units and source revision are required."
                    }
                )
            if snapshot["unit"] != "currency":
                raise ValidationError(
                    {"input_snapshot": "This metric binding requires a monetary unit."}
                )
            if not isinstance(snapshot["revision"], int) or snapshot["revision"] < 1:
                raise ValidationError(
                    {"input_snapshot": "Input revision must be a positive integer."}
                )
            if not isinstance(snapshot["evidence"], list) or any(
                not isinstance(item, dict)
                or set(item) != {"evidence_id", "revision", "permission_status"}
                or not isinstance(item["revision"], int)
                or item["revision"] < 1
                or item["permission_status"] != "available"
                for item in snapshot["evidence"]
            ):
                raise ValidationError(
                    {
                        "input_snapshot": "Evidence provenance must pin available source revisions."
                    }
                )
        if self.created_by_id and workspace_role(
            self.created_by, self.workspace
        ) not in {"owner", "editor"}:
            raise ValidationError(
                {"created_by": "The run creator must be an active Workspace editor."}
            )

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError(
                "Calculation runs are immutable; create a new run instead."
            )
        return super().save(*args, **kwargs)


class MetricValue(models.Model):
    """Immutable result status/value attached to its exact calculation snapshot."""

    class Status(models.TextChoices):
        OBSERVED = "observed", "Observed"
        UNKNOWN = "unknown", "Unknown"
        NOT_APPLICABLE = "not_applicable", "Not applicable"
        INVALID = "invalid", "Invalid"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(
        CalculationRun, on_delete=models.PROTECT, related_name="metric_values"
    )
    metric_id = models.CharField(max_length=80)
    variant = models.CharField(max_length=64)
    value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices)
    unit = models.CharField(max_length=32)
    currency = models.CharField(max_length=3)
    reason = models.CharField(max_length=1000, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("run", "metric_id", "variant"),
                name="metric_value_run_identity_uniq",
            ),
            models.CheckConstraint(
                condition=Q(status="observed", value__isnull=False)
                | Q(
                    status__in=("unknown", "not_applicable", "invalid"),
                    value__isnull=True,
                ),
                name="metric_value_state_value_valid",
            ),
        ]

    def clean(self):
        super().clean()
        if self.run_id and (
            self.metric_id != self.run.metric_id or self.variant != self.run.variant
        ):
            raise ValidationError(
                {"metric_id": "Metric and variant must match the immutable run."}
            )
        if self.currency != self.currency.upper() or len(self.currency) != 3:
            raise ValidationError(
                {"currency": "Currency must be a three-letter uppercase code."}
            )
        if self.status == self.Status.OBSERVED and self.value is None:
            raise ValidationError(
                {"value": "Observed results require a number, including zero."}
            )
        if self.status != self.Status.OBSERVED and self.value is not None:
            raise ValidationError(
                {"value": "Non-observed results cannot contain a numeric value."}
            )
        if self.status != self.Status.OBSERVED and not self.reason.strip():
            raise ValidationError(
                {"reason": "Non-observed results require an explanation."}
            )

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError(
                "Metric values are immutable; create a new run instead."
            )
        return super().save(*args, **kwargs)
