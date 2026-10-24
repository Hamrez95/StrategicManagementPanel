from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Max

from modules.evidence.models import Evidence
from modules.knowledge.registry import KnowledgeReleaseError, load_release
from modules.workspaces.entitlements import require_workspace_feature
from modules.workspaces.models import Workspace

from .api import require_metric_writer, validate_segment
from .bindings import NUMERIC_INPUT_BINDINGS
from .calculations import (
    ContributionContext,
    ContributionInput,
    calculate_contribution_amount,
)
from .models import (
    CalculationRun,
    InputObservation,
    InputObservationEvidence,
    MetricValue,
)


@transaction.atomic
def link_input_evidence(*, observation_id, evidence_id, actor):
    """Attach an available, same-Workspace source with an immutable revision pin."""
    observation = InputObservation.objects.select_for_update().get(pk=observation_id)
    evidence = Evidence.objects.select_for_update().get(pk=evidence_id)
    require_metric_writer(actor, observation.workspace)
    if evidence.workspace_id != observation.workspace_id:
        raise ValidationError({"evidence_id": "The source is not in this Workspace."})
    link = InputObservationEvidence(observation=observation, evidence=evidence)
    link.full_clean()
    link.save()
    return link


@transaction.atomic
def calculate_and_store_contribution_margin(
    *,
    workspace_id,
    actor,
    observation_ids,
    scope_kind,
    segment_id,
    period_start,
    period_end,
    currency,
    accounting_basis,
    knowledge_release_id,
):
    """Authorize, freeze and persist one exact-release contribution-amount run."""
    workspace = Workspace.objects.select_for_update().get(pk=workspace_id)
    require_metric_writer(actor, workspace)
    validate_segment(workspace, segment_id)
    require_workspace_feature(workspace, "can_calculate_metrics")
    try:
        release = load_release(knowledge_release_id)
    except KnowledgeReleaseError as error:
        raise ValidationError(
            {"knowledge_release_id": "The exact knowledge release is unavailable."}
        ) from error
    record = release.get("MET-CONTRIBUTION-MARGIN")
    if (
        record is None
        or record.definition.get("runtime_gate", {}).get("status")
        != "typed_calculation_only"
    ):
        raise ValidationError(
            {
                "knowledge_release_id": "This release does not authorize the typed calculation."
            }
        )
    ids = list(observation_ids)
    if len(ids) != len(set(ids)):
        raise ValidationError(
            {"observation_ids": "Input observation IDs must be unique."}
        )
    observations = list(
        InputObservation.objects.select_for_update(of=("self",))
        .filter(workspace=workspace, pk__in=ids)
        .select_related("segment", "recorded_by")
        .order_by("binding_id", "id")
    )
    if len(observations) != len(ids):
        raise ValidationError(
            {
                "observation_ids": "Every input must be an accessible observation in this Workspace."
            }
        )
    evidence_ids = InputObservationEvidence.objects.filter(
        observation__in=observations
    ).values_list("evidence_id", flat=True)
    list(Evidence.objects.select_for_update().filter(pk__in=evidence_ids))
    snapshot = snapshot_inputs(
        observations,
        workspace_id=workspace.pk,
        scope_kind=scope_kind,
        segment_id=segment_id,
        period_start=period_start,
        period_end=period_end,
        currency=currency,
        accounting_basis=accounting_basis,
    )
    context = ContributionContext(
        workspace_id=str(workspace.pk),
        scope_kind=scope_kind,
        segment_id=str(segment_id) if segment_id else None,
        period_start=period_start,
        period_end=period_end,
        currency=currency,
        accounting_basis=accounting_basis,
    )
    typed_inputs = {
        observation.binding_id: ContributionInput(
            binding_id=observation.binding_id,
            workspace_id=str(observation.workspace_id),
            state=observation.state,
            value=observation.value,
            unit=observation.unit,
            currency=observation.currency,
            scope_kind=observation.scope_kind,
            segment_id=str(observation.segment_id) if observation.segment_id else None,
            period_start=observation.period_start,
            period_end=observation.period_end,
            accounting_basis=observation.accounting_basis,
            cost_scope=observation.cost_scope,
            reason=observation.reason,
        )
        for observation in observations
    }
    result = calculate_contribution_amount(typed_inputs, context)
    cost_input = typed_inputs.get("variable_costs")
    cost_scope = cost_input.cost_scope if cost_input else ""
    latest_revision = CalculationRun.objects.filter(
        workspace=workspace,
        metric_id="MET-CONTRIBUTION-MARGIN",
        scope_kind=scope_kind,
        segment_id=segment_id,
        period_start=period_start,
        period_end=period_end,
        currency=currency,
        accounting_basis=accounting_basis,
        cost_scope=cost_scope,
    ).aggregate(latest=Max("input_revision"))["latest"]
    run = CalculationRun(
        workspace=workspace,
        metric_id="MET-CONTRIBUTION-MARGIN",
        method_revision="contribution-amount-v1",
        knowledge_release_id=release.id,
        knowledge_release_hash=release.content_sha256,
        variant="amount",
        scope_kind=scope_kind,
        segment_id=segment_id,
        period_start=period_start,
        period_end=period_end,
        currency=currency,
        accounting_basis=accounting_basis,
        cost_scope=cost_scope,
        input_revision=(latest_revision or 0) + 1,
        input_snapshot=snapshot,
        created_by=actor,
    )
    run.full_clean()
    run.save()
    metric_value = MetricValue(
        run=run,
        metric_id=run.metric_id,
        variant=run.variant,
        value=result.value,
        status=result.status,
        unit="currency",
        currency=result.currency,
        reason=result.reason,
    )
    metric_value.full_clean()
    metric_value.save()
    return run, metric_value


