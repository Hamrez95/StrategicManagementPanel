"""Explicit operator permissions and session-bound MFA for every customer read."""
from django.conf import settings
from django.contrib.auth.models import Permission
from django.db.models import Q
from django.http import JsonResponse
from django.utils.cache import patch_vary_headers
from rest_framework.permissions import BasePermission

from modules.accounts.models import User

from .models import OperatorAccess

SECTIONS = ('accounts', 'workspaces', 'plans', 'subscriptions', 'access', 'audit', 'academy',
            'academy_plans', 'academy_subscriptions', 'academy_orders', 'academy_samples', 'feedback')


def private_response(payload, status=200):
    response = JsonResponse(payload, status=status)
    response['Cache-Control'] = 'private, no-store'
    patch_vary_headers(response, ['Cookie'])
    return response


def failure(code, message, status=403):
    return private_response({'code': code, 'message': message}, status)


def operator_sections(request):
    if not request.user.is_authenticated:
        return None, ()
    # Reload identity and permissions on every request, including group revocations.
    actor = User.objects.filter(pk=request.user.pk, is_active=True, is_staff=True,
                                email_verified_at__isnull=False).first()
    if actor is None:
        return None, ()
    access = approved_access(actor)
    if access is None:
        return None, ()
    # Superuser is not an implicit grant for the operator surface.
    codes = set(Permission.objects.filter(
        Q(user=actor) | Q(group__user=actor),
        content_type__app_label='accounts', content_type__model='user',
        codename__in=[f'operator_view_{section}' for section in SECTIONS],
    ).values_list('codename', flat=True))
    return actor, tuple(section for section in SECTIONS if f'operator_view_{section}' in codes)


def approved_access(actor):
    access = OperatorAccess.objects.filter(user=actor, is_active=True).first()
    if access and (access.role != 'owner' or actor.email.lower() in settings.OPERATOR_OWNER_EMAILS):
        return access
    return None


def operator_mfa_verified(request, actor):
    # Import lazily: the MFA endpoint uses the same explicit permission resolver.
    from .mfa import verified_proof
    access = approved_access(actor)
    return bool(access and not access.must_change_password and (
        (development_mfa_optional() and not access.mfa_enabled)
        or verified_proof(request, actor) is not None))


def development_mfa_optional():
    return bool(getattr(settings, 'ENVIRONMENT', '') == 'development'
                and settings.DEBUG and not getattr(settings, 'PRODUCTION', True)
                and getattr(settings, 'OPERATOR_MFA_OPTIONAL_IN_DEVELOPMENT', False))


def explicit_permission(actor, permission):
    app, code = permission.split('.', 1)
    return Permission.objects.filter(
        Q(user=actor) | Q(group__user=actor), content_type__app_label=app, codename=code,
    ).exists()


class OperatorFeedbackPermission(BasePermission):
    message = 'برای بررسی نظرها، مجوز مربوط و تأیید دومرحله‌ای لازم داری.'

    def has_permission(self, request, view):
        actor, sections = operator_sections(request)
        return bool(actor and 'feedback' in sections and operator_mfa_verified(request, actor)
                    and (request.method == 'GET' or explicit_permission(actor, 'accounts.operator_triage_feedback')))


class OperatorAdminBoundaryMiddleware:
    """The pre-existing Django admin must not bypass the closed operator boundary."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith('/internal/django-admin'):
            # Raw admin mutations have no reviewed MFA/audited workflow in this slice.
            return failure('operator_admin_unavailable',
                           'مدیریت مستقیم تا آماده‌شدن احراز هویت دومرحله‌ای و گردش ممیزی بسته است.', 503)
        response = self.get_response(request)
        if request.path.startswith('/api/v1/operator/'):
            response['Cache-Control'] = 'private, no-store'
            patch_vary_headers(response, ['Cookie'])
        return response
