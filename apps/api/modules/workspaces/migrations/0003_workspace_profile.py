from django.db import migrations, models
import django.db.models.deletion


def create_existing_workspace_profiles(apps, schema_editor):
    Workspace = apps.get_model('workspaces', 'Workspace')
    WorkspaceProfile = apps.get_model('workspaces', 'WorkspaceProfile')
    WorkspaceProfile.objects.using(schema_editor.connection.alias).bulk_create(
        [WorkspaceProfile(workspace_id=workspace_id) for workspace_id in
         Workspace.objects.using(schema_editor.connection.alias).values_list('pk', flat=True)],
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):
    dependencies = [('workspaces', '0002_workspace_invitations')]

    operations = [
        migrations.CreateModel(
            name='WorkspaceProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('industry', models.CharField(blank=True, default='', max_length=200)),
                ('stage', models.CharField(blank=True, default='', max_length=100)),
                ('mission', models.TextField(blank=True, default='', max_length=2000)),
                ('revision', models.PositiveIntegerField(default=1)),
                ('onboarding_completed_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('workspace', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='profile', to='workspaces.workspace')),
            ],
        ),
        migrations.AddConstraint(
            model_name='workspaceprofile',
            constraint=models.CheckConstraint(condition=models.Q(('revision__gte', 1)), name='workspace_profile_revision_gte_1'),
        ),
        migrations.RunPython(create_existing_workspace_profiles, migrations.RunPython.noop),
    ]
