"""Read and verify an immutable, explicitly approved knowledge release.

This module does not read research files, adapt research shapes, execute rules,
or access Django models. The release builder owns source adapters; this reader
accepts only the normalized release contract and exposes immutable snapshots.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Any, Mapping

RELEASE_SCHEMA_VERSION = 1
CANONICALIZATION = "json-sort-keys-compact-utf8-no-newline-v1"
MAX_RELEASE_BYTES = 4 * 1024 * 1024
MAX_REJECTED_RECORDS = 256
DEFAULT_RELEASE_DIRECTORY = Path(__file__).resolve().parent / "releases"
_RELEASE_ID = re.compile(r"[a-z0-9][a-z0-9._-]{0,63}\Z")
_KNOWLEDGE_ID = re.compile(r"[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\Z")
_ADAPTER_ID = re.compile(r"[a-z0-9][a-z0-9._/-]{0,127}\Z")
_COMMIT = re.compile(r"[0-9a-f]{40}\Z")
_SHA256 = re.compile(r"[0-9a-f]{64}\Z")


class KnowledgeReleaseError(ValueError):
    """A release was malformed, unsupported, or failed integrity checking."""


class KnowledgeReleaseNotFound(KnowledgeReleaseError):
    """A specifically requested immutable release is absent."""


@dataclass(frozen=True, slots=True)
class KnowledgeRecord:
    id: str
    source_schema: str
    revision: str
    adapter_id: str
    support_status: str
    source_refs: tuple[Mapping[str, str], ...]
    rationale: str
    definition: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class KnowledgeRelease:
    id: str
    schema_version: int
    source_kb_commit: str
    content_sha256: str
    canonicalization: str
    generated_by: str
    approved_ids: tuple[str, ...]
    source_ids: tuple[str, ...]
    rejected_records: tuple[Mapping[str, str], ...]
    records: Mapping[str, KnowledgeRecord]

    def get(self, record_id: str) -> KnowledgeRecord | None:
        """Return a record only when it was explicitly included in this release."""
        if record_id not in self.approved_ids:
            return None
        return self.records.get(record_id)


def canonical_release_bytes(document: Mapping[str, Any]) -> bytes:
    """Serialize the release contract deterministically, excluding its digest."""
    unsigned = {key: value for key, value in document.items() if key != "content_sha256"}
    try:
        text = json.dumps(
            unsigned,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        )
    except (TypeError, ValueError) as error:
        raise KnowledgeReleaseError("Release cannot be normalized as canonical JSON.") from error
    return text.encode("utf-8")


def calculate_release_sha256(document: Mapping[str, Any]) -> str:
    return hashlib.sha256(canonical_release_bytes(document)).hexdigest()


def _fail_constant(value: str) -> None:
    raise KnowledgeReleaseError(f"Non-finite JSON number is not allowed: {value}.")


def _object_without_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise KnowledgeReleaseError(f"Duplicate JSON key: {key}.")
        result[key] = value
    return result


def _require_object(value: Any, label: str, keys: set[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise KnowledgeReleaseError(f"{label} must be an object.")
    actual = set(value)
    missing = keys - actual
    unexpected = actual - keys
    if missing or unexpected:
        details = []
        if missing:
            details.append(f"missing {', '.join(sorted(missing))}")
        if unexpected:
            details.append(f"unsupported {', '.join(sorted(unexpected))}")
        raise KnowledgeReleaseError(f"{label} has an invalid shape ({'; '.join(details)}).")
    return value


def _text(value: Any, label: str, *, max_length: int = 512) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > max_length:
        raise KnowledgeReleaseError(f"{label} must be non-empty text (max {max_length} characters).")
    return value


def _freeze(value: Any, label: str) -> Any:
    if isinstance(value, dict):
        return MappingProxyType({key: _freeze(item, f"{label}.{key}") for key, item in value.items()})
    if isinstance(value, list):
        return tuple(_freeze(item, label) for item in value)
    if isinstance(value, float) and not math.isfinite(value):
        raise KnowledgeReleaseError(f"{label} contains a non-finite number.")
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    raise KnowledgeReleaseError(f"{label} contains an unsupported value.")


def _parse_record(record_id: str, value: Any) -> KnowledgeRecord:
    if not _KNOWLEDGE_ID.fullmatch(record_id):
        raise KnowledgeReleaseError(f"Invalid knowledge record ID: {record_id}.")
    row = _require_object(
        value,
        f"record {record_id}",
        {"source_schema", "revision", "adapter_id", "source_support", "definition"},
    )
    source_schema = _text(row["source_schema"], f"record {record_id} source_schema", max_length=64)
    revision = _text(row["revision"], f"record {record_id} revision", max_length=64)
    adapter_id = _text(row["adapter_id"], f"record {record_id} adapter_id", max_length=128)
    if not _ADAPTER_ID.fullmatch(adapter_id):
        raise KnowledgeReleaseError(f"record {record_id} adapter_id is malformed.")

    support = _require_object(
        row["source_support"],
        f"record {record_id} source_support",
        {"status", "refs", "rationale"},
    )
    status = support["status"]
    if not isinstance(status, str) or status not in {"source_supported", "product_heuristic"}:
        raise KnowledgeReleaseError(f"record {record_id} has an unapproved source-support status.")
    refs_value = support["refs"]
    if not isinstance(refs_value, list):
        raise KnowledgeReleaseError(f"record {record_id} source refs must be a list.")
    refs: list[Mapping[str, str]] = []
    seen_refs: set[tuple[str, str]] = set()
    for index, reference in enumerate(refs_value):
        ref = _require_object(reference, f"record {record_id} source ref {index}", {"source_id", "section"})
        source_id = _text(ref["source_id"], f"record {record_id} source ref ID", max_length=128)
        section = _text(ref["section"], f"record {record_id} source ref section", max_length=512)
        pair = (source_id, section)
        if pair in seen_refs:
            raise KnowledgeReleaseError(f"record {record_id} repeats a source reference.")
        seen_refs.add(pair)
        refs.append(MappingProxyType({"source_id": source_id, "section": section}))
    rationale_value = support["rationale"]
    if not isinstance(rationale_value, str) or len(rationale_value) > 2000:
        raise KnowledgeReleaseError(f"record {record_id} rationale must be text (max 2000 characters).")
    rationale = rationale_value.strip()
    if status == "source_supported" and not refs:
        raise KnowledgeReleaseError(f"record {record_id} needs at least one claim-level source reference.")
    if status == "product_heuristic" and not rationale:
        raise KnowledgeReleaseError(f"record {record_id} needs a product-heuristic rationale.")

    definition = row["definition"]
    if not isinstance(definition, dict) or not definition:
        raise KnowledgeReleaseError(f"record {record_id} definition must be a non-empty object.")
    frozen_definition = _freeze(definition, f"record {record_id} definition")
    return KnowledgeRecord(
        id=record_id,
        source_schema=source_schema,
        revision=revision,
        adapter_id=adapter_id,
        support_status=status,
        source_refs=tuple(refs),
        rationale=rationale,
        definition=frozen_definition,
    )


def _parse_release(document: Any) -> KnowledgeRelease:
    root = _require_object(
        document,
        "release",
        {
            "release_id",
            "schema_version",
            "source_kb_commit",
            "content_sha256",
            "canonicalization",
            "generated_by",
            "approved_ids",
            "source_ids",
            "rejected_records",
            "records",
        },
    )
    if type(root["schema_version"]) is not int or root["schema_version"] != RELEASE_SCHEMA_VERSION:
        raise KnowledgeReleaseError(f"Unsupported knowledge release schema version: {root['schema_version']}.")
    release_id = _text(root["release_id"], "release_id", max_length=64)
    if not _RELEASE_ID.fullmatch(release_id):
        raise KnowledgeReleaseError("release_id must be a stable lowercase identifier.")
    source_commit = root["source_kb_commit"]
    if not isinstance(source_commit, str) or not _COMMIT.fullmatch(source_commit):
        raise KnowledgeReleaseError("source_kb_commit must be a full Git commit SHA.")
    if root["canonicalization"] != CANONICALIZATION:
        raise KnowledgeReleaseError("Unsupported release content canonicalization.")
    generated_by = _text(root["generated_by"], "generated_by", max_length=128)
    digest = root["content_sha256"]
    if not isinstance(digest, str) or not _SHA256.fullmatch(digest):
        raise KnowledgeReleaseError("content_sha256 must be a lowercase SHA-256 digest.")
    if not hmac.compare_digest(digest, calculate_release_sha256(root)):
        raise KnowledgeReleaseError("Knowledge release content hash does not match.")

    approved_value = root["approved_ids"]
    if not isinstance(approved_value, list) or any(not isinstance(item, str) for item in approved_value):
        raise KnowledgeReleaseError("approved_ids must be a list of record IDs.")
    approved_ids = tuple(approved_value)
    if tuple(sorted(set(approved_ids))) != approved_ids:
        raise KnowledgeReleaseError("approved_ids must be sorted and unique.")
    if any(not _KNOWLEDGE_ID.fullmatch(record_id) for record_id in approved_ids):
        raise KnowledgeReleaseError("approved_ids contains a malformed record ID.")
    source_value = root["source_ids"]
    if not isinstance(source_value, list) or any(not isinstance(item, str) or not item.strip() for item in source_value):
        raise KnowledgeReleaseError("source_ids must be a list of non-empty source IDs.")
    source_ids = tuple(source_value)
    if tuple(sorted(set(source_ids))) != source_ids:
        raise KnowledgeReleaseError("source_ids must be sorted and unique.")

    rejected_value = root["rejected_records"]
    if not isinstance(rejected_value, list):
        raise KnowledgeReleaseError("rejected_records must be a list of bounded diagnostics.")
    if len(rejected_value) > MAX_REJECTED_RECORDS:
        raise KnowledgeReleaseError("rejected_records exceeds the configured diagnostic limit.")
    rejected: list[Mapping[str, str]] = []
    rejected_ids: set[str] = set()
    allowed_reasons = {
        "unsupported_source_schema",
        "unmapped_applicability",
        "unreviewed_record",
        "missing_source_support",
        "missing_dependency",
    }
    for index, value in enumerate(rejected_value):
        item = _require_object(value, f"rejected_records[{index}]", {"record_id", "reason_code", "source_schema"})
        record_id = _text(item["record_id"], f"rejected_records[{index}].record_id", max_length=128)
        reason = _text(item["reason_code"], f"rejected_records[{index}].reason_code", max_length=64)
        schema = _text(item["source_schema"], f"rejected_records[{index}].source_schema", max_length=64)
        if not _KNOWLEDGE_ID.fullmatch(record_id) or reason not in allowed_reasons:
            raise KnowledgeReleaseError(f"rejected_records[{index}] has an unsupported diagnostic.")
        if record_id in rejected_ids or record_id in approved_ids:
            raise KnowledgeReleaseError(f"record {record_id} is duplicated or both approved and rejected.")
        rejected_ids.add(record_id)
        rejected.append(MappingProxyType({"record_id": record_id, "reason_code": reason, "source_schema": schema}))

    records_value = root["records"]
    if not isinstance(records_value, dict):
        raise KnowledgeReleaseError("records must be an object keyed by stable record ID.")
    records = {record_id: _parse_record(record_id, row) for record_id, row in records_value.items()}
    if set(records) != set(approved_ids):
        raise KnowledgeReleaseError("approved_ids must exactly match the included release records.")
    if not records:
        raise KnowledgeReleaseError("A knowledge release must contain at least one approved record.")
    for record in records.values():
        for reference in record.source_refs:
            if reference["source_id"] not in source_ids:
                raise KnowledgeReleaseError(f"record {record.id} references a source absent from source_ids.")
    return KnowledgeRelease(
        id=release_id,
        schema_version=RELEASE_SCHEMA_VERSION,
        source_kb_commit=source_commit,
        content_sha256=digest,
        canonicalization=CANONICALIZATION,
        generated_by=generated_by,
        approved_ids=approved_ids,
        source_ids=source_ids,
        rejected_records=tuple(rejected),
        records=MappingProxyType(records),
    )


def load_release(release_id: str, release_directory: Path | None = None) -> KnowledgeRelease:
    """Resolve one exact release ID under the API package and verify its contract.

    No "latest" lookup is provided: historical runs must ask for their stored
    release ID. A release path may not escape the configured package directory,
    and files are size-bounded before parsing.
    """
    if release_id == "latest":
        raise KnowledgeReleaseError("The latest alias is reserved; request an exact immutable release ID.")
    if not isinstance(release_id, str) or not _RELEASE_ID.fullmatch(release_id):
        raise KnowledgeReleaseError("Invalid knowledge release ID.")
    root = (release_directory or DEFAULT_RELEASE_DIRECTORY).resolve()
    candidate = (root / f"{release_id}.json").resolve()
    if not candidate.is_relative_to(root):
        raise KnowledgeReleaseError("Knowledge release path escapes its package directory.")
    try:
        stat = candidate.stat()
    except FileNotFoundError as error:
        raise KnowledgeReleaseNotFound(f"Knowledge release {release_id} is not packaged.") from error
    if not candidate.is_file():
        raise KnowledgeReleaseError(f"Knowledge release {release_id} is not a regular file.")
    if stat.st_size > MAX_RELEASE_BYTES:
        raise KnowledgeReleaseError("Knowledge release exceeds the configured size limit.")
    try:
        raw = candidate.read_bytes()
    except OSError as error:
        raise KnowledgeReleaseError(f"Knowledge release {release_id} could not be read.") from error
    if len(raw) > MAX_RELEASE_BYTES:
        raise KnowledgeReleaseError("Knowledge release exceeds the configured size limit.")
    try:
        document = json.loads(
            raw.decode("utf-8", errors="strict"),
            object_pairs_hook=_object_without_duplicate_keys,
            parse_constant=_fail_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise KnowledgeReleaseError(f"Knowledge release {release_id} is not valid UTF-8 JSON.") from error
    release = _parse_release(document)
    if release.id != release_id:
        raise KnowledgeReleaseError("Packaged release ID does not match the requested release ID.")
    return release
