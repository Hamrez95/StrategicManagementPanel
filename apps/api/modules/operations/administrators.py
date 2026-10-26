"""Owner-only administrator approval; no public bootstrap or password defaults."""
import json
import uuid

from django.conf import settings
from django.contrib.auth import authenticate, login, update_session_auth_hash
from django.contrib.auth.models import Permission
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.views.decorators.csrf import csrf_protect

from modules.accounts.auth_views import _rate_allowed
from modules.accounts.models import User

from .models import OperatorAccess, OperatorActionEvent, OperatorProof
from .security import (
    SECTIONS,
    approved_access,
    failure,
    operator_mfa_verified,
    operator_sections,
    private_response,
)


def grantable_permissions():
    return Permission.objects.filter(
        content_type__app_label='accounts', content_type__model='user',
        codename__in=[f'operator_view_{s}' for s in SECTIONS] +
        ['operator_manage_accounts', 'operator_view_identity', 'operator_triage_feedback'],
    ) | Permission.objects.filter(content_type__app_label='workspaces', codename__in=[
        'add_managementsubscription', 'change_managementsubscription',
    ]) | Permission.objects.filter(content_type__app_label='academy', codename__in=[
        'change_academyplan', 'add_freesample', 'change_freesample',
        'add_academysubscription', 'change_academysubscription',
    ])


@csrf_protect
def operator_login(request):
    if request.method != 'POST':
        return failure('method_not_allowed', 'از فرم ورود استفاده کن.', 405)
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict) or set(data) != {'email', 'password'}:
            raise ValueError
        email, password = data['email'], data['password']
        if not isinstance(email, str) or not isinstance(password, str) or len(email) > 254 or len(password) > 1024:
            raise ValueError
        email = email.strip().lower()
        allowed, retry = _rate_allowed(request, 'operator-login', email, ip_limit=25, email_limit=6, window_seconds=900)
        if not allowed:
            response = failure('rate_limited', 'کمی بعد دوباره تلاش کن.', 429)
            response['Retry-After'] = str(retry)
            return response
        actor = authenticate(request, username=email, password=password)
        if not actor or not actor.is_staff or not actor.email_verified_at or not approved_access(actor):
            return failure('invalid_credentials', 'اطلاعات ورود یا دسترسی مدیریت تأیید نشد.', 401)
        login(request, actor)
        return private_response({'authenticated': True})
    except (ValueError, TypeError, UnicodeError):
        return failure('invalid_input', 'ایمیل و گذرواژه رو بررسی کن.', 400)


@csrf_protect
def operator_password(request):
    actor, sections = operator_sections(request)
    if actor is None or not sections:
        return failure('operator_permission_denied', 'دسترسی مدیریت تأیید نشد.', 403)
    if request.method != 'POST':
        return failure('method_not_allowed', 'از فرم تغییر گذرواژه استفاده کن.', 405)
    allowed, retry = _rate_allowed(request, 'operator-password', str(actor.pk), ip_limit=25, email_limit=6, window_seconds=900)
    if not allowed:
        response = failure('rate_limited', 'کمی بعد دوباره تلاش کن.', 429)
        response['Retry-After'] = str(retry)
        return response
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict) or set(data) != {'current_password', 'new_password', 'confirmation'}:
            raise ValueError
        if any(not isinstance(v, str) or len(v) > 1024 for v in data.values()):
            raise ValueError
        with transaction.atomic():
            actor = User.objects.select_for_update().get(pk=actor.pk)
            access = OperatorAccess.objects.select_for_update().get(user=actor, is_active=True)
            if not actor.check_password(data['current_password']):
                return failure('invalid_credentials', 'گذرواژهٔ فعلی درست نیست.', 400)
            if not access.must_change_password and not operator_mfa_verified(request, actor):
                return failure('operator_mfa_unavailable', 'اول ورود دومرحله‌ای رو تأیید کن.', 403)
            if data['new_password'] != data['confirmation'] or actor.check_password(data['new_password']):
                raise ValueError
            validate_password(data['new_password'], actor)
            actor.set_password(data['new_password'])
            actor.email_verification_nonce = uuid.uuid4()
            actor.save(update_fields=['password', 'email_verification_nonce'])
            access.must_change_password = False
            access.revision += 1
            access.save(update_fields=['must_change_password', 'revision', 'updated_at'])
            OperatorProof.objects.filter(factor__user=actor).delete()
            OperatorActionEvent.objects.create(actor=actor, event_type='operator_password_changed',
                                               target=str(actor.pk), before='previous', after='changed')
        update_session_auth_hash(request, actor)
        return private_response({'changed': True})
    except ValidationError:
        return failure('invalid_password', 'یک گذرواژهٔ تازه با حداقل ۱۲ نویسه انتخاب کن؛ فقط عدد یا یک عبارت رایج نباشه.', 400)
    except (ValueError, TypeError, UnicodeError):
        return failure('invalid_input', 'گذرواژهٔ جدید و تکرارش باید یکی باشن و با قبلی فرق داشته باشن.', 400)


