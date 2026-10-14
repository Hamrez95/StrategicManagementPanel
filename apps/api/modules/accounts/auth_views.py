import json
import logging
import math
import uuid
from datetime import timedelta
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.http import HttpResponse, JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.crypto import salted_hmac
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .models import AccountPreferences, AuthRateLimit, User
from modules.core.mailer import deliver_email
from modules.workspaces.services import workspace_session_payload

logger = logging.getLogger(__name__)
EMAIL_VERIFICATION_SALT = 'stratino.email-verification'
EMAIL_CHANGE_SALT = 'stratino.email-change'
GENERIC_DELIVERY_MESSAGE = (
    'اگر این نشانی به حسابی نیازمند اقدام وصل باشد، چند دقیقه دیگر صندوق ایمیل و پوشه هرزنامه را بررسی کنید.'
)
GENERIC_EMAIL_CHANGE_MESSAGE = 'اگر این نشانی قابل افزودن به حساب باشد، پیوند تأیید به همان نشانی می‌رسد.'
INVALID_LOGIN_MESSAGE = 'ایمیل یا گذرواژه درست نیست.'
INVALID_RESET_MESSAGE = 'پیوند بازیابی معتبر نیست یا منقضی شده است. درخواست تازه‌ای بفرستید.'
PASSWORD_MESSAGES = {
    'password_too_short': 'گذرواژه باید دست‌کم ۱۲ نویسه باشد.',
    'password_too_common': 'این گذرواژه بیش از حد رایج است. گذرواژه دیگری انتخاب کنید.',
    'password_entirely_numeric': 'گذرواژه نمی‌تواند فقط از عدد تشکیل شده باشد.',
    'password_too_similar': 'گذرواژه نباید شبیه اطلاعات حساب شما باشد.',
}


def _response(payload, status=200, headers=None):
    return JsonResponse(payload, status=status, headers=headers)


def _error(message, status, code, fields=None, headers=None):
    return _response(
        {'code': code, 'message': message, 'fields': fields or {}},
        status=status,
        headers=headers,
    )


def _json_body(request):
    try:
        value = json.loads(request.body or b'{}')
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _normalize_email(value):
    if not isinstance(value, str):
        return ''
    return User.objects.normalize_email(value.strip()).casefold()


def _email_error(email):
    if not email or len(email) > 254:
        return 'ایمیل معتبر وارد کنید.'
    try:
        validate_email(email)
    except ValidationError:
        return 'ایمیل معتبر وارد کنید.'
    return None


def _password_errors(password, user):
    if not isinstance(password, str) or not password:
        return ['گذرواژه را وارد کنید.']
    try:
        validate_password(password, user)
    except ValidationError as error:
        return [PASSWORD_MESSAGES.get(item.code, 'این گذرواژه قابل استفاده نیست.') for item in error.error_list]
    return []


def _throttle_bucket(bucket_name, limit, window_seconds, now):
    digest = salted_hmac('stratino.auth-rate-limit', bucket_name).hexdigest()
    with transaction.atomic():
        AuthRateLimit.objects.get_or_create(
            bucket_hash=digest,
            defaults={'window_started_at': now, 'attempts': 0},
        )
        bucket = AuthRateLimit.objects.select_for_update().get(bucket_hash=digest)
        window = timedelta(seconds=window_seconds)
        if bucket.window_started_at <= now - window:
            bucket.window_started_at = now
            bucket.attempts = 1
            bucket.save(update_fields=['window_started_at', 'attempts'])
            return True, 0
        if bucket.attempts >= limit:
            remaining = (bucket.window_started_at + window - now).total_seconds()
            return False, max(1, math.ceil(remaining))
        bucket.attempts += 1
        bucket.save(update_fields=['attempts'])
        return True, 0


def _rate_allowed(request, purpose, email='', *, ip_limit, email_limit, window_seconds):
    now = timezone.now()
    ip_address = request.META.get('REMOTE_ADDR') or 'unknown'
    ip_allowed, retry_after = _throttle_bucket(
        f'{purpose}:ip:{ip_address}', ip_limit, window_seconds, now
    )
    if not ip_allowed or not email:
        return ip_allowed, retry_after
    return _throttle_bucket(f'{purpose}:email:{email[:254]}', email_limit, window_seconds, now)


