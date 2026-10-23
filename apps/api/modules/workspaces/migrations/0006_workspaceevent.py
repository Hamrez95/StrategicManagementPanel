import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('workspaces', '0005_workspace_setup_bootstrap')]
    operations = [migrations.CreateModel(name='WorkspaceEvent', fields=[
        ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
        ('event_type', models.CharField(max_length=20, choices=[('created', 'Created'), ('updated', 'Updated'), ('member_changed', 'Member changed'), ('member_removed', 'Member removed'), ('invite_created', 'Invitation created'), ('invite_revoked', 'Invitation revoked'), ('invite_accepted', 'Invitation accepted')])),
        ('target_id', models.UUIDField(null=True, blank=True)), ('changes', models.JSONField(default=dict)), ('created_at', models.DateTimeField(auto_now_add=True)),
        ('actor', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='workspace_audit_events', to=settings.AUTH_USER_MODEL)),
        ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='audit_events', to='workspaces.workspace')),
    ], options={'ordering': ('-created_at', '-id'), 'indexes': [models.Index(fields=['workspace', '-created_at'], name='workspace_event_recent_idx')]})]
