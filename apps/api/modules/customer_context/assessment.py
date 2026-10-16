"""Read-only, lossless context mapping for the first assessment slice.

This deliberately does not interpret the research taxonomy. The taxonomy still
requires domain/user review, and legacy stage labels have no approved alias map.
"""

from django.http import Http404

from modules.workspaces.models import WorkspaceProfile
from modules.workspaces.services import workspace_role

from .models import Segment


def _profile_snapshot(profile):
    if profile is None:
        return None
    return {
        "profile_id": str(profile.pk),
        "revision": profile.revision,
        "company_name": profile.company_name,
        "industry": profile.industry,
        "reported_stage": profile.stage,
        "mission": profile.mission,
        "problem_statement": profile.problem_statement,
        "products": profile.products,
        "customer_segments": profile.customer_segments,
        "goals": profile.goals,
        "icps": profile.icps,
    }


def build_context_assessment(*, workspace, profile=None, segment=None):
    """Map existing profile data without inferring a lifecycle or copying facts."""
    if profile is not None and profile.workspace_id != workspace.pk:
        raise ValueError("Profile must belong to the selected Workspace.")
    if segment is not None and segment.workspace_id != workspace.pk:
        raise ValueError("Segment must belong to the selected Workspace.")

    profile_snapshot = _profile_snapshot(profile)
    context = {
        "workspace_id": str(workspace.pk),
        "scope": (
            {
                "kind": "segment",
                "segment_id": str(segment.pk),
                "revision": segment.revision,
            }
            if segment is not None
            else {"kind": "whole_business", "segment_id": None}
        ),
        "profile": profile_snapshot,
    }

    reported_stage = profile.stage if profile is not None else ""
    applies_to_scope = segment is None
    if applies_to_scope and reported_stage.strip():
        status = "provisional"
        reason = "self_reported_stage_requires_evidence_review"
        value = reported_stage
    else:
        status = "unknown"
        reason = (
            "profile_stage_is_not_segment_scoped"
            if segment is not None and reported_stage
            else "no_stage_reported"
        )
        value = None

    return {
        "context": context,
        "stage": {
            "reported_value": value,
            "stage_id": None,
            "status": status,
            "reason_code": reason,
            "evidence_refs": [],
            "source_trace": (
                [
                    {
                        "kind": "workspace_profile",
                        "record_id": profile_snapshot["profile_id"],
                        "revision": profile_snapshot["revision"],
                        "field": "stage",
                    }
                ]
                if value is not None
                else []
            ),
        },
    }


def read_context_assessment(actor, workspace, *, segment_id=None):
    """Return a read-only assessment DTO for a visible Workspace and optional Segment."""
    if workspace_role(actor, workspace) is None:
        raise Http404("Workspace is not available.")

    profile = WorkspaceProfile.objects.filter(workspace_id=workspace.pk).first()
    segment = None
    if segment_id is not None:
        segment = Segment.objects.filter(
            workspace_id=workspace.pk, pk=segment_id
        ).first()
        if segment is None:
            raise Http404("Workspace is not available.")

    return build_context_assessment(
        workspace=workspace, profile=profile, segment=segment
    )
