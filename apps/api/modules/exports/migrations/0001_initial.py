import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('workspaces', '0003_workspace_profile'),
    ]

    operations = [
        migrations.CreateModel(
            name='ExportSnapshot',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('idempotency_key', models.CharField(max_length=100)),
                ('schema_version', models.PositiveSmallIntegerField(default=1)),
                ('method_version', models.CharField(default='stratino-report-v1', max_length=32)),
                ('scope', models.JSONField(default=list)),
                ('data', models.JSONField()),
                ('exported_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('artifact_key', models.CharField(max_length=100, unique=True)),
                ('artifact_sha256', models.CharField(max_length=64)),
                ('artifact_size_bytes', models.PositiveBigIntegerField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('requested_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='export_snapshots', to=settings.AUTH_USER_MODEL)),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='export_snapshots', to='workspaces.workspace')),
            ],
            options={'ordering': ('-created_at', 'id')},
        ),
        migrations.AddConstraint(
            model_name='exportsnapshot',
            constraint=models.UniqueConstraint(fields=('workspace', 'requested_by', 'idempotency_key'), name='export_workspace_user_idem_uniq'),
        ),
        migrations.AddConstraint(
            model_name='exportsnapshot',
            constraint=models.CheckConstraint(condition=models.Q(('schema_version', 1)), name='export_schema_version_supported'),
        ),
        migrations.AddConstraint(
            model_name='exportsnapshot',
            constraint=models.CheckConstraint(condition=models.Q(('artifact_size_bytes__gte', 0)), name='export_artifact_size_nonnegative'),
        ),
    ]