@csrf_protect
def operator_team(request):
    actor, sections = operator_sections(request)
    access = approved_access(actor) if actor else None
    if not access or access.role != 'owner' or not sections:
        return failure('operator_permission_denied', 'این بخش برای مالک سرویسه.', 403)
    if not operator_mfa_verified(request, actor):
        return failure('operator_mfa_unavailable', 'اول ورود دومرحله‌ای رو تأیید کن.', 403)
    permissions = grantable_permissions()
    if request.method == 'GET':
        return private_response({
            'permissions': sorted(permissions.values_list('codename', flat=True)),
            'results': [{
                'id': str(row.user_id), 'email': row.user.email, 'role': row.role,
                'is_active': row.is_active, 'revision': row.revision,
                'permissions': sorted(row.user.user_permissions.filter(pk__in=permissions).values_list('codename', flat=True)),
            } for row in OperatorAccess.objects.select_related('user').prefetch_related('user__user_permissions').order_by('user_id')],
        })
    if request.method != 'POST':
        return failure('method_not_allowed', 'از فرم مدیریت مدیران استفاده کن.', 405)
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict) or set(data) != {'email', 'permissions', 'is_active', 'revision', 'reason', 'current_password'}:
            raise ValueError
        if (not isinstance(data['email'], str) or not isinstance(data['reason'], str)
                or not 3 <= len(data['reason'].strip()) <= 500 or not isinstance(data['current_password'], str)
                or len(data['current_password']) > 1024 or not isinstance(data['is_active'], bool)
                or type(data['revision']) is not int or not isinstance(data['permissions'], list)
                or len(data['permissions']) > 30 or any(not isinstance(p, str) for p in data['permissions'])):
            raise ValueError
        codes = set(data['permissions'])
        if not codes.issubset(set(permissions.values_list('codename', flat=True))) or not any(p.startswith('operator_view_') for p in codes):
            raise ValueError
        allowed, _retry = _rate_allowed(request, 'operator-team', str(actor.pk), ip_limit=40, email_limit=12, window_seconds=900)
        if not allowed:
            return failure('rate_limited', 'کمی بعد دوباره تلاش کن.', 429)
        with transaction.atomic():
            actor = User.objects.select_for_update().get(pk=actor.pk)
            if not actor.check_password(data['current_password']):
                return failure('invalid_credentials', 'گذرواژهٔ فعلی درست نیست.', 400)
            user = User.objects.select_for_update().filter(email__iexact=data['email'].strip(), is_active=True,
                                                          email_verified_at__isnull=False).first()
            if not user:
                return failure('invalid_input', 'اول این فرد باید حساب بسازه و ایمیلش رو تأیید کنه.', 400)
            row = OperatorAccess.objects.select_for_update().filter(user=user).first()
            if data['is_active'] and user.groups.filter(permissions__in=permissions).exists():
                return failure('group_managed_access', 'مجوزهای این حساب از گروه میاد؛ برای جلوگیری از دسترسی اضافه، از یک حساب مستقل استفاده کن.', 400)
            if user.pk == actor.pk or user.email.lower() in settings.OPERATOR_OWNER_EMAILS or (row and row.role == 'owner'):
                return failure('protected_owner', 'حساب‌های مالک از این بخش تغییر نمی‌کنن.', 403)
            if (row.revision if row else 0) != data['revision']:
                return failure('revision_conflict', 'اطلاعات تغییر کرده؛ فهرست رو تازه کن.', 409)
            if not row:
                row = OperatorAccess(user=user, role='admin', revision=0)
            previous = row.revision
            row.is_active = data['is_active']
            row.approved_by = actor
            row.revision += 1
            row.save()
            user.is_staff = True
            user.save(update_fields=['is_staff'])
            user.user_permissions.remove(*permissions)
            user.user_permissions.add(*permissions.filter(codename__in=codes))
            OperatorProof.objects.filter(factor__user=user).delete()
            OperatorActionEvent.objects.create(actor=actor, event_type='operator_access_changed', target=str(user.pk),
                                               before=str(previous), after=str(row.revision), reason=data['reason'].strip())
        return private_response({'saved': True})
    except (ValueError, TypeError, UnicodeError):
        return failure('invalid_input', 'ایمیل، مجوزها، دلیل و نسخهٔ اطلاعات رو بررسی کن.', 400)
