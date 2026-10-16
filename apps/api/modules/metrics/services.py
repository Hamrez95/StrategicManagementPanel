from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction

from modules.evidence.models import Evidence
from modules.workspaces.services import workspace_role

from .bindings import NUMERIC_INPUT_BINDINGS
from .models import InputObservation, InputObservationEvidence


@transaction.atomic
def link_input_evidence(*, observation_id, evidence_id, actor):
    """Attach an available, same-Workspace source with an immutable revision pin."""
    observation = InputObservation.objects.select_for_update().get(pk=observation_id)
    evidence = Evidence.objects.select_for_update().get(pk=evidence_id)
    if workspace_role(actor, observation.workspace) not in {"owner", "editor"}:
        raise PermissionDenied("An active Workspace owner or editor is required.")
    link = InputObservationEvidence(observation=observation, evidence=evidence)
    link.full_clean()
    link.save()
    return link


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
