"""PostgreSQL guards beyond Django's single-column foreign keys.

Frozen migration registry only; no imports from live model/integrity helpers.
No data is repaired or relabeled. Existing violations abort the migration.
"""
import hashlib

from django.db import migrations


def name(kind, value):
    return f'ci_{kind}_{hashlib.sha256(value.encode()).hexdigest()[:16]}'


def product_models(apps):
    # Freeze the migration's model set: later model additions have their own guard migration.
    labels = '''accounts.AccountAvatar accounts.User accounts.AuthRateLimit accounts.GoogleIdentity accounts.GoogleLoginChallenge accounts.AccountPreferences
    workspaces.BillingAccount workspaces.Workspace workspaces.Membership workspaces.WorkspaceProfile workspaces.WorkspaceProfileRevision workspaces.WorkspaceSetup workspaces.WorkspaceBootstrapRequest workspaces.WorkspaceInvitation
    customer_context.Product customer_context.Segment customer_context.IdealCustomerProfile customer_context.LegacyProfileIdentityMap customer_context.ProfileMigrationBatch
    evidence.Claim evidence.Evidence evidence.ClaimEvidenceLink evidence.ConfidenceAssessment
    metrics.InputObservation metrics.InputObservationEvidence metrics.CalculationRun metrics.MetricValue
    strategy.StrategyFactor strategy.StrategyOption strategy.StrategyOptionFactor analysis.Analysis analysis.AnalysisRevision
    execution.Decision execution.Goal execution.Action execution.ExecutionEvent documents.DocumentRecord documents.DocumentEvent documents.DocumentAttachment
    imports.WorkspaceImportBatch exports.ExportSnapshot academy.AcademyArea academy.AcademyCourse academy.AcademyUnit academy.AcademyCard academy.AcademyPlan academy.FreeSample academy.AcademyCoupon academy.AcademyOrder academy.AcademyOrderItem academy.AcademyOrderArea academy.AcademySubscription academy.SubscriptionArea academy.LearningProgress academy.LearningFeedback'''.split()
    return [apps.get_model(label) for label in labels]


def relations(apps):
    for model in product_models(apps):
        if 'workspace' not in {field.name for field in model._meta.fields}:
            continue
        for field in model._meta.fields:
            if field.is_relation and field.name != 'workspace' and field.related_model and 'workspace' in {target.name for target in field.related_model._meta.fields}:
                yield model, field


