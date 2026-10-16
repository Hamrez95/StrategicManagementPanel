"""Pure deterministic calculations for the reviewed metric slice."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Mapping


@dataclass(frozen=True)
class ContributionInput:
    binding_id: str
    workspace_id: str
    state: str
    value: Decimal | None
    unit: str
    currency: str
    scope_kind: str
    segment_id: str | None
    period_start: date
    period_end: date
    accounting_basis: str
    cost_scope: str = ""
    reason: str = ""


@dataclass(frozen=True)
class ContributionContext:
    workspace_id: str
    scope_kind: str
    segment_id: str | None
    period_start: date
    period_end: date
    currency: str
    accounting_basis: str


@dataclass(frozen=True)
class ContributionResult:
    status: str
    value: Decimal | None
    currency: str
    cost_scope: str
    missing_inputs: tuple[str, ...] = ()
    reason: str = ""


def _invalid(context: ContributionContext, reason: str) -> ContributionResult:
    return ContributionResult(
        status="invalid",
        value=None,
        currency=context.currency,
        cost_scope="",
        reason=reason,
    )


def _fits_storage_precision(value: Decimal) -> bool:
    if not isinstance(value, Decimal) or not value.is_finite():
        return False
    sign, digits, exponent = value.as_tuple()
    del sign
    decimal_places = max(0, -exponent)
    whole_places = max(0, len(digits) + exponent)
    return decimal_places <= 6 and whole_places <= 18


def calculate_contribution_amount(
    inputs: Mapping[str, ContributionInput], context: ContributionContext
) -> ContributionResult:
    """Return net revenue less explicitly scoped variable costs, without inference."""
    required = ("net_revenue", "variable_costs")
    if any(
        key not in required
        or not isinstance(item, ContributionInput)
        or item.binding_id != key
        for key, item in inputs.items()
    ):
        return _invalid(context, "An input is not an approved contribution binding.")

    expected_context = (
        context.workspace_id,
        context.scope_kind,
        context.segment_id,
        context.period_start,
        context.period_end,
        context.currency,
        context.accounting_basis,
    )
    for item in inputs.values():
        if item.state not in {"observed", "unknown", "not_applicable", "invalid"}:
            return _invalid(context, "An input uses an unsupported state.")
        if (item.state == "observed") != (item.value is not None):
            return _invalid(context, "Observed state and numeric value must agree.")
        actual_context = (
            item.workspace_id,
            item.scope_kind,
            item.segment_id,
            item.period_start,
            item.period_end,
            item.currency,
            item.accounting_basis,
        )
        if actual_context != expected_context:
            return _invalid(
                context,
                "Inputs must match Workspace, scope, period, currency and accounting basis.",
            )
        if item.unit != "currency":
            return _invalid(
                context, "Contribution inputs require the same monetary unit."
            )
        if item.binding_id == "variable_costs" and not item.cost_scope.strip():
            return _invalid(
                context, "Variable-cost scope must be explicitly described."
            )
        if item.binding_id == "net_revenue" and item.cost_scope:
            return _invalid(context, "Cost scope cannot be attached to net revenue.")

    present = [inputs.get(binding_id) for binding_id in required]
    if any(item is not None and item.state == "invalid" for item in present):
        return _invalid(context, "An input is marked invalid.")
    if any(item is not None and item.state == "not_applicable" for item in present):
        return ContributionResult(
            status="not_applicable",
            value=None,
            currency=context.currency,
            cost_scope="",
            reason="A required input is explicitly marked not applicable.",
        )
    missing = tuple(
        binding_id
        for binding_id, item in zip(required, present, strict=True)
        if item is None or item.state == "unknown"
    )
    if missing:
        cost_input = inputs.get("variable_costs")
        return ContributionResult(
            status="unknown",
            value=None,
            currency=context.currency,
            cost_scope=cost_input.cost_scope if cost_input else "",
            missing_inputs=missing,
            reason="Required observed inputs are missing or unknown.",
        )

    revenue = inputs["net_revenue"].value
    costs = inputs["variable_costs"].value
    if (
        revenue is None
        or costs is None
        or not _fits_storage_precision(revenue)
        or not _fits_storage_precision(costs)
    ):
        return _invalid(
            context, "Observed inputs must be finite Decimals within storage precision."
        )
    try:
        amount = (revenue - costs).quantize(Decimal("0.000001"))
    except InvalidOperation:
        return _invalid(context, "The result exceeds the supported decimal range.")
    if not _fits_storage_precision(amount):
        return _invalid(context, "The result exceeds the supported decimal range.")
    return ContributionResult(
        status="observed",
        value=amount,
        currency=context.currency,
        cost_scope=inputs["variable_costs"].cost_scope,
    )
