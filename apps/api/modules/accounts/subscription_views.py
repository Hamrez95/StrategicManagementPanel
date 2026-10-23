from django.views.decorators.http import require_GET
from .auth_views import _authenticated_account, _error, _response
from modules.academy.account_summary import plans_payload
from modules.workspaces.models import BillingAccount, Workspace, Membership


@require_GET
def account_subscriptions(request):
    user = _authenticated_account(request)
    if user is None:
        return _error('برای دیدن اشتراک‌هات، وارد حسابت شو.', 401, 'not_authenticated')
    billing = BillingAccount.objects.filter(owner=user).first()
    management = {'billing_status': billing.status if billing else None, 'owned_workspaces': Workspace.objects.filter(owner=user, archived_at__isnull=True).count(), 'archived_workspaces': Workspace.objects.filter(owner=user, archived_at__isnull=False).count(), 'joined_workspaces': Membership.objects.filter(user=user, workspace__archived_at__isnull=True).exclude(workspace__owner=user).count(), 'plans_configured': False}
    return _response({'user_id': str(user.pk), 'academy': plans_payload(user, include_orders=True), 'management': management}, headers={'Cache-Control': 'private, no-store', 'Vary': 'Cookie'})
