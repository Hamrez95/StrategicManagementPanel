import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('workspaces', '0003_workspace_profile'),
    ]

    operations = [
        migrations.CreateModel(
            name='WorkspaceImportBatch',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('idempotency_key', models.CharField(max_length=100)),
                ('source_schema', models.CharField(max_length=80)),
                ('mapping_version', models.PositiveSmallIntegerField(default=1)),
                ('source_digest', models.CharField(max_length=64)),
                ('record_counts', models.JSONField(default=dict)),
                ('missing_attachment_bytes', models.PositiveIntegerField(default=0)),
                ('data', models.JSONField()),
                ('source_backup', models.JSONField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('undone_at', models.DateTimeField(blank=True, null=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='workspace_import_batches', to=settings.AUTH_USER_MODEL)),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='import_batches', to='workspaces.workspace')),
            ],
            options={'ordering': ('-created_at', 'id')},
        ),
        migrations.AddConstraint(
            model_name='workspaceimportbatch',
            constraint=models.UniqueConstraint(fields=('workspace', 'idempotency_key'), name='workspace_import_idem_uniq'),
        ),
        migrations.AddConstraint(
            model_name='workspaceimportbatch',
            constraint=models.UniqueConstraint(condition=models.Q(('undone_at__isnull', True)), fields=('workspace', 'source_digest'), name='workspace_import_active_digest_uniq'),
        ),
        migrations.AddConstraint(
            model_name='workspaceimportbatch',
            constraint=models.CheckConstraint(condition=models.Q(('mapping_version__gte', 1)), name='workspace_import_mapping_version_gte_1'),
        ),
    ]
