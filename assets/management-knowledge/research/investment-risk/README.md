# Investment and risk evidence notes

Reviewed 2026-10-15. Deliverables: seven metrics (MET-EBIT, MET-EBITDA, MET-ROIC, MET-ROI, MET-NPV, MET-IRR, MET-BREAK-EVEN), two risk frameworks, one low-margin diagnosis, eight sources. No runtime calculation service or product UI was changed.

Source access is recorded as relevant_sections. Primary originals include SEC staff interpretations, Damodaran's NYU teaching materials, and OpenStax textbooks. Full books were not read; only relevant sections were inspected. No externally sourced numerical benchmark, market return, probability or company forecast was imported.

## Definition choices and boundaries

- SEC-style EBIT starts from net income plus interest expense and income-tax expense; it is not assumed equal to operating income. EBITDA adds only depreciation/amortization already expensed in net income. Other exclusions require a distinct adjusted measure. These are supplementary non-GAAP measures in the cited SEC context, which is not automatically the user's local accounting regime.
- ROIC uses operating after-tax profit and positive invested capital. Beginning versus average capital, treatment of cash, leases, goodwill and research capitalization must be disclosed. No unadjusted dependency on MET-EBIT is imposed because that definition can retain nonoperating income.
- ROI is explicitly the accounting operating-segment version (operating income / average operating assets). It must not silently stand in for simple investment net gain / initial cost, investor total return or annualized return.
- NPV uses signed incremental cash flows including t=0. Currency, nominal/real basis, investor claim, tax treatment and rate period must match. Irregular dates need a dated model. Forecast assumptions are scenarios, not facts.
- IRR requires reporting ambiguity, absent roots and failed convergence. Synthetic flows [-100, 230, -132] have two admissible roots, 10% and 20%; the displayed rate cannot be selected arbitrarily. Rate frequency must be explicit.
- Single-product operating break-even assumes positive unit contribution, constant unit economics and a valid fixed-cost range. Indivisible units round upward. Demand and cash coverage are separate checks.
- Scenario/risk workflows, diagnosis branches, owner/frequency defaults, and recommended actions are product-authored. The sources support financial concepts and limitations, not the exact workflow or a formal ISO risk standard. Probabilities are not fabricated and ordinal risk scores are not expected monetary losses.

## Evidence updates

The current SEC non-GAAP page was accessible at https://www.sec.gov/rules-regulations/staff-guidance/corporation-finance-interpretations/non-gaap-financial-measures . It includes both Sections 103.01/103.02 and FCF interpretation 102.07. The previous shorter SEC URL was inaccessible; no claim is made that the current page is unavailable.

## Verification scope

JSON and reference validation covers these records and references to already-authored finance records. Numeric examples are synthetic teaching checks; there is no executable calculator to verify. Future ingestion must enforce denominator guards, consistent units, data permissions, and approved forecasting assumptions.

