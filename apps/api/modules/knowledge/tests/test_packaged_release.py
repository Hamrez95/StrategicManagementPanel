from __future__ import annotations

import unittest

from modules.knowledge.registry import load_release


class PackagedKnowledgeReleaseTests(unittest.TestCase):
    def test_first_slice_is_loadable_but_runtime_gates_are_preserved(self) -> None:
        release = load_release("stratino-first-slice-v1")

        self.assertEqual(len(release.approved_ids), 9)
        self.assertEqual(len(release.source_ids), 5)
        self.assertIsNotNone(release.get("RULE-RETENTION-BEFORE-SCALE"))
        self.assertEqual(
            release.get("RULE-DISCOVERY").definition["runtime_gate"]["status"],
            "blocked_until_typed_mapping",
        )
        self.assertEqual(
            release.get("REC-DISCOVERY").definition["runtime_gate"]["inherited_from"],
            "RULE-DISCOVERY",
        )
        self.assertEqual(
            release.get("RULE-RETENTION-BEFORE-SCALE").definition["runtime_gate"]["status"],
            "gated_by_STR-061-A",
        )
        self.assertEqual(
            release.get("MET-CONTRIBUTION-MARGIN").definition["runtime_gate"]["status"],
            "definition_only_until_STR-058-A_B",
        )
        self.assertEqual(
            {item["record_id"] for item in release.rejected_records},
            {"MET-ACTIVATION-RATE", "PLAN-MARKET-SIZING"},
        )


if __name__ == "__main__":
    unittest.main()
