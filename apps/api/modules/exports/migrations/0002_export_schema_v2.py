from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('exports', '0001_initial')]
    operations = [
        migrations.RemoveConstraint(model_name='exportsnapshot', name='export_schema_version_supported'),
        migrations.AddConstraint(model_name='exportsnapshot', constraint=models.CheckConstraint(
            condition=models.Q(schema_version__in=(1, 2)), name='export_schema_version_supported')),
    ]
