"""Authorized projection and capture; no generic answers or formula execution."""

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Max, Prefetch
from django.shortcuts import get_object_or_404

from modules.customer_context.models import Segment
from modules.evidence.models import Evidence
from modules.workspaces.models import Workspace
from modules.workspaces.services import get_accessible_workspace_or_404, workspace_role

from .models import CalculationRun, InputObservation, InputObservationEvidence

PAGE_SIZE = 50


def require_metric_writer(actor, workspace):
    if workspace_role(actor, workspace) not in {"owner", "editor"}:
        raise PermissionDenied("An active Workspace owner or editor is required.")
    if workspace.archived_at is not None:
        raise PermissionDenied("Archived Workspaces are read-only.")


def validate_segment(workspace, segment_id):
    if (
        segment_id is not None
        and not Segment.objects.filter(workspace=workspace, pk=segment_id).exists()
    ):
        raise ValidationError(
            {"segment_id": "The Segment is not available in this Workspace."}
        )


@transaction.atomic
def capture_observation(actor, workspace_id, data):
    # Serialize captures and archive changes on the same Workspace lock.
    workspace = Workspace.objects.select_for_update().get(pk=workspace_id)
    require_metric_writer(actor, workspace)
    data = dict(data)
    evidence_ids = data.pop("evidence_ids")
    validate_segment(workspace, data["segment_id"])
    evidence = list(
        Evidence.objects.select_for_update().filter(
            workspace=workspace, pk__in=evidence_ids, permission_status="available"
        )
    )
    if len(evidence) != len(evidence_ids):
        raise ValidationError(
            {"evidence_ids": "Every source must be available in this Workspace."}
        )
    context = {
        key: data[key]
        for key in (
            "binding_id",
            "scope_kind",
            "segment_id",
            "period_start",
            "period_end",
            "currency",
            "accounting_basis",
            "cost_scope",
        )
    }
    latest = InputObservation.objects.filter(workspace=workspace, **context).aggregate(
        latest=Max("revision")
    )["latest"]
    observation = InputObservation(
        workspace=workspace, recorded_by=actor, revision=(latest or 0) + 1, **data
    )
    observation.full_clean()
    observation.save()
    for source in evidence:
        link = InputObservationEvidence(observation=observation, evidence=source)
        link.full_clean()
        link.save()
    return observation_dict(observation)


def observation_dict(observation):
    return {
        "id": str(observation.pk),
        "workspace_id": str(observation.workspace_id),
        **{
            key: getattr(observation, key)
            for key in (
                "binding_id",
                "scope_kind",
                "state",
                "unit",
                "currency",
                "accounting_basis",
                "cost_scope",
                "source_kind",
                "source_id",
                "source_revision",
                "reason",
                "revision",
            )
        },
        "segment_id": str(observation.segment_id) if observation.segment_id else None,
        "period_start": observation.period_start.isoformat(),
        "period_end": observation.period_end.isoformat(),
        "value": format(observation.value, ".6f")
        if observation.value is not None
        else None,
        "created_at": observation.created_at.isoformat(),
        "evidence": [
            {
                "evidence_id": str(link.evidence_id),
                "revision": link.evidence_revision,
                "permission_status": link.permission_status,
                "current": link.evidence.permission_status == "available"
                and link.evidence.revision == link.evidence_revision,
            }
            for link in sorted(
                observation.evidence_links.all(), key=lambda item: item.evidence_id
            )
        ],
    }


def run_dict(run):
    return {
        "id": str(run.pk),
        "workspace_id": str(run.workspace_id),
        **{
            key: getattr(run, key)
            for key in (
                "metric_id",
                "method_revision",
                "knowledge_release_id",
                "knowledge_release_hash",
                "variant",
                "scope_kind",
                "currency",
                "accounting_basis",
                "cost_scope",
                "input_revision",
                "input_snapshot",
            )
        },
        "segment_id": str(run.segment_id) if run.segment_id else None,
        "period_start": run.period_start.isoformat(),
        "period_end": run.period_end.isoformat(),
        "created_at": run.created_at.isoformat(),
        "results": [
            {
                "id": str(value.pk),
                "metric_id": value.metric_id,
                "variant": value.variant,
                "status": value.status,
                "reason": value.reason,
                "value": format(value.value, ".6f")
                if value.value is not None
                else None,
                "unit": value.unit,
                "currency": value.currency,
            }
            for value in run.metric_values.all()
        ],
    }


def read_metric_page(actor, workspace_id, *, offset, runs=False):
    workspace = get_accessible_workspace_or_404(actor, workspace_id)
    if runs:
        query = CalculationRun.objects.filter(workspace=workspace).prefetch_related(
            "metric_values"
        )
        project = run_dict
    else:
        query = InputObservation.objects.filter(workspace=workspace).prefetch_related(
            Prefetch(
                "evidence_links",
                queryset=InputObservationEvidence.objects.select_related("evidence"),
            )
        )
        project = observation_dict
    rows = list(query.order_by("-created_at", "-id")[offset : offset + PAGE_SIZE + 1])
    return {
        "items": [project(row) for row in rows[:PAGE_SIZE]],
        "next_offset": offset + PAGE_SIZE if len(rows) > PAGE_SIZE else None,
    }


def read_metric_run(actor, workspace_id, run_id):
    workspace = get_accessible_workspace_or_404(actor, workspace_id)
    run = get_object_or_404(
        CalculationRun.objects.prefetch_related("metric_values"),
        workspace=workspace,
        pk=run_id,
    )
    return run_dict(run)
