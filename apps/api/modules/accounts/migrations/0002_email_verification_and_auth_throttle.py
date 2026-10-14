import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('accounts', '0001_initial')]

    operations = [
        migrations.AddField(
            model_name='user',
            name='email_verified_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='email_verification_nonce',
            field=models.UUIDField(default=uuid.uuid4, editable=False),
        ),
        migrations.CreateModel(
            name='AuthRateLimit',
            fields=[
                ('bucket_hash', models.CharField(max_length=64, primary_key=True, serialize=False)),
                ('window_started_at', models.DateTimeField()),
                ('attempts', models.PositiveIntegerField(default=0)),
            ],
        ),
    ]
