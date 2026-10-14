import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class StrategyFactor(models.Model):
    class Type(models.TextChoices):
        STRENGTH = 'strength', 'Strength'
        WEAKNESS = 'weakness', 'Weakness'
        OPPORTUNITY = 'opportunity', 'Opportunity'
        THREAT = 'threat', 'Threat'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='strategy_factors')
    factor_type = models.CharField(max_length=16, choices=Type.choices)
    title = models.CharField(max_length=160)
    evidence = models.TextField(max_length=2000)
    owner = models.CharField(max_length=120, blank=True, default='')
    priority = models.PositiveSmallIntegerField(default=3)
    revision = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='strategy_factors_created')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('factor_type', '-priority', 'title', 'id')
        indexes = [models.Index(fields=('workspace', 'factor_type'), name='strategy_factor_kind_idx')]
        constraints = [
            models.CheckConstraint(condition=Q(priority__gte=1, priority__lte=5), name='strategy_factor_priority_range'),
            models.CheckConstraint(condition=Q(revision__gte=1), name='strategy_factor_revision_gte_1'),
        ]


class StrategyOption(models.Model):
    class Category(models.TextChoices):
        SO = 'SO', 'Strength + opportunity'
        WO = 'WO', 'Weakness + opportunity'
        ST = 'ST', 'Strength + threat'
        WT = 'WT', 'Weakness + threat'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='strategy_options')
    category = models.CharField(max_length=2, choices=Category.choices)
    title = models.CharField(max_length=160)
    action = models.TextField(max_length=1000)
    rationale = models.TextField(max_length=1000)
    hypothesis = models.TextField(max_length=600)
    cost = models.CharField(max_length=300, blank=True, default='')
    factors = models.ManyToManyField(StrategyFactor, through='StrategyOptionFactor', related_name='strategy_options')
    needs_review = models.BooleanField(default=False)
    revision = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='strategy_options_created')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('category', 'title', 'id')
        indexes = [models.Index(fields=('workspace', 'category'), name='strategy_option_kind_idx')]
        constraints = [
            models.CheckConstraint(condition=Q(revision__gte=1), name='strategy_option_revision_gte_1'),
        ]


class StrategyOptionFactor(models.Model):
    option = models.ForeignKey(StrategyOption, on_delete=models.CASCADE, related_name='factor_links')
    factor = models.ForeignKey(StrategyFactor, on_delete=models.CASCADE, related_name='option_links')

    class Meta:
        constraints = [models.UniqueConstraint(fields=('option', 'factor'), name='strategy_option_factor_unique')]
