from django.db import transaction
from django.http import Http404
from django.utils import timezone

from modules.workspaces.models import Workspace
from modules.workspaces.services import WorkspaceActionError, workspace_role

from .models import Claim, ClaimEvidenceLink, Evidence


def _conflict(status, code, message, *, fields=None):
    raise WorkspaceActionError(status, code, message, fields=fields or {})


@transaction.atomic
def link_claim_evidence(
    actor,
    workspace,
    *,
    claim_id,
    evidence_id,
    polarity,
    rationale,
    expected_claim_revision,
    expected_evidence_revision,
):
    """Create or revise one scoped provenance link without merging source rows."""

    locked_workspace = (
        Workspace.objects.select_for_update().filter(pk=workspace.pk).first()
    )
    if locked_workspace is None:
        raise Http404("Workspace is not available.")
    role = workspace_role(actor, locked_workspace)
    if role is None:
        raise Http404("Workspace is not available.")
    if role not in {"owner", "editor"}:
        _conflict(
            403, "workspace_permission_denied", "برای ثبت پیوند دسترسی لازم را ندارید."
        )
    if polarity not in ClaimEvidenceLink.Polarity.values:
        _conflict(400, "invalid_evidence_polarity", "نوع رابطهٔ شواهد معتبر نیست.")
    if (
        not isinstance(rationale, str)
        or not rationale.strip()
        or len(rationale.strip()) > 1000
    ):
        _conflict(400, "invalid_evidence_rationale", "دلیل پیوند معتبر نیست.")

    claim = (
        Claim.objects.select_for_update()
        .filter(pk=claim_id, workspace=locked_workspace)
        .first()
    )
    evidence = (
        Evidence.objects.select_for_update()
        .filter(pk=evidence_id, workspace=locked_workspace)
        .first()
    )
    if claim is None or evidence is None:
        raise Http404("Workspace evidence is not available.")
    if claim.revision != expected_claim_revision:
        _conflict(
            409,
            "claim_revision_conflict",
            "ادعا پس از بارگیری تغییر کرده است.",
            fields={"claim_id": [str(claim.pk)]},
        )
    if evidence.revision != expected_evidence_revision:
        _conflict(
            409,
            "evidence_revision_conflict",
            "منبع پس از بارگیری تغییر کرده است.",
            fields={"evidence_id": [str(evidence.pk)]},
        )
    if evidence.permission_status != Evidence.PermissionStatus.AVAILABLE:
        _conflict(
            409,
            "evidence_permission_unavailable",
            "مجوز این منبع تأیید نشده یا لغو شده است.",
            fields={"evidence_id": [str(evidence.pk)]},
        )

    link = (
        ClaimEvidenceLink.objects.select_for_update()
        .filter(workspace=locked_workspace, claim=claim, evidence=evidence)
        .first()
    )
    now = timezone.now()
    if link is None:
        link = ClaimEvidenceLink(
            workspace=locked_workspace,
            claim=claim,
            evidence=evidence,
            polarity=polarity,
            rationale=rationale.strip(),
            reviewer=actor,
            reviewed_at=now,
        )
        link.full_clean()
        link.save(force_insert=True)
        created = True
    else:
        changed = (
            link.polarity != polarity
            or link.rationale != rationale.strip()
            or link.reviewer_id != actor.pk
        )
        if changed:
            link.polarity = polarity
            link.rationale = rationale.strip()
            link.reviewer = actor
            link.reviewed_at = now
            link.revision += 1
            link.updated_at = now
            link.full_clean()
            link.save(
                update_fields=(
                    "polarity",
                    "rationale",
                    "reviewer",
                    "reviewed_at",
                    "revision",
                    "updated_at",
                )
            )
        created = False
    return {
        "id": str(link.pk),
        "workspace_id": str(link.workspace_id),
        "claim_id": str(link.claim_id),
        "evidence_id": str(link.evidence_id),
        "polarity": link.polarity,
        "rationale": link.rationale,
        "revision": link.revision,
        "reviewer_id": str(link.reviewer_id) if link.reviewer_id else None,
        "reviewed_at": link.reviewed_at.isoformat() if link.reviewed_at else None,
        "created": created,
    }
