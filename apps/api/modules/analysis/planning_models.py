"""Typed, Workspace-owned planning records; never a catch-all notes JSON store."""

import uuid
from typing import ClassVar

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class PlanningRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey("workspaces.Workspace", on_delete=models.CASCADE)
    title = models.CharField(max_length=160)
    revision = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ("-updated_at", "id")
        constraints: ClassVar[list] = [
            models.CheckConstraint(
                condition=Q(revision__gte=1), name="%(class)s_revision_positive"
            )
        ]


class EnvironmentSignal(PlanningRecord):
    category = models.CharField(
        max_length=16,
        choices=[
            (v, v)
            for v in (
                "political",
                "economic",
                "social",
                "technological",
                "environmental",
                "legal",
            )
        ],
    )
    observation = models.TextField(max_length=2000)
    implication = models.TextField(max_length=2000, blank=True)
    source = models.CharField(max_length=1000)
    observed_on = models.DateField(null=True, blank=True)


class CompetitorProfile(PlanningRecord):
    customer_segment = models.CharField(max_length=500, blank=True)
    value_proposition = models.TextField(max_length=2000)
    advantage = models.TextField(max_length=2000, blank=True)
    source = models.CharField(max_length=1000)
    observed_on = models.DateField(null=True, blank=True)


class ResourceAssessment(PlanningRecord):
    description = models.TextField(max_length=2000)
    valuable = models.CharField(
        max_length=8,
        choices=[(v, v) for v in ("unknown", "yes", "no")],
        default="unknown",
    )
    rare = models.CharField(
        max_length=8,
        choices=[(v, v) for v in ("unknown", "yes", "no")],
        default="unknown",
    )
    hard_to_imitate = models.CharField(
        max_length=8,
        choices=[(v, v) for v in ("unknown", "yes", "no")],
        default="unknown",
    )
    organized = models.CharField(
        max_length=8,
        choices=[(v, v) for v in ("unknown", "yes", "no")],
        default="unknown",
    )
    source = models.CharField(max_length=1000)


class ScenarioPlan(PlanningRecord):
    uncertainty = models.TextField(max_length=2000)
    assumptions = models.TextField(max_length=2000)
    early_signal = models.CharField(max_length=1000)
    response = models.TextField(max_length=2000)
    review_on = models.DateField(null=True, blank=True)


class RiskRecord(PlanningRecord):
    description = models.TextField(max_length=2000)
    likelihood = models.CharField(
        max_length=8,
        choices=[(v, v) for v in ("unknown", "low", "medium", "high")],
        default="unknown",
    )
    impact = models.CharField(
        max_length=8,
        choices=[(v, v) for v in ("unknown", "low", "medium", "high")],
        default="unknown",
    )
    mitigation = models.TextField(max_length=2000)
    responsible = models.CharField(max_length=160, blank=True)
    review_on = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=12,
        choices=[(v, v) for v in ("open", "monitoring", "closed")],
        default="open",
    )


class JourneyStep(PlanningRecord):
    stage = models.CharField(
        max_length=16,
        choices=[
            (v, v) for v in ("understand", "analyze", "decide", "execute", "evidence")
        ],
        unique=False,
    )
    status = models.CharField(
        max_length=12,
        choices=[(v, v) for v in ("not_started", "in_progress", "done")],
        default="not_started",
    )
    outcome = models.TextField(max_length=2000, blank=True)

    class Meta(PlanningRecord.Meta):
        constraints = PlanningRecord.Meta.constraints + [
            models.UniqueConstraint(
                fields=("workspace", "stage"), name="journey_workspace_stage_unique"
            )
        ]


class PlanningRevision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey("workspaces.Workspace", on_delete=models.CASCADE)
    tool = models.CharField(max_length=16)
    record_id = models.UUIDField()
    revision = models.PositiveIntegerField()
    snapshot = models.JSONField()
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=("workspace", "tool", "record_id", "revision"),
                name="planning_history_revision_unique",
            )
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Planning history is immutable.")
        return super().save(*args, **kwargs)
