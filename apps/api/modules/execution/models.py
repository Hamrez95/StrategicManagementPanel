import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class Decision(models.Model):
    class Status(models.TextChoices):
        PROPOSED = 'proposed', 'Proposed'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        SUPERSEDED = 'superseded', 'Superseded'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='decisions')
    title = models.CharField(max_length=160)
    rationale = models.TextField(max_length=2000)
    assumptions = models.TextField(max_length=2000)
    review_trigger = models.CharField(max_length=500)
    source_analysis = models.ForeignKey(
        'analysis.Analysis', null=True, blank=True, on_delete=models.SET_NULL, related_name='decisions'
    )
    source_option = models.ForeignKey(
        'strategy.StrategyOption', null=True, blank=True, on_delete=models.SET_NULL, related_name='decisions'
    )
    source_snapshot = models.JSONField(default=dict)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PROPOSED)
    revision = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='decisions_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('-updated_at', 'title', 'id')
        indexes = [models.Index(fields=('workspace', 'status'), name='execution_decision_status_idx')]
        constraints = [
            models.CheckConstraint(
                condition=Q(source_analysis__isnull=True) | Q(source_option__isnull=True),
                name='execution_decision_one_source',
            ),
            models.CheckConstraint(condition=Q(revision__gte=1), name='exec_decision_revision_gte1'),
        ]


class Goal(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        COMPLETE = 'complete', 'Complete'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='execution_goals')
    title = models.CharField(max_length=160)
    description = models.TextField(max_length=1000, blank=True, default='')
    due_on = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.ACTIVE)
    revision = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='execution_goals_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('status', 'due_on', 'title', 'id')
        indexes = [models.Index(fields=('workspace', 'status'), name='execution_goal_status_idx')]
        constraints = [models.CheckConstraint(condition=Q(revision__gte=1), name='exec_goal_revision_gte1')]


class Action(models.Model):
    class Status(models.TextChoices):
        PLANNED = 'planned', 'Planned'
        IN_PROGRESS = 'in_progress', 'In progress'
        BLOCKED = 'blocked', 'Blocked'
        DONE = 'done', 'Done'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='execution_actions')
    decision = models.ForeignKey(Decision, on_delete=models.PROTECT, related_name='actions')
    goal = models.ForeignKey(Goal, null=True, blank=True, on_delete=models.SET_NULL, related_name='actions')
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='execution_actions')
    title = models.CharField(max_length=160)
    description = models.TextField(max_length=1000, blank=True, default='')
    due_on = models.DateField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PLANNED)
    revision = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='execution_actions_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('due_on', 'status', 'title', 'id')
        indexes = [models.Index(fields=('workspace', 'due_on'), name='execution_action_due_idx')]
        constraints = [models.CheckConstraint(condition=Q(revision__gte=1), name='exec_action_revision_gte1')]


class ExecutionEvent(models.Model):
    class EntityType(models.TextChoices):
        DECISION = 'decision', 'Decision'
        GOAL = 'goal', 'Goal'
        ACTION = 'action', 'Action'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='execution_events')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='execution_events')
    entity_type = models.CharField(max_length=8, choices=EntityType.choices)
    entity_id = models.UUIDField()
    entity_label = models.CharField(max_length=160)
    event_type = models.CharField(max_length=16)
    changes = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at', '-id')
        indexes = [models.Index(fields=('workspace', '-created_at'), name='execution_event_recent_idx')]


class Scorecard(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE)
    title = models.CharField(max_length=160)
    scope = models.TextField(max_length=1000, blank=True, default='')
    strategy = models.TextField(max_length=2000, blank=True, default='')
    decision = models.ForeignKey(Decision, null=True, blank=True, on_delete=models.PROTECT)
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    revision = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(revision__gte=1), name='bsc_revision_positive'),
            models.CheckConstraint(condition=Q(period_start__isnull=True) | Q(period_end__isnull=True) | Q(period_end__gte=models.F('period_start')), name='bsc_period_order'),
        ]


class ScorecardObjective(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(Scorecard, on_delete=models.CASCADE, related_name='objectives')
    perspective = models.CharField(max_length=12, choices=[(v, v) for v in ('financial', 'customer', 'process', 'learning')])
    title = models.CharField(max_length=160)
    goal = models.ForeignKey(Goal, null=True, blank=True, on_delete=models.PROTECT)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(perspective__in=['financial', 'customer', 'process', 'learning']), name='bsc_perspective_valid')]


