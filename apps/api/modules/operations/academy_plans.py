"""Audited catalog edits; order and entitlement snapshots are never rewritten."""
import hashlib
import json

from django.db import transaction
from django.views.decorators.csrf import csrf_protect
from modules.academy.models import AcademyPlan
from .models import OperatorActionEvent
from .security import approved_access, explicit_permission, failure, operator_mfa_verified, operator_sections, private_response

FIELDS = ('title', 'is_active', 'price', 'sale_price', 'duration_days')
MAX_AMOUNT = 1_000_000_000_000_000


def can_edit_academy_plans(actor, sections):
    access = approved_access(actor)
    return 'academy_plans' in sections and bool(access and (
        access.role == 'owner' or explicit_permission(actor, 'academy.change_academyplan')))


def payload(plan):
    result = {key: getattr(plan, key) for key in ('id', 'code', 'kind', 'currency', *FIELDS)}
    result['version'] = hashlib.sha256(json.dumps(result, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return result


@csrf_protect
def academy_plan_detail(request, plan_id):
    if request.method not in ('GET', 'PATCH'):
        return failure('method_not_allowed', 'از فرم ویرایش پلن استفاده کن.', 405)
    actor, sections = operator_sections(request)
    if actor is None or not can_edit_academy_plans(actor, sections):
        return failure('operator_permission_denied', 'مجوز ویرایش پلن رو نداری.', 403 if request.user.is_authenticated else 401)
    if not operator_mfa_verified(request, actor):
        return failure('operator_mfa_unavailable', 'برای ویرایش، ورود دومرحله‌ای رو تأیید کن.', 403)
    with transaction.atomic():
        plan = AcademyPlan.objects.select_for_update().filter(pk=plan_id).first()
        if plan is None:
            return failure('not_found', 'این پلن پیدا نشد.', 404)
        before = payload(plan)
        if request.method == 'GET':
            return private_response(before)
        try:
            data = json.loads(request.body)
            if not isinstance(data, dict) or set(data) != {*FIELDS, 'version', 'reason'}:
                raise ValueError
            if data['version'] != before['version']:
                return failure('revision_conflict', 'این پلن تغییر کرده. اطلاعات تازه رو بگیر و دوباره ویرایش کن.', 409)
            if not isinstance(data['title'], str) or not 1 <= len(data['title'].strip()) <= 160:
                raise ValueError
            if type(data['is_active']) is not bool:
                raise ValueError
            for key, maximum, minimum in [('price', MAX_AMOUNT, 0), ('sale_price', MAX_AMOUNT, 0), ('duration_days', 36500, 1)]:
                value = data[key]
                if value is not None and (type(value) is not int or not minimum <= value <= maximum):
                    raise ValueError
            if data['sale_price'] is not None and (data['price'] is None or data['sale_price'] > data['price']):
                return failure('invalid_input', 'قیمت تخفیف‌خورده باید از قیمت اصلی بیشتر نباشه.', 400)
            if plan.kind == 'free' and (data['price'] not in (None, 0) or data['sale_price'] is not None):
                return failure('invalid_input', 'برای نمونه‌های رایگان، قیمت وارد نکن.', 400)
            if not isinstance(data['reason'], str) or not 3 <= len(data['reason'].strip()) <= 500:
                raise ValueError
        except (ValueError, TypeError, UnicodeError):
            return failure('invalid_input', 'عنوان، مبلغ‌های صحیح، مدت و دلیل تغییر رو بررسی کن.', 400)
        for key in FIELDS:
            setattr(plan, key, data[key].strip() if key == 'title' else data[key])
        after = payload(plan)
        if after['version'] != before['version']:
            plan.save(update_fields=FIELDS)
            OperatorActionEvent.objects.create(actor=actor, event_type='academy_plan_updated', target=f'academy-plan:{plan.pk}',
                before=before['version'][:20], after=after['version'][:20], reason=data['reason'].strip(), details={'before': before, 'after': after})
        return private_response(after)
