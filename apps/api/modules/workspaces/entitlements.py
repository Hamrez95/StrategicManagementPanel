"""Owner-scoped, additive grants; membership and data ownership are never subscriptions."""
from datetime import timedelta
from uuid import UUID

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import BillingAccount, ManagementPlan, ManagementSubscription, ManagementSubscriptionEvent, Workspace

FEATURES = ('can_finalize_analysis', 'can_calculate_metrics', 'can_generate_reports')


def management_access(owner):
    default = ManagementPlan.objects.filter(is_default=True, is_active=True).first()
    limit = default.owned_workspace_limit if default else 1
    features = {feature: bool(default and getattr(default, feature)) for feature in FEATURES}
    billing = BillingAccount.objects.filter(owner=owner).first()
    now = timezone.now()
    grants = []
    if billing and billing.status == 'active':
        grants = list(ManagementSubscription.objects.filter(billing_account=billing, status='active', starts_at__lte=now).filter(Q(ends_at=None) | Q(ends_at__gt=now)).order_by('-created_at'))
    for grant in grants:
        limit = None if limit is None or grant.owned_workspace_limit is None else max(limit, grant.owned_workspace_limit)
        for feature in FEATURES:
            features[feature] |= getattr(grant, feature)
    used = Workspace.objects.filter(owner=owner, archived_at__isnull=True).count()
    return {'hasAccess': True, 'accessLevel': 'special' if grants else 'free', 'owned_workspace_limit': limit,
            'owned_workspaces': used, 'can_create_workspace': (not billing or billing.status == 'active') and (limit is None or used < limit),
            'features': features, 'subscriptions': [{'id': str(grant.pk), 'title': grant.plan_title, 'starts_at': grant.starts_at, 'ends_at': grant.ends_at} for grant in grants]}


def require_workspace_slot(owner, billing):
    # Call in a transaction: all create/restore writers serialize on the owner's BillingAccount.
    BillingAccount.objects.select_for_update().get(pk=billing.pk)
    if not management_access(owner)['can_create_workspace']:
        from .services import WorkspaceActionError
        raise WorkspaceActionError(409, 'workspace_subscription_limit', 'ظرفیت فضای کاری اشتراکت تکمیل شده؛ می‌تونی یک فضای قبلی رو بایگانی کنی یا اشتراکت رو ارتقا بدی.')


def require_workspace_feature(workspace, feature):
    if feature not in FEATURES:
        raise ValueError('Unknown management entitlement.')
    if not management_access(workspace.owner)['features'][feature]:
        from .services import WorkspaceActionError
        raise WorkspaceActionError(403, 'management_subscription_required', 'پیش‌نویست در دسترسه؛ این خروجی با اشتراک ویژه فعال می‌شه.')


def _operator(actor, permission):
    from modules.accounts.models import User
    actor = User.objects.filter(pk=actor.pk).first()
    if actor is None:
        raise PermissionDenied('A verified authorized operator is required.')
    if not actor.is_active or not actor.is_staff or not actor.email_verified_at or not actor.has_perm(permission):
        raise PermissionDenied('A verified authorized operator is required.')
    return actor


@transaction.atomic
def grant_management_subscription(actor, billing_account, plan, *, request_id, reason):
    actor = _operator(actor, 'workspaces.add_managementsubscription')
    reason = reason.strip() if isinstance(reason, str) else ''
    if not reason or len(reason) > 500:
        raise ValidationError({'reason': 'دلیل فعال‌سازی رو بنویس؛ حداکثر ۵۰۰ نویسه.'})
    try:
        request_id = UUID(str(request_id))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError({'request_id': 'شناسهٔ درخواست معتبر نیست.'}) from None
    billing = BillingAccount.objects.select_for_update().get(pk=billing_account.pk)
    previous = ManagementSubscription.objects.filter(request_id=request_id).first()
    if previous:
        if previous.billing_account_id != billing.pk or previous.plan_id != plan.pk or previous.reason != reason:
            raise ValidationError({'request_id': 'این شناسه برای درخواست دیگه‌ای ثبت شده.'})
        return previous
    plan = ManagementPlan.objects.select_for_update().get(pk=plan.pk)
    if not plan.is_active or plan.is_default or billing.status != 'active':
        raise ValidationError({'plan': 'این پلن یا حساب برای فعال‌سازی آماده نیست.'})
    now = timezone.now()
    subscription = ManagementSubscription.objects.create(billing_account=billing, plan=plan, request_id=request_id,
        starts_at=now, ends_at=now + timedelta(days=plan.duration_days) if plan.duration_days else None,
        plan_title=plan.title, plan_revision=plan.revision, owned_workspace_limit=plan.owned_workspace_limit,
        granted_by=actor, reason=reason, **{feature: getattr(plan, feature) for feature in FEATURES})
    ManagementSubscriptionEvent.objects.create(subscription=subscription, actor=actor, event_type='granted', reason=reason)
    return subscription


@transaction.atomic
def revoke_management_subscription(actor, subscription, *, reason):
    actor = _operator(actor, 'workspaces.change_managementsubscription')
    reason = reason.strip() if isinstance(reason, str) else ''
    if not reason or len(reason) > 500:
        raise ValidationError({'reason': 'دلیل لغو رو بنویس؛ حداکثر ۵۰۰ نویسه.'})
    BillingAccount.objects.select_for_update().get(pk=subscription.billing_account_id)
    grant = ManagementSubscription.objects.select_for_update().get(pk=subscription.pk)
    if grant.status != 'revoked':
        grant.status = 'revoked'
        grant.save(update_fields=['status'])
        ManagementSubscriptionEvent.objects.create(subscription=grant, actor=actor, event_type='revoked', reason=reason)
    return grant
