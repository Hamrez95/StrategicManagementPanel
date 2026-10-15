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


class DocumentAttachment(models.Model):
    class Status(models.TextChoices):
        RESERVED = 'reserved', 'Reserved'
        UPLOADING = 'uploading', 'Uploading'
        CANCEL_REQUESTED = 'cancel_requested', 'Cancel requested'
        QUARANTINED = 'quarantined', 'Quarantined'
        READY = 'ready', 'Ready'
        REJECTED = 'rejected', 'Rejected'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='document_attachments')
    document = models.ForeignKey(DocumentRecord, on_delete=models.CASCADE, related_name='attachments')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='document_attachments_created')
    request_id = models.UUIDField()
    original_name = models.CharField(max_length=180)
    extension = models.CharField(max_length=12)
    media_type = models.CharField(max_length=128)
    version = models.PositiveIntegerField()
    reserved_size_bytes = models.PositiveBigIntegerField()
    size_bytes = models.PositiveBigIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True, default='')
    storage_key = models.CharField(max_length=80, unique=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RESERVED)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('-version',)
        constraints = [
            models.UniqueConstraint(fields=('document', 'version'), name='document_attachment_version_unique'),
            models.UniqueConstraint(fields=('workspace', 'created_by', 'request_id'), name='document_attachment_request_unique'),
            models.CheckConstraint(condition=models.Q(version__gte=1), name='document_attachment_version_gte1'),
            models.CheckConstraint(condition=models.Q(reserved_size_bytes__gt=0), name='document_attachment_reserved_size_gt0'),
            models.CheckConstraint(condition=models.Q(size_bytes__gte=0), name='document_attachment_size_gte0'),
        ]
        indexes = [
            models.Index(fields=('workspace', 'status'), name='document_attachment_quota_idx'),
            models.Index(fields=('status', 'expires_at'), name='document_attachment_expiry_idx'),
        ]
