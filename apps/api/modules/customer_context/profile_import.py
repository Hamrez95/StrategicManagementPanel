import copy
import hashlib
import json
import re
import unicodedata
from collections import Counter
from uuid import UUID

from .context import legacy_canonical_id

PROFILE_SOURCE_NAMESPACE = "stratino-workspace-profile-v1"
MAX_CONFLICTS = 256
MAX_PRODUCTS = 20
MAX_SEGMENTS = 20
MAX_GOALS = 30
MAX_ICPS = 20

PRODUCT_FIELDS = {
    "id": 80,
    "name": 120,
    "description": 1000,
    "problem_solved": 600,
    "target_customer": 400,
}
SEGMENT_FIELDS = {
    "id": 80,
    "name": 120,
    "description": 1000,
    "needs": 600,
    "buying_roles": 400,
}
GOAL_FIELDS = {"id": 80, "title": 160, "success_signal": 500, "timeframe": 120}
ICP_SEGMENT_FIELDS = {
    "industry": 160,
    "organization_size": 120,
    "geography": 120,
    "buying_context": 500,
}
PERSONA_FIELDS = {"role": 120, "decision_role": 120, "goals": 500, "pains": 500}
EVIDENCE_FIELDS = {
    "id": 80,
    "source_type": 40,
    "reference": 400,
    "statement": 1000,
    "date": 32,
    "confidence": 20,
}
ASSUMPTION_FIELDS = {
    "id": 80,
    "statement": 1000,
    "confidence": 20,
    "test": 600,
    "status": 20,
}
SOURCE_TYPES = {
    "interview",
    "sales",
    "support",
    "usage",
    "survey",
    "document",
    "secondary",
    "other",
}
CONFIDENCE_LEVELS = {"low", "medium", "high"}
ASSUMPTION_STATUSES = {"untested", "supported", "rejected"}


class ProfileImportError(ValueError):
    """The source profile cannot be represented as a safe dry-run input."""


class CompatibilityProjectionError(ValueError):
    """Canonical records cannot be projected without dropping or guessing data."""


def _canonical_json(value):
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as error:
        raise ProfileImportError(
            "Profile snapshot must contain finite JSON values."
        ) from error


def _text_row(value, schema, path, *, required):
    if not isinstance(value, dict) or set(value) != set(schema):
        return None, {"path": path, "code": "unsupported_record_shape"}
    normalized = {}
    for name, maximum in schema.items():
        item = value[name]
        if not isinstance(item, str):
            return None, {"path": f"{path}.{name}", "code": "invalid_text_value"}
        if name == "id" and item != item.strip():
            return None, {"path": f"{path}.{name}", "code": "legacy_id_not_canonical"}
        item = item.strip()
        if len(item) > maximum or (name in required and not item):
            return None, {"path": f"{path}.{name}", "code": "text_length_or_required"}
        normalized[name] = item
    return normalized, None


def _rows(value, limit, path, schema, required, *, with_positions=False):
    if not isinstance(value, list):
        return [], [{"path": path, "code": "invalid_collection"}]
    conflicts = []
    if len(value) > limit:
        conflicts.append(
            {"path": path, "code": "collection_limit_exceeded", "limit": limit}
        )
    checked = []
    for index, item in enumerate(value[:limit]):
        record, error = _text_row(item, schema, f"{path}.{index}", required=required)
        checked.append((index, record, error, item))
        if error:
            conflicts.append(error)

    id_indexes = {}
    for index, record, error, raw in checked:
        legacy_id = (
            record.get("id")
            if record
            else raw.get("id")
            if isinstance(raw, dict)
            else None
        )
        if isinstance(legacy_id, str) and legacy_id and legacy_id == legacy_id.strip():
            id_indexes.setdefault(legacy_id, []).append(index)
    duplicate_ids = {key for key, indexes in id_indexes.items() if len(indexes) > 1}
    for legacy_id in sorted(duplicate_ids):
        conflicts.append(
            {
                "path": path,
                "code": "duplicate_legacy_id",
                "legacy_id": legacy_id,
                "indexes": id_indexes[legacy_id],
            }
        )
    accepted = [
        (index, record) if with_positions else record
        for index, record, error, _ in checked
        if record and not error and record["id"] not in duplicate_ids
    ]
    return accepted, conflicts


