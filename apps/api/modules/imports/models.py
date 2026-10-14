import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class WorkspaceImportBatch(models.Model):
    """Immutable, Workspace-scoped snapshot of a mapped legacy backup."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='import_batches')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='workspace_import_batches')
    idempotency_key = models.CharField(max_length=100)
    source_schema = models.CharField(max_length=80)
    mapping_version = models.PositiveSmallIntegerField(default=1)
    source_digest = models.CharField(max_length=64)
    record_counts = models.JSONField(default=dict)
    missing_attachment_bytes = models.PositiveIntegerField(default=0)
    data = models.JSONField()
    source_backup = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    undone_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-created_at', 'id')
        constraints = [
            models.UniqueConstraint(fields=('workspace', 'idempotency_key'), name='workspace_import_idem_uniq'),
            models.UniqueConstraint(
                fields=('workspace', 'source_digest'),
                condition=Q(undone_at__isnull=True),
                name='workspace_import_active_digest_uniq',
            ),
            models.CheckConstraint(condition=Q(mapping_version__gte=1), name='workspace_import_mapping_version_gte_1'),
        ]

