from django.db import migrations, models


def annual_catalog(apps, schema_editor):
    # Only mutable offers change. Existing order items and grants are untouched.
    apps.get_model('academy', 'AcademyPlan').objects.using(schema_editor.connection.alias).exclude(kind='free').update(duration_days=365)


class Migration(migrations.Migration):
    dependencies = [('academy', '0005_special_subscription_wording')]
    operations = [
        migrations.AlterField(model_name='academyplan', name='duration_days', field=models.PositiveIntegerField(blank=True, default=365, null=True, help_text='دورهٔ خرید جدید یک سال، برابر با ۳۶۵ روز است.')),
        migrations.RunPython(annual_catalog, migrations.RunPython.noop),
    ]
