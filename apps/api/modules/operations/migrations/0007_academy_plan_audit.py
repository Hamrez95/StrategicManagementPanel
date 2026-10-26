import hashlib
from django.db import migrations, models

EVENTS = ['account_status_changed', 'feedback_triaged', 'operator_access_changed', 'operator_password_changed', 'academy_plan_updated']


def guard(schema_editor, events):
    if schema_editor.connection.vendor != 'postgresql':
        return
    table = 'operations_operatoractionevent'
    name = 'ci_choice_' + hashlib.sha256((table + 'event_type').encode()).hexdigest()[:16]
    schema_editor.execute(f'ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}')
    values = ', '.join("'" + value + "'" for value in events)
    schema_editor.execute(f'ALTER TABLE {table} ADD CONSTRAINT {name} CHECK (event_type IN ({values}))')


def forward(apps, schema_editor):
    guard(schema_editor, EVENTS)


def backward(apps, schema_editor):
    guard(schema_editor, EVENTS[:-1])


class Migration(migrations.Migration):
    dependencies = [('operations', '0006_operator_choice_guards')]
    operations = [
        migrations.RemoveConstraint(model_name='operatoractionevent', name='operator_action_event_type'),
        migrations.AlterField(model_name='operatoractionevent', name='event_type', field=models.CharField(max_length=32, choices=[('account_status_changed', 'Account status'), ('feedback_triaged', 'Feedback triage'), ('operator_access_changed', 'Operator access'), ('operator_password_changed', 'Operator password'), ('academy_plan_updated', 'Academy plan updated')])),
        migrations.AddField(model_name='operatoractionevent', name='details', field=models.JSONField(default=dict, blank=True)),
        migrations.AddConstraint(model_name='operatoractionevent', constraint=models.CheckConstraint(condition=models.Q(event_type__in=EVENTS), name='operator_action_event_type')),
        migrations.RunPython(forward, backward),
    ]
