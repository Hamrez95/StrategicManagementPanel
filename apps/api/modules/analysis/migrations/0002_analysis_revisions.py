import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def capture_existing(apps, schema_editor):
    Analysis = apps.get_model('analysis', 'Analysis')
    Revision = apps.get_model('analysis', 'AnalysisRevision')
    database = schema_editor.connection.alias
    for row in Analysis.objects.using(database).iterator():
        Revision.objects.using(database).create(workspace_id=row.workspace_id, source_record_id=row.pk,
            revision=row.revision, recorded_by_id=None, is_backfill=True,
            snapshot={'id': str(row.pk), 'workspace_id': str(row.workspace_id), 'revision': row.revision,
                      'created_at': row.created_at.isoformat(), 'updated_at': row.updated_at.isoformat(),
                      'kind': row.kind, 'schema_version': row.schema_version, 'method_version': row.method_version,
                      'inputs': row.inputs, 'output': row.output, 'state': row.state})


class Migration(migrations.Migration):
    dependencies = [('analysis', '0001_initial')]
    operations = [
        migrations.CreateModel(name='AnalysisRevision', fields=[
            ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
            ('source_record_id', models.UUIDField()), ('revision', models.PositiveIntegerField()),
            ('snapshot', models.JSONField()), ('recorded_at', models.DateTimeField(auto_now_add=True)),
            ('is_backfill', models.BooleanField(default=False)),
            ('recorded_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, related_name='analysis_revisions', to=settings.AUTH_USER_MODEL)),
            ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='analysis_revisions', to='workspaces.workspace')),
        ], options={'ordering': ('-revision',), 'constraints': [
            models.UniqueConstraint(fields=('workspace', 'source_record_id', 'revision'), name='analysis_history_revision_uniq'),
            models.CheckConstraint(condition=models.Q(revision__gte=1), name='analysis_history_revision_gte1')]}),
        migrations.AddConstraint(model_name='analysis', constraint=models.CheckConstraint(condition=models.Q(kind__in=('efe', 'ife')), name='analysis_kind_valid')),
        migrations.AddConstraint(model_name='analysis', constraint=models.CheckConstraint(condition=models.Q(state__in=('draft', 'finalized')), name='analysis_state_valid')),
        migrations.RunPython(capture_existing, migrations.RunPython.noop),
    ]
