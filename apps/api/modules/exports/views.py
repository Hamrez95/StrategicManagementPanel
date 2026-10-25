import json
import re

from django.core.exceptions import RequestDataTooBig
from django.core.files.storage import default_storage
from django.http import FileResponse, Http404, HttpResponse, JsonResponse
from django.views.decorators.http import require_http_methods

from modules.workspaces.services import get_accessible_workspace_or_404, workspace_role
from modules.workspaces.services import WorkspaceActionError
from modules.workspaces.entitlements import require_workspace_feature
from .schema_v2 import PROFESSIONAL_METHOD

from .models import ExportSnapshot
from .services import (
    ExportValidationError,
    create_snapshot,
    read_csv,
    read_json,
    snapshot_payload,
)

PRIVATE_HEADERS = {
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
}


def _error(status, code, message):
    return JsonResponse({'code': code, 'message': message, 'fields': {}}, status=status, headers=PRIVATE_HEADERS)


def _verified(request):
    user = request.user
    return bool(user.is_authenticated and user.is_active and user.email_verified_at is not None)


def _workspace(request, workspace_id):
    if not _verified(request):
        raise PermissionError('not_authenticated')
    workspace = get_accessible_workspace_or_404(request.user, workspace_id)
    if workspace_role(request.user, workspace) is None:
        raise Http404('Workspace is not available.')
    return workspace


def _workspace_error(error):
    if isinstance(error, WorkspaceActionError):
        return _error(error.status, error.code, error.message)
    if isinstance(error, Http404):
        return _error(404, 'workspace_not_found', 'فضای کار در دسترس نیست.')
    if isinstance(error, PermissionError) and str(error) == 'not_authenticated':
        return _error(401, 'not_authenticated', 'برای ادامه وارد حساب تأییدشده شوید.')
    return _error(403, 'workspace_permission_denied', 'برای خروجی این فضا دسترسی لازم را ندارید.')


@require_http_methods(['GET', 'POST'])
def export_collection(request, workspace_id):
    try:
        workspace = _workspace(request, workspace_id)
    except (PermissionError, Http404) as error:
        return _workspace_error(error)

    if request.method == 'GET':
        snapshots = ExportSnapshot.objects.filter(workspace=workspace).order_by('-created_at', '-id')
        return JsonResponse(
            {'workspace_id': str(workspace.pk), 'items': [snapshot_payload(item) for item in snapshots]},
            headers=PRIVATE_HEADERS,
        )

    try:
        if len(request.body) > 256:
            return _error(400, 'invalid_export_request', 'درخواست ساخت گزارش باید خالی باشد.')
    except RequestDataTooBig:
        return _error(413, 'export_request_too_large', 'درخواست ساخت گزارش بیش از اندازه بزرگ است.')
    key = request.headers.get('Idempotency-Key', '')
    try:
        body = json.loads(request.body or b'{}')
        if not isinstance(body, dict) or set(body) - {'schema_version', 'purpose'}:
            return _error(400, 'invalid_export_request', 'درخواست خروجی معتبر نیست.')
        snapshot, created = create_snapshot(request.user, workspace, key,
            schema_version=body.get('schema_version', 1), purpose=body.get('purpose', 'raw'))
    except (ValueError, UnicodeDecodeError):
        return _error(400, 'invalid_export_request', 'درخواست خروجی معتبر نیست.')
    except WorkspaceActionError as error:
        return _workspace_error(error)
    except ExportValidationError as error:
        return _error(400, error.code, str(error))
    except Http404:
        return _error(404, 'workspace_not_found', 'فضای کار در دسترس نیست.')
    except RequestDataTooBig:
        return _error(413, 'export_request_too_large', 'درخواست ساخت گزارش بیش از اندازه بزرگ است.')
    except OSError:
        return _error(503, 'export_storage_unavailable', 'ساخت فایل خروجی انجام نشد. اتصال ذخیره‌سازی را بررسی کنید و دوباره تلاش کنید.')
    except Exception:
        return _error(503, 'export_unavailable', 'ساخت گزارش کامل نشد. دوباره تلاش کنید.')
    response = JsonResponse(
        snapshot_payload(snapshot, include_data=True),
        status=201 if created else 200,
        headers=PRIVATE_HEADERS,
    )
    return response


@require_http_methods(['GET'])
def export_detail(request, workspace_id, record_id):
    try:
        workspace = _workspace(request, workspace_id)
        snapshot = ExportSnapshot.objects.get(pk=record_id, workspace=workspace)
        if snapshot.method_version == PROFESSIONAL_METHOD:
            require_workspace_feature(workspace, 'can_generate_reports')
    except (PermissionError, Http404, WorkspaceActionError) as error:
        return _workspace_error(error)
    except (ExportSnapshot.DoesNotExist, ValueError, TypeError):
        return _error(404, 'export_not_found', 'نسخهٔ گزارش در این فضا پیدا نشد.')
    return JsonResponse(snapshot_payload(snapshot, include_data=True), headers=PRIVATE_HEADERS)


@require_http_methods(['GET'])
def export_download(request, workspace_id, record_id):
    try:
        workspace = _workspace(request, workspace_id)
        snapshot = ExportSnapshot.objects.get(pk=record_id, workspace=workspace)
        if snapshot.method_version == PROFESSIONAL_METHOD:
            require_workspace_feature(workspace, 'can_generate_reports')
    except (PermissionError, Http404, WorkspaceActionError) as error:
        return _workspace_error(error)
    except (ExportSnapshot.DoesNotExist, ValueError, TypeError):
        return _error(404, 'export_not_found', 'نسخهٔ گزارش در این فضا پیدا نشد.')

    export_format = request.GET.get('format', 'zip')
    base_name = f'stratino-{snapshot.pk}'
    if export_format == 'json':
        response = HttpResponse(read_json(snapshot), content_type='application/json; charset=utf-8', headers=PRIVATE_HEADERS)
        response['Content-Disposition'] = f'attachment; filename="{snapshot.pk}.json"'
        return response
    if export_format == 'csv':
        response = HttpResponse(read_csv(snapshot), content_type='text/csv; charset=utf-8', headers=PRIVATE_HEADERS)
        response['Content-Disposition'] = f'attachment; filename="{snapshot.pk}.csv"'
        return response
    if export_format != 'zip':
        return _error(400, 'invalid_export_format', 'قالب خروجی را JSON، CSV یا ZIP انتخاب کنید.')
    try:
        if not re.fullmatch(r'exports/[a-f0-9]{32}\.zip', snapshot.artifact_key):
            return _error(410, 'export_file_unavailable', 'مسیر فایل خروجی معتبر نیست؛ نسخهٔ تازه بساز.')
        archive = default_storage.open(snapshot.artifact_key, 'rb')
    except (FileNotFoundError, OSError):
        return _error(410, 'export_file_unavailable', 'فایل این نسخه در دسترس نیست؛ گزارش تازه‌ای بسازید.')
    response = FileResponse(archive, as_attachment=True, filename=f'{base_name}.zip', content_type='application/zip')
    for name, value in PRIVATE_HEADERS.items():
        response[name] = value
    response['ETag'] = f'"{snapshot.artifact_sha256}"'
    response['Content-Length'] = str(snapshot.artifact_size_bytes)
    return response
