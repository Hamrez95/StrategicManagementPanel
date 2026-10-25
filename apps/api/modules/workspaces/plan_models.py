"""Management subscriptions are separate from Academy purchases and Workspace roles."""
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q


class ManagementPlan(models.Model):
    code = models.SlugField(max_length=48, unique=True)
    title = models.CharField(max_length=100)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=False)
    owned_workspace_limit = models.PositiveIntegerField(null=True, blank=True)
    can_finalize_analysis = models.BooleanField(default=False)
    can_calculate_metrics = models.BooleanField(default=False)
    can_generate_reports = models.BooleanField(default=False)
    price = models.PositiveBigIntegerField(null=True, blank=True)
    currency = models.CharField(max_length=3, default='IRR')
    duration_days = models.PositiveIntegerField(null=True, blank=True)
    revision = models.PositiveIntegerField(default=1)

    class Meta:
        app_label = 'workspaces'
        constraints = [
            models.UniqueConstraint(fields=['is_default'], condition=Q(is_default=True), name='management_one_default_plan'),
            models.CheckConstraint(condition=Q(revision__gte=1), name='management_plan_revision_gte1'),
            models.CheckConstraint(condition=Q(duration_days__isnull=True) | Q(duration_days__gt=0), name='management_plan_duration_valid'),
        ]


class ManagementSubscription(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    billing_account = models.ForeignKey('workspaces.BillingAccount', on_delete=models.PROTECT, related_name='management_subscriptions')
    plan = models.ForeignKey(ManagementPlan, on_delete=models.PROTECT, related_name='subscriptions')
    request_id = models.UUIDField(unique=True)
    status = models.CharField(max_length=12, choices=[('active', 'Active'), ('revoked', 'Revoked')], default='active')
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)
    # Frozen entitlement snapshot; changing the plan must not rewrite an existing grant.
    plan_title = models.CharField(max_length=100)
    plan_revision = models.PositiveIntegerField()
    owned_workspace_limit = models.PositiveIntegerField(null=True, blank=True)
    can_finalize_analysis = models.BooleanField(default=False)
    can_calculate_metrics = models.BooleanField(default=False)
    can_generate_reports = models.BooleanField(default=False)
    granted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='management_grants')
    reason = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'workspaces'
        constraints = [
            models.CheckConstraint(condition=Q(ends_at__isnull=True) | Q(ends_at__gt=F('starts_at')), name='management_grant_window_valid'),
            models.CheckConstraint(condition=~Q(reason=''), name='management_grant_reason_required'),
            models.CheckConstraint(condition=Q(plan_revision__gte=1), name='management_grant_plan_rev_gte1'),
        ]
        indexes = [models.Index(fields=['billing_account', 'status', 'starts_at', 'ends_at'], name='management_active_grants_idx')]


class ManagementSubscriptionEvent(models.Model):
    subscription = models.ForeignKey(ManagementSubscription, on_delete=models.PROTECT, related_name='events')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='management_subscription_events')
    event_type = models.CharField(max_length=12, choices=[('granted', 'Granted'), ('revoked', 'Revoked')])
    reason = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'workspaces'

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError('Subscription events are immutable.')
        return super().save(*args, **kwargs)
