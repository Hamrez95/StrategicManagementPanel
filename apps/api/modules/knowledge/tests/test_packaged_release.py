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
            release.get("RULE-RETENTION-BEFORE-SCALE").definition["runtime_gate"][
                "status"
            ],
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

    def test_v2_pins_typed_calculation_while_v1_remains_historical(self) -> None:
        historical = load_release("stratino-first-slice-v1")
        current = load_release("stratino-first-slice-v2")

        self.assertEqual(
            historical.get("MET-CONTRIBUTION-MARGIN").definition["runtime_gate"][
                "status"
            ],
            "definition_only_until_STR-058-A_B",
        )
        metric = current.get("MET-CONTRIBUTION-MARGIN").definition
        self.assertEqual(metric["runtime_gate"]["status"], "typed_calculation_only")
        self.assertIn("cost_scope", metric["runtime_gate"]["fields"])
        self.assertNotIn("business_types", metric["runtime_gate"]["fields"])
        self.assertNotIn("stages", metric["runtime_gate"]["fields"])
        self.assertNotEqual(historical.content_sha256, current.content_sha256)


if __name__ == "__main__":
    unittest.main()