class ScorecardAction(models.Model):
    objective = models.ForeignKey(ScorecardObjective, on_delete=models.CASCADE, related_name='action_links')
    action = models.ForeignKey(Action, on_delete=models.PROTECT)
    request_id = models.UUIDField(null=True, blank=True)
    request_fingerprint = models.CharField(max_length=64, blank=True, default='')

    class Meta:
        constraints = [models.UniqueConstraint(fields=('objective', 'action'), name='bsc_action_unique'), models.UniqueConstraint(fields=('objective', 'request_id'), name='bsc_action_retry_unique')]


class ScorecardIndicator(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    objective = models.ForeignKey(ScorecardObjective, on_delete=models.CASCADE, related_name='indicators')
    name = models.CharField(max_length=160)
    definition = models.TextField(max_length=2000, blank=True, default='')
    unit = models.CharField(max_length=80, blank=True, default='')
    formula = models.TextField(max_length=1000, blank=True, default='')
    direction = models.CharField(max_length=8, choices=[(v, v) for v in ('increase', 'decrease', 'range')], default='increase')
    baseline = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    baseline_on = models.DateField(null=True, blank=True)
    target = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    target_high = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    warning_margin = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    due_on = models.DateField(null=True, blank=True)
    cadence_days = models.PositiveIntegerField(null=True, blank=True)
    source = models.CharField(max_length=500, blank=True, default='')
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT)
    kind = models.CharField(max_length=8, choices=[(v, v) for v in ('leading', 'lagging')], default='lagging')
    guardrail = models.CharField(max_length=500, blank=True, default='')
    position = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(direction__in=['increase', 'decrease', 'range']), name='bsc_direction_valid'),
            models.CheckConstraint(condition=Q(kind__in=['leading', 'lagging']), name='bsc_kind_valid'),
            models.CheckConstraint(condition=Q(warning_margin__isnull=True) | Q(warning_margin__gte=0), name='bsc_margin_nonnegative'),
            models.CheckConstraint(condition=Q(cadence_days__isnull=True) | Q(cadence_days__gte=1, cadence_days__lte=3660), name='bsc_cadence_valid'),
            models.CheckConstraint(condition=Q(direction='range', target__isnull=True, target_high__isnull=True) | Q(direction='range', target__isnull=False, target_high__isnull=False, target_high__gte=models.F('target')) | ~Q(direction='range'), name='bsc_range_order'),
            models.CheckConstraint(condition=Q(baseline__isnull=True, baseline_on__isnull=True) | Q(baseline__isnull=False, baseline_on__isnull=False), name='bsc_baseline_pair'),
        ]


class ScorecardObservation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    indicator = models.ForeignKey(ScorecardIndicator, on_delete=models.PROTECT, related_name='observations')
    request_id = models.UUIDField()
    observed_on = models.DateField()
    value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    evidence = models.TextField(max_length=2000)
    definition_snapshot = models.JSONField(default=dict)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=('indicator', 'request_id'), name='bsc_observation_retry_unique')]


class ScorecardRelation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(Scorecard, on_delete=models.CASCADE, related_name='relations')
    source = models.ForeignKey(ScorecardObjective, on_delete=models.CASCADE, related_name='outgoing_hypotheses')
    destination = models.ForeignKey(ScorecardObjective, on_delete=models.CASCADE, related_name='incoming_hypotheses')
    rationale = models.TextField(max_length=2000)
    test_method = models.TextField(max_length=2000)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=~Q(source=models.F('destination')), name='bsc_no_self_relation'),
            models.UniqueConstraint(fields=('source', 'destination'), name='bsc_relation_unique'),
        ]


class ScorecardReview(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(Scorecard, on_delete=models.PROTECT, related_name='reviews')
    request_id = models.UUIDField()
    reviewed_on = models.DateField()
    decision = models.TextField(max_length=2000)
    action = models.ForeignKey(Action, null=True, blank=True, on_delete=models.PROTECT)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=('card', 'request_id'), name='bsc_review_retry_unique')]


class ScorecardRevision(models.Model):
    card = models.ForeignKey(Scorecard, on_delete=models.PROTECT, related_name='history')
    revision = models.PositiveIntegerField()
    snapshot = models.JSONField()
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=('card', 'revision'), name='bsc_history_unique')]
