"""Internal payment services. No browser-supplied success or public mutation API.

Adapters come exclusively from trusted server settings. They must authenticate
to the provider, verify/query by our persisted UUID and enforce bounded timeouts.
Transport uncertainty is recoverable with the same key, never a fresh charge.
"""
from dataclasses import dataclass
from datetime import timedelta
from typing import Literal, Protocol
from uuid import UUID

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.module_loading import import_string

from .entitlements import FEATURES, _operator
from .models import (
    BillingAccount,
    ManagementDiscount,
    ManagementOrder,
    ManagementPaymentAttempt,
    ManagementPaymentEvent,
    ManagementPlan,
    ManagementRefund,
    ManagementSubscription,
    ManagementSubscriptionEvent,
)


@dataclass(frozen=True)
class Verification:
    key: UUID
    amount_rial: int
    currency: str
    status: Literal['pending', 'failed', 'succeeded']
    reference: str = ''


class PaymentProvider(Protocol):
    def start(self, *, key: UUID, amount_rial: int, currency: str) -> None: ...
    def verify(self, *, key: UUID) -> Verification: ...
    def refund(self, *, key: UUID, payment_reference: str, amount_rial: int, currency: str) -> None: ...
    def verify_refund(self, *, key: UUID) -> Verification: ...


def toman_to_rial(value):
    """Only whole integer tomans are accepted; floats/bools never round money."""
    if type(value) is not int or value < 0 or value > (2**63-1)//10:
        raise ValidationError('invalid_money')
    return value * 10


def _key(value):
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError('invalid_request_id') from None


def _provider(name):
    path = getattr(settings, 'MANAGEMENT_PAYMENT_PROVIDERS', {}).get(name)
    if not path:
        raise ValidationError('payment_provider_unconfigured')
    return import_string(path)()


def _checkout_policy():
    policy = getattr(settings, 'MANAGEMENT_COMMERCE_POLICY_REVISION', '')
    if not getattr(settings, 'MANAGEMENT_CHECKOUT_ENABLED', False) or not policy:
        raise ValidationError('management_checkout_disabled')
    return policy


def _owner(actor, billing):
    from modules.accounts.models import User
    user = User.objects.filter(pk=actor.pk, is_active=True, email_verified_at__isnull=False).first()
    if user is None or billing.owner_id != user.pk:
        raise PermissionDenied('billing_owner_required')
    return user


def _event(order, actor, action, before, after, subject, reason=''):
    ManagementPaymentEvent.objects.create(order=order, actor=actor, action=action,
        from_status=before, to_status=after, subject_id=subject, reason=reason)


def _reason(value):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 500:
        raise ValidationError('reason_required')
    return value.strip()


@transaction.atomic
def create_order(actor, billing_account, plan, *, request_id, discount_code=None):
    billing = BillingAccount.objects.select_for_update().get(pk=billing_account.pk)
    actor = _owner(actor, billing)
    key = _key(request_id)
    previous = ManagementOrder.objects.filter(billing_account=billing, request_id=key).first()
    if previous:
        code = previous.discount_code or None
        if previous.plan_id != plan.pk or code != discount_code:
            raise ValidationError('idempotency_conflict')
        return previous
    policy = _checkout_policy()
    plan = ManagementPlan.objects.select_for_update().get(pk=plan.pk)
    if (billing.status != 'active' or not plan.is_active or plan.is_default
            or not plan.price or plan.currency != 'IRR' or not plan.duration_days):
        raise ValidationError('plan_not_purchasable')
    discount = None
    amount = 0
    if discount_code is not None:
        if not getattr(settings, 'MANAGEMENT_DISCOUNTS_ENABLED', False):
            raise ValidationError('management_discounts_disabled')
        discount = ManagementDiscount.objects.select_for_update().filter(code=discount_code).first()
        if (discount is None or discount.status != 'active' or discount.plan_id != plan.pk
                or discount.expires_at <= timezone.now()):
            raise ValidationError('discount_unavailable')
        # Reservations remain consumed for unknown/late-payment/refunded orders.
        # Releasing/reusing codes after cancellation/refund needs an owner policy.
        if ManagementOrder.objects.filter(discount=discount).count() >= discount.max_redemptions:
            raise ValidationError('discount_exhausted')
        amount = discount.amount_rial
        if amount >= plan.price:
            raise ValidationError('discount_requires_positive_total')
    order = ManagementOrder.objects.create(billing_account=billing, request_id=key,
        plan=plan, discount=discount, discount_code=discount_code or '', plan_title=plan.title, plan_revision=plan.revision,
        duration_days=plan.duration_days, owned_workspace_limit=plan.owned_workspace_limit,
        subtotal_rial=plan.price, discount_rial=amount, total_rial=plan.price-amount,
        currency=plan.currency, policy_revision=policy,
        **{feature: getattr(plan, feature) for feature in FEATURES})
    _event(order, actor, 'order_created', '', order.status, order.pk)
    return order


