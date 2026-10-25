import hashlib
from django.db import migrations


def name(kind, value):
    return f'ci_{kind}_{hashlib.sha256(value.encode()).hexdigest()[:16]}'


def install(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    q = schema_editor.quote_name
    schema_editor.execute(f'CREATE TRIGGER {q(name("tenant", "workspaces_workspaceevent"))} BEFORE UPDATE OF workspace_id ON workspaces_workspaceevent FOR EACH ROW EXECUTE FUNCTION stratino_tenant_immutable()')
    values = ', '.join("'" + value + "'" for value, _ in apps.get_model('workspaces', 'WorkspaceEvent')._meta.get_field('event_type').flatchoices)
    schema_editor.execute(f'ALTER TABLE workspaces_workspaceevent ADD CONSTRAINT {q(name("choice", "workspaces_workspaceeventevent_type"))} CHECK (event_type IN ({values}))')


def uninstall(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    q = schema_editor.quote_name
    schema_editor.execute(f'DROP TRIGGER {q(name("tenant", "workspaces_workspaceevent"))} ON workspaces_workspaceevent')
    schema_editor.execute(f'ALTER TABLE workspaces_workspaceevent DROP CONSTRAINT {q(name("choice", "workspaces_workspaceeventevent_type"))}')


class Migration(migrations.Migration):
    dependencies = [('core', '0001_management_integrity'), ('workspaces', '0006_workspaceevent')]
    operations = [migrations.RunPython(install, uninstall)]
