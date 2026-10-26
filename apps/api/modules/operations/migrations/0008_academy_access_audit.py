"""Allow audited Academy sample and entitlement operations; preserve prior history."""
from importlib import import_module
from typing import ClassVar

from django.db import migrations, models

PREVIOUS = ['account_status_changed', 'feedback_triaged', 'operator_access_changed', 'operator_password_changed', 'academy_plan_updated']
EVENTS = PREVIOUS + ['academy_samples_updated', 'academy_access_granted', 'academy_access_revoked']


def forward(apps, schema_editor):
    import_module('modules.operations.migrations.0007_academy_plan_audit').guard(schema_editor, EVENTS)


def backward(apps, schema_editor):
    # Reverting application code must not silently delete an immutable audit trail.
    if apps.get_model('operations', 'OperatorActionEvent').objects.exclude(event_type__in=PREVIOUS).exists():
        raise RuntimeError('New Academy audit events exist; retain this migration or restore a complete pre-change backup in an isolated database.')
    import_module('modules.operations.migrations.0007_academy_plan_audit').guard(schema_editor, PREVIOUS)


class Migration(migrations.Migration):
    dependencies: ClassVar = [('operations', '0007_academy_plan_audit')]
    operations: ClassVar = [
        migrations.RemoveConstraint(model_name='operatoractionevent', name='operator_action_event_type'),
        migrations.AlterField(model_name='operatoractionevent', name='event_type', field=models.CharField(max_length=32, choices=[
            ('account_status_changed', 'Account status'), ('feedback_triaged', 'Feedback triage'),
            ('operator_access_changed', 'Operator access'), ('operator_password_changed', 'Operator password'),
            ('academy_plan_updated', 'Academy plan updated'), ('academy_samples_updated', 'Academy samples updated'),
            ('academy_access_granted', 'Academy access granted'), ('academy_access_revoked', 'Academy access revoked'),
        ])),
        migrations.AddConstraint(model_name='operatoractionevent', constraint=models.CheckConstraint(condition=models.Q(event_type__in=EVENTS), name='operator_action_event_type')),
        migrations.RunPython(forward, backward),
    ]
