"""Explicit numeric input bindings approved for the first metric slice."""

from dataclasses import dataclass


@dataclass(frozen=True)
class NumericInputBinding:
    id: str
    metric_id: str
    required: bool


NUMERIC_INPUT_BINDINGS = {
    item.id: item
    for item in (
        NumericInputBinding(
            id="net_revenue",
            metric_id="MET-CONTRIBUTION-MARGIN",
            required=True,
        ),
        NumericInputBinding(
            id="variable_costs",
            metric_id="MET-CONTRIBUTION-MARGIN",
            required=True,
        ),
    )
}
