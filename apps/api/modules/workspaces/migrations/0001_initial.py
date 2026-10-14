import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [('accounts', '0003_account_profile_preferences_and_email_change')]

    operations = [
        migrations.CreateModel(
            name='BillingAccount',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('status', models.CharField(choices=[('active', 'Active'), ('suspended', 'Suspended')], default='active', max_length=16)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('owner', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='billing_account', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='Workspace',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=120)),
                ('archived_at', models.DateTimeField(blank=True, null=True)),
                ('revision', models.PositiveIntegerField(default=1)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('billing_account', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='workspaces', to='workspaces.billingaccount')),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='owned_workspaces', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ('name', 'id')},
        ),
        migrations.CreateModel(
            name='Membership',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('role', models.CharField(choices=[('editor', 'Editor'), ('viewer', 'Viewer')], max_length=8)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_memberships', to=settings.AUTH_USER_MODEL)),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='memberships', to='workspaces.workspace')),
            ],
        ),
        migrations.AddConstraint(
            model_name='workspace',
            constraint=models.CheckConstraint(condition=models.Q(('revision__gte', 1)), name='workspace_revision_gte_1'),
        ),
        migrations.AddConstraint(
            model_name='membership',
            constraint=models.UniqueConstraint(fields=('workspace', 'user'), name='workspace_membership_unique_user'),
        ),
        migrations.AddConstraint(
            model_name='membership',
            constraint=models.CheckConstraint(condition=models.Q(('role__in', ('editor', 'viewer'))), name='workspace_membership_valid_role'),
        ),
    ]
