from django.core.exceptions import RequestDataTooBig, ValidationError
from django.db import IntegrityError, transaction
from django.http import Http404, HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods, require_POST

from modules.workspaces.models import Workspace
from modules.workspaces.services import get_accessible_workspace_or_404, workspace_role

from .models import WorkspaceImportBatch
from .services import MAX_REQUEST_BYTES, ImportValidationError, parse_import_request

PRIVATE_HEADERS = {'Cache-Control': 'no-store, private'}


def _error(status, code, message, fields=None):
    return JsonResponse(
        {'code': code, 'message': message, 'fields': fields or {}},
        status=status,
        headers=PRIVATE_HEADERS,
    )


def _verified(request):
    user = request.user
    return bool(user.is_authenticated and user.is_active and user.email_verified_at is not None)


def _workspace(request, workspace_id, *, write=False):
    if not _verified(request):
        raise PermissionError('not_authenticated')
    workspace = get_accessible_workspace_or_404(request.user, workspace_id)
    role = workspace_role(request.user, workspace)
    if role is None:
        raise Http404('Workspace is not available.')
    if write and role not in {'owner', 'editor'}:
        raise PermissionError('workspace_permission_denied')
    if write and workspace.archived_at is not None:
        raise ImportValidationError('فضای بایگانی‌شده مقصد واردسازی نیست.', code='workspace_archived')
    return workspace, role


def _workspace_error(error):
    if isinstance(error, Http404):
        return _error(404, 'workspace_not_found', 'فضای کار در دسترس نیست.')
    if isinstance(error, PermissionError):
        if str(error) == 'not_authenticated':
            return _error(401, 'not_authenticated', 'برای ادامه وارد حساب تأییدشده شوید.')
        return _error(403, 'workspace_permission_denied', 'برای واردسازی در این فضا دسترسی لازم را ندارید.')
    if isinstance(error, ImportValidationError):
        status = 409 if error.code == 'workspace_archived' else 400
        return _error(status, error.code, str(error), error.fields)
    return _error(400, 'workspace_not_available', 'فضای کار در دسترس نیست.')


def _request_preview(request):
    if request.META.get('CONTENT_LENGTH'):
        try:
            if int(request.META['CONTENT_LENGTH']) > MAX_REQUEST_BYTES:
                raise ImportValidationError('فایل پشتیبان بیش از یک مگابایت است.', fields={'file': ['حداکثر اندازه فایل یک مگابایت است.']}, code='import_too_large')
        except ValueError:
            raise ImportValidationError('اندازه درخواست معتبر نیست.') from None
    try:
        return parse_import_request(request.body)
    except RequestDataTooBig:
        raise ImportValidationError('فایل پشتیبان بیش از یک مگابایت است.', fields={'file': ['حداکثر اندازه فایل یک مگابایت است.']}, code='import_too_large') from None


def _batch_payload(batch, *, include_data=False, duplicate=False):
    payload = {
        'id': str(batch.pk),
        'workspace_id': str(batch.workspace_id),
        'created_by_id': str(batch.created_by_id),
        'source_schema': batch.source_schema,
        'mapping_version': batch.mapping_version,
        'source_digest': batch.source_digest,
        'record_counts': batch.record_counts,
        'record_count': sum(batch.record_counts.values()),
        'missing_attachment_bytes': batch.missing_attachment_bytes,
        'created_at': batch.created_at,
        'undone_at': batch.undone_at,
        'duplicate': duplicate,
    }
    if include_data:
        payload['data'] = batch.data
        payload['source_backup'] = batch.source_backup
    return payload


