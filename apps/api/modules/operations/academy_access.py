"""MFA-protected sample prefixes and explicit, audited Academy grants."""
import hashlib
import json
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_protect

from modules.academy.models import (
    AcademyArea,
    AcademyPlan,
    AcademySubscription,
    AcademyUnit,
    FreeSample,
    SubscriptionArea,
)
from modules.accounts.models import User

from .models import OperatorActionEvent
from .security import (
    approved_access,
    explicit_permission,
    failure,
    operator_mfa_verified,
    operator_sections,
    private_response,
)


def allowed(actor, sections, operation):
    section, permissions = {
        'samples': ('academy_samples', ('academy.add_freesample', 'academy.change_freesample')),
        'grant': ('academy_subscriptions', ('academy.add_academysubscription',)),
        'revoke': ('academy_subscriptions', ('academy.change_academysubscription',)),
    }[operation]
    access = approved_access(actor)
    return section in sections and bool(access and (
        access.role == 'owner' or all(explicit_permission(actor, p) for p in permissions)))


def boundary(request, operation):
    actor, sections = operator_sections(request)
    if actor is None or not allowed(actor, sections, operation):
        return None, failure('operator_permission_denied', 'مجوز این تغییر رو نداری.', 403 if request.user.is_authenticated else 401)
    if not operator_mfa_verified(request, actor):
        return None, failure('operator_mfa_unavailable', 'برای ادامه، ورود دومرحله‌ای رو تأیید کن.', 403)
    return actor, None


