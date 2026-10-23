"""One server-side calculation for previews and immutable order snapshots."""
from django.utils import timezone
from .models import AcademyArea, AcademyCoupon, AcademyPlan


class PricingError(ValueError):
    pass


def selection(data):
    if not isinstance(data, dict) or set(data) - {'plan_id', 'area_ids', 'coupon_code', 'request_id'}:
        raise PricingError('انتخاب اشتراکت معتبر نیست.')
    try:
        plan = AcademyPlan.objects.get(pk=data.get('plan_id'), is_active=True)
    except (ValueError, TypeError, AcademyPlan.DoesNotExist):
        raise PricingError('این اشتراک پیدا نشد.')
    ids = data.get('area_ids')
    code = data.get('coupon_code', '')
    if not isinstance(code, str) or len(code) > 48:
        raise PricingError('کد تخفیف رو بررسی کن.')
    if not isinstance(ids, list) or len(ids) > 20 or not all(isinstance(x, str) for x in ids) or len(set(ids)) != len(ids) or plan.kind == 'free':
        raise PricingError('گرایش‌های انتخابی رو بررسی کن.')
    areas = list(AcademyArea.objects.filter(id__in=ids, is_active=True, kind='specialty'))
    if (plan.kind == 'specialty' and (not areas or len(areas) != len(ids))) or (plan.kind != 'specialty' and ids):
        raise PricingError('یک یا چند گرایش معتبر انتخاب کن.')
    return plan, areas, code.strip().upper()


def quote(plan, areas, code=''):
    quantity = len(areas) if plan.kind == 'specialty' else 1
    original = plan.price
    unit = plan.sale_price if plan.sale_price is not None else original
    # Reject invalid settings even if a caller bypassed model validation.
    if unit is not None and (original is None or unit > original):
        raise PricingError('قیمت این اشتراک نیاز به بررسی داره.')
    coupon = None
    if code:
        coupon = AcademyCoupon.objects.filter(code__iexact=code, is_active=True).first()
        now = timezone.now()
        if not coupon or not 1 <= coupon.percent <= 100 or (coupon.starts_at and coupon.starts_at > now) or (coupon.ends_at and coupon.ends_at <= now) or (coupon.plans.exists() and not coupon.plans.filter(pk=plan.pk).exists()):
            raise PricingError('این کد برای انتخابت فعال نیست. کد یا اشتراک رو بررسی کن.')
        if unit is None:
            raise PricingError('بعد از مشخص‌شدن قیمت، می‌تونی کد تخفیف رو اعمال کنی.')
    subtotal = original * quantity if original is not None else None
    after_sale = unit * quantity if unit is not None else None
    coupon_discount = after_sale * coupon.percent // 100 if coupon else 0
    total = after_sale - coupon_discount if after_sale is not None else None
    return {
        'quantity': quantity, 'currency': plan.currency, 'original_unit_price': original,
        'unit_price': unit, 'subtotal': subtotal,
        'sale_discount': subtotal - after_sale if subtotal is not None else None,
        'coupon_discount': coupon_discount, 'discount_amount': subtotal - total if subtotal is not None else None,
        'total': total, 'coupon_code': coupon.code if coupon else '',
        'duration_days': plan.duration_days,
    }, coupon
