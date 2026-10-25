import json
from datetime import date
from decimal import Decimal
from modules.core.resources import resource_path
from unittest import TestCase

from .calculations import (
    ContributionContext,
    ContributionInput,
    calculate_contribution_amount,
)

FIXTURE_PATH = resource_path('fixtures/contribution-margin.json')


def parse_context(source):
    return ContributionContext(
        **{
            **source,
            "period_start": date.fromisoformat(source["period_start"]),
            "period_end": date.fromisoformat(source["period_end"]),
        }
    )


def parse_input(binding_id, source, context):
    return ContributionInput(
        binding_id=binding_id,
        workspace_id=context.workspace_id,
        state=source["state"],
        value=Decimal(source["value"]) if source["value"] is not None else None,
        unit=source["unit"],
        currency=source["currency"],
        scope_kind=source["scope_kind"],
        segment_id=source["segment_id"],
        period_start=date.fromisoformat(source["period_start"]),
        period_end=date.fromisoformat(source["period_end"]),
        accounting_basis=source["accounting_basis"],
        cost_scope=source.get("cost_scope", ""),
        reason=source.get("reason", ""),
    )


class ContributionAmountGoldenTests(TestCase):
    def test_python_matches_shared_decimal_fixtures(self):
        fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        self.assertEqual(fixture["fixture_version"], 1)
        self.assertEqual(fixture["scale"], 6)
        for case in fixture["cases"]:
            with self.subTest(case=case["id"]):
                context = parse_context(case["context"])
                inputs = {
                    binding_id: parse_input(binding_id, source, context)
                    for binding_id, source in case["inputs"].items()
                    if source is not None
                }
                result = calculate_contribution_amount(inputs, context)
                expected = case["expected"]
                self.assertEqual(result.status, expected["status"])
                self.assertEqual(
                    str(result.value) if result.value is not None else None,
                    expected["value"],
                )
                self.assertEqual(result.currency, expected["currency"])
                self.assertEqual(result.cost_scope, expected["cost_scope"])
                self.assertEqual(
                    list(result.missing_inputs), expected["missing_inputs"]
                )

    def test_unknown_is_not_zero_and_extra_input_fails_closed(self):
        fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        case = fixture["cases"][4]
        context = parse_context(case["context"])
        inputs = {
            binding_id: parse_input(binding_id, source, context)
            for binding_id, source in case["inputs"].items()
            if source is not None
        }
        unknown = calculate_contribution_amount(inputs, context)
        self.assertEqual(unknown.status, "unknown")
        self.assertIsNone(unknown.value)
        self.assertNotEqual(unknown.value, Decimal("0"))

        invalid = calculate_contribution_amount(
            {**inputs, "fixed_costs": inputs["net_revenue"]}, context
        )
        self.assertEqual(invalid.status, "invalid")
        self.assertIsNone(invalid.value)