def install(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return  # Read-only audit and authorized services still apply; production uses PostgreSQL.
    q = schema_editor.quote_name
    for model in product_models(apps):
        table = model._meta.db_table
        for field in model._meta.fields:
            if field.choices:
                values = ', '.join("'" + str(value).replace("'", "''") + "'" for value, _ in field.flatchoices)
                schema_editor.execute(f'ALTER TABLE {q(table)} ADD CONSTRAINT {q(name("choice", table + field.name))} CHECK ({q(field.column)} IN ({values}))')

    parents = {field.related_model._meta.db_table for _, field in relations(apps)}
    for table in sorted(parents):
        schema_editor.execute(f'ALTER TABLE {q(table)} ADD CONSTRAINT {q(name("scope_key", table))} UNIQUE (workspace_id, id)')
    for model, field in relations(apps):
        table, target = model._meta.db_table, field.related_model._meta.db_table
        schema_editor.execute(f'ALTER TABLE {q(table)} ADD CONSTRAINT {q(name("scope_fk", table + field.column))} FOREIGN KEY (workspace_id, {q(field.column)}) REFERENCES {q(target)} (workspace_id, id) DEFERRABLE INITIALLY DEFERRED')

    schema_editor.execute('ALTER TABLE workspaces_billingaccount ADD CONSTRAINT ci_billing_owner_key UNIQUE (id, owner_id)')
    schema_editor.execute('ALTER TABLE workspaces_workspace ADD CONSTRAINT ci_workspace_billing_owner FOREIGN KEY (billing_account_id, owner_id) REFERENCES workspaces_billingaccount (id, owner_id) DEFERRABLE INITIALLY DEFERRED')
    schema_editor.execute('''CREATE FUNCTION stratino_tenant_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
        RAISE EXCEPTION 'Workspace ownership is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$''')
    for model in product_models(apps):
        if 'workspace' in {field.name for field in model._meta.fields}:
            table = model._meta.db_table
            schema_editor.execute(f'CREATE TRIGGER {q(name("tenant", table))} BEFORE UPDATE OF workspace_id ON {q(table)} FOR EACH ROW EXECUTE FUNCTION stratino_tenant_immutable()')

    schema_editor.execute('''CREATE FUNCTION stratino_bridge_scope() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE left_workspace uuid; right_workspace uuid;
    BEGIN
      EXECUTE format('SELECT workspace_id FROM %%I WHERE id = $1', TG_ARGV[0]) INTO left_workspace USING (to_jsonb(NEW)->>TG_ARGV[1])::uuid;
      EXECUTE format('SELECT workspace_id FROM %%I WHERE id = $1', TG_ARGV[2]) INTO right_workspace USING (to_jsonb(NEW)->>TG_ARGV[3])::uuid;
      IF left_workspace IS DISTINCT FROM right_workspace THEN
        RAISE EXCEPTION 'Linked records must belong to the same Workspace' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$''')
    for label, left, right in [('strategy.StrategyOptionFactor', 'option', 'factor'), ('metrics.InputObservationEvidence', 'observation', 'evidence')]:
        model = apps.get_model(label)
        lfield, rfield = model._meta.get_field(left), model._meta.get_field(right)
        table = model._meta.db_table
        # Existing bridges need an explicit preflight; triggers only guard later writes.
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(f'SELECT COUNT(*) FROM {q(table)} b JOIN {q(lfield.related_model._meta.db_table)} l ON l.id=b.{q(lfield.column)} JOIN {q(rfield.related_model._meta.db_table)} r ON r.id=b.{q(rfield.column)} WHERE l.workspace_id <> r.workspace_id')
            if cursor.fetchone()[0]:
                raise RuntimeError(f'Cross-Workspace links in {label}; review data before migrating.')
        schema_editor.execute(f"CREATE TRIGGER {q(name('bridge', table))} BEFORE INSERT OR UPDATE ON {q(table)} FOR EACH ROW EXECUTE FUNCTION stratino_bridge_scope('{lfield.related_model._meta.db_table}', '{lfield.column}', '{rfield.related_model._meta.db_table}', '{rfield.column}')")

    schema_editor.execute('''CREATE FUNCTION stratino_membership_owner() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM workspaces_workspace w WHERE w.id=NEW.workspace_id AND w.owner_id=NEW.user_id) THEN
        RAISE EXCEPTION 'Ownership is not a Membership role' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$''')
    schema_editor.execute('CREATE TRIGGER ci_membership_owner BEFORE INSERT OR UPDATE ON workspaces_membership FOR EACH ROW EXECUTE FUNCTION stratino_membership_owner()')
    schema_editor.execute('''CREATE FUNCTION stratino_workspace_owner() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM workspaces_membership m WHERE m.workspace_id=NEW.id AND m.user_id=NEW.owner_id) THEN
        RAISE EXCEPTION 'Remove Membership before assigning ownership' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$''')
    schema_editor.execute('CREATE TRIGGER ci_workspace_owner BEFORE UPDATE OF owner_id ON workspaces_workspace FOR EACH ROW EXECUTE FUNCTION stratino_workspace_owner()')


def uninstall(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    q = schema_editor.quote_name
    schema_editor.execute('DROP TRIGGER ci_workspace_owner ON workspaces_workspace')
    schema_editor.execute('DROP TRIGGER ci_membership_owner ON workspaces_membership')
    for function in ['stratino_workspace_owner', 'stratino_membership_owner']:
        schema_editor.execute(f'DROP FUNCTION {function}()')
    for label in ['strategy.StrategyOptionFactor', 'metrics.InputObservationEvidence']:
        table = apps.get_model(label)._meta.db_table
        schema_editor.execute(f'DROP TRIGGER {q(name("bridge", table))} ON {q(table)}')
    schema_editor.execute('DROP FUNCTION stratino_bridge_scope()')
    for model in product_models(apps):
        table = model._meta.db_table
        if 'workspace' in {field.name for field in model._meta.fields}:
            schema_editor.execute(f'DROP TRIGGER {q(name("tenant", table))} ON {q(table)}')
    schema_editor.execute('DROP FUNCTION stratino_tenant_immutable()')
    schema_editor.execute('ALTER TABLE workspaces_workspace DROP CONSTRAINT ci_workspace_billing_owner')
    schema_editor.execute('ALTER TABLE workspaces_billingaccount DROP CONSTRAINT ci_billing_owner_key')
    for model, field in relations(apps):
        table = model._meta.db_table
        schema_editor.execute(f'ALTER TABLE {q(table)} DROP CONSTRAINT {q(name("scope_fk", table + field.column))}')
    for table in sorted({field.related_model._meta.db_table for _, field in relations(apps)}):
        schema_editor.execute(f'ALTER TABLE {q(table)} DROP CONSTRAINT {q(name("scope_key", table))}')
    for model in product_models(apps):
        for field in model._meta.fields:
            if field.choices:
                schema_editor.execute(f'ALTER TABLE {q(model._meta.db_table)} DROP CONSTRAINT {q(name("choice", model._meta.db_table + field.name))}')


class Migration(migrations.Migration):
    dependencies = [('accounts', '0007_real_business_leaders'), ('workspaces', '0005_workspace_setup_bootstrap'),
                    ('customer_context', '0004_profile_migration_batch'), ('evidence', '0003_confidenceassessment_confidence_review_text_required_and_more'),
                    ('metrics', '0003_calculationrun_cost_scope_and_more'), ('strategy', '0001_initial'),
                    ('analysis', '0002_analysis_revisions'), ('execution', '0001_initial'), ('documents', '0002_documentattachment'),
                    ('imports', '0001_initial'), ('exports', '0001_initial'), ('academy', '0005_special_subscription_wording')]
    operations = [migrations.RunPython(install, uninstall)]
