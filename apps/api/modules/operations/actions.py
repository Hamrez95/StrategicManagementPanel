"""Small, explicit operator actions through the existing audited domain services."""
import json

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction
from django.views.decorators.csrf import csrf_protect

from modules.accounts.models import User
from modules.workspaces.entitlements import (
    grant_management_subscription,
    revoke_management_subscription,
)
from modules.workspaces.models import (
    BillingAccount,
    ManagementPlan,
    ManagementSubscription,
)

from .models import OperatorActionEvent
from .security import (
    explicit_permission,
    failure,
    operator_mfa_verified,
    operator_sections,
    private_response,
)


@csrf_protect
def operator_action(request, action, target=None):
    if request.method != 'POST':
        response = failure('method_not_allowed', 'این عملیات با درخواست تأییدشده انجام می‌شه.', 405)
        response['Allow'] = 'POST'
        return response
    actor, sections = operator_sections(request)
    requirements = {
        'account-status': ('accounts', 'accounts.operator_manage_accounts'),
        'grant': ('subscriptions', 'workspaces.add_managementsubscription'),
        'revoke': ('subscriptions', 'workspaces.change_managementsubscription'),
    }
    if action not in requirements:
        return failure('not_found', 'این عملیات وجود نداره.', 404)
    section, permission = requirements[action]
    if actor is None or section not in sections or not explicit_permission(actor, permission):
        return failure('operator_permission_denied', 'مجوز انجام این تغییر رو نداری.', 403 if request.user.is_authenticated else 401)
    if not operator_mfa_verified(request, actor):
        return failure('operator_mfa_unavailable', 'برای انجام این تغییر، احراز هویت دومرحله‌ای رو تأیید کن.', 403)
    try:
        data = json.loads(request.body)
        required = {'reason', 'confirm'} | ({'is_active'} if action == 'account-status' else {'owner_id', 'plan_id', 'request_id'} if action == 'grant' else set())
        if not isinstance(data, dict) or set(data) != required or data.get('confirm') is not True:
            raise ValueError
        reason = data['reason']
        if not isinstance(reason, str) or not 3 <= len(reason.strip()) <= 500:
            raise ValueError
        reason = reason.strip()
        with transaction.atomic():
            if action == 'account-status':
                if not isinstance(data['is_active'], bool):
                    raise ValueError
                user = User.objects.select_for_update().filter(pk=target).first()
                if user is None:
                    return failure('not_found', 'این حساب پیدا نشد.', 404)
                if user.pk == actor.pk or user.is_staff or user.is_superuser:
                    return failure('operator_protected_account', 'وضعیت حساب خودت یا حساب همکاران مدیریتی از این بخش تغییر نمی‌کنه.', 403)
                before = user.is_active
                if before != data['is_active']:
                    user.is_active = data['is_active']
                    user.save(update_fields=['is_active'])
                    OperatorActionEvent.objects.create(actor=actor, event_type='account_status_changed',
                        target=str(user.pk), before=str(before).lower(), after=str(user.is_active).lower(), reason=reason)
                return private_response({'id': str(user.pk), 'is_active': user.is_active})
            if action == 'grant':
                if 'plans' not in sections:
                    return failure('operator_permission_denied', 'برای اعطای اشتراک، مجوز پلن‌ها هم لازمه.', 403)
                billing = BillingAccount.objects.filter(owner_id=data['owner_id']).first()
                plan = ManagementPlan.objects.filter(pk=data['plan_id'], is_active=True, is_default=False).first()
                if billing is None or plan is None:
                    return failure('invalid_input', 'حساب صورتحساب یا پلن فعال پیدا نشد.', 400)
                row = grant_management_subscription(actor, billing, plan, request_id=data['request_id'], reason=reason)
                return private_response({'id': str(row.pk), 'status': row.status}, 201)
            row = ManagementSubscription.objects.filter(pk=target).first()
            if row is None:
                return failure('not_found', 'این اشتراک پیدا نشد.', 404)
            row = revoke_management_subscription(actor, row, reason=reason)
            return private_response({'id': str(row.pk), 'status': row.status})
    except PermissionDenied:
        return failure('operator_permission_denied', 'مجوز انجام این تغییر رو نداری.', 403)
    except (ValueError, TypeError, UnicodeError, ValidationError, IntegrityError):
        return failure('invalid_input', 'اطلاعات تغییر، شناسه‌ها، دلیل و تأیید نهایی رو بررسی کن.', 400)