def _limited_response(retry_after):
    return _error(
        'درخواست‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید.',
        429,
        'rate_limited',
        headers={'Retry-After': str(retry_after)},
    )


def _deliver_auth_email(subject, body, recipient):
    return deliver_email(subject, body, recipient, purpose='Account')


def _send_verification(user):
    user.email_verification_nonce = uuid.uuid4()
    user.save(update_fields=['email_verification_nonce'])
    token = signing.dumps(
        {'user_id': str(user.pk), 'nonce': str(user.email_verification_nonce)},
        salt=EMAIL_VERIFICATION_SALT,
    )
    url = f'{settings.STRATINO_PUBLIC_URL}/account/verify#token={quote(token, safe="")}'
    _deliver_auth_email(
        'تأیید نشانی ایمیل استراتینو',
        f'برای تأیید نشانی ایمیل خود این پیوند را باز کنید:\n\n{url}\n\n'
        f'این پیوند تا ۲۴ ساعت معتبر است. اگر شما این درخواست را ثبت نکرده‌اید، این پیام را نادیده بگیرید.',
        user.email,
    )


def _send_password_reset(user):
    token = default_token_generator.make_token(user)
    uid = quote(str(user.pk), safe='')
    url = (
        f'{settings.STRATINO_PUBLIC_URL}/account/reset-password'
        f'#uid={uid}&token={quote(token, safe="")}'
    )
    _deliver_auth_email(
        'بازیابی گذرواژه استراتینو',
        f'برای انتخاب گذرواژه تازه این پیوند را باز کنید:\n\n{url}\n\n'
        f'این پیوند تا یک ساعت معتبر است. اگر شما این درخواست را ثبت نکرده‌اید، این پیام را نادیده بگیرید.',
        user.email,
    )


@ensure_csrf_cookie
@require_GET
def csrf_cookie(request):
    get_token(request)
    return _response({'csrf': True})


@require_GET
def session_view(request):
    user = request.user
    if not user.is_authenticated or not user.email_verified_at:
        return _error('برای ادامه وارد حساب شوید.', 401, 'not_authenticated')
    return _response(
        {
            'authenticated': True,
            'user': {
                'id': str(user.pk),
                'name': user.display_name or user.get_full_name() or user.email,
                'is_staff': bool(user.is_staff),
            },
            'workspaces': workspace_session_payload(user),
        }
    )


@require_POST
def signup(request):
    body = _json_body(request)
    if body is None:
        return _error('درخواست قابل خواندن نیست.', 400, 'invalid_json')
    email = _normalize_email(body.get('email'))
    allowed, retry = _rate_allowed(
        request, 'signup', email, ip_limit=8, email_limit=3, window_seconds=3600
    )
    if not allowed:
        return _limited_response(retry)
    email_error = _email_error(email)
    if email_error:
        return _error(email_error, 400, 'validation_error', {'email': [email_error]})
    password = body.get('password')
    temporary_user = User(email=email)
    password_errors = _password_errors(password, temporary_user)
    if password_errors:
        return _error(password_errors[0], 400, 'validation_error', {'password': password_errors})

    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        try:
            with transaction.atomic():
                user = User.objects.create_user(email=email, password=password, is_active=False)
        except IntegrityError:
            user = User.objects.filter(email__iexact=email).first()
    if user and not user.is_active and user.email_verified_at is None:
        _send_verification(user)
    return _response({'message': GENERIC_DELIVERY_MESSAGE}, status=202)


