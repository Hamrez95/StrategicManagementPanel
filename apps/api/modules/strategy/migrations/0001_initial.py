import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('workspaces', '0004_workspace_strategy_profile'),
    ]

    operations = [
        migrations.CreateModel(
            name='StrategyFactor',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('factor_type', models.CharField(choices=[('strength', 'Strength'), ('weakness', 'Weakness'), ('opportunity', 'Opportunity'), ('threat', 'Threat')], max_length=16)),
                ('title', models.CharField(max_length=160)),
                ('evidence', models.TextField(max_length=2000)),
                ('owner', models.CharField(blank=True, default='', max_length=120)),
                ('priority', models.PositiveSmallIntegerField(default=3)),
                ('revision', models.PositiveIntegerField(default=1)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='strategy_factors_created', to=settings.AUTH_USER_MODEL)),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='strategy_factors', to='workspaces.workspace')),
            ],
            options={'ordering': ('factor_type', '-priority', 'title', 'id')},
        ),
        migrations.CreateModel(
            name='StrategyOption',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('category', models.CharField(choices=[('SO', 'Strength + opportunity'), ('WO', 'Weakness + opportunity'), ('ST', 'Strength + threat'), ('WT', 'Weakness + threat')], max_length=2)),
                ('title', models.CharField(max_length=160)),
                ('action', models.TextField(max_length=1000)),
                ('rationale', models.TextField(max_length=1000)),
                ('hypothesis', models.TextField(max_length=600)),
                ('cost', models.CharField(blank=True, default='', max_length=300)),
                ('needs_review', models.BooleanField(default=False)),
                ('revision', models.PositiveIntegerField(default=1)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='strategy_options_created', to=settings.AUTH_USER_MODEL)),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='strategy_options', to='workspaces.workspace')),
            ],
            options={'ordering': ('category', 'title', 'id')},
        ),
        migrations.CreateModel(
            name='StrategyOptionFactor',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('factor', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='option_links', to='strategy.strategyfactor')),
                ('option', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='factor_links', to='strategy.strategyoption')),
            ],
        ),
        migrations.AddField(
            model_name='strategyoption',
            name='factors',
            field=models.ManyToManyField(related_name='strategy_options', through='strategy.StrategyOptionFactor', to='strategy.strategyfactor'),
        ),
        migrations.AddConstraint(
            model_name='strategyfactor',
            constraint=models.CheckConstraint(condition=models.Q(('priority__gte', 1), ('priority__lte', 5)), name='strategy_factor_priority_range'),
        ),
        migrations.AddConstraint(
            model_name='strategyfactor',
            constraint=models.CheckConstraint(condition=models.Q(('revision__gte', 1)), name='strategy_factor_revision_gte_1'),
        ),
        migrations.AddConstraint(
            model_name='strategyoption',
            constraint=models.CheckConstraint(condition=models.Q(('revision__gte', 1)), name='strategy_option_revision_gte_1'),
        ),
        migrations.AddConstraint(
            model_name='strategyoptionfactor',
            constraint=models.UniqueConstraint(fields=('option', 'factor'), name='strategy_option_factor_unique'),
        ),
        migrations.AddIndex(
            model_name='strategyfactor',
            index=models.Index(fields=['workspace', 'factor_type'], name='strategy_factor_kind_idx'),
        ),
        migrations.AddIndex(
            model_name='strategyoption',
            index=models.Index(fields=['workspace', 'category'], name='strategy_option_kind_idx'),
        ),
    ]