def _nested_rows(value, path, schema, required, allowed_values=None):
    rows, conflicts = _rows(value, 10, path, schema, required)
    if allowed_values:
        id_counts = Counter(row["id"] for row in rows if row["id"])
        duplicate_ids = {key for key, count in id_counts.items() if count > 1}
        if duplicate_ids:
            conflicts.append(
                {
                    "path": path,
                    "code": "duplicate_legacy_id",
                    "legacy_ids": sorted(duplicate_ids),
                }
            )
            rows = [row for row in rows if row["id"] not in duplicate_ids]
        for row in rows:
            for field, choices in allowed_values.items():
                if row[field] not in choices:
                    conflicts.append(
                        {"path": f"{path}.{row['id']}.{field}", "code": "unknown_enum"}
                    )
    return rows, conflicts


def _icp_record(value, path):
    expected = {
        "id",
        "name",
        "segment",
        "persona",
        "problem",
        "evidence",
        "assumptions",
    }
    if not isinstance(value, dict) or set(value) != expected:
        return None, [{"path": path, "code": "unsupported_record_shape"}]
    conflicts = []
    identifier, error = _text_row(
        {"id": value["id"], "name": value["name"]},
        {"id": 80, "name": 120},
        path,
        required={"id", "name"},
    )
    if error:
        conflicts.append(error)
    segment, error = _text_row(
        value["segment"], ICP_SEGMENT_FIELDS, f"{path}.segment", required=set()
    )
    if error:
        conflicts.append(error)
    persona, error = _text_row(
        value["persona"], PERSONA_FIELDS, f"{path}.persona", required=set()
    )
    if error:
        conflicts.append(error)
    problem = value["problem"]
    if not isinstance(problem, str) or len(problem.strip()) > 1000:
        conflicts.append({"path": f"{path}.problem", "code": "invalid_text_value"})
        problem = ""
    evidence, evidence_conflicts = _nested_rows(
        value["evidence"],
        f"{path}.evidence",
        EVIDENCE_FIELDS,
        {"id", "statement"},
        {"source_type": SOURCE_TYPES, "confidence": CONFIDENCE_LEVELS},
    )
    assumptions, assumption_conflicts = _nested_rows(
        value["assumptions"],
        f"{path}.assumptions",
        ASSUMPTION_FIELDS,
        {"id", "statement"},
        {"confidence": CONFIDENCE_LEVELS, "status": ASSUMPTION_STATUSES},
    )
    conflicts.extend(evidence_conflicts)
    conflicts.extend(assumption_conflicts)
    if conflicts or identifier is None or segment is None or persona is None:
        return None, conflicts
    return {
        "id": identifier["id"],
        "name": identifier["name"],
        "segment": segment,
        "persona": persona,
        "problem": problem.strip(),
        "evidence": evidence,
        "assumptions": assumptions,
    }, []


def _title_key(value):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value).strip()).casefold()


