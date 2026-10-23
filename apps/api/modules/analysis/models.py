import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class Analysis(models.Model):
    class Kind(models.TextChoices):
        EFE = 'efe', 'External Factor Evaluation'
        IFE = 'ife', 'Internal Factor Evaluation'

    class State(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        FINALIZED = 'finalized', 'Finalized'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='analyses')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='analyses_created')
    kind = models.CharField(max_length=8, choices=Kind.choices)
    schema_version = models.PositiveSmallIntegerField(default=1)
    method_version = models.CharField(max_length=32)
    inputs = models.JSONField(default=dict)
    output = models.JSONField(default=dict)
    state = models.CharField(max_length=12, choices=State.choices, default=State.DRAFT)
    revision = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('kind',)
        constraints = [
            models.UniqueConstraint(fields=('workspace', 'kind'), name='analysis_workspace_kind_unique'),
            models.CheckConstraint(condition=Q(revision__gte=1), name='analysis_revision_gte_1'),
            models.CheckConstraint(condition=Q(schema_version=1), name='analysis_schema_supported'),
            models.CheckConstraint(condition=Q(kind__in=('efe', 'ife')), name='analysis_kind_valid'),
            models.CheckConstraint(condition=Q(state__in=('draft', 'finalized')), name='analysis_state_valid'),
        ]


class AnalysisRevision(models.Model):
    """Frozen saved revision; source UUID intentionally survives deletion of the editor row."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='analysis_revisions')
    source_record_id = models.UUIDField()
    revision = models.PositiveIntegerField()
    snapshot = models.JSONField()
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name='analysis_revisions')
    recorded_at = models.DateTimeField(auto_now_add=True)
    is_backfill = models.BooleanField(default=False)

    class Meta:
        ordering = ('-revision',)
        constraints = [
            models.UniqueConstraint(fields=('workspace', 'source_record_id', 'revision'), name='analysis_history_revision_uniq'),
            models.CheckConstraint(condition=Q(revision__gte=1), name='analysis_history_revision_gte1'),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError('Saved analysis revisions are immutable.')
        return super().save(*args, **kwargs)
