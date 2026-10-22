"""Google Identity Services callback, bound to CSRF + a single-use session nonce."""
import secrets
from datetime import timedelta
from uuid import UUID
from django.conf import settings
from django.contrib.auth import authenticate, login
from django.db import transaction, IntegrityError
from django.utils import timezone
from django.utils.crypto import salted_hmac, constant_time_compare
from django.views.decorators.http import require_GET, require_POST
from .models import User, GoogleIdentity, GoogleLoginChallenge
from .auth_views import _response, _error, _json_body, _normalize_email, _email_error, _rate_allowed, _limited_response, _authenticated_account
from .profile_completion import require_profile_on_login, normalize_phone, profile_complete


def digest(value):
    return salted_hmac('google-login', value, algorithm='sha256').hexdigest()


def verify_credential(credential):
    from google.oauth2 import id_token
    from google.auth.transport.requests import Request
    from google.auth.exceptions import GoogleAuthError, TransportError
    class BoundedRequest(Request):
        def __call__(self, *args, **kwargs):
            kwargs['timeout'] = 5
            return super().__call__(*args, **kwargs)
    try:
        return id_token.verify_oauth2_token(credential, BoundedRequest(), settings.GOOGLE_OAUTH_CLIENT_ID)
    except TransportError:
        raise
    except GoogleAuthError as exc:
        raise ValueError('Invalid Google credential') from exc


@require_GET
def google_config(request):
    client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    return _response({'enabled': bool(client_id), 'client_id': client_id})


@require_POST
def google_challenge(request):
    if not settings.GOOGLE_OAUTH_CLIENT_ID:
        return _error('ورود با گوگل هنوز فعال نشده؛ فعلاً با ایمیل ادامه بده.', 503, 'google_not_configured')
    allowed, retry = _rate_allowed(request, 'google-challenge', ip_limit=30, email_limit=1, window_seconds=900)
    if not allowed:
        return _limited_response(retry)
    binding = request.session.get('google_binding') or secrets.token_urlsafe(32)
    request.session['google_binding'] = binding
    nonce = secrets.token_urlsafe(32)
    row = GoogleLoginChallenge.objects.create(nonce_hash=digest(nonce), binding_hash=digest(binding), expires_at=timezone.now()+timedelta(minutes=10))
    return _response({'challenge_id': str(row.pk), 'nonce': nonce})


def finish_login(request, user):
    require_profile_on_login(user)
    login(request, user, backend='django.contrib.auth.backends.ModelBackend')
    request.session.pop('google_pending_link', None)
    return _response({'status': 'authenticated', 'profile_required': user.requires_profile_completion})


@require_POST
def google_login(request):
    if not settings.GOOGLE_OAUTH_CLIENT_ID:
        return _error('ورود با گوگل هنوز فعال نشده؛ فعلاً با ایمیل ادامه بده.', 503, 'google_not_configured')
    allowed, retry = _rate_allowed(request, 'google-login', ip_limit=30, email_limit=1, window_seconds=900)
    if not allowed:
        return _limited_response(retry)
    data = _json_body(request)
    if not data or not isinstance(data.get('credential'), str) or not 50 <= len(data['credential']) <= 12000:
        return _error('پاسخ گوگل معتبر نیست؛ دوباره تلاش کن.', 400, 'invalid_google_token')
    try:
        challenge_id = UUID(str(data.get('challenge_id')))
        # Reject missing/expired/session-mismatched challenges before making a network request.
        challenge = GoogleLoginChallenge.objects.get(pk=challenge_id, used_at=None, expires_at__gt=timezone.now(), binding_hash=digest(request.session.get('google_binding', '')))
    except (ValueError, GoogleLoginChallenge.DoesNotExist):
        return _error('درخواست ورود منقضی شده؛ دوباره گوگل رو انتخاب کن.', 400, 'invalid_google_challenge')
    try:
        claims = verify_credential(data['credential'])
    except ValueError:
        return _error('پاسخ گوگل تأیید نشد؛ دوباره تلاش کن.', 400, 'invalid_google_token')
    except Exception:
        # Never log the credential, email, or verification response.
        return _error('فعلاً ارتباط با گوگل برقرار نشد؛ دوباره تلاش کن یا با ایمیل وارد شو.', 503, 'google_unavailable')
    subject, email = claims.get('sub'), _normalize_email(claims.get('email'))
    if not isinstance(subject, str) or not subject.isascii() or not 1 <= len(subject) <= 255 or _email_error(email) or claims.get('email_verified') is not True or not isinstance(claims.get('nonce'), str) or not constant_time_compare(challenge.nonce_hash, digest(claims['nonce'])):
        return _error('اطلاعات حساب گوگل برای ورود تأیید نشد.', 400, 'invalid_google_claims')
    with transaction.atomic():
        challenge = GoogleLoginChallenge.objects.select_for_update().get(pk=challenge.pk)
        if challenge.used_at or challenge.expires_at <= timezone.now():
            return _error('این درخواست ورود قبلاً استفاده شده؛ دوباره تلاش کن.', 400, 'google_token_replayed')
        challenge.used_at = timezone.now()
        challenge.save(update_fields=['used_at'])
    identity = GoogleIdentity.objects.select_related('user').filter(subject=subject).first()
    if identity:
        if not identity.user.is_active or not identity.user.email_verified_at:
            return _error('این حساب در دسترس نیست؛ با روش قبلی ورود ادامه بده.', 403, 'account_unavailable')
        return finish_login(request, identity.user)
    existing = User.objects.filter(email__iexact=email).first()
    if existing:
        request.session['google_pending_link'] = {'subject': subject, 'email': email, 'expires': (timezone.now()+timedelta(minutes=10)).timestamp()}
        return _response({'status': 'link_required', 'email': email})
    # Google does not vouch for continued ownership of third-party email addresses.
    if not (email.endswith('@gmail.com') or (isinstance(claims.get('hd'), str) and claims['hd'])):
        return _response({'status': 'email_proof_required', 'email': email})
    def name(key):
        value = claims.get(key)
        return value.strip()[:150] if isinstance(value, str) else ''
    try:
        with transaction.atomic():
            user = User.objects.create_user(email=email, password=None, first_name=name('given_name'), last_name=name('family_name'), email_verified_at=timezone.now(), requires_profile_completion=True)
            GoogleIdentity.objects.create(user=user, subject=subject)
    except IntegrityError:
        return _error('حساب هم‌زمان تغییر کرد؛ دوباره ورود با گوگل رو انتخاب کن.', 409, 'google_account_conflict')
    return finish_login(request, user)


