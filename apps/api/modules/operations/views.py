"""Read-only, minimal management summaries. No Workspace content or impersonation."""
from uuid import UUID

from django.core.paginator import EmptyPage, Paginator
from django.db.models import CharField, F, Q, Value
from django.db.models.functions import Cast

from modules.accounts.models import User
from modules.workspaces.entitlements import FEATURES, management_access
from modules.workspaces.models import (
    ManagementPlan, ManagementSubscription, ManagementSubscriptionEvent, Workspace, WorkspaceEvent,
)
from .security import SECTIONS, failure, operator_mfa_verified, operator_sections, private_response

PAGE_SIZE = 25


def operator_status(request):
    if request.method != 'GET':
        return method_denied()
    actor, sections = operator_sections(request)
    if actor is None or not sections:
        return denied(request)
    return private_response({'sections': sections, 'mfa_ready': operator_mfa_verified(request, actor)})


def denied(request):
    return failure('operator_permission_denied', 'برای این بخش مجوز اپراتوری لازم رو نداری.',
                   403 if request.user.is_authenticated else 401)


def method_denied():
    response = failure('method_not_allowed', 'این بخش فقط برای مشاهده است.', 405)
    response['Allow'] = 'GET'
    return response


def _uuid(value):
    try:
        return UUID(value)
    except (ValueError, TypeError, AttributeError):
        return None


def _accounts(query):
    rows = User.objects.order_by('id')
    if query:
        identity = _uuid(query)
        rows = rows.filter(pk=identity) if identity else rows.filter(email__iexact=query)
    return rows


def _rows(section, query, state):
    identity = _uuid(query)
    if section in ('accounts', 'access'):
        rows = _accounts(query)
        if state:
            rows = rows.filter(is_active=state == 'active')
        if section == 'access':
            return rows.only('id')
        return rows.annotate(verified=Q(email_verified_at__isnull=False)).values(
            'id', 'is_active', 'verified', 'date_joined')
    if section == 'plans':
        rows = ManagementPlan.objects.order_by('code', 'id')
        if query:
            rows = rows.filter(Q(code__icontains=query) | Q(title__icontains=query))
        if state:
            rows = rows.filter(is_active=state == 'active')
        return rows.values('id', 'code', 'title', 'is_active', 'is_default', 'revision',
                           'owned_workspace_limit', *FEATURES, 'price', 'currency', 'duration_days')
    if section == 'workspaces':
        rows = Workspace.objects.order_by('-created_at', '-id')
        if query:
            rows = rows.filter(Q(pk=identity) | Q(owner_id=identity)) if identity else rows.none()
        if state:
            rows = rows.filter(archived_at__isnull=state == 'active')
        return rows.values('id', 'owner_id', 'archived_at', 'created_at')
    if section == 'subscriptions':
        rows = ManagementSubscription.objects.order_by('-created_at', '-id')
        if query:
            rows = rows.filter(Q(pk=identity) | Q(billing_account__owner_id=identity)) if identity else rows.none()
        if state:
            rows = rows.filter(status=state)
        return rows.annotate(owner_id=F('billing_account__owner_id')).values(
            'id', 'owner_id', 'plan_title', 'plan_revision', 'status', 'starts_at', 'ends_at',
            'owned_workspace_limit', *FEATURES)
    # Free-text changes and reasons can contain customer information. Omit them.
    workspace_events = WorkspaceEvent.objects.all()
    grant_events = ManagementSubscriptionEvent.objects.all()
    if query:
        workspace_events = workspace_events.filter(
            Q(pk=identity) | Q(workspace_id=identity) | Q(actor_id=identity)
        ) if identity else workspace_events.none()
        grant_events = grant_events.filter(
            Q(subscription_id=identity) | Q(actor_id=identity)
        ) if identity else grant_events.none()
    fields = ('event_id', 'source', 'actor_id', 'event_type', 'target', 'created_at')
    workspace_events = workspace_events.order_by().annotate(
        event_id=Cast('pk', CharField()), source=Value('workspace', output_field=CharField()),
        target=Cast('workspace_id', CharField()),
    ).values(*fields)
    grant_events = grant_events.order_by().annotate(
        event_id=Cast('pk', CharField()), source=Value('subscription', output_field=CharField()),
        target=Cast('subscription_id', CharField()),
    ).values(*fields)
    return workspace_events.union(grant_events, all=True).order_by('-created_at', 'source', 'event_id')


def operator_collection(request, section):
    if request.method != 'GET':
        return method_denied()
    actor, sections = operator_sections(request)
    if actor is None or section not in SECTIONS or section not in sections:
        return denied(request)
    # Check before parsing query parameters or touching any customer queryset.
    if not operator_mfa_verified(request, actor):
        return failure('operator_mfa_unavailable',
                       'احراز هویت دومرحله‌ای اپراتور هنوز آماده نیست. نمایش اطلاعات مشتری بسته است.', 503)
    query = request.GET.get('q', '').strip()
    state = request.GET.get('state', '')
    allowed_states = {
        'accounts': ('active', 'inactive'), 'access': ('active', 'inactive'),
        'plans': ('active', 'inactive'), 'workspaces': ('active', 'archived'),
        'subscriptions': ('active', 'revoked'), 'audit': (),
    }
    try:
        page_number = int(request.GET.get('page', '1'))
    except ValueError:
        page_number = 0
    if len(query) > 254 or page_number < 1 or (state and state not in allowed_states[section]):
        return failure('operator_invalid_query', 'جست‌وجو، وضعیت یا شمارهٔ صفحه معتبر نیست.', 400)
    paginator = Paginator(_rows(section, query, state), PAGE_SIZE)
    try:
        page = paginator.page(page_number)
    except EmptyPage:
        return failure('operator_page_not_found', 'این صفحه وجود نداره. به صفحهٔ قبل برگرد.', 404)
    results = list(page.object_list)
    if section == 'access':
        results = [{'id': str(user.pk), **{key: value for key, value in management_access(user).items()
                   if key in ('accessLevel', 'owned_workspace_limit', 'owned_workspaces',
                              'can_create_workspace', 'features')}} for user in results]
    return private_response({'results': results, 'count': paginator.count,
                             'page': page_number, 'page_size': PAGE_SIZE,
                             'has_next': page.has_next(), 'has_previous': page.has_previous()})
