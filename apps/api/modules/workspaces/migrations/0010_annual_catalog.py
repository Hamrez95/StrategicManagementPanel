from django.db import migrations, models
from django.db.models import F


def annual_catalog(apps, schema_editor):
    # A new offer revision never rewrites frozen order/subscription terms.
    apps.get_model('workspaces', 'ManagementPlan').objects.using(schema_editor.connection.alias).filter(is_default=False).exclude(duration_days=365).update(duration_days=365, revision=F('revision') + 1)


class Migration(migrations.Migration):
    dependencies = [('workspaces', '0009_managementdiscount_managementorder_and_more')]
    operations = [
        migrations.AlterField(model_name='managementplan', name='duration_days', field=models.PositiveIntegerField(blank=True, default=365, null=True)),
        migrations.RunPython(annual_catalog, migrations.RunPython.noop),
    ]
