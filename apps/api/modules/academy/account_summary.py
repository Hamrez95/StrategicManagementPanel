"""Read-only, owner-scoped purchase history and effective entitlements."""
from django.utils import timezone
from .models import AcademyPlan, AcademyArea, AcademySubscription, AcademyOrder


def subscription_status(row, now=None):
    now = now or timezone.now()
    if row.status == 'revoked':
        return 'revoked'
    if row.order_item_id and (row.order_item.order.status != 'paid' or row.order_item.order.user_id != row.user_id or row.order_item.plan_kind != row.coverage):
        return 'revoked'
    if row.starts_at > now:
        return 'scheduled'
    if row.ends_at and row.ends_at <= now:
        return 'expired'
    return 'active'


def effective_areas(row):
    selected = {area.pk for area in row.areas.all() if area.kind == 'specialty' and area.is_active}
    if row.order_item_id:
        selected &= {area.pk for area in row.order_item.areas.all()}
    return sorted(selected) if row.coverage == 'specialty' else []


def plans_payload(user, include_orders=False):
    now = timezone.now()
    plans = list(AcademyPlan.objects.filter(is_active=True).order_by('id').values('id', 'code', 'title', 'kind', 'price', 'sale_price', 'currency', 'duration_days'))
    areas = list(AcademyArea.objects.filter(kind='specialty', is_active=True).values('id', 'title'))
    subscriptions, orders = [], []
    access = {'full': False, 'general': False, 'area_ids': [], 'free_sample': True}
    if user.is_authenticated:
        rows = AcademySubscription.objects.filter(user=user).select_related('plan', 'order_item__order').prefetch_related('areas', 'order_item__areas').order_by('-created_at', '-id')
        for row in rows:
            status = subscription_status(row, now)
            active_areas = effective_areas(row) if status == 'active' else []
            if status == 'active':
                access['full'] |= row.coverage == 'full'
                access['general'] |= row.coverage in ('general', 'full')
                access['area_ids'] = sorted(set(access['area_ids']) | set(active_areas))
            subscriptions.append({'id': str(row.pk), 'plan_id': row.plan_id, 'title': row.order_item.plan_title if row.order_item_id else row.plan.title, 'coverage': row.coverage, 'status': status, 'is_effective': status == 'active' and (row.coverage != 'specialty' or bool(active_areas)), 'starts_at': row.starts_at, 'ends_at': row.ends_at, 'created_at': row.created_at, 'areas': [area.pk for area in row.areas.all()], 'effective_areas': active_areas, 'order_id': str(row.order_item.order_id) if row.order_item_id else None, 'source': 'purchase' if row.order_item_id else 'manual'})
        if include_orders:
            for order in AcademyOrder.objects.filter(user=user).prefetch_related('items__areas').order_by('-created_at', '-id')[:50]:
                orders.append({'id': str(order.pk), 'status': order.status, 'created_at': order.created_at, 'paid_at': order.paid_at, 'items': [{'title': item.plan_title, 'coverage': item.plan_kind, 'currency': item.currency, 'subtotal': item.subtotal, 'discount_amount': item.discount_amount, 'total': item.total, 'coupon_code': item.coupon_code, 'areas': [area.pk for area in item.areas.all()]} for item in order.items.all()]})
    if access['full']:
        access['area_ids'] = [area['id'] for area in areas]
    result = {'plans': plans, 'areas': areas, 'subscriptions': subscriptions, 'access_summary': access, 'payment_enabled': False}
    if include_orders:
        result['orders'] = orders
        result['order_history_limit'] = 50
    return result
