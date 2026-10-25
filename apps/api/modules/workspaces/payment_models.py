"""STR-029: commercial records, separate from entitlement grants and Academy."""
import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class ManagementDiscount(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        ACTIVE = 'active', 'Active'
        DISABLED = 'disabled', 'Disabled'

    code = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    plan = models.ForeignKey('workspaces.ManagementPlan', on_delete=models.PROTECT)
    amount_rial = models.PositiveBigIntegerField()
    max_redemptions = models.PositiveIntegerField()
    expires_at = models.DateTimeField()

    class Meta:
        app_label = 'workspaces'
        constraints = [
            models.CheckConstraint(condition=Q(amount_rial__gt=0, max_redemptions__gt=0), name='management_discount_positive'),
        ]


class ManagementOrder(models.Model):
    class Status(models.TextChoices):
        AWAITING = 'awaiting_payment', 'Awaiting payment'
        PAID = 'paid', 'Paid'
        CANCELLED = 'cancelled', 'Cancelled'
        REVIEW = 'payment_review', 'Payment review'
        REFUND_PENDING = 'refund_pending', 'Refund pending'
        REFUNDED = 'refunded', 'Refunded'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    billing_account = models.ForeignKey('workspaces.BillingAccount', on_delete=models.PROTECT, related_name='management_orders')
    request_id = models.UUIDField()
    cancel_request_id = models.UUIDField(null=True, blank=True, unique=True)
    plan = models.ForeignKey('workspaces.ManagementPlan', on_delete=models.PROTECT)
    discount = models.ForeignKey(ManagementDiscount, null=True, blank=True, on_delete=models.PROTECT)
    discount_code = models.CharField(max_length=64, blank=True)
    # A frozen, priced entitlement offer; catalog edits never rewrite an invoice.
    plan_title = models.CharField(max_length=100)
    plan_revision = models.PositiveIntegerField()
    duration_days = models.PositiveIntegerField()
    owned_workspace_limit = models.PositiveIntegerField(null=True, blank=True)
    can_finalize_analysis = models.BooleanField(default=False)
    can_calculate_metrics = models.BooleanField(default=False)
    can_generate_reports = models.BooleanField(default=False)
    subtotal_rial = models.PositiveBigIntegerField()
    discount_rial = models.PositiveBigIntegerField(default=0)
    total_rial = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default='IRR')
    policy_revision = models.CharField(max_length=100)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AWAITING)
    subscription = models.OneToOneField('workspaces.ManagementSubscription', null=True, blank=True, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'workspaces'
        constraints = [
            models.UniqueConstraint(fields=['billing_account', 'request_id'], name='management_order_request_unique'),
            models.CheckConstraint(condition=Q(total_rial__gt=0, subtotal_rial__gt=0, duration_days__gt=0, plan_revision__gte=1, currency='IRR') & Q(total_rial=F('subtotal_rial')-F('discount_rial')), name='management_order_money_valid'),
            models.CheckConstraint(condition=~Q(status='paid') | Q(subscription__isnull=False), name='management_paid_grant_required'),
            models.CheckConstraint(condition=~Q(status='cancelled') | Q(cancel_request_id__isnull=False), name='management_cancel_key_required'),
        ]


class ManagementPaymentAttempt(models.Model):
    class Status(models.TextChoices):
        CREATED = 'created', 'Created'
        PENDING = 'pending', 'Pending'
        UNKNOWN = 'unknown', 'Unknown'
        FAILED = 'failed', 'Failed'
        SUCCEEDED = 'succeeded', 'Succeeded'

    id = models.UUIDField(primary_key=True, editable=False)  # provider idempotency key
    order = models.ForeignKey(ManagementOrder, on_delete=models.PROTECT, related_name='attempts')
    provider = models.CharField(max_length=64)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.CREATED)
    transaction_reference = models.CharField(max_length=160, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'workspaces'
        constraints = [
            models.UniqueConstraint(fields=['provider', 'transaction_reference'], condition=Q(transaction_reference__isnull=False), name='management_provider_reference_unique'),
            models.UniqueConstraint(fields=['order'], condition=Q(status__in=['created', 'pending', 'unknown', 'succeeded']), name='management_one_unresolved_attempt'),
            models.CheckConstraint(condition=(Q(status='succeeded', transaction_reference__isnull=False) & ~Q(transaction_reference='')) | (~Q(status='succeeded') & Q(transaction_reference__isnull=True)), name='management_success_reference'),
        ]


class ManagementRefund(models.Model):
    id = models.UUIDField(primary_key=True, editable=False)
    attempt = models.ForeignKey(ManagementPaymentAttempt, on_delete=models.PROTECT, related_name='refunds')
    status = models.CharField(max_length=12, choices=ManagementPaymentAttempt.Status.choices, default='created')
    transaction_reference = models.CharField(max_length=160, null=True, blank=True)
    reason = models.CharField(max_length=500)
    # Explicit operator decision under the approved policy, never inferred.
    revoke_entitlement = models.BooleanField()
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'workspaces'

        constraints = [
            models.UniqueConstraint(fields=['attempt'], condition=Q(status__in=['created', 'pending', 'unknown', 'succeeded']), name='management_one_unresolved_refund'),
            models.CheckConstraint(condition=(Q(status='succeeded', transaction_reference__isnull=False) & ~Q(transaction_reference='')) | (~Q(status='succeeded') & Q(transaction_reference__isnull=True)), name='management_refund_success_reference'),
        ]


class ManagementPaymentEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(ManagementOrder, on_delete=models.PROTECT, related_name='payment_events')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)
    action = models.CharField(max_length=48)
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20)
    subject_id = models.UUIDField()
    reason = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'workspaces'
        ordering = ['created_at', 'id']
