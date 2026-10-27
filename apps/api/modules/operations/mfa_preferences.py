"""Owner-scoped opt-out for explicitly enabled local testing; never production."""
import json

from django.db import transaction
from django.utils import timezone
from django.views.decorators.csrf import csrf_protect

from modules.accounts.auth_views import _rate_allowed

from .mfa import _counter
from .models import OperatorAccess, OperatorActionEvent, OperatorFactor, OperatorProof
from .security import (
    development_mfa_optional,
    failure,
    operator_sections,
    private_response,
)


def payload(access):
    optional = development_mfa_optional()
    return {'enabled': access.mfa_enabled if optional else True, 'can_disable': optional,
            'revision': access.revision, 'enrolled': OperatorFactor.objects.filter(user=access.user, enabled_at__isnull=False).exists()}


@csrf_protect
def operator_mfa_preferences(request):
    actor, sections = operator_sections(request)
    if actor is None or not sections:
        return failure('operator_permission_denied', 'این تنظیم به حساب مدیریت مربوطه.', 403 if request.user.is_authenticated else 401)
    if request.method not in ('GET', 'PATCH'):
        return failure('method_not_allowed', 'از تنظیمات امنیت حساب استفاده کن.', 405)
    if request.method == 'GET':
        return private_response(payload(OperatorAccess.objects.get(user=actor)))
    allowed, retry = _rate_allowed(request, 'operator-mfa', str(actor.pk), ip_limit=30, email_limit=8, window_seconds=300)
    if not allowed:
        response = failure('rate_limited', 'چند بار تلاش کردی؛ کمی بعد دوباره امتحان کن.', 429)
        response['Retry-After'] = str(retry)
        return response
    try:
        data = json.loads(request.body)
        if (not isinstance(data, dict) or set(data) != {'enabled', 'revision', 'password', 'code', 'confirm'}
                or type(data['enabled']) is not bool or type(data['revision']) is not int or data['revision'] < 1
                or data['confirm'] is not True or not isinstance(data['password'], str)
                or len(data['password']) > 4096 or not isinstance(data['code'], str) or len(data['code']) > 12):
            raise ValueError
    except (ValueError, TypeError, UnicodeError):
        return failure('invalid_input', 'انتخابت، گذرواژه و تأیید تغییر رو بررسی کن.', 400)
    with transaction.atomic():
        actor = type(actor).objects.select_for_update().get(pk=actor.pk)
        access = OperatorAccess.objects.select_for_update().get(user=actor)
        current_actor, current_sections = operator_sections(request)
        if current_actor is None or not current_sections:
            return failure('operator_permission_denied', 'دسترسی مدیریت این حساب تغییر کرده.', 403)
        if access.must_change_password or not actor.has_usable_password() or not actor.check_password(data['password']):
            return failure('operator_reauthentication_failed', 'گذرواژهٔ فعلی رو بررسی کن.', 403)
        if access.revision != data['revision']:
            return failure('revision_conflict', 'تنظیمات تغییر کرده؛ اطلاعات تازه رو بگیر.', 409)
        if not data['enabled'] and not development_mfa_optional():
            return failure('operator_mfa_required', 'ورود دومرحله‌ای در این محیط الزامیه.', 403)
        if access.mfa_enabled != data['enabled']:
            factor = OperatorFactor.objects.select_for_update().filter(user=actor, enabled_at__isnull=False).first()
            if not data['enabled'] and factor:
                counter = _counter(factor, data['code'], timezone.now())
                if counter is None:
                    return failure('operator_reauthentication_failed', 'کد تازهٔ Authenticator رو وارد کن.', 403)
                factor.last_counter = counter
                factor.save(update_fields=['last_counter'])
            before = access.mfa_enabled
            access.mfa_enabled = data['enabled']
            access.revision += 1
            access.save(update_fields=['mfa_enabled', 'revision', 'updated_at'])
            # Re-enabling requires fresh verification in every browser.
            OperatorProof.objects.filter(factor__user=actor).delete()
            OperatorActionEvent.objects.create(actor=actor, event_type='operator_access_changed', target=f'operator:{actor.pk}',
                before=str(before), after=str(access.mfa_enabled), reason='Account MFA preference changed in local development',
                details={'setting': 'mfa_enabled', 'before': before, 'after': access.mfa_enabled, 'revision': access.revision})
        return private_response(payload(access))