@require_POST
def google_link(request):
    data = _json_body(request)
    pending = request.session.get('google_pending_link')
    if not pending or pending['expires'] <= timezone.now().timestamp():
        return _error('درخواست اتصال منقضی شده؛ دوباره گوگل رو انتخاب کن.', 400, 'google_link_expired')
    allowed, retry = _rate_allowed(request, 'google-link', pending['email'], ip_limit=20, email_limit=5, window_seconds=900)
    if not allowed:
        return _limited_response(retry)
    password = data.get('password') if data else None
    if not isinstance(password, str) or len(password) > 1024:
        return _error('گذرواژهٔ حساب فعلی‌ات رو وارد کن.', 400, 'invalid_credentials')
    user = authenticate(request, username=pending['email'], password=password)
    if not user or not user.email_verified_at:
        return _error('گذرواژه درست نیست یا ایمیل حسابت هنوز تأیید نشده.', 400, 'invalid_credentials')
    try:
        with transaction.atomic():
            User.objects.select_for_update().get(pk=user.pk)
            identity = GoogleIdentity.objects.filter(user=user).first()
            if identity and identity.subject != pending['subject']:
                return _error('این حساب به حساب گوگل دیگه‌ای متصله.', 409, 'google_already_linked')
            GoogleIdentity.objects.get_or_create(user=user, subject=pending['subject'])
    except IntegrityError:
        return _error('این حساب گوگل قبلاً متصل شده؛ دوباره وارد شو.', 409, 'google_already_linked')
    return finish_login(request, user)


@require_GET
def completion_details(request):
    user = _authenticated_account(request)
    if not user:
        return _error('برای تکمیل مشخصات، اول وارد حسابت شو.', 401, 'not_authenticated')
    return _response({'first_name': user.first_name, 'last_name': user.last_name, 'phone_number': user.phone_number, 'email': user.email, 'google_connected': GoogleIdentity.objects.filter(user=user).exists(), 'profile_required': not profile_complete(user), 'marketing_opt_in': bool(user.marketing_consent_at)})


@require_POST
def complete_profile(request):
    user = _authenticated_account(request)
    if not user:
        return _error('برای تکمیل مشخصات، اول وارد حسابت شو.', 401, 'not_authenticated')
    data = _json_body(request)
    if not data or set(data) - {'first_name', 'last_name', 'phone_number', 'marketing_opt_in', 'expected_user_id'}:
        return _error('اطلاعات پروفایلت معتبر نیست.', 400, 'validation_error')
    if data.get('expected_user_id') != str(user.pk):
        return _error('حساب فعال عوض شده؛ صفحه رو تازه کن.', 409, 'account_changed')
    errors = {}
    for key, label in [('first_name', 'نام'), ('last_name', 'نام خانوادگی')]:
        value = data.get(key)
        if not isinstance(value, str) or not 1 <= len(value.strip()) <= 150 or any(ord(c) < 32 for c in value):
            errors[key] = [f'{label} رو وارد کن؛ حداکثر ۱۵۰ نویسه.']
    phone = normalize_phone(data.get('phone_number'))
    if not phone:
        errors['phone_number'] = ['شماره موبایل رو با ۰۹ یا کد کشور مثل ‎+۹۸ وارد کن.']
    if type(data.get('marketing_opt_in', False)) is not bool:
        errors['marketing_opt_in'] = ['انتخاب دریافت خبر معتبر نیست.']
    if errors:
        return _error('چند مورد رو بررسی کن.', 400, 'validation_error', errors)
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=user.pk)
        user.first_name, user.last_name = data['first_name'].strip(), data['last_name'].strip()
        if user.phone_number != phone:
            user.phone_verified_at = None
        user.phone_number = phone
        user.profile_completed_at = user.profile_completed_at or timezone.now()
        user.requires_profile_completion = False
        if 'marketing_opt_in' in data:
            user.marketing_consent_at = (user.marketing_consent_at or timezone.now()) if data['marketing_opt_in'] else None
        user.save(update_fields=['first_name', 'last_name', 'phone_number', 'phone_verified_at', 'profile_completed_at', 'requires_profile_completion', 'marketing_consent_at'])
    return _response({'saved': True, 'profile_required': False})
