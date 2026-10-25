import mimetypes
import uuid
from pathlib import Path
from django.db import transaction, IntegrityError
from django.http import FileResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from .access import AcademyAccess
from .projection import curriculum
from .content import ROOT
from .models import AcademyPlan, AcademyArea, AcademyOrder, AcademyOrderItem, AcademyOrderArea, AcademySubscription
from .pricing import selection, quote, PricingError
from .account_summary import plans_payload


def private(response):
    response['Cache-Control'] = 'private, no-store'
    response['Vary'] = 'Cookie'
    return response


@api_view(['GET'])
@permission_classes([AllowAny])
def catalog(request):
    return private(Response(AcademyAccess(request.user).catalog()))


@api_view(['GET'])
@permission_classes([AllowAny])
def unit_content(request, unit_id):
    unit = curriculum()[1].get(unit_id)
    if not unit:
        return Response({'message': 'این درس پیدا نشد.'}, status=404)
    # Locked shells deliberately return metadata for an accessible purchase view.
    return private(Response(AcademyAccess(request.user).project_unit(unit)))


@api_view(['GET'])
@permission_classes([AllowAny])
def media(request, unit_id, filename):
    if Path(filename).name != filename:
        return Response(status=404)
    unit = curriculum()[1].get(unit_id)
    if not unit:
        return Response(status=404)
    projected = AcademyAccess(request.user).project_unit(unit)
    assets = projected.get('media_plan', {}).get('assets', []) + projected.get('reference_visuals', [])
    allowed = {Path(str(asset[key])).name for asset in assets for key in ('asset_ref', 'mobile_asset_ref', 'download_ref') if asset.get(key)}
    if filename not in allowed:
        return private(Response({'message': 'برای دیدن این تصویر، اشتراک مربوط رو فعال کن.', 'code': 'academy_access_required'}, status=403))
    path = None
    refs = [str(asset[key]) for asset in assets for key in ('asset_ref', 'mobile_asset_ref', 'download_ref') if asset.get(key) and Path(str(asset[key])).name == filename]
    for ref in refs:
        candidate = (ROOT / ref).resolve()
        if candidate.is_relative_to(ROOT.resolve()) and candidate.is_file():
            path = candidate
            break
    if path is None:
        return Response(status=404)
    return private(FileResponse(path.open('rb'), content_type=mimetypes.guess_type(filename)[0] or 'application/octet-stream'))


@api_view(['GET'])
@permission_classes([AllowAny])
def plans(request):
    return private(Response(plans_payload(request.user)))


@api_view(['POST'])
@permission_classes([AllowAny])
def price_quote(request):
    try:
        plan, areas, code = selection(request.data)
        pricing, _ = quote(plan, areas, code)
    except PricingError as error:
        return private(Response({'message': str(error)}, status=400))
    return private(Response(pricing))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def order_request(request):
    data = request.data
    if not isinstance(data, dict) or not {'request_id', 'plan_id', 'area_ids'} <= set(data) or set(data) - {'request_id', 'plan_id', 'area_ids', 'coupon_code'}:
        return Response({'message': 'انتخاب اشتراکت معتبر نیست.'}, status=400)
    try:
        request_id = uuid.UUID(str(data['request_id']))
        plan, areas, code = selection(data)
    except (ValueError, TypeError) as error:
        if isinstance(error, PricingError):
            return private(Response({'message': str(error)}, status=400))
        return Response({'message': 'این اشتراک پیدا نشد.'}, status=400)
    area_ids = data['area_ids']
    if not isinstance(area_ids, list) or len(area_ids) > 20 or not all(isinstance(x, str) for x in area_ids) or len(set(area_ids)) != len(area_ids) or plan.kind == 'free':
        return Response({'message': 'گرایش‌های انتخابی رو بررسی کن.'}, status=400)
    areas = list(AcademyArea.objects.filter(id__in=area_ids, is_active=True, kind='specialty'))
    if (plan.kind == 'specialty' and (not areas or len(areas) != len(area_ids))) or (plan.kind != 'specialty' and area_ids):
        return Response({'message': 'یک یا چند گرایش معتبر انتخاب کن.'}, status=400)
    existing = AcademyOrder.objects.filter(request_id=request_id).first()
    if existing:
        item = existing.items.first()
        if existing.user_id != request.user.pk or not item or item.plan_id != plan.pk or item.coupon_code != code or set(item.areas.values_list('id', flat=True)) != set(area_ids):
            return Response({'message': 'این درخواست با انتخاب دیگه‌ای ثبت شده.'}, status=409)
        return private(Response({'id': str(existing.pk), 'status': existing.status}))
    if AcademyOrder.objects.filter(user=request.user, created_at__gte=timezone.now()-timezone.timedelta(hours=1)).count() >= 15:
        return Response({'message': 'چند درخواست ثبت کردی؛ کمی بعد دوباره تلاش کن.'}, status=429)
    try:
        pricing, coupon = quote(plan, areas, code)
    except PricingError as error:
        return private(Response({'message': str(error)}, status=400))
    try:
        with transaction.atomic():
            order = AcademyOrder.objects.create(user=request.user, request_id=request_id)
            item = AcademyOrderItem.objects.create(order=order, plan=plan, plan_title=plan.title, plan_kind=plan.kind, unit_price=pricing['unit_price'], original_unit_price=pricing['original_unit_price'], subtotal=pricing['subtotal'], discount_amount=pricing['discount_amount'], total=pricing['total'], coupon=coupon, coupon_code=pricing['coupon_code'], currency=plan.currency, duration_days=plan.duration_days)
            AcademyOrderArea.objects.bulk_create([AcademyOrderArea(item=item, area=area) for area in areas])
    except IntegrityError:
        return Response({'message': 'درخواست هم‌زمان ثبت شد؛ دوباره تلاش کن.'}, status=409)
    return private(Response({'id': str(order.pk), 'status': order.status, 'message': 'درخواستت ثبت شد. قیمت و پرداخت هنوز فعال نیست و اشتراکی فعال نشده.'}, status=201))
