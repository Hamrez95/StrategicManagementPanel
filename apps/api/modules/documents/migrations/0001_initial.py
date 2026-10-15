import uuid

import django.db.models.deletion
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
            name='DocumentRecord',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('template_id', models.SlugField(max_length=80)),
                ('stage', models.CharField(max_length=24)),
                ('industry', models.CharField(max_length=40)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('review', 'In review'), ('ready', 'Ready')], default='draft', max_length=8)),
                ('content', models.TextField(blank=True, default='', max_length=16000)),
                ('content_version', models.PositiveIntegerField(default=1)),
                ('revision', models.PositiveIntegerField(default=1)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='document_records_created', to=settings.AUTH_USER_MODEL)),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='owned_document_records', to=settings.AUTH_USER_MODEL)),
                ('reviewer', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_document_records', to=settings.AUTH_USER_MODEL)),
                ('updated_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='document_records_updated', to=settings.AUTH_USER_MODEL)),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='document_records', to='workspaces.workspace')),
            ],
            options={'ordering': ('template_id',)},
        ),
        migrations.CreateModel(
            name='DocumentEvent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('event_type', models.CharField(max_length=16)),
                ('changes', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='document_events', to=settings.AUTH_USER_MODEL)),
                ('document', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='events', to='documents.documentrecord')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='document_events', to='workspaces.workspace')),
            ],
            options={'ordering': ('-created_at', '-id')},
        ),
        migrations.AddConstraint(
            model_name='documentrecord',
            constraint=models.UniqueConstraint(fields=('workspace', 'template_id'), name='document_workspace_template_unique'),
        ),
        migrations.AddConstraint(
            model_name='documentrecord',
            constraint=models.CheckConstraint(condition=models.Q(('content_version__gte', 1)), name='document_version_gte1'),
        ),
        migrations.AddConstraint(
            model_name='documentrecord',
            constraint=models.CheckConstraint(condition=models.Q(('revision__gte', 1)), name='document_revision_gte1'),
        ),
        migrations.AddIndex(
            model_name='documentrecord',
            index=models.Index(fields=['workspace', 'status'], name='document_workspace_status_idx'),
        ),
        migrations.AddIndex(
            model_name='documentevent',
            index=models.Index(fields=['workspace', '-created_at'], name='document_event_recent_idx'),
        ),
    ]
