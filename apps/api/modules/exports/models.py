import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class ExportSnapshot(models.Model):
    """Immutable, Workspace-scoped report data and private downloadable archive."""

    class State(models.TextChoices):
        READY = 'ready', 'Ready'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='export_snapshots')
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='export_snapshots')
    idempotency_key = models.CharField(max_length=100)
    schema_version = models.PositiveSmallIntegerField(default=1)
    method_version = models.CharField(max_length=32, default='stratino-report-v1')
    scope = models.JSONField(default=list)
    data = models.JSONField()
    exported_at = models.DateTimeField(default=timezone.now)
    artifact_key = models.CharField(max_length=100, unique=True)
    artifact_sha256 = models.CharField(max_length=64)
    artifact_size_bytes = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError('Export snapshots are immutable; create a new snapshot.')
        return super().save(*args, **kwargs)

    class Meta:
        ordering = ('-created_at', 'id')
        constraints = [
            models.UniqueConstraint(
                fields=('workspace', 'requested_by', 'idempotency_key'),
                name='export_workspace_user_idem_uniq',
            ),
            models.CheckConstraint(condition=models.Q(schema_version__in=(1, 2)), name='export_schema_version_supported'),
            models.CheckConstraint(condition=models.Q(artifact_size_bytes__gte=0), name='export_artifact_size_nonnegative'),
        ]
