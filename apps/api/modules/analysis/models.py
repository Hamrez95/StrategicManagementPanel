import uuid

from django.conf import settings
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
        ]
