"""Atomic financial captures reuse the reviewed numeric observation/run services."""

import hashlib
import json

from django.db import transaction
from django.http import Http404, JsonResponse
from django.views.decorators.http import require_http_methods
from rest_framework import serializers

from modules.workspaces.models import Workspace
from modules.workspaces.services import WorkspaceActionError

from .api import capture_observation, observation_dict, require_metric_writer, run_dict
from .models import FinanceCapture
from .serializers import (
    MetricContextSerializer,
    ObservationCreateSerializer,
    StrictSerializer,
)
from .services import calculate_and_store_contribution_margin
from .views import _dispatch, _input


class CaptureSerializer(StrictSerializer):
    id = serializers.UUIDField()
    context = MetricContextSerializer()
    observations = ObservationCreateSerializer(many=True, min_length=2, max_length=2)

    def validate(self, attrs):
        if {row["binding_id"] for row in attrs["observations"]} != {
            "net_revenue",
            "variable_costs",
        }:
            raise serializers.ValidationError(
                {"observations": "Send one revenue and one variable-cost observation."}
            )
        for row in attrs["observations"]:
            if any(row[key] != value for key, value in attrs["context"].items()):
                raise serializers.ValidationError(
                    {"context": "Both inputs must share the exact context."}
                )
        return attrs


def capture_dict(capture):
    return {
        "id": str(capture.pk),
        "workspace_id": str(capture.workspace_id),
        "observations": [
            observation_dict(capture.revenue),
            observation_dict(capture.variable_costs),
        ],
        "run": run_dict(capture.run) if capture.run_id else None,
        "created_at": capture.created_at,
    }


@transaction.atomic
def save_capture(actor, workspace, data):
    workspace = Workspace.objects.select_for_update().get(pk=workspace.pk)
    require_metric_writer(actor, workspace)
    digest = hashlib.sha256(
        json.dumps(data, sort_keys=True, default=str).encode()
    ).hexdigest()
    existing = FinanceCapture.objects.filter(pk=data["id"]).first()
    if existing:
        if (
            existing.workspace_id != workspace.pk
            or existing.recorded_by_id != actor.pk
            or existing.request_hash != digest
        ):
            raise WorkspaceActionError(
                409, "request_conflict", "شناسهٔ درخواست با اطلاعات ذخیره‌شده یکسان نیست."
            )
        return capture_dict(existing)
    captured = {
        row["binding_id"]: capture_observation(actor, workspace.pk, row)
        for row in data["observations"]
    }
    capture = FinanceCapture.objects.create(
        id=data["id"],
        workspace=workspace,
        recorded_by=actor,
        revenue_id=captured["net_revenue"]["id"],
        variable_costs_id=captured["variable_costs"]["id"],
        request_hash=digest,
    )
    return capture_dict(capture)


@require_http_methods(["GET", "POST"])
def captures(request, workspace_id):
    def operation(workspace):
        if request.method == "POST":
            return JsonResponse(
                save_capture(
                    request.user, workspace, _input(request, CaptureSerializer)
                ),
                status=201,
            )
        offset = serializers.IntegerField(min_value=0, max_value=100000).run_validation(
            request.GET.get("offset", 0)
        )
        rows = list(
            FinanceCapture.objects.filter(workspace=workspace)
            .select_related("revenue", "variable_costs", "run")
            .prefetch_related(
                "revenue__evidence_links__evidence",
                "variable_costs__evidence_links__evidence",
                "run__metric_values",
            )[offset : offset + 21]
        )
        return JsonResponse(
            {
                "workspace_id": str(workspace.pk),
                "items": [capture_dict(row) for row in rows[:20]],
                "next_offset": offset + 20 if len(rows) > 20 else None,
            }
        )

    return _dispatch(request, workspace_id, operation)


@require_http_methods(["POST"])
def calculate_capture(request, workspace_id, capture_id):
    @transaction.atomic
    def operation(workspace):
        workspace = Workspace.objects.select_for_update().get(pk=workspace.pk)
        require_metric_writer(request.user, workspace)
        capture = (
            FinanceCapture.objects.select_for_update()
            .filter(workspace=workspace, pk=capture_id)
            .first()
        )
        if capture is None:
            raise Http404
        if not capture.run_id:
            observation = capture.revenue
            context = {
                key: getattr(observation, key)
                for key in (
                    "scope_kind",
                    "segment_id",
                    "period_start",
                    "period_end",
                    "currency",
                    "accounting_basis",
                )
            }
            capture.run, _ = calculate_and_store_contribution_margin(
                workspace_id=workspace.pk,
                actor=request.user,
                observation_ids=[capture.revenue_id, capture.variable_costs_id],
                knowledge_release_id="stratino-first-slice-v2",
                **context,
            )
            capture.save(update_fields=["run"])
        return JsonResponse(capture_dict(capture))

    return _dispatch(request, workspace_id, operation)
