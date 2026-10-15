import json

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404, JsonResponse
from django.views.decorators.http import require_http_methods

from modules.workspaces.services import WorkspaceActionError, get_accessible_workspace_or_404

from .services import create_document_record, read_document_board, update_document_record


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


@require_http_methods(['GET', 'POST'])
def document_collection(request, workspace_id):
    if request.method == 'GET':
        return _run(
            request,
            workspace_id,
            lambda workspace: read_document_board(
                request.user,
                workspace,
                stage=request.GET.get('stage', ''),
                industry=request.GET.get('industry', ''),
            ),
        )
    body = _body(request)
    if body is None:
        return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
    return _run(request, workspace_id, lambda workspace: create_document_record(request.user, workspace, body), status=201)


@require_http_methods(['PATCH'])
def document_detail(request, workspace_id, record_id):
    body = _body(request)
    if body is None:
        return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
    return _run(request, workspace_id, lambda workspace: update_document_record(request.user, workspace, record_id, body))


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
