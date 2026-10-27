"""TOTP with encrypted seeds, replay protection and database-backed session proofs."""
import json
import re
from datetime import timedelta
from io import BytesIO

import pyotp
import qrcode
from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from django.views.decorators.csrf import csrf_protect
from qrcode.image.svg import SvgPathImage

from modules.accounts.auth_views import _rate_allowed

from .models import OperatorFactor, OperatorProof, OperatorSecurityEvent
from .security import failure, operator_sections, private_response

PROOF_SECONDS = 900


def cipher():
    keys = getattr(settings, 'OPERATOR_MFA_KEYS', ())
    if not keys:
        return None
    try:
        return MultiFernet([Fernet(key.encode('ascii')) for key in keys])
    except (ValueError, TypeError, UnicodeError):
        return None


def session_digest(request):
    key = request.session.session_key
    return salted_hmac('stratino.operator.session', key, algorithm='sha256').hexdigest() if key else ''


def auth_digest(actor):
    return salted_hmac('stratino.operator.auth', actor.get_session_auth_hash(), algorithm='sha256').hexdigest()


def verified_proof(request, actor):
    if cipher() is None:
        return None
    proof = OperatorProof.objects.select_related('factor').filter(
        session_digest=session_digest(request), factor__user_id=actor.pk,
        factor__enabled_at__isnull=False, expires_at__gt=timezone.now(),
        verified_at__lte=timezone.now(),
    ).first()
    if (proof and proof.generation == proof.factor.generation
            and constant_time_compare(proof.auth_digest, auth_digest(actor))):
        try:
            cipher().decrypt(proof.factor.encrypted_secret.encode('ascii'))
            return proof
        except (InvalidToken, ValueError, UnicodeError):
            return None
    return None


def _event(actor, kind):
    OperatorSecurityEvent.objects.create(actor=actor, event_type=kind)


def _issue_proof(request, actor, factor, now):
    old = session_digest(request)
    request.session.cycle_key()
    if old:
        OperatorProof.objects.filter(pk=old).delete()
    OperatorProof.objects.filter(expires_at__lte=now).delete()
    proof = OperatorProof.objects.create(
        session_digest=session_digest(request), factor=factor, generation=factor.generation,
        auth_digest=auth_digest(actor), verified_at=now,
        expires_at=now + timedelta(seconds=PROOF_SECONDS),
    )
    return proof


def _counter(factor, code, now):
    code = code.translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'))
    if not re.fullmatch(r'[0-9]{6}', code):
        return None
    try:
        secret = cipher().decrypt(factor.encrypted_secret.encode('ascii')).decode('ascii')
        totp = pyotp.TOTP(secret)
        current = totp.timecode(now)
        for candidate in (current, current - 1, current + 1):
            if candidate > factor.last_counter and constant_time_compare(totp.at(candidate * 30), code):
                return candidate
    except (InvalidToken, ValueError, TypeError, AttributeError, UnicodeError):
        return None
    return None


