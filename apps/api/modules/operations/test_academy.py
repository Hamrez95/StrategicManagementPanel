
"""Commerce inventory uses real models, explicit grants and frozen order data."""
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import Permission
from django.test import TestCase
from django.utils import timezone

from modules.academy.models import (
    AcademyArea,
    AcademyCard,
    AcademyCourse,
    AcademyOrder,
    AcademyOrderItem,
    AcademyPlan,
    AcademySubscription,
    AcademyUnit,
    FreeSample,
    SubscriptionArea,
)
from modules.accounts.models import User
from modules.operations.models import OperatorAccess


@patch('modules.operations.views.operator_mfa_verified', return_value=True)
class OperatorAcademyTests(TestCase):
    def setUp(self):
        self.actor = User.objects.create_user('staff@inventory.test', is_staff=True,
                                             email_verified_at=timezone.now())
        OperatorAccess.objects.create(user=self.actor, role="admin")
        self.owner = User.objects.create_user('private@inventory.test')
        self.area = AcademyArea.objects.create(id='strategy', title='استراتژی', kind='specialty')
        self.course = AcademyCourse.objects.create(id='C1', area=self.area, title='مجموعه')
        self.unit = AcademyUnit.objects.create(id='L1', course=self.course, title='درس', kind='lesson')
        self.card = AcademyCard.objects.create(id='CARD1', unit=self.unit, title='کارت')
        FreeSample.objects.create(card=self.card)
        self.plan = AcademyPlan.objects.create(code='selected', title='Current title', kind='specialty')
        self.order = AcademyOrder.objects.create(user=self.owner, request_id=uuid4())
        self.item = AcademyOrderItem.objects.create(
            order=self.order, plan=self.plan, plan_title='Purchased title', plan_kind='specialty',
            unit_price=700, original_unit_price=1000, subtotal=700, discount_amount=70, total=630,
            currency='IRR', duration_days=30,
        )
        self.item.areas.add(self.area)
        self.subscription = AcademySubscription.objects.create(
            user=self.owner, plan=self.plan, coverage='specialty', starts_at=timezone.now()-timedelta(days=40),
            ends_at=timezone.now()-timedelta(days=10), reason='Private manual reason', granted_by=self.actor,
        )
        SubscriptionArea.objects.create(subscription=self.subscription, area=self.area)
        self.client.force_login(self.actor)

    def allow(self, section):
        self.actor.user_permissions.add(Permission.objects.get(
            content_type__app_label='accounts', codename='operator_view_' + section,
        ))

    def read(self, section, query=''):
        return self.client.get('/api/v1/operator/' + section + '/' + query)

    def test_course_permission_does_not_grant_commerce_or_customer_identity(self, _mfa):
        self.allow('academy')
        row = self.read('academy').json()['results'][0]
        self.assertEqual((row['unit_count'], row['card_count']), (1, 1))
        for section in ('academy_plans', 'academy_subscriptions', 'academy_orders', 'academy_samples'):
            self.assertEqual(self.read(section).status_code, 403)
        self.assertEqual(self.client.get('/api/v1/operator/overview/').json()['counts'],
                         {'academy': 1, 'lessons': 1})

    def test_subscription_scope_and_expiry_are_not_reconstructed_from_current_plan(self, _mfa):
        self.allow('academy_subscriptions')
        self.plan.kind = 'full'
        self.plan.save(update_fields=['kind'])
        response = self.read('academy_subscriptions', '?q=' + str(self.owner.pk))
        self.assertEqual(response.status_code, 200)
        row = response.json()['results'][0]
        self.assertEqual(row['coverage'], 'specialty')
        self.assertEqual(row['areas'], ['strategy'])
        self.assertEqual(row['status'], 'active')
        self.assertFalse(row['is_effective'])
        for secret in ('private@inventory.test', 'Private manual reason', 'granted_by'):
            self.assertNotIn(secret, response.content.decode())
        self.assertIn('no-store', response['Cache-Control'])
        self.assertEqual(self.read('academy_subscriptions', '?q=invalid').json()['count'], 0)
        self.subscription.starts_at = timezone.now() + timedelta(days=1)
        self.subscription.ends_at = None
        self.subscription.save()
        self.assertFalse(self.read('academy_subscriptions').json()['results'][0]['is_effective'])
        self.subscription.starts_at = timezone.now() - timedelta(days=1)
        self.subscription.save()
        self.assertTrue(self.read('academy_subscriptions').json()['results'][0]['is_effective'])
        self.subscription.status = 'revoked'
        self.subscription.save()
        self.assertFalse(self.read('academy_subscriptions').json()['results'][0]['is_effective'])

    def test_order_snapshot_preserves_amount_currency_scope_and_pending_state(self, _mfa):
        self.allow('academy_orders')
        row = self.read('academy_orders', '?q=' + str(self.owner.pk)).json()['results'][0]
        self.assertEqual(row['status'], 'requested')
        self.assertIsNone(row['paid_at'])
        self.assertEqual(row['items'][0], {
            'plan_title': 'Purchased title', 'coverage': 'specialty', 'original_unit_price': 1000,
            'unit_price': 700, 'subtotal': 700, 'discount_amount': 70, 'total': 630,
            'currency': 'IRR', 'duration_days': 30, 'areas': ['strategy'],
        })
        self.assertEqual(self.read('academy_orders', '?state=paid').json()['count'], 0)
        self.assertEqual(self.read('academy_orders', '?state=active').status_code, 400)
        self.assertEqual(self.read('academy_orders', '?page=2').status_code, 404)
        self.assertEqual(self.read('academy_orders', '?q=' + str(self.order.pk)).json()['count'], 1)
        self.assertEqual(self.client.post('/api/v1/operator/academy_orders/', {}).status_code, 405)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'requested')

    def test_free_samples_and_unpriced_plans_preserve_identifiers_and_nulls(self, _mfa):
        self.allow('academy_samples')
        self.allow('academy_plans')
        for query in ('?q=C1', '?q=L1', '?q=CARD1'):
            row = self.read('academy_samples', query).json()['results'][0]
            self.assertEqual((row['id'], row['course_id'], row['unit_id']), ('CARD1', 'C1', 'L1'))
        row = self.read('academy_plans', '?q=selected').json()['results'][0]
        self.assertIsNone(row['price'])
        self.assertIsNone(row['sale_price'])
        self.assertIsNone(row['duration_days'])
        self.assertNotIn('answer', self.read('academy_samples').content.decode())
