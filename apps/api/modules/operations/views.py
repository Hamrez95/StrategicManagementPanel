"""Read-only, minimal management summaries. No Workspace content or impersonation."""
from uuid import UUID

from django.core.paginator import EmptyPage, Paginator
from django.db.models import CharField, Count, F, Prefetch, Q, Value
from django.db.models.functions import Cast

from modules.accounts.models import User
from modules.workspaces.entitlements import FEATURES, management_access
from modules.workspaces.models import (
    ManagementPlan,
    ManagementSubscription,
    ManagementSubscriptionEvent,
    Workspace,
    WorkspaceEvent,
)

from .models import OperatorActionEvent, OperatorFactor, OperatorSecurityEvent
from .academy_plans import can_edit_academy_plans
from .academy_access import allowed as academy_action_allowed
from .security import (
    SECTIONS,
    approved_access,
    explicit_permission,
    failure,
    operator_mfa_verified,
    operator_sections,
    private_response,
)

PAGE_SIZE = 25


def operator_status(request):
    if request.method != 'GET':
        return method_denied()
    actor, sections = operator_sections(request)
    if actor is None or not sections:
        return denied(request)
    from .mfa import cipher, verified_proof
    access = approved_access(actor)
    proof = verified_proof(request, actor) if not access.must_change_password else None
    return private_response({
        'sections': sections, 'mfa_ready': proof is not None,
        'mfa_configured': cipher() is not None,
        'mfa_enrolled': OperatorFactor.objects.filter(user=actor, enabled_at__isnull=False).exists(),
        'expires_at': proof.expires_at.isoformat() if proof else None,
        'must_change_password': access.must_change_password,
        'can_manage_operators': access.role == 'owner',
        'actor': {'name': actor.get_full_name() or actor.display_name or 'اپراتور'},
        'capabilities': {
            'edit_academy_plans': can_edit_academy_plans(actor, sections),
            'edit_academy_samples': academy_action_allowed(actor, sections, 'samples'),
            'grant_academy': academy_action_allowed(actor, sections, 'grant'),
            'revoke_academy': academy_action_allowed(actor, sections, 'revoke'),
            'identity': 'accounts' in sections and explicit_permission(actor, 'accounts.operator_view_identity'),
            'manage_accounts': 'accounts' in sections and explicit_permission(actor, 'accounts.operator_manage_accounts'),
            'triage_feedback': 'feedback' in sections and explicit_permission(actor, 'accounts.operator_triage_feedback'),
            'grant': {'plans', 'subscriptions'}.issubset(sections) and explicit_permission(actor, 'workspaces.add_managementsubscription'),
            'revoke': 'subscriptions' in sections and explicit_permission(actor, 'workspaces.change_managementsubscription'),
        },
    })


def operator_overview(request):
    if request.method != 'GET':
        return method_denied()
    actor, sections = operator_sections(request)
    if actor is None or not sections:
        return denied(request)
    if not operator_mfa_verified(request, actor):
        return failure('operator_mfa_unavailable', 'برای ادامه، احراز هویت دومرحله‌ای رو تأیید کن.', 403)
    from modules.academy.models import (
        AcademyCourse,
        AcademyOrder,
        AcademyPlan,
        AcademySubscription,
        AcademyUnit,
        FreeSample,
        LearningFeedback,
    )
    counts = {}
    sources = {
        'accounts': User.objects, 'workspaces': Workspace.objects,
        'plans': ManagementPlan.objects, 'subscriptions': ManagementSubscription.objects,
        'academy': AcademyCourse.objects, 'feedback': LearningFeedback.objects,
        'academy_plans': AcademyPlan.objects, 'academy_subscriptions': AcademySubscription.objects,
        'academy_orders': AcademyOrder.objects, 'academy_samples': FreeSample.objects,
    }
    for section, source in sources.items():
        if section in sections:
            counts[section] = source.count()
    if 'academy' in sections:
        counts['lessons'] = AcademyUnit.objects.count()
    return private_response({'counts': counts})


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


