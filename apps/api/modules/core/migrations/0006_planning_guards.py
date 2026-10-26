"""Freeze tenant/choice guards for the typed planning and finance additions."""

import hashlib
from typing import ClassVar

from django.db import migrations

LABELS = (
    "analysis.EnvironmentSignal",
    "analysis.CompetitorProfile",
    "analysis.ResourceAssessment",
    "analysis.ScenarioPlan",
    "analysis.RiskRecord",
    "analysis.JourneyStep",
    "analysis.PlanningRevision",
    "metrics.FinanceCapture",
)


def name(kind, value):
    return f"ci_{kind}_{hashlib.sha256(value.encode()).hexdigest()[:16]}"


def install(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    q = schema_editor.quote_name
    for label in LABELS:
        model = apps.get_model(label)
        table = model._meta.db_table
        schema_editor.execute(
            f"CREATE TRIGGER {q(name('tenant', table))} BEFORE UPDATE OF workspace_id ON {q(table)} FOR EACH ROW EXECUTE FUNCTION stratino_tenant_immutable()"
        )
        for field in model._meta.fields:
            if field.choices:
                values = ", ".join(
                    "'" + str(v).replace("'", "''") + "'" for v, _ in field.flatchoices
                )
                schema_editor.execute(
                    f"ALTER TABLE {q(table)} ADD CONSTRAINT {q(name('choice', table + field.name))} CHECK ({q(field.column)} IN ({values}))"
                )
    for target in ("metrics_inputobservation", "metrics_calculationrun"):
        constraint = name("scope_key", target)
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM pg_constraint WHERE conname=%s AND conrelid=%s::regclass",
                [constraint, target],
            )
            present = cursor.fetchone()
        if not present:
            schema_editor.execute(
                f"ALTER TABLE {q(target)} ADD CONSTRAINT {q(constraint)} UNIQUE (workspace_id,id)"
            )
    for column, target in [
        ("revenue_id", "metrics_inputobservation"),
        ("variable_costs_id", "metrics_inputobservation"),
        ("run_id", "metrics_calculationrun"),
    ]:
        schema_editor.execute(
            f"ALTER TABLE metrics_financecapture ADD CONSTRAINT {q(name('scope_fk', 'metrics_financecapture' + column))} FOREIGN KEY (workspace_id,{q(column)}) REFERENCES {q(target)} (workspace_id,id) DEFERRABLE INITIALLY DEFERRED"
        )
    schema_editor.execute("""CREATE FUNCTION stratino_planning_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'Planning history is immutable' USING ERRCODE = '23514'; END $$""")
    schema_editor.execute(
        "CREATE TRIGGER planning_history_immutable BEFORE UPDATE ON analysis_planningrevision FOR EACH ROW EXECUTE FUNCTION stratino_planning_history_immutable()"
    )


def uninstall(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    q = schema_editor.quote_name
    schema_editor.execute(
        "DROP TRIGGER planning_history_immutable ON analysis_planningrevision"
    )
    schema_editor.execute("DROP FUNCTION stratino_planning_history_immutable()")
    for column in ("revenue_id", "variable_costs_id", "run_id"):
        schema_editor.execute(
            f"ALTER TABLE metrics_financecapture DROP CONSTRAINT {q(name('scope_fk', 'metrics_financecapture' + column))}"
        )
    for label in LABELS:
        model = apps.get_model(label)
        table = model._meta.db_table
        schema_editor.execute(f"DROP TRIGGER {q(name('tenant', table))} ON {q(table)}")
        for field in model._meta.fields:
            if field.choices:
                schema_editor.execute(
                    f"ALTER TABLE {q(table)} DROP CONSTRAINT {q(name('choice', table + field.name))}"
                )


class Migration(migrations.Migration):
    dependencies: ClassVar[list] = [
        ("core", "0005_management_payment_guards"),
        ("analysis", "0003_competitorprofile_environmentsignal_journeystep_and_more"),
        ("metrics", "0004_financecapture"),
    ]
    operations: ClassVar[list] = [migrations.RunPython(install, uninstall)]