@require_POST
def verify_email(request):
    allowed, retry = _rate_allowed(
        request, 'verify-email', ip_limit=30, email_limit=1, window_seconds=900
    )
    if not allowed:
        return _limited_response(retry)
    body = _json_body(request)
    token = body.get('token') if body else None
    if not isinstance(token, str) or not token or len(token) > 2048:
        return _error('پیوند تأیید معتبر نیست یا منقضی شده است.', 400, 'invalid_token')
    try:
        payload = signing.loads(
            token,
            salt=EMAIL_VERIFICATION_SALT,
            max_age=settings.EMAIL_VERIFICATION_TIMEOUT,
        )
        if not isinstance(payload, dict):
            raise signing.BadSignature('invalid payload')
        user_id = payload.get('user_id')
        nonce = payload.get('nonce')
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=user_id)
            if str(user.email_verification_nonce) != nonce or user.email_verified_at is not None:
                raise signing.BadSignature('invalid or used token')
            user.is_active = True
            user.email_verified_at = timezone.now()
            user.email_verification_nonce = uuid.uuid4()
            user.save(update_fields=['is_active', 'email_verified_at', 'email_verification_nonce'])
    except (
        signing.BadSignature,
        signing.SignatureExpired,
        User.DoesNotExist,
        ValidationError,
        TypeError,
        ValueError,
    ):
        return _error('پیوند تأیید معتبر نیست یا منقضی شده است.', 400, 'invalid_token')
    return _response({'message': 'نشانی ایمیل تأیید شد. حالا می‌توانید وارد شوید.'})


@require_POST
def resend_verification(request):
    body = _json_body(request)
    if body is None:
        return _error('درخواست قابل خواندن نیست.', 400, 'invalid_json')
    email = _normalize_email(body.get('email'))
    allowed, retry = _rate_allowed(
        request, 'verify-resend', email, ip_limit=12, email_limit=3, window_seconds=3600
    )
    if not allowed:
        return _limited_response(retry)
    email_error = _email_error(email)
    if email_error:
        return _error(email_error, 400, 'validation_error', {'email': [email_error]})
    user = User.objects.filter(
        email__iexact=email,
        is_active=False,
        email_verified_at__isnull=True,
    ).first()
    if user:
        _send_verification(user)
    return _response({'message': GENERIC_DELIVERY_MESSAGE}, status=202)


@require_POST
def login_view(request):
    body = _json_body(request)
    if body is None:
        return _error('درخواست قابل خواندن نیست.', 400, 'invalid_json')
    email = _normalize_email(body.get('email'))
    allowed, retry = _rate_allowed(
        request, 'login', email, ip_limit=30, email_limit=8, window_seconds=900
    )
    if not allowed:
        return _limited_response(retry)
    password = body.get('password')
    if not email or not isinstance(password, str) or len(password) > 1024:
        return _error(INVALID_LOGIN_MESSAGE, 401, 'invalid_credentials')
    user = authenticate(request, username=email, password=password)
    if user is None or not user.email_verified_at:
        return _error(INVALID_LOGIN_MESSAGE, 401, 'invalid_credentials')
    login(request, user)
    return _response({'authenticated': True})


@require_POST
def logout_view(request):
    logout(request)
    return HttpResponse(status=204)


@require_POST
def password_reset_request(request):
    body = _json_body(request)
    if body is None:
        return _error('درخواست قابل خواندن نیست.', 400, 'invalid_json')
    email = _normalize_email(body.get('email'))
    allowed, retry = _rate_allowed(
        request, 'password-reset', email, ip_limit=12, email_limit=3, window_seconds=3600
    )
    if not allowed:
        return _limited_response(retry)
    email_error = _email_error(email)
    if email_error:
        return _error(email_error, 400, 'validation_error', {'email': [email_error]})
    user = User.objects.filter(email__iexact=email, is_active=True).exclude(email_verified_at=None).first()
    if user:
        _send_password_reset(user)
    return _response({'message': GENERIC_DELIVERY_MESSAGE}, status=202)


