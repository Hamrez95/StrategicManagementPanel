from dataclasses import dataclass
from datetime import date
from typing import Literal
from uuid import UUID, uuid5

ScopeKind = Literal["whole_business", "segment"]
LEGACY_ID_NAMESPACE = UUID("e3d5e9e0-430f-5cd4-b650-0da5f747abf3")


@dataclass(frozen=True, slots=True)
class ContextRef:
    """Typed scope for a Workspace fact; it is not a duplicate Business row."""

    workspace_id: UUID
    scope_kind: ScopeKind = "whole_business"
    segment_id: UUID | None = None
    period_start: date | None = None
    period_end: date | None = None
    cohort_id: str | None = None
    unit: str | None = None
    currency: str | None = None
    accounting_basis: str | None = None
    input_revision: int = 1

    def __post_init__(self):
        if not isinstance(self.workspace_id, UUID):
            raise ValueError("workspace_id must be a UUID")
        if self.scope_kind not in {"whole_business", "segment"}:
            raise ValueError("Unsupported context scope.")
        if (self.scope_kind == "segment") != (self.segment_id is not None):
            raise ValueError("segment_id is required only for segment-scoped context.")
        if self.segment_id is not None and not isinstance(self.segment_id, UUID):
            raise ValueError("segment_id must be a UUID")
        if (self.period_start is None) != (self.period_end is None):
            raise ValueError("Both period boundaries must be supplied together.")
        if self.period_start is not None and self.period_end <= self.period_start:
            raise ValueError("period_end must be later than period_start.")
        if self.input_revision < 1:
            raise ValueError("input_revision must be positive.")


def legacy_canonical_id(
    workspace_id: UUID, source_namespace: str, entity_type: str, legacy_id: str
) -> UUID:
    """Derive a stable, type- and Workspace-scoped UUID from an exact legacy ID."""

    if not isinstance(workspace_id, UUID):
        raise ValueError("workspace_id must be a UUID")
    if (
        not isinstance(source_namespace, str)
        or not source_namespace
        or source_namespace != source_namespace.strip()
        or len(source_namespace) > 80
    ):
        raise ValueError(
            "source_namespace must be a trimmed string of 1–80 characters."
        )
    if entity_type not in {"product", "segment", "icp"}:
        raise ValueError("Unsupported legacy entity type.")
    if (
        not isinstance(legacy_id, str)
        or not legacy_id
        or legacy_id != legacy_id.strip()
        or len(legacy_id) > 80
    ):
        raise ValueError("legacy_id must be a trimmed string of 1–80 characters.")

    # UUIDv5 is repeatable and preserves exact case-sensitive source IDs.
    identity = (
        f"stratino-profile:{workspace_id}:{source_namespace}:{entity_type}:{legacy_id}"
    )
    return uuid5(LEGACY_ID_NAMESPACE, identity)
