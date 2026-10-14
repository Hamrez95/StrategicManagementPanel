import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('workspaces', '0001_initial')]

    operations = [
        migrations.CreateModel(
            name='WorkspaceInvitation',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('email', models.EmailField(max_length=254)),
                ('role', models.CharField(choices=[('editor', 'Editor'), ('viewer', 'Viewer')], max_length=8)),
                ('token_digest', models.CharField(max_length=64, unique=True)),
                ('expires_at', models.DateTimeField()),
                ('accepted_at', models.DateTimeField(blank=True, null=True)),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('invited_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='workspace_invitations_sent', to=settings.AUTH_USER_MODEL)),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='invitations', to='workspaces.workspace')),
            ],
            options={'ordering': ('expires_at', 'id')},
        ),
        migrations.AddIndex(
            model_name='workspaceinvitation',
            index=models.Index(fields=['workspace', 'expires_at'], name='workspace_invite_expiry_idx'),
        ),
        migrations.AddConstraint(
            model_name='workspaceinvitation',
            constraint=models.UniqueConstraint(condition=models.Q(('accepted_at__isnull', True), ('revoked_at__isnull', True)), fields=('workspace', 'email'), name='workspace_invite_pending_uniq'),
        ),
        migrations.AddConstraint(
            model_name='workspaceinvitation',
            constraint=models.CheckConstraint(condition=models.Q(('role__in', ('editor', 'viewer'))), name='workspace_invite_valid_role'),
        ),
    ]
