import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('workspaces', '0004_workspace_strategy_profile'),
    ]

    operations = [
        migrations.CreateModel(
            name='Analysis',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('kind', models.CharField(choices=[('efe', 'External Factor Evaluation'), ('ife', 'Internal Factor Evaluation')], max_length=8)),
                ('schema_version', models.PositiveSmallIntegerField(default=1)),
                ('method_version', models.CharField(max_length=32)),
                ('inputs', models.JSONField(default=dict)),
                ('output', models.JSONField(default=dict)),
                ('state', models.CharField(choices=[('draft', 'Draft'), ('finalized', 'Finalized')], default='draft', max_length=12)),
                ('revision', models.PositiveIntegerField(default=1)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='analyses_created', to=settings.AUTH_USER_MODEL)),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='analyses', to='workspaces.workspace')),
            ],
            options={'ordering': ('kind',)},
        ),
        migrations.AddConstraint(
            model_name='analysis',
            constraint=models.UniqueConstraint(fields=('workspace', 'kind'), name='analysis_workspace_kind_unique'),
        ),
        migrations.AddConstraint(
            model_name='analysis',
            constraint=models.CheckConstraint(condition=models.Q(('revision__gte', 1)), name='analysis_revision_gte_1'),
        ),
        migrations.AddConstraint(
            model_name='analysis',
            constraint=models.CheckConstraint(condition=models.Q(('schema_version', 1)), name='analysis_schema_supported'),
        ),
    ]
