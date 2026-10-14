import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0002_email_verification_and_auth_throttle'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='display_name',
            field=models.CharField(blank=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='user',
            name='role_title',
            field=models.CharField(blank=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='user',
            name='pending_email',
            field=models.EmailField(blank=True, default='', max_length=254),
        ),
        migrations.AddField(
            model_name='user',
            name='email_change_nonce',
            field=models.UUIDField(default=uuid.uuid4, editable=False),
        ),
        migrations.CreateModel(
            name='AccountPreferences',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('theme', models.CharField(choices=[('system', 'System'), ('light', 'Light'), ('dark', 'Dark')], default='system', max_length=8)),
                ('language', models.CharField(choices=[('fa', 'Persian'), ('en', 'English')], default='fa', max_length=2)),
                ('motion', models.CharField(choices=[('auto', 'System'), ('reduced', 'Reduced')], default='auto', max_length=8)),
                ('show_tutorial', models.BooleanField(default=True)),
                ('device_synced_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='account_preferences', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