@require_POST
def password_reset_confirm(request):
    allowed, retry = _rate_allowed(
        request, 'password-reset-confirm', ip_limit=30, email_limit=1, window_seconds=900
    )
    if not allowed:
        return _limited_response(retry)
    body = _json_body(request)
    if body is None:
        return _error('درخواست قابل خواندن نیست.', 400, 'invalid_json')
    token = body.get('token')
    user_id = body.get('uid')
    password = body.get('password')
    if (
        not isinstance(token, str)
        or not token
        or len(token) > 128
        or not isinstance(user_id, str)
        or len(user_id) > 64
    ):
        return _error(INVALID_RESET_MESSAGE, 400, 'invalid_token')
    try:
        user = User.objects.get(pk=user_id, is_active=True)
    except (ValueError, ValidationError, User.DoesNotExist):
        return _error(INVALID_RESET_MESSAGE, 400, 'invalid_token')
    errors = _password_errors(password, user)
    if errors:
        return _error(errors[0], 400, 'validation_error', {'password': errors})
    with transaction.atomic():
        user = User.objects.select_for_update().filter(pk=user.pk).first()
        if user is None or not user.email_verified_at or not default_token_generator.check_token(user, token):
            return _error(INVALID_RESET_MESSAGE, 400, 'invalid_token')
        user.set_password(password)
        user.save(update_fields=['password'])
    return _response({'message': 'گذرواژه تازه ذخیره شد. برای ادامه وارد شوید.'})


def _authenticated_account(request):
    user = request.user
    return user if user.is_authenticated and user.is_active and user.email_verified_at else None


def _profile_payload(user):
    return {
        'email': user.email,
        'display_name': user.display_name,
        'role_title': user.role_title,
        'pending_email': user.pending_email,
    }


@require_http_methods(['GET', 'PATCH'])
def account_profile(request):
    user = _authenticated_account(request)
    if user is None:
        return _error('برای ادامه وارد حساب شوید.', 401, 'not_authenticated')
    if request.method == 'GET':
        return _response(_profile_payload(user))
    body = _json_body(request)
    if body is None:
        return _error('درخواست قابل خواندن نیست.', 400, 'invalid_json')
    allowed_fields = {'display_name', 'role_title'}
    if body.keys() - allowed_fields:
        return _error('فقط اطلاعات شخصی قابل ویرایش است.', 400, 'invalid_fields')
    errors = {}
    for field, maximum in [('display_name', 80), ('role_title', 80)]:
        if field not in body:
            continue
        value = body[field]
        if not isinstance(value, str) or len(value.strip()) > maximum:
            errors[field] = ['این مقدار را کوتاه‌تر وارد کنید.']
        else:
            setattr(user, field, value.strip())
    if errors:
        return _error('اطلاعات را بررسی کنید.', 400, 'validation_error', errors)
    user.save(update_fields=[field for field in ('display_name', 'role_title') if field in body])
    return _response(_profile_payload(user))


def _preferences_payload(preferences, device_sync_pending=False):
    return {
        'theme': preferences.theme,
        'language': preferences.language,
        'motion': preferences.motion,
        'show_tutorial': preferences.show_tutorial,
        'device_sync_pending': device_sync_pending,
        'updated_at': preferences.updated_at.isoformat(),
    }


@require_http_methods(['GET', 'PATCH'])
def account_preferences(request):
    user = _authenticated_account(request)
    if user is None:
        return _error('برای ادامه وارد حساب شوید.', 401, 'not_authenticated')
    preferences, _ = AccountPreferences.objects.get_or_create(user=user)
    if request.method == 'GET':
        return _response(
            _preferences_payload(preferences, device_sync_pending=preferences.device_synced_at is None)
        )
    body = _json_body(request)
    if body is None:
        return _error('درخواست قابل خواندن نیست.', 400, 'invalid_json')
    allowed_fields = {'theme', 'language', 'motion', 'show_tutorial'}
    if body.keys() - allowed_fields:
        return _error('تنظیمات ارسالی معتبر نیست.', 400, 'invalid_fields')
    errors = {}
    choices = {
        'theme': {'system', 'light', 'dark'},
        'language': {'fa', 'en'},
        'motion': {'auto', 'reduced'},
    }
    for field, values in choices.items():
        if field in body:
            if not isinstance(body[field], str) or body[field] not in values:
                errors[field] = ['یکی از گزینه‌های فهرست‌شده را انتخاب کنید.']
            else:
                setattr(preferences, field, body[field])
    if 'show_tutorial' in body:
        if not isinstance(body['show_tutorial'], bool):
            errors['show_tutorial'] = ['یک گزینه معتبر انتخاب کنید.']
        else:
            preferences.show_tutorial = body['show_tutorial']
    if errors:
        return _error('تنظیمات را بررسی کنید.', 400, 'validation_error', errors)
    preferences.device_synced_at = timezone.now()
    preferences.save()
    return _response(_preferences_payload(preferences))


