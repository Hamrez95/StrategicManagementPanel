"""Include newly added operator tables in the shared integrity audit contract."""
import hashlib

from django.db import migrations


def apply_guards(apps, schema_editor, remove=False):
    if schema_editor.connection.vendor != 'postgresql':
        return
    quote = schema_editor.quote_name
    for model_name, field_name in [('OperatorAccess', 'role'), ('OperatorActionEvent', 'event_type'),
                                    ('OperatorSecurityEvent', 'event_type')]:
        model = apps.get_model('operations', model_name)
        table = model._meta.db_table
        field = model._meta.get_field(field_name)
        name = 'ci_choice_' + hashlib.sha256((table + field_name).encode()).hexdigest()[:16]
        schema_editor.execute(f'ALTER TABLE {quote(table)} DROP CONSTRAINT IF EXISTS {quote(name)}')
        if not remove:
            values = ', '.join("'" + value.replace("'", "''") + "'" for value, _ in field.flatchoices)
            schema_editor.execute(f'ALTER TABLE {quote(table)} ADD CONSTRAINT {quote(name)} CHECK ({quote(field.column)} IN ({values}))')


def install(apps, schema_editor):
    apply_guards(apps, schema_editor)


def uninstall(apps, schema_editor):
    apply_guards(apps, schema_editor, remove=True)


class Migration(migrations.Migration):
    dependencies = [('operations', '0005_operatoraccess_and_more'), ('core', '0004_billing_owner_identity')]
    operations = [migrations.RunPython(install, uninstall)]
