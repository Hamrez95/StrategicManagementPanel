import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('analysis', '0001_initial'),
        ('strategy', '0001_initial'),
        ('workspaces', '0004_workspace_strategy_profile'),
    ]

    operations = [
        migrations.CreateModel(
            name='Decision',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=160)),
                ('rationale', models.TextField(max_length=2000)),
                ('assumptions', models.TextField(max_length=2000)),
                ('review_trigger', models.CharField(max_length=500)),
                ('source_snapshot', models.JSONField(default=dict)),
                ('status', models.CharField(choices=[('proposed', 'Proposed'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('superseded', 'Superseded')], default='proposed', max_length=12)),
                ('revision', models.PositiveIntegerField(default=1)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='decisions_created', to=settings.AUTH_USER_MODEL)),
                ('source_analysis', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='decisions', to='analysis.analysis')),
                ('source_option', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='decisions', to='strategy.strategyoption')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='decisions', to='workspaces.workspace')),
            ],
            options={'ordering': ('-updated_at', 'title', 'id')},
        ),
        migrations.CreateModel(
            name='Goal',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=160)),
                ('description', models.TextField(blank=True, default='', max_length=1000)),
                ('due_on', models.DateField(blank=True, null=True)),
                ('status', models.CharField(choices=[('active', 'Active'), ('complete', 'Complete')], default='active', max_length=8)),
                ('revision', models.PositiveIntegerField(default=1)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='execution_goals_created', to=settings.AUTH_USER_MODEL)),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='execution_goals', to='workspaces.workspace')),
            ],
            options={'ordering': ('status', 'due_on', 'title', 'id')},
        ),
        migrations.CreateModel(
            name='Action',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=160)),
                ('description', models.TextField(blank=True, default='', max_length=1000)),
                ('due_on', models.DateField()),
                ('status', models.CharField(choices=[('planned', 'Planned'), ('in_progress', 'In progress'), ('blocked', 'Blocked'), ('done', 'Done')], default='planned', max_length=12)),
                ('revision', models.PositiveIntegerField(default=1)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='execution_actions_created', to=settings.AUTH_USER_MODEL)),
                ('decision', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='actions', to='execution.decision')),
                ('goal', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='actions', to='execution.goal')),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='execution_actions', to=settings.AUTH_USER_MODEL)),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='execution_actions', to='workspaces.workspace')),
            ],
            options={'ordering': ('due_on', 'status', 'title', 'id')},
        ),
        migrations.CreateModel(
            name='ExecutionEvent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('entity_type', models.CharField(choices=[('decision', 'Decision'), ('goal', 'Goal'), ('action', 'Action')], max_length=8)),
                ('entity_id', models.UUIDField()),
                ('entity_label', models.CharField(max_length=160)),
                ('event_type', models.CharField(max_length=16)),
                ('changes', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='execution_events', to=settings.AUTH_USER_MODEL)),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='execution_events', to='workspaces.workspace')),
            ],
            options={'ordering': ('-created_at', '-id')},
        ),
        migrations.AddConstraint(
            model_name='decision',
            constraint=models.CheckConstraint(condition=models.Q(('source_analysis__isnull', True), ('source_option__isnull', True), _connector='OR'), name='execution_decision_one_source'),
        ),
        migrations.AddConstraint(
            model_name='decision',
            constraint=models.CheckConstraint(condition=models.Q(('revision__gte', 1)), name='exec_decision_revision_gte1'),
        ),
        migrations.AddConstraint(
            model_name='goal',
            constraint=models.CheckConstraint(condition=models.Q(('revision__gte', 1)), name='exec_goal_revision_gte1'),
        ),
        migrations.AddConstraint(
            model_name='action',
            constraint=models.CheckConstraint(condition=models.Q(('revision__gte', 1)), name='exec_action_revision_gte1'),
        ),
        migrations.AddIndex(
            model_name='decision',
            index=models.Index(fields=['workspace', 'status'], name='execution_decision_status_idx'),
        ),
        migrations.AddIndex(
            model_name='goal',
            index=models.Index(fields=['workspace', 'status'], name='execution_goal_status_idx'),
        ),
        migrations.AddIndex(
            model_name='action',
            index=models.Index(fields=['workspace', 'due_on'], name='execution_action_due_idx'),
        ),
        migrations.AddIndex(
            model_name='executionevent',
            index=models.Index(fields=['workspace', '-created_at'], name='execution_event_recent_idx'),
        ),
    ]