def start_payment(actor, order, *, request_id, provider):
    # Commit intent before contacting a provider. A crash leaves a reconcilable key.
    key = _key(request_id)
    with transaction.atomic():
        billing = BillingAccount.objects.select_for_update().get(pk=order.billing_account_id)
        actor = _owner(actor, billing)
        order = ManagementOrder.objects.select_for_update().get(pk=order.pk)
        previous = ManagementPaymentAttempt.objects.filter(pk=key).first()
        if previous:
            if previous.order_id != order.pk or previous.provider != provider:
                raise ValidationError('idempotency_conflict')
            return previous
        _checkout_policy()
        _provider(provider)
        if billing.status != 'active' or order.status != 'awaiting_payment':
            raise ValidationError('order_not_payable')
        if order.attempts.exclude(status='failed').exists():
            raise ValidationError('payment_reconciliation_required')
        attempt = ManagementPaymentAttempt.objects.create(id=key, order=order, provider=provider)
        _event(order, actor, 'payment_created', '', attempt.status, key)
    return resume_payment(actor, attempt)


@transaction.atomic
def resume_payment(actor, attempt):
    """Recover a committed intent after a process crash, using the SAME provider key."""
    billing = BillingAccount.objects.select_for_update().get(pk=attempt.order.billing_account_id)
    actor = _owner(actor, billing)
    order = ManagementOrder.objects.select_for_update().get(pk=attempt.order_id)
    attempt = ManagementPaymentAttempt.objects.select_for_update().get(pk=attempt.pk)
    if attempt.status in ('succeeded', 'failed'):
        return attempt
    _checkout_policy()
    if billing.status != 'active' or order.status != 'awaiting_payment':
        raise ValidationError('order_not_payable')
    adapter = _provider(attempt.provider)
    before = attempt.status
    outcome = 'pending'
    try:
        adapter.start(key=attempt.pk, amount_rial=order.total_rial, currency=order.currency)
    except TimeoutError:
        # Verification uses our key even when no provider token was returned.
        outcome = 'unknown'
    attempt.status = outcome
    attempt.save(update_fields=['status'])
    if before != outcome:
        _event(order, actor, 'payment_started', before, outcome, attempt.pk)
    return attempt


def _verified_result(result, key, order):
    if (not isinstance(result, Verification) or result.key != key
            or type(result.amount_rial) is not int or result.amount_rial != order.total_rial
            or result.currency != order.currency or result.status not in ('pending', 'failed', 'succeeded')
            or (result.status == 'succeeded' and (not isinstance(result.reference, str)
                or not result.reference.strip() or len(result.reference) > 160))):
        return False
    return True


@transaction.atomic
def reconcile_payment(actor, attempt):
    actor = _operator(actor, 'workspaces.change_managementpaymentattempt')
    actor = _operator(actor, 'workspaces.add_managementsubscription')
    # Lock order first everywhere, including refund/cancel, to serialize outcomes.
    BillingAccount.objects.select_for_update().get(pk=attempt.order.billing_account_id)
    order = ManagementOrder.objects.select_for_update().get(pk=attempt.order_id)
    attempt = ManagementPaymentAttempt.objects.select_for_update().get(pk=attempt.pk)
    if attempt.status in ('succeeded', 'failed'):
        return attempt
    before = attempt.status
    try:
        result = _provider(attempt.provider).verify(key=attempt.pk)
    except TimeoutError:
        result = None
    valid = _verified_result(result, attempt.pk, order)
    attempt.status = result.status if valid else 'unknown'
    if valid and result.status == 'succeeded':
        # Unique (provider, reference) prevents replay against another invoice.
        attempt.transaction_reference = result.reference
        old = order.status
        billing = order.billing_account
        if old == 'awaiting_payment' and billing.status == 'active':
            actor = _operator(actor, 'workspaces.add_managementsubscription')
            now = timezone.now()
            grant = ManagementSubscription.objects.create(billing_account=billing, plan=order.plan,
                request_id=order.pk, starts_at=now, ends_at=now+timedelta(days=order.duration_days),
                plan_title=order.plan_title, plan_revision=order.plan_revision,
                owned_workspace_limit=order.owned_workspace_limit, granted_by=actor,
                reason=f'Verified payment for order {order.pk}',
                **{feature: getattr(order, feature) for feature in FEATURES})
            ManagementSubscriptionEvent.objects.create(subscription=grant, actor=actor,
                event_type='granted', reason=grant.reason)
            order.subscription = grant
            order.status = 'paid'
        else:
            order.status = 'payment_review'
        order.save(update_fields=['status', 'subscription'])
        _event(order, actor, 'payment_settled', old, order.status, attempt.pk)
    attempt.save(update_fields=['status', 'transaction_reference'])
    if before != attempt.status:
        _event(order, actor, 'payment_verified', before, attempt.status, attempt.pk,
            '' if valid else 'provider_result_unverified')
    return attempt


