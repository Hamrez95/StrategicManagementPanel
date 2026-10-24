from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [('accounts', '0007_real_business_leaders')]
    operations = [migrations.AlterModelOptions(
        name='user',
        options={'permissions': [
            ('operator_view_accounts', 'Operator: read account summaries'),
            ('operator_view_workspaces', 'Operator: read Workspace summaries'),
            ('operator_view_plans', 'Operator: read management plans'),
            ('operator_view_subscriptions', 'Operator: read management subscriptions'),
            ('operator_view_access', 'Operator: read effective management access'),
            ('operator_view_audit', 'Operator: read redacted audit history'),
        ]},
    )]
