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
