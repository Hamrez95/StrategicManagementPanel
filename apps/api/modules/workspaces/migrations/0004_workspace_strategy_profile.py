import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('workspaces', '0003_workspace_profile'),
    ]

    operations = [
        migrations.AddField(
            model_name='workspaceprofile',
            name='company_name',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='workspaceprofile',
            name='problem_statement',
            field=models.TextField(blank=True, default='', max_length=2000),
        ),
        migrations.AddField(
            model_name='workspaceprofile',
            name='products',
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name='workspaceprofile',
            name='customer_segments',
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name='workspaceprofile',
            name='goals',
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name='workspaceprofile',
            name='icps',
            field=models.JSONField(default=list),
        ),
        migrations.CreateModel(
            name='WorkspaceProfileRevision',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('revision', models.PositiveIntegerField()),
                ('snapshot', models.JSONField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('changed_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='workspace_profile_revisions', to=settings.AUTH_USER_MODEL)),
                ('profile', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='history', to='workspaces.workspaceprofile')),
            ],
            options={'ordering': ('-revision',)},
        ),
        migrations.AddConstraint(
            model_name='workspaceprofilerevision',
            constraint=models.UniqueConstraint(fields=('profile', 'revision'), name='workspace_profile_revision_unique'),
        ),
        migrations.AddConstraint(
            model_name='workspaceprofilerevision',
            constraint=models.CheckConstraint(condition=models.Q(('revision__gte', 1)), name='workspace_profile_history_revision_gte_1'),
        ),
    ]