def _import_idempotency_key(request):
    value = request.headers.get('Idempotency-Key', '').strip()
    if not value or len(value) > 100 or any(not (char in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-') for char in value):
        raise ImportValidationError('کلید یکتای واردسازی معتبر نیست.', fields={'idempotency_key': ['یک کلید ۱ تا ۱۰۰ نویسه‌ای بفرستید.']}, code='invalid_idempotency_key')
    return value


@require_POST
def preview_import(request, workspace_id):
    try:
        workspace, _ = _workspace(request, workspace_id, write=True)
        preview = _request_preview(request)
    except (PermissionError, Http404, ImportValidationError) as error:
        return _workspace_error(error)
    return JsonResponse({
        'workspace_id': str(workspace.pk),
        'workspace_name': workspace.name,
        'schema_version': 1,
        'recognized': True,
        'record_counts': preview['record_counts'],
        'record_count': preview['record_count'],
        'missing_attachment_bytes': preview['missing_attachment_bytes'],
        'warnings': preview['warnings'],
    }, headers=PRIVATE_HEADERS)


@require_http_methods(['GET', 'POST'])
def workspace_imports(request, workspace_id):
    try:
        workspace, _ = _workspace(request, workspace_id, write=request.method == 'POST')
    except (PermissionError, Http404, ImportValidationError) as error:
        return _workspace_error(error)

    if request.method == 'GET':
        batches = WorkspaceImportBatch.objects.filter(workspace=workspace).select_related('created_by')
        return JsonResponse({'items': [_batch_payload(batch) for batch in batches]}, headers=PRIVATE_HEADERS)

    try:
        key = _import_idempotency_key(request)
        preview = _request_preview(request)
    except ImportValidationError as error:
        return _workspace_error(error)

    try:
        with transaction.atomic():
            locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
            current_role = workspace_role(request.user, locked)
            if current_role not in {'owner', 'editor'}:
                return _error(403, 'workspace_permission_denied', 'برای واردسازی در این فضا دسترسی لازم را ندارید.')
            if locked.archived_at is not None:
                raise ImportValidationError('فضای بایگانی‌شده مقصد واردسازی نیست.', code='workspace_archived')
            by_key = WorkspaceImportBatch.objects.filter(workspace=locked, idempotency_key=key).first()
            if by_key:
                if by_key.source_digest != preview['source_digest']:
                    return _error(409, 'idempotency_conflict', 'این کلید قبلاً برای فایل دیگری استفاده شده است.')
                return JsonResponse(_batch_payload(by_key, duplicate=True), headers=PRIVATE_HEADERS)
            existing = WorkspaceImportBatch.objects.filter(
                workspace=locked,
                source_digest=preview['source_digest'],
                undone_at__isnull=True,
            ).first()
            if existing:
                return JsonResponse(_batch_payload(existing, duplicate=True), headers=PRIVATE_HEADERS)
            batch = WorkspaceImportBatch.objects.create(
                workspace=locked,
                created_by=request.user,
                idempotency_key=key,
                source_schema=preview['source_schema'],
                mapping_version=1,
                source_digest=preview['source_digest'],
                record_counts=preview['record_counts'],
                missing_attachment_bytes=preview['missing_attachment_bytes'],
                data=preview['data'],
                source_backup=preview['source_backup'],
            )
    except Workspace.DoesNotExist:
        return _error(404, 'workspace_not_found', 'فضای کار در دسترس نیست.')
    except ImportValidationError as error:
        return _workspace_error(error)
    except IntegrityError:
        # A concurrent import can win between the digest lookup and insert.
        existing = WorkspaceImportBatch.objects.filter(
            workspace=workspace,
            source_digest=preview['source_digest'],
            undone_at__isnull=True,
        ).first()
        if existing:
            return JsonResponse(_batch_payload(existing, duplicate=True), headers=PRIVATE_HEADERS)
        return _error(409, 'idempotency_conflict', 'واردسازی هم‌زمان انجام شد؛ فهرست batchها را تازه کنید.')
    return JsonResponse(_batch_payload(batch), status=201, headers=PRIVATE_HEADERS)


@require_http_methods(['GET', 'DELETE'])
def workspace_import_detail(request, workspace_id, batch_id):
    try:
        workspace, role = _workspace(request, workspace_id, write=request.method == 'DELETE')
        batch = WorkspaceImportBatch.objects.select_related('created_by').get(pk=batch_id, workspace=workspace)
    except (PermissionError, Http404, ImportValidationError) as error:
        return _workspace_error(error)
    except (WorkspaceImportBatch.DoesNotExist, ValidationError, TypeError, ValueError):
        return _error(404, 'import_batch_not_found', 'نسخه واردشده در این فضا پیدا نشد.')

    if request.method == 'GET':
        return JsonResponse(_batch_payload(batch, include_data=True), headers=PRIVATE_HEADERS)
    if role != 'owner' and batch.created_by_id != request.user.pk:
        return _error(403, 'import_undo_permission_denied', 'فقط واردکننده یا مالک فضا می‌تواند batch را بازگردانی کند.')
    if batch.undone_at is None:
        batch.undone_at = timezone.now()
        batch.save(update_fields=['undone_at'])
    return HttpResponse(status=204, headers=PRIVATE_HEADERS)
