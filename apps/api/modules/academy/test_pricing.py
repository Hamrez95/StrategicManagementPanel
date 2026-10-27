from datetime import timedelta
from uuid import uuid4
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import AcademyArea, AcademyPlan, AcademyCoupon, AcademyOrder, AcademyOrderItem


class AcademyPricingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.plan = AcademyPlan.objects.create(code='pricing-test', title='گرایش', kind='specialty', price=1000000, sale_price=800000, duration_days=365)
        for area_id in ['S01', 'S02']:
            AcademyArea.objects.create(id=area_id, title=area_id, kind='specialty')
        self.coupon = AcademyCoupon.objects.create(code='learn10', percent=10)
        self.body = {'plan_id': self.plan.pk, 'area_ids': ['S01', 'S02'], 'coupon_code': ' learn10 '}

    def test_quote_multiplies_selection_and_combines_discounts_without_creating_order(self):
        response = self.client.post('/api/v1/academy/price-quote/', self.body, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['subtotal'], 2000000)
        self.assertEqual(response.data['sale_discount'], 400000)
        self.assertEqual(response.data['coupon_discount'], 160000)
        self.assertEqual(response.data['total'], 1440000)
        self.assertEqual(response.data['coupon_code'], 'LEARN10')
        self.assertFalse(AcademyOrder.objects.exists())
        self.assertIn('no-store', response['Cache-Control'])

    def test_invalid_expired_future_and_wrong_plan_coupons_are_rejected(self):
        url = '/api/v1/academy/price-quote/'
        self.assertEqual(self.client.post(url, {**self.body, 'coupon_code': 'missing'}, format='json').status_code, 400)
        for change in [{'is_active': False}, {'ends_at': timezone.now()-timedelta(seconds=1)}, {'starts_at': timezone.now()+timedelta(days=1)}]:
            self.coupon.is_active = change.get('is_active', True)
            self.coupon.starts_at = change.get('starts_at')
            self.coupon.ends_at = change.get('ends_at')
            self.coupon.save()
            self.assertEqual(self.client.post(url, self.body, format='json').status_code, 400)
        self.coupon.starts_at = None
        self.coupon.save()
        other = AcademyPlan.objects.create(code='other', title='عمومی', kind='general')
        self.coupon.plans.add(other)
        self.assertEqual(self.client.post(url, self.body, format='json').status_code, 400)

    def test_orders_store_server_prices_and_coupon_snapshot_and_keep_access_unpaid(self):
        user = get_user_model().objects.create_user('pricing@example.test')
        self.client.force_authenticate(user)
        body = {**self.body, 'request_id': str(uuid4())}
        response = self.client.post('/api/v1/academy/orders/', body, format='json')
        self.assertEqual(response.status_code, 201)
        item = AcademyOrderItem.objects.get()
        self.assertEqual((item.subtotal, item.discount_amount, item.total), (2000000, 560000, 1440000))
        self.assertEqual(item.coupon_code, 'LEARN10')
        self.assertEqual(item.order.status, 'requested')
        self.assertFalse(user.academy_subscriptions.exists())
        self.plan.sale_price = 700000
        self.plan.save()
        self.assertEqual(self.client.post('/api/v1/academy/orders/', body, format='json').status_code, 200)
        item.refresh_from_db()
        self.assertEqual(item.total, 1440000)
        self.assertEqual(self.client.post('/api/v1/academy/orders/', {**body, 'coupon_code': ''}, format='json').status_code, 409)
        self.assertEqual(self.client.post('/api/v1/academy/orders/', {**body, 'total': 1}, format='json').status_code, 400)

    def test_unknown_price_and_database_guards(self):
        self.plan.sale_price = None
        self.plan.price = None
        self.plan.save()
        self.assertIsNone(self.client.post('/api/v1/academy/price-quote/', {**self.body, 'coupon_code': ''}, format='json').data['total'])
        self.assertEqual(self.client.post('/api/v1/academy/price-quote/', self.body, format='json').status_code, 400)
        for values in [{'price': 100, 'sale_price': 101}, {'price': None, 'sale_price': 10}]:
            with self.assertRaises(IntegrityError), transaction.atomic():
                AcademyPlan.objects.filter(pk=self.plan.pk).update(**values)

    def test_nonannual_offer_cannot_quote_or_create_new_order(self):
        user = get_user_model().objects.create_user('annual@example.test')
        self.client.force_authenticate(user)
        for days in (None, 30, 366):
            self.plan.duration_days = days
            self.plan.save()
            with self.subTest(days=days):
                self.assertEqual(self.client.post('/api/v1/academy/price-quote/', self.body, format='json').status_code, 400)
                self.assertEqual(self.client.post('/api/v1/academy/orders/', {**self.body, 'request_id': str(uuid4())}, format='json').status_code, 400)
        self.assertFalse(AcademyOrder.objects.exists())
