import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('documents', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='DocumentAttachment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('original_name', models.CharField(max_length=180)),
                ('extension', models.CharField(max_length=12)),
                ('media_type', models.CharField(max_length=128)),
                ('version', models.PositiveIntegerField()),
                ('reserved_size_bytes', models.PositiveBigIntegerField()),
                ('size_bytes', models.PositiveBigIntegerField(default=0)),
                ('sha256', models.CharField(blank=True, default='', max_length=64)),
                ('storage_key', models.CharField(max_length=80, unique=True)),
                ('status', models.CharField(choices=[('reserved', 'Reserved'), ('uploading', 'Uploading'), ('cancel_requested', 'Cancel requested'), ('quarantined', 'Quarantined'), ('ready', 'Ready'), ('rejected', 'Rejected')], default='reserved', max_length=16)),
                ('expires_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('request_id', models.UUIDField()),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='document_attachments_created', to=settings.AUTH_USER_MODEL)),
                ('document', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='documents.documentrecord')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='document_attachments', to='workspaces.workspace')),
            ],
            options={'ordering': ('-version',)},
        ),
        migrations.AddConstraint(
            model_name='documentattachment',
            constraint=models.UniqueConstraint(fields=('document', 'version'), name='document_attachment_version_unique'),
        ),
        migrations.AddConstraint(
            model_name='documentattachment',
            constraint=models.UniqueConstraint(fields=('workspace', 'created_by', 'request_id'), name='document_attachment_request_unique'),
        ),
        migrations.AddConstraint(
            model_name='documentattachment',
            constraint=models.CheckConstraint(condition=models.Q(('version__gte', 1)), name='document_attachment_version_gte1'),
        ),
        migrations.AddConstraint(
            model_name='documentattachment',
            constraint=models.CheckConstraint(condition=models.Q(('reserved_size_bytes__gt', 0)), name='document_attachment_reserved_size_gt0'),
        ),
        migrations.AddConstraint(
            model_name='documentattachment',
            constraint=models.CheckConstraint(condition=models.Q(('size_bytes__gte', 0)), name='document_attachment_size_gte0'),
        ),
        migrations.AddIndex(
            model_name='documentattachment',
            index=models.Index(fields=['workspace', 'status'], name='document_attachment_quota_idx'),
        ),
        migrations.AddIndex(
            model_name='documentattachment',
            index=models.Index(fields=['status', 'expires_at'], name='document_attachment_expiry_idx'),
        ),
    ]