def snapshot_inputs(
    observations,
    *,
    workspace_id,
    scope_kind,
    segment_id,
    period_start,
    period_end,
    currency,
    accounting_basis,
):
    """Freeze reviewed observations that exactly match a calculation context."""
    snapshots = []
    seen_bindings = set()
    for observation in observations:
        if not isinstance(observation, InputObservation):
            raise ValidationError(
                "Only typed InputObservation records can feed a calculation."
            )
        if observation._state.adding:
            raise ValidationError(
                {
                    "observations": "Only saved immutable observations can feed a calculation."
                }
            )
        observation.full_clean()
        if observation.workspace_id != workspace_id:
            raise ValidationError(
                {"observations": "Every input must belong to the run Workspace."}
            )
        context_matches = (
            observation.scope_kind == scope_kind
            and observation.segment_id == segment_id
            and observation.period_start == period_start
            and observation.period_end == period_end
            and observation.currency == currency
            and observation.accounting_basis == accounting_basis
        )
        if not context_matches:
            raise ValidationError(
                {
                    "observations": "Every input must match the run scope, period, currency and accounting basis."
                }
            )
        if observation.binding_id in seen_bindings:
            raise ValidationError(
                {
                    "observations": "A calculation can use only one current observation per binding."
                }
            )
        if observation.unit != "currency":
            raise ValidationError(
                {"observations": "This calculation binding requires a monetary unit."}
            )
        if (
            NUMERIC_INPUT_BINDINGS[observation.binding_id].metric_id
            != "MET-CONTRIBUTION-MARGIN"
        ):
            raise ValidationError(
                {"observations": "Input binding is not approved for this metric."}
            )
        seen_bindings.add(observation.binding_id)
        snapshots.append(
            {
                "binding_id": observation.binding_id,
                "observation_id": str(observation.pk),
                "revision": observation.revision,
                "state": observation.state,
                "value": str(observation.value)
                if observation.value is not None
                else None,
                "unit": observation.unit,
                "currency": observation.currency,
                "accounting_basis": observation.accounting_basis,
                "cost_scope": observation.cost_scope,
                "source_id": observation.source_id,
                "source_kind": observation.source_kind,
                "source_revision": observation.source_revision,
                "reason": observation.reason,
                "evidence": [
                    {
                        "evidence_id": str(link.evidence_id),
                        "revision": link.evidence_revision,
                        "permission_status": link.permission_status,
                    }
                    for link in observation.evidence_links.select_related(
                        "evidence"
                    ).order_by("evidence_id")
                    if _evidence_link_is_current(link)
                ],
                "scope_kind": observation.scope_kind,
                "segment_id": str(observation.segment_id)
                if observation.segment_id
                else None,
                "period_start": observation.period_start.isoformat(),
                "period_end": observation.period_end.isoformat(),
            }
        )
    return sorted(snapshots, key=lambda item: item["binding_id"])


def _evidence_link_is_current(link):
    if (
        link.evidence.permission_status != "available"
        or link.evidence.revision != link.evidence_revision
    ):
        raise ValidationError(
            {
                "observations": "A linked evidence source is revoked or has changed revision."
            }
        )
    return True
