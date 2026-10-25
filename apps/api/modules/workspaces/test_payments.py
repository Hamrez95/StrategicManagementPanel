"""Synthetic provider contract tests; not evidence of a live gateway integration."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, close_old_connections, connection, transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from modules.accounts.models import User

from .entitlements import management_access
from .models import (
    BillingAccount,
    ManagementDiscount,
    ManagementOrder,
    ManagementPaymentAttempt,
    ManagementPaymentEvent,
    ManagementPlan,
    ManagementRefund,
    ManagementSubscription,
)
from .payments import (
    Verification,
    cancel_order,
    create_order,
    reconcile_payment,
    reconcile_refund,
    request_refund,
    resume_payment,
    resume_refund,
    start_payment,
    toman_to_rial,
)


class SyntheticProvider:
    payments = {}
    refunds = {}
    start_calls = 0
    refund_calls = 0
    timeout = False
    result = 'pending'
    tamper = None

    def start(self, *, key, amount_rial, currency):
        type(self).start_calls += 1
        self.payments[key] = (amount_rial, currency)
        if self.timeout:
            raise TimeoutError

    def _verify(self, key, amounts):
        if self.timeout:
            raise TimeoutError
        amount, currency = amounts[key]
        return Verification(
            uuid4() if self.tamper == 'key' else key,
            amount+1 if self.tamper == 'amount' else amount,
            'USD' if self.tamper == 'currency' else currency,
            self.result, '' if self.tamper == 'reference' else f'ref-{key}',
        )

    def verify(self, *, key):
        return self._verify(key, self.payments)

    def refund(self, *, key, payment_reference, amount_rial, currency):
        type(self).refund_calls += 1
        self.refunds[key] = (amount_rial, currency)
        if self.timeout:
            raise TimeoutError

    def verify_refund(self, *, key):
        return self._verify(key, self.refunds)


COMMERCE = dict(MANAGEMENT_CHECKOUT_ENABLED=True, MANAGEMENT_DISCOUNTS_ENABLED=True,
    MANAGEMENT_COMMERCE_POLICY_REVISION='synthetic-policy',
    MANAGEMENT_PAYMENT_PROVIDERS={'synthetic': 'modules.workspaces.test_payments.SyntheticProvider'})


class PaymentFixture:
    def setUp(self):
        SyntheticProvider.payments = {}
        SyntheticProvider.refunds = {}
        SyntheticProvider.start_calls = SyntheticProvider.refund_calls = 0
        SyntheticProvider.timeout = False
        SyntheticProvider.result = 'pending'
        SyntheticProvider.tamper = None
        self.owner = User.objects.create_user('payment-owner@example.test', email_verified_at=timezone.now())
        self.other = User.objects.create_user('payment-other@example.test', email_verified_at=timezone.now())
        self.operator = User.objects.create_superuser('payment-operator@example.test', password='synthetic-test-only')
        self.billing = BillingAccount.objects.create(owner=self.owner)
        self.plan = ManagementPlan.objects.create(code='payment-test', title='Synthetic offer', is_active=True,
            price=12000, duration_days=7, owned_workspace_limit=2, can_finalize_analysis=True)

    def order(self, **kwargs):
        return create_order(self.owner, self.billing, self.plan, request_id=kwargs.pop('request_id', uuid4()), **kwargs)

    def attempt(self, order=None, key=None):
        return start_payment(self.owner, order or self.order(), request_id=key or uuid4(), provider='synthetic')

    def settle(self, attempt=None):
        SyntheticProvider.result = 'succeeded'
        return reconcile_payment(self.operator, attempt or self.attempt())


@override_settings(**COMMERCE)
class ManagementPaymentTests(PaymentFixture, TestCase):
    def test_default_checkout_and_discounts_are_closed(self):
        with override_settings(MANAGEMENT_CHECKOUT_ENABLED=False), self.assertRaises(ValidationError):
            self.order()
        with override_settings(MANAGEMENT_COMMERCE_POLICY_REVISION=''), self.assertRaises(ValidationError):
            self.order()
        with override_settings(MANAGEMENT_DISCOUNTS_ENABLED=False), self.assertRaises(ValidationError):
            self.order(discount_code='ANY')
        self.assertFalse(ManagementOrder.objects.exists())

    def test_unpriced_or_undated_plan_cannot_be_purchased(self):
        for field, value in [('price', None), ('price', 0), ('duration_days', None), ('currency', 'USD')]:
            with self.subTest(field=field, value=value):
                original = getattr(self.plan, field)
                setattr(self.plan, field, value)
                self.plan.save()
                with self.assertRaises(ValidationError):
                    self.order()
                setattr(self.plan, field, original)
        self.assertFalse(ManagementOrder.objects.exists())

    def test_owner_and_verified_operator_boundaries(self):
        with self.assertRaises(PermissionDenied):
            create_order(self.other, self.billing, self.plan, request_id=uuid4())
        attempt = self.attempt()
        with self.assertRaises(PermissionDenied):
            reconcile_payment(self.owner, attempt)
        self.operator.is_active = False
        self.operator.save(update_fields=['is_active'])
        with self.assertRaises(PermissionDenied):
            reconcile_payment(self.operator, attempt)
        self.assertFalse(ManagementSubscription.objects.exists())

    def test_idempotency_is_bound_to_payload_and_account(self):
        key = uuid4()
        order = self.order(request_id=key)
        self.assertEqual(self.order(request_id=key).pk, order.pk)
        with self.assertRaises(ValidationError):
            self.order(request_id=key, discount_code='changed')
        attempt_key = uuid4()
        attempt = self.attempt(order, attempt_key)
        self.assertEqual(self.attempt(order, attempt_key).pk, attempt.pk)
        with self.assertRaises(ValidationError):
            self.attempt(self.order(), attempt_key)
        self.assertEqual(SyntheticProvider.start_calls, 1)

    def test_unknown_is_reconciled_with_same_key_and_grants_once(self):
        SyntheticProvider.timeout = True
        attempt = self.attempt()
        self.assertEqual(attempt.status, 'unknown')
        with self.assertRaises(ValidationError):
            self.attempt(attempt.order)
        SyntheticProvider.timeout = False
        settled = self.settle(attempt)
        self.settle(attempt)
        self.assertEqual(settled.status, 'succeeded')
        self.assertEqual(ManagementSubscription.objects.count(), 1)
        self.assertEqual(ManagementPaymentEvent.objects.filter(action='payment_settled').count(), 1)
        self.assertEqual(SyntheticProvider.start_calls, 1)
        self.assertTrue(management_access(self.owner)['features']['can_finalize_analysis'])

    def test_mismatched_verification_never_grants(self):
        for field in ['key', 'amount', 'currency', 'reference']:
            with self.subTest(field=field):
                attempt = self.attempt()
                SyntheticProvider.result = 'succeeded'
                SyntheticProvider.tamper = field
                self.assertEqual(reconcile_payment(self.operator, attempt).status, 'unknown')
        self.assertFalse(ManagementSubscription.objects.exists())

    def test_failed_attempt_allows_explicit_new_attempt(self):
        attempt = self.attempt()
        SyntheticProvider.result = 'failed'
        self.assertEqual(reconcile_payment(self.operator, attempt).status, 'failed')
        self.attempt(attempt.order)
        self.assertEqual(SyntheticProvider.start_calls, 2)

    def test_cancel_late_success_requires_review_without_grant(self):
        attempt = self.attempt()
        cancel_key = uuid4()
        cancel_order(self.owner, attempt.order, request_id=cancel_key, reason='Synthetic cancellation')
        cancel_order(self.owner, attempt.order, request_id=cancel_key, reason='Synthetic cancellation')
        with self.assertRaises(ValidationError):
            cancel_order(self.owner, attempt.order, request_id=uuid4(), reason='Conflicting retry')
        with self.assertRaises(ValidationError):
            cancel_order(self.owner, attempt.order, request_id=cancel_key, reason='Changed payload')
        self.settle(attempt)
        attempt.order.refresh_from_db()
        self.assertEqual(attempt.order.status, 'payment_review')
        self.assertFalse(ManagementSubscription.objects.exists())
        self.assertEqual(ManagementPaymentEvent.objects.filter(action='order_cancelled').count(), 1)

    def test_frozen_priced_offer_survives_catalog_changes(self):
        attempt = self.attempt()
        self.plan.price = 24000
        self.plan.can_finalize_analysis = False
        self.plan.duration_days = 30
        self.plan.save()
        self.settle(attempt)
        grant = ManagementSubscription.objects.get()
        self.assertTrue(grant.can_finalize_analysis)
        self.assertEqual(grant.ends_at-grant.starts_at, timedelta(days=7))
        self.assertEqual(SyntheticProvider.payments[attempt.pk][0], 12000)

    def test_discount_lifecycle_reservation_expiry_and_disabled_gate(self):
        discount = ManagementDiscount.objects.create(code='TEST', plan=self.plan, amount_rial=1000,
            max_redemptions=1, expires_at=timezone.now()+timedelta(days=1))
        with self.assertRaises(ValidationError):
            self.order(discount_code='TEST')
        discount.status = 'active'
        discount.save()
        order = self.order(discount_code='TEST')
        self.assertEqual(order.total_rial, 11000)
        cancel_order(self.owner, order, request_id=uuid4(), reason='Keep reservation until policy decides')
        with self.assertRaises(ValidationError):
            self.order(discount_code='TEST')
        discount.status = 'disabled'
        discount.save()
        with self.assertRaises(ValidationError):
            self.order(discount_code='TEST')

    def test_refund_timeout_and_duplicate_revoke_only_after_verification(self):
        attempt = self.settle()
        SyntheticProvider.timeout = True
        key = uuid4()
        refund = request_refund(self.operator, attempt, request_id=key, reason='Synthetic refund', revoke_entitlement=True)
        self.assertEqual(refund.status, 'unknown')
        self.assertTrue(management_access(self.owner)['features']['can_finalize_analysis'])
        self.assertEqual(request_refund(self.operator, attempt, request_id=key,
            reason='Synthetic refund', revoke_entitlement=True).pk, refund.pk)
        self.assertEqual(SyntheticProvider.refund_calls, 1)
        SyntheticProvider.timeout = False
        reconcile_refund(self.operator, refund)
        reconcile_refund(self.operator, refund)
        self.assertFalse(management_access(self.owner)['features']['can_finalize_analysis'])
        attempt.order.refresh_from_db()
        refund.refresh_from_db()
        self.assertEqual(attempt.order.status, 'refunded')
        self.assertTrue(refund.transaction_reference.startswith('ref-'))
        self.assertEqual(ManagementPaymentEvent.objects.filter(action='refund_settled').count(), 1)

    def test_refund_permission_and_payload_conflicts(self):
        attempt = self.settle()
        with self.assertRaises(PermissionDenied):
            request_refund(self.owner, attempt, request_id=uuid4(), reason='Invalid', revoke_entitlement=True)
        refund = request_refund(self.operator, attempt, request_id=uuid4(), reason='Approved', revoke_entitlement=False)
        with self.assertRaises(ValidationError):
            request_refund(self.operator, attempt, request_id=refund.pk, reason='Changed', revoke_entitlement=False)
        self.assertTrue(management_access(self.owner)['features']['can_finalize_analysis'])

    def test_money_conversion_is_exact(self):
        self.assertEqual(toman_to_rial(1234), 12340)
        for value in [True, 1.1, -1, '100', 2**63]:
            with self.assertRaises(ValidationError):
                toman_to_rial(value)

    def test_provider_reference_replay_rolls_back_second_grant(self):
        first = self.settle()
        second = self.attempt()
        with patch.object(SyntheticProvider, 'verify', return_value=Verification(
                second.pk, second.order.total_rial, 'IRR', 'succeeded', first.transaction_reference)):
            with self.assertRaises(IntegrityError), transaction.atomic():
                reconcile_payment(self.operator, second)
        self.assertEqual(ManagementSubscription.objects.count(), 1)
        second.refresh_from_db()
        self.assertEqual(second.status, 'pending')

    def test_crash_before_provider_submission_keeps_recoverable_intent(self):
        with patch.object(SyntheticProvider, 'start', side_effect=RuntimeError('synthetic crash')):
            with self.assertRaises(RuntimeError):
                self.attempt()
        attempt = ManagementPaymentAttempt.objects.get()
        self.assertEqual(attempt.status, 'created')
        resume_payment(self.owner, attempt)
        self.settle(attempt)
        self.assertEqual(ManagementSubscription.objects.count(), 1)

    def test_crash_before_refund_submission_keeps_recoverable_intent(self):
        attempt = self.settle()
        with patch.object(SyntheticProvider, 'refund', side_effect=RuntimeError('synthetic crash')):
            with self.assertRaises(RuntimeError):
                request_refund(self.operator, attempt, request_id=uuid4(), reason='Crash recovery', revoke_entitlement=True)
        refund = ManagementRefund.objects.get()
        self.assertEqual(refund.status, 'created')
        resume_refund(self.operator, refund)
        self.assertFalse(management_access(self.owner)['features']['can_finalize_analysis'])

    def test_failed_refund_requires_explicit_new_key_and_never_revokes(self):
        attempt = self.settle()
        SyntheticProvider.result = 'failed'
        failed = request_refund(self.operator, attempt, request_id=uuid4(), reason='First attempt', revoke_entitlement=True)
        self.assertEqual(failed.status, 'failed')
        self.assertTrue(management_access(self.owner)['features']['can_finalize_analysis'])
        SyntheticProvider.result = 'succeeded'
        retry = request_refund(self.operator, attempt, request_id=uuid4(), reason='Explicit retry', revoke_entitlement=True)
        self.assertEqual(retry.status, 'succeeded')
        self.assertEqual(ManagementRefund.objects.count(), 2)
        self.assertFalse(management_access(self.owner)['features']['can_finalize_analysis'])

    def test_refund_verification_mismatch_keeps_entitlement(self):
        attempt = self.settle()
        SyntheticProvider.tamper = 'amount'
        refund = request_refund(self.operator, attempt, request_id=uuid4(), reason='Mismatch', revoke_entitlement=True)
        self.assertEqual(refund.status, 'unknown')
        self.assertTrue(management_access(self.owner)['features']['can_finalize_analysis'])
        with self.assertRaises(ValidationError):
            request_refund(self.operator, attempt, request_id=uuid4(), reason='Duplicate', revoke_entitlement=True)

    def test_suspended_account_settlement_is_reviewed_without_grant(self):
        attempt = self.attempt()
        self.billing.status = 'suspended'
        self.billing.save(update_fields=['status'])
        self.settle(attempt)
        attempt.order.refresh_from_db()
        self.assertEqual(attempt.order.status, 'payment_review')
        self.assertFalse(ManagementSubscription.objects.exists())

    def test_raw_browser_success_dictionary_is_not_verification(self):
        attempt = self.attempt()
        with patch.object(SyntheticProvider, 'verify', return_value={'status': 'succeeded', 'amount_rial': 12000}):
            self.assertEqual(reconcile_payment(self.operator, attempt).status, 'unknown')
        self.assertFalse(ManagementSubscription.objects.exists())

    def test_expired_and_wrong_plan_discounts_are_rejected(self):
        discount = ManagementDiscount.objects.create(code='EXPIRED', plan=self.plan, status='active',
            amount_rial=1000, max_redemptions=1, expires_at=timezone.now()-timedelta(seconds=1))
        with self.assertRaises(ValidationError):
            self.order(discount_code=discount.code)
        discount.expires_at = timezone.now()+timedelta(days=1)
        discount.plan = ManagementPlan.objects.get(is_default=True)
        discount.save()
        with self.assertRaises(ValidationError):
            self.order(discount_code=discount.code)

    def test_database_guards_reject_snapshot_rewrite_and_event_tampering(self):
        order = self.order()
        if connection.vendor != 'postgresql':
            self.skipTest('Requires PostgreSQL guards')
        for operation in [
            lambda: ManagementOrder.objects.filter(pk=order.pk).update(plan_title='Changed'),
            lambda: ManagementOrder.objects.filter(pk=order.pk).update(status='invented'),
            lambda: ManagementPaymentEvent.objects.filter(order=order).update(action='edited'),
            lambda: ManagementPaymentEvent.objects.filter(order=order).delete(),
        ]:
            with self.assertRaises(IntegrityError), transaction.atomic():
                operation()


@override_settings(**COMMERCE)
class ManagementPaymentRaceTests(PaymentFixture, TransactionTestCase):
    def test_concurrent_confirmation_grants_once(self):
        if connection.vendor != 'postgresql':
            self.skipTest('Requires PostgreSQL row-level locking')
        attempt = self.attempt()
        SyntheticProvider.result = 'succeeded'

        def confirm(_):
            close_old_connections()
            try:
                return reconcile_payment(User.objects.get(pk=self.operator.pk),
                    ManagementPaymentAttempt.objects.get(pk=attempt.pk)).status
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(confirm, range(2))), ['succeeded', 'succeeded'])
        self.assertEqual(ManagementSubscription.objects.count(), 1)
