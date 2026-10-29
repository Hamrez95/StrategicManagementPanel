from django.db import migrations


def install(apps, editor):
    if editor.connection.vendor != 'postgresql':
        return
    editor.execute("""CREATE FUNCTION stratino_bsc_relation_parent() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.card_id IS DISTINCT FROM OLD.card_id THEN
      RAISE EXCEPTION 'BSC relationship parent is immutable' USING ERRCODE='23514';
    END IF; RETURN NEW; END $$;
    CREATE TRIGGER bsc_relation_parent BEFORE UPDATE OF card_id ON execution_scorecardrelation
    FOR EACH ROW EXECUTE FUNCTION stratino_bsc_relation_parent();""")


def uninstall(apps, editor):
    if editor.connection.vendor == 'postgresql':
        editor.execute('DROP TRIGGER bsc_relation_parent ON execution_scorecardrelation; DROP FUNCTION stratino_bsc_relation_parent();')


class Migration(migrations.Migration):
    dependencies = [('execution', '0004_scorecard_action_retry')]
    operations = [migrations.RunPython(install, uninstall)]
