from typing import ClassVar

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies: ClassVar = [('operations', '0008_academy_access_audit')]
    operations: ClassVar = [
        migrations.AddField(model_name='operatoraccess', name='mfa_enabled', field=models.BooleanField(default=True)),
    ]
