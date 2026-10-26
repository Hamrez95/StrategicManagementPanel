"""Operator factors and session-bound proofs are separate from customer identity."""
import uuid

from django.conf import settings
from django.db import models


class OperatorAccess(models.Model):
    """Explicit approval, separate from staff flags and normal account signup."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, primary_key=True, on_delete=models.PROTECT)
    role = models.CharField(max_length=10, choices=[('owner', 'Owner'), ('admin', 'Administrator')])
    is_active = models.BooleanField(default=True)
    must_change_password = models.BooleanField(default=False)
    revision = models.PositiveIntegerField(default=1)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name='+')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(role__in=['owner', 'admin']), name='operator_access_role')]


class OperatorFactor(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    encrypted_secret = models.TextField()
    generation = models.UUIDField(default=uuid.uuid4, editable=False)
    pending_until = models.DateTimeField()
    pending_session_digest = models.CharField(max_length=64)
    pending_auth_digest = models.CharField(max_length=64)
    enabled_at = models.DateTimeField(null=True)
    last_counter = models.BigIntegerField(default=-1)

    class Meta:
        constraints = [models.CheckConstraint(
            condition=(models.Q(enabled_at__isnull=True, last_counter=-1)
                       | models.Q(enabled_at__isnull=False, last_counter__gte=0)),
            name='operator_factor_counter_state',
        )]


class OperatorProof(models.Model):
    session_digest = models.CharField(max_length=64, primary_key=True)
    factor = models.ForeignKey(OperatorFactor, on_delete=models.CASCADE)
    generation = models.UUIDField()
    auth_digest = models.CharField(max_length=64)
    verified_at = models.DateTimeField()
    expires_at = models.DateTimeField(db_index=True)

    class Meta:
        constraints = [models.CheckConstraint(
            condition=models.Q(expires_at__gt=models.F('verified_at')),
            name='operator_proof_positive_window',
        )]


class OperatorSecurityEvent(models.Model):
    TYPES = [(value, value) for value in (
        'enrollment_started', 'enrolled', 'verified', 'locked', 'factor_removed',
    )]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    event_type = models.CharField(max_length=32, choices=TYPES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [models.CheckConstraint(
            condition=models.Q(event_type__in=[
                'enrollment_started', 'enrolled', 'verified', 'locked', 'factor_removed',
            ]), name='operator_security_event_type',
        )]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError('Operator security events are append-only.')
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError('Operator security events are append-only.')


class OperatorActionEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    event_type = models.CharField(max_length=32, choices=[('account_status_changed', 'Account status'), ('feedback_triaged', 'Feedback triage'), ('operator_access_changed', 'Operator access'), ('operator_password_changed', 'Operator password'), ('academy_plan_updated', 'Academy plan updated')])
    target = models.CharField(max_length=100)
    before = models.CharField(max_length=20)
    after = models.CharField(max_length=20)
    reason = models.CharField(max_length=500, blank=True)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [models.CheckConstraint(
            condition=models.Q(event_type__in=['account_status_changed', 'feedback_triaged', 'operator_access_changed', 'operator_password_changed', 'academy_plan_updated']),
            name='operator_action_event_type',
        )]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError('Operator action events are append-only.')
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError('Operator action events are append-only.')