@transaction.atomic
def cancel_order(actor, order, *, request_id, reason):
    billing = BillingAccount.objects.select_for_update().get(pk=order.billing_account_id)
    actor = _owner(actor, billing)
    reason = _reason(reason)
    key = _key(request_id)
    order = ManagementOrder.objects.select_for_update().get(pk=order.pk)
    if order.status == 'cancelled':
        prior_reason = ManagementPaymentEvent.objects.filter(order=order,
            action='order_cancelled', subject_id=key).values_list('reason', flat=True).first()
        if order.cancel_request_id != key or prior_reason != reason:
            raise ValidationError('idempotency_conflict')
        return order
    if order.status != 'awaiting_payment':
        raise ValidationError('order_not_cancellable')
    before = order.status
    order.status = 'cancelled'
    order.cancel_request_id = key
    order.save(update_fields=['status', 'cancel_request_id'])
    _event(order, actor, 'order_cancelled', before, order.status, key, reason)
    return order


def request_refund(actor, attempt, *, request_id, reason, revoke_entitlement):
    actor = _operator(actor, 'workspaces.add_managementrefund')
    actor = _operator(actor, 'workspaces.change_managementrefund')
    reason = _reason(reason)
    key = _key(request_id)
    if type(revoke_entitlement) is not bool:
        raise ValidationError('explicit_refund_entitlement_decision_required')
    if revoke_entitlement:
        actor = _operator(actor, 'workspaces.change_managementsubscription')
    with transaction.atomic():
        BillingAccount.objects.select_for_update().get(pk=attempt.order.billing_account_id)
        order = ManagementOrder.objects.select_for_update().get(pk=attempt.order_id)
        attempt = ManagementPaymentAttempt.objects.select_for_update().get(pk=attempt.pk)
        previous = ManagementRefund.objects.filter(pk=key).first()
        if previous:
            if previous.attempt_id != attempt.pk or previous.reason != reason or previous.revoke_entitlement != revoke_entitlement:
                raise ValidationError('idempotency_conflict')
            return previous
        if not getattr(settings, 'MANAGEMENT_COMMERCE_POLICY_REVISION', ''):
            raise ValidationError('refund_policy_unconfigured')
        if attempt.status != 'succeeded' or order.status not in ('paid', 'payment_review', 'refund_pending'):
            raise ValidationError('payment_not_refundable')
        if attempt.refunds.exclude(status='failed').exists():
            raise ValidationError('refund_reconciliation_required')
        _provider(attempt.provider)
        refund = ManagementRefund.objects.create(id=key, attempt=attempt, reason=reason,
            revoke_entitlement=revoke_entitlement, requested_by=actor)
        before = order.status
        order.status = 'refund_pending'
        order.save(update_fields=['status'])
        _event(order, actor, 'refund_requested', before, order.status, key, reason)
    return resume_refund(actor, refund)


def resume_refund(actor, refund):
    """Re-submit only the persisted idempotency key, including after a process crash."""
    actor = _operator(actor, 'workspaces.add_managementrefund')
    actor = _operator(actor, 'workspaces.change_managementrefund')
    with transaction.atomic():
        BillingAccount.objects.select_for_update().get(pk=refund.attempt.order.billing_account_id)
        order = ManagementOrder.objects.select_for_update().get(pk=refund.attempt.order_id)
        refund = ManagementRefund.objects.select_for_update().get(pk=refund.pk)
        if refund.status in ('succeeded', 'failed'):
            return refund
        if refund.revoke_entitlement:
            actor = _operator(actor, 'workspaces.change_managementsubscription')
        adapter = _provider(refund.attempt.provider)
        try:
            adapter.refund(key=refund.pk, payment_reference=refund.attempt.transaction_reference,
                amount_rial=order.total_rial, currency=order.currency)
        except TimeoutError:
            pass
    return reconcile_refund(actor, refund)


@transaction.atomic
def reconcile_refund(actor, refund):
    actor = _operator(actor, 'workspaces.change_managementrefund')
    BillingAccount.objects.select_for_update().get(pk=refund.attempt.order.billing_account_id)
    order = ManagementOrder.objects.select_for_update().get(pk=refund.attempt.order_id)
    refund = ManagementRefund.objects.select_for_update().get(pk=refund.pk)
    if refund.status in ('succeeded', 'failed'):
        return refund
    before = refund.status
    try:
        result = _provider(refund.attempt.provider).verify_refund(key=refund.pk)
    except TimeoutError:
        result = None
    valid = _verified_result(result, refund.pk, order)
    refund.status = result.status if valid else 'unknown'
    refund.transaction_reference = result.reference if valid and result.status == 'succeeded' else None
    if refund.status == 'succeeded':
        old = order.status
        if refund.revoke_entitlement and order.subscription_id:
            actor = _operator(actor, 'workspaces.change_managementsubscription')
            grant = ManagementSubscription.objects.select_for_update().get(pk=order.subscription_id)
            if grant.status != 'revoked':
                grant.status = 'revoked'
                grant.save(update_fields=['status'])
                ManagementSubscriptionEvent.objects.create(subscription=grant, actor=actor,
                    event_type='revoked', reason=refund.reason)
        order.status = 'refunded'
        order.save(update_fields=['status'])
        _event(order, actor, 'refund_settled', old, order.status, refund.pk, refund.reason)
    refund.save(update_fields=['status', 'transaction_reference'])
    if before != refund.status:
        _event(order, actor, 'refund_verified', before, refund.status, refund.pk,
            '' if valid else 'provider_result_unverified')
    return refund
