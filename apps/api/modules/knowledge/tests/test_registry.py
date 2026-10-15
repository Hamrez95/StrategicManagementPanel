from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

from modules.knowledge.registry import (
    CANONICALIZATION,
    MAX_RELEASE_BYTES,
    MAX_REJECTED_RECORDS,
    KnowledgeReleaseError,
    KnowledgeReleaseNotFound,
    calculate_release_sha256,
    load_release,
)


def release_document(**overrides: Any) -> dict[str, Any]:
    document: dict[str, Any] = {
        "release_id": "test-release-a",
        "schema_version": 1,
        "source_kb_commit": "a" * 40,
        "canonicalization": CANONICALIZATION,
        "generated_by": "fixture-builder/1",
        "approved_ids": ["MET-CONTRIBUTION-MARGIN"],
        "source_ids": ["SRC-TEST"],
        "rejected_records": [
            {
                "record_id": "MET-ACTIVATION-RATE",
                "reason_code": "missing_source_support",
                "source_schema": "1.0.0",
            }
        ],
        "records": {
            "MET-CONTRIBUTION-MARGIN": {
                "source_schema": "1.0.0",
                "revision": "1.0.0",
                "adapter_id": "management-knowledge/1.0.0",
                "source_support": {
                    "status": "source_supported",
                    "refs": [{"source_id": "SRC-TEST", "section": "definition"}],
                    "rationale": "",
                },
                "definition": {
                    "metric_kind": "amount",
                    "formula_prose": "sum(net revenue) - sum(variable costs)",
                    "units": ["IRR"],
                    "nested": {"ready": True},
                },
            }
        },
        "content_sha256": "",
    }
    document.update(overrides)
    document["content_sha256"] = calculate_release_sha256(document)
    return document


class KnowledgeReleaseReaderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.release_dir = Path(self.temp.name)

    def write_release(self, document: dict[str, Any], *, release_id: str | None = None) -> Path:
        name = release_id or document["release_id"]
        path = self.release_dir / f"{name}.json"
        path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return path

    def test_explicit_release_id_is_repeatable_and_deeply_immutable(self) -> None:
        old = self.write_release(release_document())
        newer = release_document(
            release_id="test-release-b",
            source_kb_commit="b" * 40,
            records={
                "MET-CONTRIBUTION-MARGIN": {
                    **release_document()["records"]["MET-CONTRIBUTION-MARGIN"],
                    "revision": "2.0.0",
                    "definition": {"metric_kind": "amount", "formula_prose": "revised prose"},
                }
            },
        )
        self.write_release(newer)

        first = load_release("test-release-a", self.release_dir)
        repeated = load_release("test-release-a", self.release_dir)
        second = load_release("test-release-b", self.release_dir)

        self.assertEqual(first, repeated)
        self.assertEqual(first.id, "test-release-a")
        self.assertEqual(first.source_kb_commit, "a" * 40)
        self.assertNotEqual(first.content_sha256, second.content_sha256)
        self.assertEqual(first.get("MET-CONTRIBUTION-MARGIN").revision, "1.0.0")
        self.assertIsNone(first.get("PLAN-UNAPPROVED"))
        self.assertEqual(first.get("MET-CONTRIBUTION-MARGIN").definition["formula_prose"], "sum(net revenue) - sum(variable costs)")
        with self.assertRaises(TypeError):
            first.records["NEW"] = first.records["MET-CONTRIBUTION-MARGIN"]  # type: ignore[index]
        with self.assertRaises(TypeError):
            first.get("MET-CONTRIBUTION-MARGIN").definition["nested"]["ready"] = False  # type: ignore[index]
        with self.assertRaises(AttributeError):
            first.approved_ids.append("NEW")  # type: ignore[attr-defined]
        self.assertTrue(old.exists())

    def test_canonical_hash_is_independent_of_json_whitespace_and_crlf(self) -> None:
        document = release_document()
        path = self.release_dir / "test-release-a.json"
        formatted = json.dumps(document, ensure_ascii=False, indent=4).replace("\n", "\r\n")
        path.write_bytes((formatted + "\r\n").encode("utf-8"))
        self.assertEqual(load_release("test-release-a", self.release_dir).content_sha256, document["content_sha256"])

    def test_unavailable_release_is_reported_without_latest_fallback(self) -> None:
        self.write_release(release_document(release_id="latest", source_kb_commit="c" * 40))
        with self.assertRaises(KnowledgeReleaseNotFound):
            load_release("unknown-release", self.release_dir)
        with self.assertRaisesRegex(KnowledgeReleaseError, "latest alias is reserved"):
            load_release("latest", self.release_dir)

    def test_release_identifier_cannot_traverse_package_path(self) -> None:
        for identifier in ("../outside", "nested/release", "", "../test-release-a"):
            with self.subTest(identifier=identifier), self.assertRaises(KnowledgeReleaseError):
                load_release(identifier, self.release_dir)

    def test_tampered_content_is_rejected(self) -> None:
        document = release_document()
        document["generated_by"] = "unverified-edit"
        self.write_release(document)
        with self.assertRaisesRegex(KnowledgeReleaseError, "content hash"):
            load_release("test-release-a", self.release_dir)

    def test_unknown_release_schema_is_rejected_even_with_valid_digest(self) -> None:
        self.write_release(release_document(schema_version=99))
        with self.assertRaisesRegex(KnowledgeReleaseError, "Unsupported knowledge release schema"):
            load_release("test-release-a", self.release_dir)

    def test_duplicate_json_keys_are_rejected(self) -> None:
        (self.release_dir / "test-release-a.json").write_text(
            '{"release_id":"test-release-a","release_id":"shadow"}', encoding="utf-8"
        )
        with self.assertRaisesRegex(KnowledgeReleaseError, "Duplicate JSON key"):
            load_release("test-release-a", self.release_dir)

    def test_approved_records_need_explicit_review_and_real_source_references(self) -> None:
        unreviewed = release_document()
        unreviewed["records"]["MET-CONTRIBUTION-MARGIN"]["source_support"]["status"] = "unreviewed"
        unreviewed["content_sha256"] = calculate_release_sha256(unreviewed)
        self.write_release(unreviewed)
        with self.assertRaisesRegex(KnowledgeReleaseError, "unapproved source-support"):
            load_release("test-release-a", self.release_dir)

        unsupported = release_document(source_ids=[])
        self.write_release(unsupported)
        with self.assertRaisesRegex(KnowledgeReleaseError, "absent from source_ids"):
            load_release("test-release-a", self.release_dir)

    def test_missing_claim_level_source_for_supported_record_is_rejected(self) -> None:
        document = release_document()
        document["records"]["MET-CONTRIBUTION-MARGIN"]["source_support"]["refs"] = []
        document["content_sha256"] = calculate_release_sha256(document)
        self.write_release(document)
        with self.assertRaisesRegex(KnowledgeReleaseError, "claim-level source"):
            load_release("test-release-a", self.release_dir)

    def test_record_set_must_equal_the_approved_id_allowlist(self) -> None:
        document = release_document(approved_ids=[])
        self.write_release(document)
        with self.assertRaisesRegex(KnowledgeReleaseError, "exactly match"):
            load_release("test-release-a", self.release_dir)

    def test_record_cannot_be_both_approved_and_rejected(self) -> None:
        diagnostics = release_document()["rejected_records"]
        diagnostics.append(
            {
                "record_id": "MET-CONTRIBUTION-MARGIN",
                "reason_code": "unreviewed_record",
                "source_schema": "1.0.0",
            }
        )
        self.write_release(release_document(rejected_records=diagnostics))
        with self.assertRaisesRegex(KnowledgeReleaseError, "duplicated or both approved and rejected"):
            load_release("test-release-a", self.release_dir)

    def test_oversized_file_is_rejected_before_json_parsing(self) -> None:
        (self.release_dir / "test-release-a.json").write_bytes(b" " * (MAX_RELEASE_BYTES + 1))
        with self.assertRaisesRegex(KnowledgeReleaseError, "size limit"):
            load_release("test-release-a", self.release_dir)

    def test_rejected_record_diagnostics_have_a_bounded_count(self) -> None:
        diagnostics = [
            {
                "record_id": f"REJECT-{index:03}",
                "reason_code": "unreviewed_record",
                "source_schema": "1.0.0",
            }
            for index in range(MAX_REJECTED_RECORDS + 1)
        ]
        self.write_release(release_document(rejected_records=diagnostics))
        with self.assertRaisesRegex(KnowledgeReleaseError, "diagnostic limit"):
            load_release("test-release-a", self.release_dir)


if __name__ == "__main__":
    unittest.main()
