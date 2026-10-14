import uuid

from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.http import Http404, JsonResponse
from django.views.decorators.http import require_GET
from django.utils.dateparse import parse_datetime
from django.utils.timezone import is_aware

from .services import accessible_workspaces_for, get_accessible_workspace_or_404, workspace_dict

CURSOR_SALT = 'stratino.workspace-list-cursor'
CURSOR_MAX_AGE = 60 * 60


def _error(status, code, message):
    return JsonResponse({'code': code, 'message': message, 'fields': {}}, status=status)


def _verified_user(request):
    return bool(
        request.user.is_authenticated
        and request.user.email_verified_at is not None
    )


@require_GET
def list_workspaces(request):
    if not _verified_user(request):
        return _error(401, 'not_authenticated', 'برای ادامه وارد حساب تأییدشده شوید.')

    raw_limit = request.GET.get('limit', '25')
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError):
        return _error(400, 'validation_error', 'تعداد موارد باید بین ۱ تا ۱۰۰ باشد.')
    if not 1 <= limit <= 100:
        return _error(400, 'validation_error', 'تعداد موارد باید بین ۱ تا ۱۰۰ باشد.')

    after_created_at = None
    after_id = None
    cursor = request.GET.get('cursor', '')
    if cursor:
        if len(cursor) > 500:
            return _error(400, 'invalid_cursor', 'نشانگر فهرست معتبر نیست؛ فهرست را از ابتدا باز کنید.')
        try:
            value = signing.loads(cursor, salt=CURSOR_SALT, max_age=CURSOR_MAX_AGE)
            if value.get('user') != str(request.user.pk):
                raise ValueError
            after_created_at = parse_datetime(value['created_at'])
            after_id = uuid.UUID(value['id'])
            if after_created_at is None or not is_aware(after_created_at):
                raise ValueError
        except (signing.BadSignature, DjangoValidationError, AttributeError, KeyError, TypeError, ValueError):
            return _error(400, 'invalid_cursor', 'نشانگر فهرست معتبر نیست؛ فهرست را از ابتدا باز کنید.')

    workspaces = accessible_workspaces_for(request.user).order_by('created_at', 'id')
    if after_id is not None:
        workspaces = workspaces.filter(
            Q(created_at__gt=after_created_at)
            | Q(created_at=after_created_at, pk__gt=after_id)
        )
    page = list(workspaces[: limit + 1])
    has_more = len(page) > limit
    page = page[:limit]
    next_cursor = None
    if has_more and page:
        next_cursor = signing.dumps(
            {
                'user': str(request.user.pk),
                'created_at': page[-1].created_at.isoformat(),
                'id': str(page[-1].pk),
            },
            salt=CURSOR_SALT,
            compress=True,
        )
    return JsonResponse({
        'items': [workspace_dict(workspace) for workspace in page],
        'next_cursor': next_cursor,
    })


@require_GET
def read_workspace(request, workspace_id):
    if not _verified_user(request):
        return _error(401, 'not_authenticated', 'برای ادامه وارد حساب تأییدشده شوید.')
    try:
        workspace = get_accessible_workspace_or_404(request.user, workspace_id)
    except Http404:
        return _error(404, 'workspace_not_found', 'فضای کار در دسترس نیست.')
    return JsonResponse(workspace_dict(workspace))