def _rows(section, query, state, *, identity_allowed=False):
    identity = _uuid(query)
    if section in ('accounts', 'access'):
        rows = _accounts(query)
        if state:
            rows = rows.filter(is_active=state == 'active')
        if section == 'access':
            return rows.only('id')
        return rows.annotate(verified=Q(email_verified_at__isnull=False)).values(
            'id', 'is_active', 'verified', 'date_joined',
            *(['first_name', 'last_name', 'email', 'phone_number'] if identity_allowed else []))
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
    if section == 'academy':
        from modules.academy.models import AcademyCourse
        rows = AcademyCourse.objects.select_related('area').order_by('order', 'id')
        if query:
            rows = rows.filter(Q(title__icontains=query) | Q(id__icontains=query))
        return rows.annotate(unit_count=Count('units', distinct=True),
                             card_count=Count('units__cards', distinct=True)).values(
            'id', 'title', 'area_id', 'order', 'unit_count', 'card_count')
    if section.startswith('academy_'):
        from modules.academy.models import (
            AcademyArea,
            AcademyOrder,
            AcademyOrderItem,
            AcademyPlan,
            AcademySubscription,
            FreeSample,
        )
        if section == 'academy_plans':
            rows = AcademyPlan.objects.order_by('order', 'id')
            if query:
                rows = rows.filter(Q(code__icontains=query) | Q(title__icontains=query))
            if state:
                rows = rows.filter(is_active=state == 'active')
            return rows.values('id', 'code', 'title', 'kind', 'is_active', 'price', 'sale_price',
                               'currency', 'duration_days')
        if section == 'academy_subscriptions':
            rows = AcademySubscription.objects.select_related('plan', 'order_item__order').prefetch_related(
                Prefetch('areas', queryset=AcademyArea.objects.order_by('order', 'id')),
                'order_item__areas',
            ).order_by('-created_at', '-id')
            if query:
                rows = rows.filter(Q(pk=identity) | Q(user_id=identity)) if identity else rows.none()
            if state:
                rows = rows.filter(status=state)
            return rows
        if section == 'academy_orders':
            rows = AcademyOrder.objects.prefetch_related(Prefetch(
                'items', queryset=AcademyOrderItem.objects.prefetch_related(
                    Prefetch('areas', queryset=AcademyArea.objects.order_by('order', 'id')),
                ).order_by('id'),
            )).order_by('-created_at', '-id')
            if query:
                rows = rows.filter(Q(pk=identity) | Q(user_id=identity)) if identity else rows.none()
            if state:
                rows = rows.filter(status=state)
            return rows
        rows = FreeSample.objects.order_by('card__unit__course__order', 'card__unit__order',
                                           'card__order', 'card_id')
        if query:
            rows = rows.filter(Q(card__id__icontains=query) | Q(card__title__icontains=query)
                               | Q(card__unit__id__icontains=query) | Q(card__unit__course__id__icontains=query))
        if state:
            rows = rows.filter(is_active=state == 'active')
        return rows.annotate(id=F('card_id'), title=F('card__title'), unit_id=F('card__unit_id'),
                             course_id=F('card__unit__course_id')).values(
            'id', 'title', 'unit_id', 'course_id', 'is_active', 'updated_at')
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
    security_events = OperatorSecurityEvent.objects.all()
    if query:
        security_events = security_events.filter(Q(pk=identity) | Q(actor_id=identity)) if identity else security_events.none()
    security_events = security_events.order_by().annotate(
        event_id=Cast('pk', CharField()), source=Value('security', output_field=CharField()),
        target=Cast('actor_id', CharField()),
    ).values(*fields)
    action_events = OperatorActionEvent.objects.all()
    if query:
        action_events = action_events.filter(Q(actor_id=identity) | Q(target=query) | Q(pk=identity)) if identity else action_events.filter(target=query)
    action_events = action_events.order_by().annotate(
        event_id=Cast('pk', CharField()), source=Value('operator', output_field=CharField()),
    ).values(*fields)
    return workspace_events.union(grant_events, security_events, action_events, all=True).order_by('-created_at', 'source', 'event_id')


