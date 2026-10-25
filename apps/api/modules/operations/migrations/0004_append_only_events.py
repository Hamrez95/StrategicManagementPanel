from django.db import migrations


def forward(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute("""
        CREATE FUNCTION stratino_operator_event_immutable() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'Operator events are append-only' USING ERRCODE = '23514';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER operator_security_event_immutable BEFORE UPDATE OR DELETE
            ON operations_operatorsecurityevent FOR EACH ROW
            EXECUTE FUNCTION stratino_operator_event_immutable();
        CREATE TRIGGER operator_action_event_immutable BEFORE UPDATE OR DELETE
            ON operations_operatoractionevent FOR EACH ROW
            EXECUTE FUNCTION stratino_operator_event_immutable();
    """)


def backward(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute("""
        DROP TRIGGER operator_security_event_immutable ON operations_operatorsecurityevent;
        DROP TRIGGER operator_action_event_immutable ON operations_operatoractionevent;
        DROP FUNCTION stratino_operator_event_immutable();
    """)


class Migration(migrations.Migration):
    dependencies = [('operations', '0003_operatoractionevent')]
    operations = [migrations.RunPython(forward, backward)]
