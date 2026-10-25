import hashlib
from django.db import migrations


def name(table, field):
    return 'ci_choice_' + hashlib.sha256((table + field).encode()).hexdigest()[:16]


CHOICES = [
    ('workspaces_managementsubscription', 'status', ['active', 'revoked']),
    ('workspaces_managementsubscriptionevent', 'event_type', ['granted', 'revoked']),
]


def install(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    q = schema_editor.quote_name
    for table, field, choices in CHOICES:
        values = ', '.join("'" + value + "'" for value in choices)
        schema_editor.execute(f'ALTER TABLE {q(table)} ADD CONSTRAINT {q(name(table, field))} CHECK ({q(field)} IN ({values}))')
    schema_editor.execute('''CREATE FUNCTION stratino_management_grant_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
        RAISE EXCEPTION 'Subscription entitlement snapshots are immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$''')
    schema_editor.execute('CREATE TRIGGER ci_management_grant_snapshot BEFORE UPDATE ON workspaces_managementsubscription FOR EACH ROW EXECUTE FUNCTION stratino_management_grant_snapshot()')


def uninstall(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    q = schema_editor.quote_name
    schema_editor.execute('DROP TRIGGER ci_management_grant_snapshot ON workspaces_managementsubscription')
    schema_editor.execute('DROP FUNCTION stratino_management_grant_snapshot()')
    for table, field, _ in CHOICES:
        schema_editor.execute(f'ALTER TABLE {q(table)} DROP CONSTRAINT {q(name(table, field))}')


class Migration(migrations.Migration):
    dependencies = [('core', '0002_workspace_event_guards'), ('workspaces', '0008_seed_management_catalog')]
    operations = [migrations.RunPython(install, uninstall)]
