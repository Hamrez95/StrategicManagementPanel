"""Database enforcement even for writes outside the HTTP service."""
import hashlib
from django.db import migrations


def name(kind, value):
    return f'ci_{kind}_{hashlib.sha256(value.encode()).hexdigest()[:16]}'

SQL = """
CREATE FUNCTION stratino_bsc_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ws uuid; parent_ws uuid; parent_card uuid;
BEGIN
  IF TG_TABLE_NAME = 'execution_scorecard' THEN
    IF TG_OP = 'UPDATE' AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
      RAISE EXCEPTION 'BSC workspace is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.decision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM execution_decision WHERE id=NEW.decision_id AND workspace_id=NEW.workspace_id) THEN
      RAISE EXCEPTION 'BSC decision scope' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'execution_scorecardobjective' THEN
    IF TG_OP='UPDATE' AND NEW.card_id IS DISTINCT FROM OLD.card_id THEN
      RAISE EXCEPTION 'BSC parent is immutable' USING ERRCODE='23514';
    END IF;
    SELECT workspace_id INTO ws FROM execution_scorecard WHERE id=NEW.card_id;
    IF NEW.goal_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM execution_goal WHERE id=NEW.goal_id AND workspace_id=ws) THEN
      RAISE EXCEPTION 'BSC goal scope' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME IN ('execution_scorecardindicator', 'execution_scorecardaction') THEN
    IF TG_OP='UPDATE' AND NEW.objective_id IS DISTINCT FROM OLD.objective_id THEN
      RAISE EXCEPTION 'BSC parent is immutable' USING ERRCODE='23514';
    END IF;
    SELECT c.workspace_id INTO ws FROM execution_scorecard c JOIN execution_scorecardobjective o ON o.card_id=c.id WHERE o.id=NEW.objective_id;
    IF TG_TABLE_NAME='execution_scorecardaction' THEN
      IF NOT EXISTS (SELECT 1 FROM execution_action WHERE id=NEW.action_id AND workspace_id=ws) THEN
        RAISE EXCEPTION 'BSC action scope' USING ERRCODE='23514';
      END IF;
    ELSE
      IF NEW.owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workspaces_workspace WHERE id=ws AND owner_id=NEW.owner_id) AND NOT EXISTS (SELECT 1 FROM workspaces_membership WHERE workspace_id=ws AND user_id=NEW.owner_id) THEN
        RAISE EXCEPTION 'BSC owner scope' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME='execution_scorecardrelation' THEN
    IF NOT EXISTS (SELECT 1 FROM execution_scorecardobjective WHERE id=NEW.source_id AND card_id=NEW.card_id) OR NOT EXISTS (SELECT 1 FROM execution_scorecardobjective WHERE id=NEW.destination_id AND card_id=NEW.card_id) THEN
      RAISE EXCEPTION 'BSC relation scope' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='execution_scorecardreview' THEN
    SELECT workspace_id INTO ws FROM execution_scorecard WHERE id=NEW.card_id;
    IF NEW.action_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM execution_action WHERE id=NEW.action_id AND workspace_id=ws) THEN
      RAISE EXCEPTION 'BSC review action scope' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION stratino_bsc_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'BSC history is append only' USING ERRCODE='23514'; END $$;
"""
TABLES = ('scorecard', 'scorecardobjective', 'scorecardindicator', 'scorecardaction', 'scorecardrelation', 'scorecardreview')
IMMUTABLE = ('scorecardobservation', 'scorecardreview', 'scorecardrevision')


def install(apps, editor):
    if editor.connection.vendor != 'postgresql':
        return
    editor.execute(SQL)
    for table in TABLES:
        editor.execute(f'CREATE TRIGGER bsc_scope_{table} BEFORE INSERT OR UPDATE ON execution_{table} FOR EACH ROW EXECUTE FUNCTION stratino_bsc_guard()')
    for table in IMMUTABLE:
        editor.execute(f'CREATE TRIGGER bsc_append_only_{table} BEFORE UPDATE OR DELETE ON execution_{table} FOR EACH ROW EXECUTE FUNCTION stratino_bsc_history_immutable()')
    q = editor.quote_name
    editor.execute(f'CREATE TRIGGER {q(name("tenant", "execution_scorecard"))} BEFORE UPDATE OF workspace_id ON execution_scorecard FOR EACH ROW EXECUTE FUNCTION stratino_tenant_immutable()')
    editor.execute(f'ALTER TABLE execution_scorecard ADD CONSTRAINT {q(name("scope_fk", "execution_scorecarddecision_id"))} FOREIGN KEY (workspace_id,decision_id) REFERENCES execution_decision (workspace_id,id) DEFERRABLE INITIALLY DEFERRED')
    for label in ('ScorecardObjective', 'ScorecardIndicator'):
        model = apps.get_model('execution', label)
        for field in model._meta.fields:
            if field.choices:
                values = ', '.join("'" + str(v) + "'" for v, _ in field.flatchoices)
                editor.execute(f'ALTER TABLE {q(model._meta.db_table)} ADD CONSTRAINT {q(name("choice", model._meta.db_table + field.name))} CHECK ({q(field.column)} IN ({values}))')


def uninstall(apps, editor):
    if editor.connection.vendor != 'postgresql':
        return
    for table in TABLES:
        editor.execute(f'DROP TRIGGER bsc_scope_{table} ON execution_{table}')
    for table in IMMUTABLE:
        editor.execute(f'DROP TRIGGER bsc_append_only_{table} ON execution_{table}')
    q = editor.quote_name
    editor.execute(f'DROP TRIGGER {q(name("tenant", "execution_scorecard"))} ON execution_scorecard')
    editor.execute(f'ALTER TABLE execution_scorecard DROP CONSTRAINT {q(name("scope_fk", "execution_scorecarddecision_id"))}')
    for label in ('ScorecardObjective', 'ScorecardIndicator'):
        model = apps.get_model('execution', label)
        for field in model._meta.fields:
            if field.choices:
                editor.execute(f'ALTER TABLE {q(model._meta.db_table)} DROP CONSTRAINT {q(name("choice", model._meta.db_table + field.name))}')
    editor.execute('DROP FUNCTION stratino_bsc_guard(); DROP FUNCTION stratino_bsc_history_immutable();')


class Migration(migrations.Migration):
    dependencies = [('execution', '0002_balanced_scorecard'), ('core', '0006_planning_guards')]
    operations = [migrations.RunPython(install, uninstall)]