def operator_collection(request, section):
    if request.method != 'GET':
        return method_denied()
    actor, sections = operator_sections(request)
    if actor is None or section not in SECTIONS or section not in sections:
        return denied(request)
    # Check before parsing query parameters or touching any customer queryset.
    if not operator_mfa_verified(request, actor):
        return failure('operator_mfa_unavailable',
                       'برای ادامه، احراز هویت دومرحله‌ای رو تأیید کن.', 403)
    query = request.GET.get('q', '').strip()
    state = request.GET.get('state', '')
    allowed_states = {
        'accounts': ('active', 'inactive'), 'access': ('active', 'inactive'),
        'plans': ('active', 'inactive'), 'workspaces': ('active', 'archived'),
        'subscriptions': ('active', 'revoked'), 'audit': (), 'academy': (), 'feedback': (),
        'academy_plans': ('active', 'inactive'), 'academy_subscriptions': ('active', 'revoked'),
        'academy_orders': ('requested', 'pending', 'paid', 'cancelled', 'refunded'),
        'academy_samples': ('active', 'inactive'),
    }
    try:
        page_number = int(request.GET.get('page', '1'))
    except ValueError:
        page_number = 0
    if len(query) > 254 or page_number < 1 or (state and state not in allowed_states[section]):
        return failure('operator_invalid_query', 'جست‌وجو، وضعیت یا شمارهٔ صفحه معتبر نیست.', 400)
    if section == 'feedback':
        return failure('operator_use_feedback_inbox', 'از بخش نظرهای یادگیرنده‌ها استفاده کن.', 400)
    paginator = Paginator(_rows(section, query, state,
                               identity_allowed=explicit_permission(actor, 'accounts.operator_view_identity')), PAGE_SIZE)
    try:
        page = paginator.page(page_number)
    except EmptyPage:
        return failure('operator_page_not_found', 'این صفحه وجود نداره. به صفحهٔ قبل برگرد.', 404)
    results = list(page.object_list)
    if section == 'academy_subscriptions':
        from django.utils import timezone
        from modules.academy.account_summary import effective_areas, subscription_status
        now = timezone.now()
        results = [{
            'id': str(row.pk), 'user_id': str(row.user_id), 'plan_code': row.plan.code,
            'coverage': row.coverage, 'status': row.status,
            'is_effective': subscription_status(row, now) == 'active'
                            and (row.coverage != 'specialty' or bool(effective_areas(row))),
            'starts_at': row.starts_at, 'ends_at': row.ends_at,
            'order_item_id': row.order_item_id,
            'areas': [area.pk for area in row.areas.all()],
        } for row in results]
    if section == 'academy_orders':
        results = [{
            'id': str(row.pk), 'user_id': str(row.user_id), 'status': row.status,
            'created_at': row.created_at, 'paid_at': row.paid_at,
            'items': [{
                'plan_title': item.plan_title, 'coverage': item.plan_kind,
                'original_unit_price': item.original_unit_price, 'unit_price': item.unit_price,
                'subtotal': item.subtotal, 'discount_amount': item.discount_amount,
                'total': item.total, 'currency': item.currency, 'duration_days': item.duration_days,
                'areas': [area.pk for area in item.areas.all()],
            } for item in row.items.all()],
        } for row in results]
    if section == 'access':
        results = [{'id': str(user.pk), **{key: value for key, value in management_access(user).items()
                   if key in ('accessLevel', 'owned_workspace_limit', 'owned_workspaces',
                              'can_create_workspace', 'features')}} for user in results]
    return private_response({'results': results, 'count': paginator.count,
                             'page': page_number, 'page_size': PAGE_SIZE,
                             'has_next': page.has_next(), 'has_previous': page.has_previous()})
