# Finance evidence and design notes

Reviewed: 2026-10-15. Scope: knowledge records only; no UI, calculation service, legal compliance certification or runtime behavior implemented.

## Deliverables

18 metric records, 3 diagnostic trees, 2 workflow frameworks, 11 sources.
All text is authored in Persian with English aliases and symbolic formulas.
Metric IDs use MET-UPPERCASE-SLUG. Source IDs use SRC-FINANCE-lowercase-slug.
Source metadata records standardized access depth (relevant_sections or search_excerpt) and limitations. All records carry schema_version 1.0.0 and canonical maturity stages. No numeric external benchmark has been imported.

## Evidence method

Primary institutional summaries: [SEC financial statements](https://www.sec.gov/about/reports-publications/investorpubsbegfinstmtguide), [IFRS 15](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/), [IAS 7](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/).
Educational originals: [OpenStax contribution margin](https://openstax.org/books/principles-managerial-accounting/pages/3-1-explain-contribution-margin-and-calculate-contribution-margin-per-unit-contribution-margin-ratio-and-total-contribution-margin), [OpenStax working capital](https://openstax.org/books/principles-finance/pages/19-1-what-is-working-capital), [Damodaran working capital](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/noncashwc.htm).
Practitioner originals: [Skok SaaS metrics](https://www.forentrepreneurs.com/saas-metrics-2/), [Skok LTV DCF](https://www.forentrepreneurs.com/ltv/).
Vendor educational originals are used only for the burn/runway concepts; their benchmarks and unsupported startup failure statistics were excluded.
FCF relies on SEC-hosted 2022 correspondence discussing staff interpretation 102.07; the direct current interpretation page could not be fetched. This supports a common calculation and disclosure caution, not certification of current legal compliance.

## Explicit product conventions and judgment

- Net burn includes operating plus investing cash flows and excludes financing. This is declared as a product convention; other operational-only definitions must be separately named. Debt repayment is still essential in the forward cash forecast.
- Runway subtracts a user-approved minimum reserve from unrestricted cash. Nonpositive burn returns not applicable/undefined in this specification; it does not imply guaranteed infinite survival. Negative available headroom is a shortfall.
- LTV is a finite-horizon discounted expected margin model per original acquired customer, including survival and disclosed retention/expansion costs. CAC is excluded from LTV and compared separately.
- Contribution margin records an amount; its revenue-based ratio is explained separately. Variable cost coverage requires an explicit policy; gross margin is not a substitute.
- DPO uses credit purchases by preference. The cited textbook uses COGS; the record expressly labels COGS as a proxy whose limitations matter when stock and cash purchase share change.
- All diagnostic branches, escalation workflow, owner/frequency defaults and recommended actions are product-authored heuristics. Sources support accounting concepts, not the exact decision trees.
- No causal diagnosis follows from a ratio alone. Branches require documentary evidence and retain missing-data paths.
- IFRS standard summaries were read; complete standards, local Iranian accounting requirements, tax law and company-specific contracts were not reviewed. This material is educational and requires finance-owner approval for company policy.

## Validation and remaining work

JSON parsing and internal metric/source reference checks completed successfully (18 metrics, 11 sources, zero unresolved metric/source references).
The formulas are human-readable specifications; no runtime calculator was introduced or claimed tested.
Calculation examples are synthetic teaching examples, not industry benchmarks or predictions.
Future ingestion must validate denominator guards, unit/currency/period consistency, access permissions and metadata against the parent registry schema.
Working capital ratios are primarily for trading/manufacturing/credit sales; not every finance metric applies to every business type. applicability remains explicit in warnings where a generic all-business record is used.