def _send_email_change(user, email):
    user.pending_email = email
    user.email_change_nonce = uuid.uuid4()
    user.save(update_fields=['pending_email', 'email_change_nonce'])
    token = signing.dumps(
        {'user_id': str(user.pk), 'email': email, 'nonce': str(user.email_change_nonce)},
        salt=EMAIL_CHANGE_SALT,
    )
    url = f'{settings.STRATINO_PUBLIC_URL}/account/email-change#token={quote(token, safe="")}'
    _deliver_auth_email(
        'تأیید نشانی ایمیل تازه استراتینو',
        f'برای ثبت نشانی ایمیل تازه در حساب خود این پیوند را باز کنید:\n\n{url}\n\n'
        f'این پیوند تا ۲۴ ساعت معتبر است. اگر شما این درخواست را ثبت نکرده‌اید، این پیام را نادیده بگیرید.',
        email,
    )


@require_POST
def email_change_request(request):
    user = _authenticated_account(request)
    if user is None:
        return _error('برای ادامه وارد حساب شوید.', 401, 'not_authenticated')
    body = _json_body(request)
    if body is None:
        return _error('درخواست قابل خواندن نیست.', 400, 'invalid_json')
    email = _normalize_email(body.get('email'))
    allowed, retry = _rate_allowed(
        request, 'email-change', email, ip_limit=8, email_limit=3, window_seconds=3600
    )
    if not allowed:
        return _limited_response(retry)
    email_error = _email_error(email)
    if email_error:
        return _error(email_error, 400, 'validation_error', {'email': [email_error]})
    if email != user.email and not User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
        _send_email_change(user, email)
    return _response({'message': GENERIC_EMAIL_CHANGE_MESSAGE}, status=202)


@require_POST
def email_change_confirm(request):
    allowed, retry = _rate_allowed(
        request, 'email-change-confirm', ip_limit=30, email_limit=1, window_seconds=900
    )
    if not allowed:
        return _limited_response(retry)
    body = _json_body(request)
    token = body.get('token') if body else None
    if not isinstance(token, str) or not token or len(token) > 2048:
        return _error('پیوند تغییر ایمیل معتبر نیست یا منقضی شده است.', 400, 'invalid_token')
    try:
        payload = signing.loads(token, salt=EMAIL_CHANGE_SALT, max_age=settings.EMAIL_VERIFICATION_TIMEOUT)
        if not isinstance(payload, dict):
            raise signing.BadSignature('invalid payload')
        user_id = payload.get('user_id')
        email = payload.get('email')
        nonce = payload.get('nonce')
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=user_id, is_active=True)
            if (
                not isinstance(email, str)
                or user.pending_email != email
                or str(user.email_change_nonce) != nonce
                or User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists()
            ):
                raise signing.BadSignature('invalid or used token')
            user.email = email
            user.pending_email = ''
            user.email_change_nonce = uuid.uuid4()
            user.email_verified_at = timezone.now()
            user.save(update_fields=['email', 'pending_email', 'email_change_nonce', 'email_verified_at'])
    except (
        signing.BadSignature,
        signing.SignatureExpired,
        User.DoesNotExist,
        ValidationError,
        TypeError,
        ValueError,
        IntegrityError,
    ):
        return _error('پیوند تغییر ایمیل معتبر نیست یا منقضی شده است.', 400, 'invalid_token')
    return _response({'message': 'نشانی تازه تأیید و در حساب ثبت شد.'})