def build_profile_import_plan(profile_snapshot, execution_goals=()):
    """Build a non-writing import plan; never infers Goal or Segment identity."""

    required = {
        "workspace_id",
        "revision",
        "products",
        "customer_segments",
        "goals",
        "icps",
    }
    if not isinstance(profile_snapshot, dict) or not required.issubset(
        profile_snapshot
    ):
        raise ProfileImportError("Profile snapshot is missing required fields.")
    try:
        workspace_id = UUID(profile_snapshot["workspace_id"])
    except (TypeError, ValueError, AttributeError) as error:
        raise ProfileImportError(
            "Profile snapshot has an invalid Workspace ID."
        ) from error
    revision = profile_snapshot["revision"]
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
        raise ProfileImportError(
            "Profile snapshot revision must be a positive integer."
        )
    source_digest = hashlib.sha256(
        _canonical_json(profile_snapshot).encode("utf-8")
    ).hexdigest()

    products, conflicts = _rows(
        profile_snapshot["products"],
        MAX_PRODUCTS,
        "products",
        PRODUCT_FIELDS,
        {"id", "name"},
        with_positions=True,
    )
    segments, segment_conflicts = _rows(
        profile_snapshot["customer_segments"],
        MAX_SEGMENTS,
        "customer_segments",
        SEGMENT_FIELDS,
        {"id", "name"},
        with_positions=True,
    )
    conflicts.extend(segment_conflicts)
    profile_goals, goal_conflicts = _rows(
        profile_snapshot["goals"], MAX_GOALS, "goals", GOAL_FIELDS, {"id", "title"}
    )
    conflicts.extend(goal_conflicts)

    icps = []
    raw_icps = profile_snapshot["icps"]
    if not isinstance(raw_icps, list):
        conflicts.append({"path": "icps", "code": "invalid_collection"})
    else:
        if len(raw_icps) > MAX_ICPS:
            conflicts.append(
                {"path": "icps", "code": "collection_limit_exceeded", "limit": MAX_ICPS}
            )
        checked_icps = []
        for index, item in enumerate(raw_icps[:MAX_ICPS]):
            record, errors = _icp_record(item, f"icps.{index}")
            checked_icps.append((index, record, item))
            conflicts.extend(errors)
            if record and any(record["segment"].values()):
                conflicts.append(
                    {
                        "path": f"icps.{record['id']}.segment",
                        "code": "icp_segment_binding_requires_review",
                    }
                )
        id_indexes = {}
        for index, record, raw in checked_icps:
            legacy_id = (
                record.get("id")
                if record
                else raw.get("id")
                if isinstance(raw, dict)
                else None
            )
            if (
                isinstance(legacy_id, str)
                and legacy_id
                and legacy_id == legacy_id.strip()
            ):
                id_indexes.setdefault(legacy_id, []).append(index)
        duplicate_icps = {
            key for key, indexes in id_indexes.items() if len(indexes) > 1
        }
        for legacy_id in sorted(duplicate_icps):
            conflicts.append(
                {
                    "path": "icps",
                    "code": "duplicate_legacy_id",
                    "legacy_id": legacy_id,
                    "indexes": id_indexes[legacy_id],
                }
            )
        icps = [
            (index, record)
            for index, record, _ in checked_icps
            if record and record["id"] not in duplicate_icps
        ]

    candidate_goals = {}
    for item in execution_goals:
        title = (
            item.get("title")
            if isinstance(item, dict)
            else getattr(item, "title", None)
        )
        identifier = (
            item.get("id") if isinstance(item, dict) else getattr(item, "id", None)
        )
        goal_workspace_id = (
            item.get("workspace_id")
            if isinstance(item, dict)
            else getattr(item, "workspace_id", None)
        )
        if (
            str(goal_workspace_id) == str(workspace_id)
            and isinstance(title, str)
            and title.strip()
            and identifier is not None
        ):
            candidate_goals.setdefault(_title_key(title), []).append(str(identifier))
    goal_reviews = []
    for goal in profile_goals:
        matches = candidate_goals.get(_title_key(goal["title"]), [])
        review = {
            "legacy_id": goal["id"],
            "title": goal["title"],
            "candidate_execution_goal_ids": matches,
            "status": "conflict" if matches else "needs_review",
        }
        goal_reviews.append(review)
        if matches:
            conflicts.append(
                {
                    "path": f"goals.{goal['id']}",
                    "code": "goal_title_match_requires_review",
                    "execution_goal_ids": matches,
                }
            )

    planned = []
    for entity_type, records in (
        ("product", products),
        ("segment", segments),
        ("icp", icps),
    ):
        for source_position, record in records:
            canonical_id = legacy_canonical_id(
                workspace_id, PROFILE_SOURCE_NAMESPACE, entity_type, record["id"]
            )
            if entity_type == "product":
                canonical = {
                    "name": record["name"],
                    "description": record["description"],
                    "problem_solved": record["problem_solved"],
                    "target_customer_legacy": record["target_customer"],
                }
            elif entity_type == "segment":
                canonical = {key: value for key, value in record.items() if key != "id"}
            else:
                canonical = {
                    "name": record["name"],
                    "segment_id": None,
                    "persona_role": record["persona"]["role"],
                    "persona_decision_role": record["persona"]["decision_role"],
                    "persona_goals": record["persona"]["goals"],
                    "persona_pains": record["persona"]["pains"],
                    "problem": record["problem"],
                    "legacy_segment_snapshot": record["segment"],
                    "legacy_evidence_snapshot": record["evidence"],
                    "legacy_assumptions_snapshot": record["assumptions"],
                }
            planned.append(
                {
                    "entity_type": entity_type,
                    "legacy_id": record["id"],
                    "source_position": source_position,
                    "canonical_id": str(canonical_id),
                    "attributes": canonical,
                }
            )

    visible_conflicts = conflicts[:MAX_CONFLICTS]
    return {
        "mapping_version": 1,
        "workspace_id": str(workspace_id),
        "source_namespace": PROFILE_SOURCE_NAMESPACE,
        "source_profile_revision": revision,
        "source_digest": source_digest,
        "source_backup": copy.deepcopy(profile_snapshot),
        "planned_records": planned,
        "goal_reviews": goal_reviews,
        "deferred_profile_fields": ["mission", "problem_statement", "goals"],
        "conflicts": visible_conflicts,
        "suppressed_conflict_count": max(0, len(conflicts) - len(visible_conflicts)),
        "counts": {
            "products": len(products),
            "segments": len(segments),
            "icps": len(icps),
            "profile_goals_deferred": len(profile_goals),
            "conflicts": len(conflicts),
        },
    }