def digest(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def body(request, fields):
    data = json.loads(request.body)
    if not isinstance(data, dict) or set(data) != fields:
        raise ValueError
    if not isinstance(data['reason'], str) or not 3 <= len(data['reason'].strip()) <= 500:
        raise ValueError
    data['reason'] = data['reason'].strip()
    return data


def sample_payload(unit):
    cards = list(unit.cards.order_by('order', 'id').values('id', 'title'))
    samples = FreeSample.objects.filter(is_active=True)
    if unit.course.area.kind == 'specialty':
        samples = samples.filter(card__unit__course__area__kind='specialty')
    else:
        samples = samples.filter(card__unit=unit)
    active_ids = sorted(samples.values_list('card_id', flat=True))
    own_ids = {row['id'] for row in cards}
    result = {'unit_id': unit.pk, 'title': unit.title, 'area_kind': unit.course.area.kind,
              'cards': cards, 'active_card_ids': [pk for pk in active_ids if pk in own_ids],
              'other_specialty_cards': len(set(active_ids) - own_ids)}
    result['version'] = digest({**result, 'all_active_ids': active_ids})
    return result


@csrf_protect
def academy_sample_config(request):
    if request.method not in ('GET', 'POST'):
        return failure('method_not_allowed', 'از فرم نمونهٔ رایگان استفاده کن.', 405)
    actor, error = boundary(request, 'samples')
    if error is not None:
        return error
    try:
        if request.method == 'GET' and not request.GET.get('unit_id'):
            query = request.GET.get('q', '').strip()
            if len(query) > 160:
                raise ValueError
            from django.db.models import Q
            units = AcademyUnit.objects.filter(kind='lesson', course__area__is_active=True)
            if query:
                units = units.filter(Q(id__icontains=query) | Q(title__icontains=query))
            return private_response({'units': list(units.order_by('course__order', 'order', 'id').values('id', 'title', 'course_id')[:50])})
        data = body(request, {'unit_id', 'count', 'version', 'reason'}) if request.method == 'POST' else request.GET
        unit_id = data.get('unit_id')
        if not isinstance(unit_id, str) or not 1 <= len(unit_id) <= 80:
            raise ValueError
        with transaction.atomic():
            # Lock all specialty areas in stable order: only one selected specialty lesson
            # can be a sample, even when two operators edit different specialties.
            list(AcademyArea.objects.select_for_update().filter(kind='specialty').order_by('pk'))
            unit = AcademyUnit.objects.select_for_update().select_related('course__area').filter(pk=unit_id, kind='lesson').first()
            if unit is None:
                return failure('not_found', 'شناسهٔ یک درس‌نامه رو وارد کن؛ مرورها نمونهٔ رایگان نمی‌شن.', 404)
            before = sample_payload(unit)
            if request.method == 'GET':
                return private_response(before)
            if data['version'] != before['version']:
                return failure('revision_conflict', 'نمونه‌ها تغییر کردن. اطلاعات تازه رو بگیر و دوباره انتخاب کن.', 409)
            count = data['count']
            if type(count) is not int or not 0 <= count <= len(before['cards']):
                raise ValueError
            selected = [card['id'] for card in before['cards'][:count]]
            if unit.course.area.kind == 'specialty' and count:
                FreeSample.objects.filter(is_active=True, card__unit__course__area__kind='specialty').exclude(card__unit=unit).update(is_active=False, updated_at=timezone.now())
            FreeSample.objects.filter(is_active=True, card__unit=unit).exclude(card_id__in=selected).update(is_active=False, updated_at=timezone.now())
            for card_id in selected:
                FreeSample.objects.update_or_create(card_id=card_id, defaults={'is_active': True})
            after = sample_payload(unit)
            if after['version'] != before['version']:
                OperatorActionEvent.objects.create(actor=actor, event_type='academy_samples_updated', target=f'academy-unit:{unit.pk}',
                    before=before['version'][:20], after=after['version'][:20], reason=data['reason'], details={'before': before, 'after': after})
            return private_response(after)
    except (ValueError, TypeError, UnicodeError):
        return failure('invalid_input', 'شناسهٔ درس‌نامه، تعداد کارت‌های اول و دلیل تغییر رو بررسی کن.', 400)


def subscription_payload(row):
    result = {'id': str(row.pk), 'user_id': str(row.user_id), 'plan_id': row.plan_id,
              'coverage': row.coverage, 'areas': sorted(row.areas.values_list('pk', flat=True)),
              'starts_at': row.starts_at.isoformat(), 'ends_at': row.ends_at.isoformat() if row.ends_at else None,
              'status': row.status, 'order_item_id': row.order_item_id}
    result['version'] = digest(result)
    return result


def date(value):
    if not isinstance(value, str) or len(value) > 40:
        raise ValueError
    result = parse_datetime(value)
    if result is None or timezone.is_naive(result):
        raise ValueError
    return result.astimezone(timezone.get_current_timezone())


@csrf_protect
def academy_grant(request):
    if request.method not in ('GET', 'POST'):
        return failure('method_not_allowed', 'از فرم اعطای دسترسی استفاده کن.', 405)
    actor, error = boundary(request, 'grant')
    if error is not None:
        return error
    if request.method == 'GET':
        return private_response({
            'plans': list(AcademyPlan.objects.filter(is_active=True).exclude(kind='free').order_by('order', 'id').values('id', 'title', 'kind')),
            'areas': list(AcademyArea.objects.filter(is_active=True, kind='specialty').order_by('order', 'id').values('id', 'title')),
        })
    try:
        data = body(request, {'request_id', 'user_id', 'plan_id', 'areas', 'starts_at', 'ends_at', 'reason', 'confirm'})
        request_id, user_id = UUID(data['request_id']), UUID(data['user_id'])
        if data['confirm'] is not True or type(data['plan_id']) is not int:
            raise ValueError
        areas = data['areas']
        if not isinstance(areas, list) or len(areas) > 100 or any(not isinstance(pk, str) or len(pk) > 80 for pk in areas) or len(set(areas)) != len(areas):
            raise ValueError
        starts = date(data['starts_at'])
        ends = date(data['ends_at']) if data['ends_at'] is not None else None
        if ends is not None and ends <= starts:
            raise ValueError
        normalized = {**data, 'request_id': str(request_id), 'user_id': str(user_id), 'areas': sorted(areas),
                      'starts_at': starts.isoformat(), 'ends_at': ends.isoformat() if ends else None}
        fingerprint = digest(normalized)
        with transaction.atomic():
            # Serialize retries per recipient; UUID uniqueness covers conflicting recipients.
            user = User.objects.select_for_update().filter(pk=user_id, is_active=True).first()
            if user is None:
                return failure('not_found', 'حساب فعال با این شناسه پیدا نشد.', 404)
            event = OperatorActionEvent.objects.filter(pk=request_id).first()
            if event is not None:
                if event.actor_id != actor.pk or event.event_type != 'academy_access_granted' or event.details.get('request_hash') != fingerprint:
                    return failure('idempotency_conflict', 'این شناسهٔ درخواست برای تغییر دیگه‌ای ثبت شده.', 409)
                row = AcademySubscription.objects.get(pk=request_id)
                return private_response(subscription_payload(row))
            plan = AcademyPlan.objects.select_for_update().filter(pk=data['plan_id'], is_active=True).exclude(kind='free').first()
            if plan is None:
                return failure('invalid_input', 'یک پلن ویژهٔ فعال انتخاب کن.', 400)
            if (plan.kind != 'specialty' and areas) or (plan.kind == 'specialty' and (not areas or AcademyArea.objects.filter(pk__in=areas, kind='specialty', is_active=True).count() != len(areas))):
                return failure('invalid_input', 'گرایش‌ها باید با نوع پوشش پلن مطابقت داشته باشن.', 400)
            row = AcademySubscription(id=request_id, user=user, plan=plan, coverage=plan.kind, starts_at=starts, ends_at=ends, granted_by=actor, reason=data['reason'])
            row.full_clean()
            row.save(force_insert=True)
            SubscriptionArea.objects.bulk_create([SubscriptionArea(subscription=row, area_id=pk) for pk in sorted(areas)])
            after = subscription_payload(row)
            OperatorActionEvent.objects.create(id=request_id, actor=actor, event_type='academy_access_granted',
                target=f'academy-subscription:{row.pk}', before='', after='active', reason=data['reason'],
                details={'request_hash': fingerprint, 'after': after})
            return private_response(after, 201)
    except IntegrityError:
        return failure('idempotency_conflict', 'این شناسهٔ درخواست قبلاً ثبت شده. اطلاعات رو تازه کن.', 409)
    except (ValueError, TypeError, AttributeError, UnicodeError, ValidationError):
        return failure('invalid_input', 'شناسه‌ها، زمان شروع و پایان، گرایش‌ها و دلیل رو بررسی کن.', 400)


@csrf_protect
def academy_subscription_detail(request, subscription_id):
    if request.method not in ('GET', 'POST'):
        return failure('method_not_allowed', 'از فرم لغو دسترسی استفاده کن.', 405)
    actor, error = boundary(request, 'revoke')
    if error is not None:
        return error
    with transaction.atomic():
        row = AcademySubscription.objects.select_for_update().filter(pk=subscription_id).first()
        if row is None:
            return failure('not_found', 'این اشتراک پیدا نشد.', 404)
        before = subscription_payload(row)
        if request.method == 'GET':
            return private_response(before)
        try:
            data = body(request, {'version', 'reason', 'confirm'})
            if data['confirm'] is not True:
                raise ValueError
        except (ValueError, TypeError, UnicodeError):
            return failure('invalid_input', 'دلیل لغو و تأیید تغییر رو وارد کن.', 400)
        if data['version'] != before['version']:
            return failure('revision_conflict', 'این اشتراک تغییر کرده. اطلاعات تازه رو بگیر.', 409)
        if row.status == 'active':
            row.status = 'revoked'
            row.save(update_fields=['status'])
            OperatorActionEvent.objects.create(actor=actor, event_type='academy_access_revoked',
                target=f'academy-subscription:{row.pk}', before='active', after='revoked', reason=data['reason'],
                details={'before': before, 'after': subscription_payload(row)})
        return private_response(subscription_payload(row))
