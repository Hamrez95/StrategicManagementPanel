"""Settlement boundary for a future payment integration; never callable by a learner."""
from datetime import timedelta
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from .models import AcademyOrder, AcademySubscription, SubscriptionArea


@transaction.atomic
def fulfill_paid_order(order_id):
    order = AcademyOrder.objects.select_for_update().get(pk=order_id)
    if order.status != 'paid' or not order.paid_at:
        raise ValidationError('Only a verified paid order can grant access.')
    granted = []
    for item in order.items.select_related('plan').prefetch_related('areas'):
        if item.unit_price is None or not item.duration_days or item.plan_kind not in {'full', 'general', 'specialty'}:
            raise ValidationError('Order pricing, duration and coverage must be finalized before settlement.')
        selected = list(item.areas.all())
        if (item.plan_kind == 'specialty' and (not selected or any(a.kind != 'specialty' for a in selected))) or (item.plan_kind != 'specialty' and selected):
            raise ValidationError('Invalid order scope.')
        subscription, created = AcademySubscription.objects.get_or_create(order_item=item, defaults={'user': order.user, 'plan': item.plan, 'coverage': item.plan_kind, 'starts_at': order.paid_at, 'ends_at': order.paid_at + timedelta(days=item.duration_days), 'reason': 'Verified order settlement'})
        if created:
            SubscriptionArea.objects.bulk_create([SubscriptionArea(subscription=subscription, area=area) for area in selected])
        granted.append(subscription)
    return granted
