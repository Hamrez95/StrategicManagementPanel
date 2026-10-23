from django.db import migrations


def seed(apps, schema_editor):
    Plan = apps.get_model('workspaces', 'ManagementPlan')
    Plan.objects.using(schema_editor.connection.alias).get_or_create(code='management-free', defaults={
        'title': 'پنل رایگان', 'is_default': True, 'is_active': True, 'owned_workspace_limit': 1, 'price': 0,
    })
    Plan.objects.using(schema_editor.connection.alias).get_or_create(code='management-special', defaults={
        'title': 'پنل ویژه', 'is_active': False, 'owned_workspace_limit': None,
        'can_finalize_analysis': True, 'can_calculate_metrics': True, 'can_generate_reports': True,
    })


class Migration(migrations.Migration):
    dependencies = [('workspaces', '0007_management_plans')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
