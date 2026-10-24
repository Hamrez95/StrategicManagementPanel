import json

from django.core.exceptions import PermissionDenied, ValidationError
from django.http import Http404, JsonResponse
from django.views.decorators.http import require_GET, require_http_methods
from rest_framework.exceptions import ValidationError as WireValidationError

from modules.workspaces.services import (
    WorkspaceActionError,
    get_accessible_workspace_or_404,
)

from .api import capture_observation, read_metric_page, read_metric_run, run_dict
from .serializers import (
    ContributionCreateSerializer,
    MetricPageSerializer,
    ObservationCreateSerializer,
)
from .services import calculate_and_store_contribution_margin


def _error(status, code, message, fields=None):
    return JsonResponse(
        {"code": code, "message": message, "fields": fields or {}}, status=status
    )


def _dispatch(request, workspace_id, operation):
    user = request.user
    if not (user.is_authenticated and user.is_active and user.email_verified_at):
        return _error(401, "not_authenticated", "برای ادامه وارد حساب تأییدشده‌ات شو.")
    try:
        workspace = get_accessible_workspace_or_404(user, workspace_id)
        return operation(workspace)
    except Http404:
        return _error(404, "not_found", "این داده یا فضای کاری در دسترس نیست.")
    except PermissionDenied:
        return _error(
            403, "workspace_permission_denied", "دسترسی ثبت یا تغییر این داده رو نداری."
        )
    except WorkspaceActionError as error:
        return _error(error.status, error.code, error.message, error.fields)
    except WireValidationError as error:
        return _error(400, "validation_error", "اطلاعات رو بررسی کن.", error.detail)
    except ValidationError as error:
        fields = getattr(error, "message_dict", None) or {
            "non_field_errors": error.messages
        }
        return _error(400, "validation_error", "اطلاعات رو بررسی کن.", fields)


def _input(request, serializer_class):
    try:
        body = json.loads(request.body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise WireValidationError({"body": ["Send a JSON object."]}) from None
    serializer = serializer_class(data=body)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def _page(request, workspace, *, runs=False):
    serializer = MetricPageSerializer(data=request.GET.dict())
    serializer.is_valid(raise_exception=True)
    return JsonResponse(
        read_metric_page(
            request.user,
            workspace.pk,
            offset=serializer.validated_data["offset"],
            runs=runs,
        )
    )


@require_http_methods(["GET", "POST"])
def observation_collection(request, workspace_id):
    def operation(workspace):
        if request.method == "GET":
            return _page(request, workspace)
        data = _input(request, ObservationCreateSerializer)
        return JsonResponse(
            capture_observation(request.user, workspace.pk, data), status=201
        )

    return _dispatch(request, workspace_id, operation)


@require_http_methods(["GET", "POST"])
def contribution_collection(request, workspace_id):
    def operation(workspace):
        if request.method == "GET":
            return _page(request, workspace, runs=True)
        data = _input(request, ContributionCreateSerializer)
        run, _ = calculate_and_store_contribution_margin(
            workspace_id=workspace.pk, actor=request.user, **data
        )
        return JsonResponse(run_dict(run), status=201)

    return _dispatch(request, workspace_id, operation)


@require_GET
def contribution_detail(request, workspace_id, run_id):
    return _dispatch(
        request,
        workspace_id,
        lambda workspace: JsonResponse(
            read_metric_run(request.user, workspace.pk, run_id)
        ),
    )