@csrf_protect
def operator_mfa(request, action):
    """Explicit active staff permissions, password reauthentication and CSRF required."""
    actor, sections = operator_sections(request)
    if actor is None or not sections:
        return failure('operator_permission_denied', 'برای این بخش مجوز اپراتوری لازم رو نداری.',
                       403 if request.user.is_authenticated else 401)
    if request.method != 'POST':
        response = failure('method_not_allowed', 'این عملیات باید با درخواست تأییدشده انجام بشه.', 405)
        response['Allow'] = 'POST'
        return response
    if action not in ('enroll', 'verify', 'lock', 'remove'):
        return failure('not_found', 'این عملیات وجود نداره.', 404)
    if action == 'lock':
        deleted, _ = OperatorProof.objects.filter(pk=session_digest(request)).delete()
        if deleted:
            _event(actor, 'locked')
        return private_response({'mfa_ready': False})
    if cipher() is None:
        return failure('operator_mfa_unavailable', 'کلید امنیتی سرور هنوز تنظیم نشده. با مسئول فنی تماس بگیر.', 503)
    allowed, retry = _rate_allowed(request, 'operator-mfa', str(actor.pk),
                                   ip_limit=30, email_limit=8, window_seconds=300)
    if not allowed:
        response = failure('rate_limited', 'چند بار تلاش کردی. کمی صبر کن و دوباره امتحان کن.', 429)
        response['Retry-After'] = str(retry)
        return response
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict) or set(data) - {'password', 'code'}:
            raise ValueError
        password, code = data.get('password'), data.get('code', '')
        if not isinstance(password, str) or len(password) > 4096 or not isinstance(code, str) or len(code) > 12:
            raise ValueError
    except (ValueError, UnicodeError):
        return failure('invalid_input', 'گذرواژه و کد تأیید رو بررسی کن.', 400)
    now = timezone.now()
    with transaction.atomic():
        # Serialize first enrollment and code consumption for this operator.
        actor = type(actor).objects.select_for_update().get(pk=actor.pk)
        if not actor.has_usable_password() or not actor.check_password(password):
            return failure('operator_reauthentication_failed', 'گذرواژه یا کد تأیید درست نیست.', 403)
        factor = OperatorFactor.objects.select_for_update().filter(user=actor).first()
        if action == 'enroll':
            if factor and factor.enabled_at:
                return failure('operator_factor_exists', 'احراز هویت دومرحله‌ای فعاله. کد برنامه‌ات رو وارد کن.', 409)
            secret = pyotp.random_base32()
            if factor:
                factor.delete()
            if not request.session.session_key:
                request.session.save()
            factor = OperatorFactor.objects.create(
                user=actor, encrypted_secret=cipher().encrypt(secret.encode('ascii')).decode('ascii'),
                pending_until=now + timedelta(minutes=10),
                pending_session_digest=session_digest(request), pending_auth_digest=auth_digest(actor),
            )
            _event(actor, 'enrollment_started')
            uri = pyotp.TOTP(secret).provisioning_uri(name=actor.email, issuer_name='Stratino Admin')
            image = qrcode.make(uri, image_factory=SvgPathImage, box_size=6, border=4)
            svg = BytesIO()
            image.save(svg)
            return private_response({
                'secret': secret,
                'qr_svg': svg.getvalue().decode('utf-8'),
                'expires_at': factor.pending_until.isoformat(),
            }, 201)
        if not factor or (not factor.enabled_at and factor.pending_until <= now):
            return failure('operator_enrollment_required', 'راه‌اندازی دومرحله‌ای رو دوباره شروع کن.', 409)
        if not factor.enabled_at and (
            not constant_time_compare(factor.pending_session_digest, session_digest(request))
            or not constant_time_compare(factor.pending_auth_digest, auth_digest(actor))
        ):
            return failure('operator_enrollment_required', 'راه‌اندازی رو در همین مرورگر دوباره شروع کن.', 409)
        if action == 'remove' and not factor.enabled_at:
            return failure('operator_enrollment_required', 'احراز هویت دومرحله‌ای هنوز فعال نشده.', 409)
        counter = _counter(factor, code, now)
        if counter is None:
            return failure('operator_reauthentication_failed', 'گذرواژه یا کد تأیید درست نیست. برای کد تازه کمی صبر کن.', 403)
        if action == 'remove':
            factor.delete()  # Cascades every session proof, including other browsers.
            _event(actor, 'factor_removed')
            return private_response({'mfa_ready': False, 'mfa_enrolled': False})
        enrolling = factor.enabled_at is None
        factor.last_counter = counter
        factor.enabled_at = factor.enabled_at or now
        factor.save(update_fields=['last_counter', 'enabled_at'])
        proof = _issue_proof(request, actor, factor, now)
        _event(actor, 'enrolled' if enrolling else 'verified')
        return private_response({'mfa_ready': True, 'expires_at': proof.expires_at.isoformat()})