def project_legacy_profile(profile_fields, products, segments, icps, identity_maps):
    """Project canonical records to profile JSON without guessing identities."""

    workspace_id = str(profile_fields.get("workspace_id", ""))
    identities = {}
    source_positions = set()
    legacy_keys = set()
    for mapping in identity_maps:
        get = (
            mapping.get
            if isinstance(mapping, dict)
            else lambda key, default=None: getattr(mapping, key, default)
        )
        if str(get("workspace_id", "")) != workspace_id:
            raise CompatibilityProjectionError(
                "Identity map belongs to another Workspace."
            )
        kind = get("entity_type")
        canonical_id = get("canonical_id")
        if canonical_id is None:
            canonical_id = get(f"{kind}_id")
        if kind not in {"product", "segment", "icp"} or canonical_id is None:
            raise CompatibilityProjectionError(
                "Identity map has no typed canonical reference."
            )
        key = (kind, str(canonical_id))
        if key in identities:
            raise CompatibilityProjectionError(
                "Canonical record has multiple legacy identities."
            )
        legacy_id = get("legacy_id")
        source_position = get("source_position")
        if (
            not isinstance(legacy_id, str)
            or not legacy_id
            or legacy_id != legacy_id.strip()
            or not isinstance(source_position, int)
            or isinstance(source_position, bool)
            or source_position < 0
            or source_position >= 20
        ):
            raise CompatibilityProjectionError(
                "Identity map has invalid source identity/order."
            )
        if (kind, legacy_id) in legacy_keys or (
            kind,
            source_position,
        ) in source_positions:
            raise CompatibilityProjectionError(
                "Legacy IDs and source positions must be unique per type."
            )
        legacy_keys.add((kind, legacy_id))
        source_positions.add((kind, source_position))
        identities[key] = (legacy_id, source_position)

    def serialize(kind, record):
        get = (
            record.get
            if isinstance(record, dict)
            else lambda key, default=None: getattr(record, key, default)
        )
        canonical_id = get("id", get("pk"))
        identity = identities.get((kind, str(canonical_id)))
        if identity is None:
            raise CompatibilityProjectionError(
                f"{kind} record has no legacy identity mapping."
            )
        legacy_id, source_position = identity
        record_workspace = get("workspace_id")
        if record_workspace is None or str(record_workspace) != workspace_id:
            raise CompatibilityProjectionError(
                f"{kind} record belongs to another Workspace."
            )
        if kind == "product":
            return source_position, {
                "id": legacy_id,
                "name": get("name", ""),
                "description": get("description", ""),
                "problem_solved": get("problem_solved", ""),
                "target_customer": get("target_customer_legacy", ""),
            }
        if kind == "segment":
            return source_position, {
                "id": legacy_id,
                "name": get("name", ""),
                "description": get("description", ""),
                "needs": get("needs", ""),
                "buying_roles": get("buying_roles", ""),
            }
        return source_position, {
            "id": legacy_id,
            "name": get("name", ""),
            "segment": copy.deepcopy(get("legacy_segment_snapshot", {})),
            "persona": {
                "role": get("persona_role", ""),
                "decision_role": get("persona_decision_role", ""),
                "goals": get("persona_goals", ""),
                "pains": get("persona_pains", ""),
            },
            "problem": get("problem", ""),
            "evidence": copy.deepcopy(get("legacy_evidence_snapshot", [])),
            "assumptions": copy.deepcopy(get("legacy_assumptions_snapshot", [])),
        }

    projection = copy.deepcopy(profile_fields)
    projection["products"] = [
        projected
        for _, projected in sorted(
            (serialize("product", item) for item in products), key=lambda row: row[0]
        )
    ]
    projection["customer_segments"] = [
        projected
        for _, projected in sorted(
            (serialize("segment", item) for item in segments), key=lambda row: row[0]
        )
    ]
    projection["icps"] = [
        projected
        for _, projected in sorted(
            (serialize("icp", item) for item in icps), key=lambda row: row[0]
        )
    ]
    # Goals and narrative fields remain in the profile owner until review.
    return projection
