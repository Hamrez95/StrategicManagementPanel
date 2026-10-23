from django.db import migrations


def install(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute('''CREATE FUNCTION stratino_owner_identity() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
        RAISE EXCEPTION 'Owner identity requires a dedicated reviewed transfer workflow' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$''')
    schema_editor.execute('CREATE TRIGGER ci_billing_owner_identity BEFORE UPDATE OF owner_id ON workspaces_billingaccount FOR EACH ROW EXECUTE FUNCTION stratino_owner_identity()')
    schema_editor.execute('CREATE TRIGGER ci_workspace_owner_identity BEFORE UPDATE OF owner_id ON workspaces_workspace FOR EACH ROW EXECUTE FUNCTION stratino_owner_identity()')


def uninstall(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute('DROP TRIGGER ci_workspace_owner_identity ON workspaces_workspace')
    schema_editor.execute('DROP TRIGGER ci_billing_owner_identity ON workspaces_billingaccount')
    schema_editor.execute('DROP FUNCTION stratino_owner_identity()')


class Migration(migrations.Migration):
    dependencies = [('core', '0003_management_subscription_guards')]
    operations = [migrations.RunPython(install, uninstall)]
