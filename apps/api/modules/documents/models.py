import uuid

from django.conf import settings
from django.db import models


class DocumentRecord(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        REVIEW = 'review', 'In review'
        READY = 'ready', 'Ready'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='document_records')
    template_id = models.SlugField(max_length=80)
    stage = models.CharField(max_length=24)
    industry = models.CharField(max_length=40)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='owned_document_records')
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='reviewed_document_records')
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.DRAFT)
    content = models.TextField(max_length=16000, blank=True, default='')
    content_version = models.PositiveIntegerField(default=1)
    revision = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='document_records_created')
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='document_records_updated')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('template_id',)
        constraints = [
            models.UniqueConstraint(fields=('workspace', 'template_id'), name='document_workspace_template_unique'),
            models.CheckConstraint(condition=models.Q(content_version__gte=1), name='document_version_gte1'),
            models.CheckConstraint(condition=models.Q(revision__gte=1), name='document_revision_gte1'),
        ]
        indexes = [models.Index(fields=('workspace', 'status'), name='document_workspace_status_idx')]


class DocumentEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='document_events')
    document = models.ForeignKey(DocumentRecord, on_delete=models.CASCADE, related_name='events')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='document_events')
    event_type = models.CharField(max_length=16)
    changes = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at', '-id')
        indexes = [models.Index(fields=('workspace', '-created_at'), name='document_event_recent_idx')]
