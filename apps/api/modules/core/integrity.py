"""Read-only model inventory and tenant-integrity checks for operators.

This is an internal Python/management-command interface, never a public API.
Results contain counts and schema names, not customer content or identifiers.
"""
import hashlib

from django.apps import apps
from django.db import connections
from django.db.models import CheckConstraint, F, Q


def product_models():
    return sorted((model for model in apps.get_models() if model.__module__.startswith('modules.')), key=lambda model: model._meta.label)


def schema_inventory():
    return [{'model': model._meta.label, 'table': model._meta.db_table,
             'fields': [{'name': field.name, 'type': field.get_internal_type(), 'nullable': field.null,
                         'unique': field.unique, 'choices': [value for value, _ in field.flatchoices],
                         'target': field.related_model._meta.label if field.is_relation else None,
                         'on_delete': field.remote_field.on_delete.__name__ if field.is_relation else None}
                        for field in model._meta.fields],
             'constraints': [constraint.name for constraint in model._meta.constraints],
             'indexes': [index.name for index in model._meta.indexes]}
            for model in product_models()]


def tenant_relations(registry=apps):
    """Discover explicit Workspace-owned references; exclude actors and public KB."""
    for model in sorted(registry.get_models(), key=lambda item: item._meta.label):
        if not model.__module__.startswith('modules.') and registry is apps:
            continue
        fields = {field.name for field in model._meta.fields}
        if 'workspace' not in fields:
            continue
        for field in model._meta.fields:
            if field.is_relation and field.name != 'workspace' and field.related_model and any(target.name == 'workspace' for target in field.related_model._meta.fields):
                yield model, field


def database_guard_coverage(database='default'):
    connection = connections[database]
    if connection.vendor != 'postgresql':
        return {'backend': connection.vendor, 'missing': ['postgresql_integrity_guards'], 'expected': 0}

    def name(kind, value):
        return f'ci_{kind}_{hashlib.sha256(value.encode()).hexdigest()[:16]}'

    expected = {'ci_billing_owner_key', 'ci_workspace_billing_owner', 'ci_membership_owner', 'ci_workspace_owner', 'ci_management_grant_snapshot', 'ci_billing_owner_identity', 'ci_workspace_owner_identity'}
    for model in product_models():
        table = model._meta.db_table
        expected.update(name('choice', table + field.name) for field in model._meta.fields if field.choices)
        if any(field.name == 'workspace' for field in model._meta.fields):
            expected.add(name('tenant', table))
    for model, field in tenant_relations():
        expected.add(name('scope_fk', model._meta.db_table + field.column))
        expected.add(name('scope_key', field.related_model._meta.db_table))
    for label in ['strategy.StrategyOptionFactor', 'metrics.InputObservationEvidence']:
        expected.add(name('bridge', apps.get_model(label)._meta.db_table))
    with connection.cursor() as cursor:
        cursor.execute("SELECT conname FROM pg_constraint c JOIN pg_namespace n ON c.connamespace=n.oid WHERE n.nspname=current_schema() UNION SELECT tgname FROM pg_trigger t JOIN pg_class r ON t.tgrelid=r.oid JOIN pg_namespace n ON r.relnamespace=n.oid WHERE n.nspname=current_schema() AND NOT t.tgisinternal")
        installed = {row[0] for row in cursor.fetchall()}
    return {'backend': connection.vendor, 'expected': len(expected), 'missing': sorted(expected - installed)}


def audit_data(database='default'):
    checks = []

    def record(code, rows):
        checks.append({'code': code, 'violations': rows.count()})

    models = product_models()
    for model in models:
        rows = model.objects.using(database).all()
        for field in model._meta.fields:
            if field.choices:
                invalid = ~Q(**{f'{field.name}__in': [value for value, _ in field.flatchoices]})
                if field.null:
                    invalid &= Q(**{f'{field.name}__isnull': False})
                record(f'{model._meta.label}.{field.name}.choice', rows.filter(invalid))
        for constraint in model._meta.constraints:
            if isinstance(constraint, CheckConstraint):
                record(f'{model._meta.label}.{constraint.name}', rows.exclude(constraint.condition))
    for model, field in tenant_relations():
        record(f'{model._meta.label}.{field.name}.workspace', model.objects.using(database).filter(**{f'{field.name}__isnull': False}).exclude(workspace_id=F(f'{field.name}__workspace_id')))
    Workspace = apps.get_model('workspaces', 'Workspace')
    Membership = apps.get_model('workspaces', 'Membership')
    record('workspaces.Workspace.billing_owner', Workspace.objects.using(database).exclude(owner_id=F('billing_account__owner_id')))
    record('workspaces.Membership.owner_duplicate', Membership.objects.using(database).filter(user_id=F('workspace__owner_id')))
    for label, left, right in [('strategy.StrategyOptionFactor', 'option__workspace_id', 'factor__workspace_id'), ('metrics.InputObservationEvidence', 'observation__workspace_id', 'evidence__workspace_id')]:
        model = apps.get_model(label)
        record(f'{label}.workspace', model.objects.using(database).exclude(**{left: F(right)}))
    guards = database_guard_coverage(database)
    checks.append({'code': 'database.guards.installed', 'violations': len(guards['missing'])})
    return {'schema_version': 1, 'models_checked': len(models), 'checks_run': len(checks), 'violations': sum(check['violations'] for check in checks), 'database_guards': guards, 'checks': checks}
