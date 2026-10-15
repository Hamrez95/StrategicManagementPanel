import json

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.exceptions import RequestDataTooBig
from django.http import Http404, HttpResponse, HttpResponseBase, JsonResponse
from django.http.multipartparser import MultiPartParserError
from django.views.decorators.http import require_http_methods

from modules.workspaces.services import WorkspaceActionError, get_accessible_workspace_or_404

from .services import create_document_record, read_document_board, update_document_record
from .attachments.services import (
    delete_attachment,
    download_attachment,
    list_attachments,
    prepare_attachment_upload,
    reserve_attachment,
    retry_attachment_scan,
    upload_attachment,
)
from .attachments.upload_handlers import AttachmentSizeLimitHandler


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


@require_http_methods(['GET', 'POST'])
def attachment_collection(request, workspace_id, record_id):
    if request.method == 'GET':
        return _run(request, workspace_id, lambda workspace: list_attachments(request.user, workspace, record_id))
    body = _body(request)
    if body is None:
        return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
    return _run(request, workspace_id, lambda workspace: reserve_attachment(request.user, workspace, record_id, body), status=201)


@require_http_methods(['PUT'])
def attachment_content(request, workspace_id, record_id, attachment_id):
    request.upload_handlers.insert(0, AttachmentSizeLimitHandler(request))

    def upload(workspace):
        prepare_attachment_upload(request.user, workspace, record_id, attachment_id)
        try:
            files = request.FILES.getlist('file')
        except (MultiPartParserError, RequestDataTooBig):
            return _error(413, 'attachment_too_large', 'اندازه درخواست از حد مجاز بیشتر است.')
        size_handler = request.upload_handlers[0]
        if getattr(size_handler, 'exceeded', False):
            return _error(413, 'attachment_too_large', 'اندازه فایل از حد مجاز بیشتر است.')
        if getattr(size_handler, 'too_many_files', False):
            return _error(400, 'invalid_attachment', 'فقط یک فایل را برای این رزرو بفرستید.')
        if len(files) != 1:
            return _error(400, 'invalid_attachment', 'فقط یک فایل را برای این رزرو بفرستید.')
        return upload_attachment(request.user, workspace, record_id, attachment_id, files[0])

    return _run(
        request,
        workspace_id,
        upload,
    )


@require_http_methods(['POST'])
def attachment_scan(request, workspace_id, record_id, attachment_id):
    return _run(
        request,
        workspace_id,
        lambda workspace: retry_attachment_scan(request.user, workspace, record_id, attachment_id),
    )


@require_http_methods(['GET'])
def attachment_download(request, workspace_id, record_id, attachment_id):
    return _run(
        request,
        workspace_id,
        lambda workspace: download_attachment(request.user, workspace, record_id, attachment_id),
    )


@require_http_methods(['DELETE'])
def attachment_detail(request, workspace_id, record_id, attachment_id):
    return _run(
        request,
        workspace_id,
        lambda workspace: delete_attachment(request.user, workspace, record_id, attachment_id),
        status=204,
    )


def _run(request, workspace_id, operation, *, status=200):
    if not _verified(request):
        return _error(401, 'not_authenticated', 'برای ادامه وارد حساب تأییدشده شوید.')
    try:
        workspace = get_accessible_workspace_or_404(request.user, workspace_id)
        result = operation(workspace)
        if isinstance(result, HttpResponseBase):
            return result
        if isinstance(result, tuple) and len(result) == 2 and isinstance(result[1], int):
            payload, response_status = result
            return JsonResponse(payload, status=response_status)
        if status == 204:
            return HttpResponse(status=204)
        return JsonResponse(result, status=status)
    except Http404:
        return _error(404, 'workspace_not_found', 'فضای کار در دسترس نیست.')
    except WorkspaceActionError as error:
        return _error(error.status, error.code, error.message, error.fields)
    except DjangoValidationError as error:
        fields = getattr(error, 'message_dict', None) or {'non_field_errors': error.messages}
        return _error(400, 'validation_error', 'اطلاعات را بررسی کنید.', fields)
