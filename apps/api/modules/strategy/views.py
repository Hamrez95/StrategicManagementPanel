import json

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404, JsonResponse
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from modules.workspaces.services import WorkspaceActionError, get_accessible_workspace_or_404

from .services import (
    create_factor,
    create_option,
    delete_factor,
    delete_option,
    read_strategy_board,
    update_factor,
    update_option,
)


def _error(status, code, message, fields=None):
    return JsonResponse({'code': code, 'message': message, 'fields': fields or {}}, status=status)


def _body(request):
    try:
        value = json.loads(request.body or b'{}')
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _verified(request):
    user = request.user
    return bool(user.is_authenticated and user.is_active and user.email_verified_at is not None)


@require_GET
def strategy_board(request, workspace_id):
    if not _verified(request):
        return _error(401, 'not_authenticated', 'برای ادامه وارد حساب تأییدشده شوید.')
    try:
        workspace = get_accessible_workspace_or_404(request.user, workspace_id)
        return JsonResponse(read_strategy_board(request.user, workspace))
    except Http404:
        return _error(404, 'workspace_not_found', 'فضای کار در دسترس نیست.')


@require_POST
def strategy_factor_create(request, workspace_id):
    body = _body(request)
    if body is None:
        return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
    return _run(request, workspace_id, lambda workspace: create_factor(request.user, workspace, body), status=201)


@require_http_methods(['PATCH', 'DELETE'])
def strategy_factor_detail(request, workspace_id, factor_id):
    if request.method == 'PATCH':
        body = _body(request)
        if body is None:
            return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
        return _run(request, workspace_id, lambda workspace: update_factor(request.user, workspace, factor_id, body))
    confirm_value = request.GET.get('confirm_dependencies', 'false')
    if confirm_value not in {'true', 'false'}:
        return _error(400, 'validation_error', 'مقدار تأیید وابستگی معتبر نیست.', {'confirm_dependencies': ['true یا false بفرستید.']})
    return _run(
        request,
        workspace_id,
        lambda workspace: delete_factor(request.user, workspace, factor_id, confirm_dependencies=confirm_value == 'true'),
    )


@require_POST
def strategy_option_create(request, workspace_id):
    body = _body(request)
    if body is None:
        return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
    return _run(request, workspace_id, lambda workspace: create_option(request.user, workspace, body), status=201)


@require_http_methods(['PATCH', 'DELETE'])
def strategy_option_detail(request, workspace_id, option_id):
    if request.method == 'PATCH':
        body = _body(request)
        if body is None:
            return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
        return _run(request, workspace_id, lambda workspace: update_option(request.user, workspace, option_id, body))
    return _run(request, workspace_id, lambda workspace: delete_option(request.user, workspace, option_id))


def _run(request, workspace_id, operation, *, status=200):
    if not _verified(request):
        return _error(401, 'not_authenticated', 'برای ادامه وارد حساب تأییدشده شوید.')
    try:
        workspace = get_accessible_workspace_or_404(request.user, workspace_id)
        return JsonResponse(operation(workspace), status=status)
    except Http404:
        return _error(404, 'workspace_not_found', 'فضای کار در دسترس نیست.')
    except WorkspaceActionError as error:
        return _error(error.status, error.code, error.message, error.fields)
    except DjangoValidationError as error:
        fields = getattr(error, 'message_dict', None) or {'non_field_errors': error.messages}
        return _error(400, 'validation_error', 'اطلاعات را بررسی کنید.', fields)
