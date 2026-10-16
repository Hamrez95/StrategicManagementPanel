# STR-054-B — first-slice knowledge review

Reviewed 2026-10-16 against the canonical records in `assets/management-knowledge/`. The machine-readable curation input is `apps/api/modules/knowledge/curation/first-slice-v1.json`. It is a reviewed candidate manifest for packet 054-C, not a packaged or active runtime release. Canonical research files remain unchanged.

## Reviewed dependency set

The first slice has two distinct paths. The idea-stage discovery path is `RULE-DISCOVERY` → `REC-DISCOVERY` → `ACT-DISCOVERY` and uses `FW-STARTUP-BUSINESS-MODEL-CANVAS`. The early-traction retention path is `RULE-RETENTION-BEFORE-SCALE` → `REC-RETENTION-BEFORE-SCALE` → `ACT-RETENTION-BEFORE-SCALE` and uses `FW-STARTUP-LEAN-STARTUP`. Both frameworks are original Startino syntheses with source-supported elements and product-authored guidance; neither is independent proof that an intervention succeeds.

All rules, recommendations and actions in these paths are explicitly product heuristics/playbooks. Blank supports the broad claim that startups test business-model hypotheses against observed behavior. Ries supports iterative validated learning and actionable measurement. Amplitude documents event-defined retention cohorts and incomplete observation windows. These sources do not prescribe a universal minimum retention rate or require stopping all acquisition. The rule's low-confidence candidate, missing-evidence request, human review, seasonal/one-time exception and bounded-risk experiment remain product policy.

For `MET-CONTRIBUTION-MARGIN`, OpenStax §3.1 supports the arithmetic meaning of sales less variable costs as a contribution amount and distinguishes amount from ratio. The product's input classification, cost policy, period, currency, interpretation and suggested actions are not thereby source-validated. In this first slice it is contextual definition only: never a retention trigger or threshold; no formula prose is executed. Calculation waits for the typed input contract and function in STR-058-B.

STR-058-B preserves `stratino-first-slice-v1` as the historical definition-only snapshot and introduces `stratino-first-slice-v2` with a narrow `typed_calculation_only` gate. It permits only `MET-CONTRIBUTION-MARGIN` amount from explicit typed inputs; Workspace/scope/period/currency/accounting basis must match, and the owner-declared variable-cost scope is required. It does not import `business_types` or `stages`, classify cost categories or add a benchmark. The v2 digest is pinned on each run; v1 remains available for historical interpretation.

## Release and execution boundaries

- The manifest lists only nine candidate records and their exact dependencies. Its per-record revision is the SHA-256 of canonical compact, sorted-key UTF-8 JSON for that record; the adapter ID names the explicit adapter packet 054-C must implement. The pinned knowledge source commit is recorded in the manifest.
- `RULE-DISCOVERY` stays blocked from executable output until `stage` and `operating` have a reviewed, lossless input mapping. Do not infer `operating=false` from an absent profile or any company-size field.
- The retention route may only consume explicit, same-venture/segment scope. `retention_evidence` can be derived from `repeatability_evidence_status` only when the preserved `repeatability_scope` is `cohort_retention`; other scopes remain unknown. A bounded test is not a material acquisition-scale request.
- The contribution metric projection omits raw `business_types`/`stages` applicability tags. Applicability is unresolved until a typed axis adapter is reviewed; source definitions do not grant universal applicability.
- Raw platform tags, activation-rate claims, organization/cadence rules, six additional financial input families, diagnostic roots and every `PLAN-*` concept remain outside this candidate. No tag is converted to a runtime predicate by resemblance.
- Source bibliography entries have no declared schema version. The manifest records them as unversioned evidence records and pins their reviewed claim text and canonical file. They are provenance references, not executable records.

## Source boundaries

The candidate source IDs and claim-level section labels are listed in the manifest. The relevant primary references are [Steve Blank's first principles](https://steveblank.com/2010/01/25/whats-a-startup-first-principles/), [The Lean Startup methodology](https://theleanstartup.com/principles), [Amplitude's retention calculation](https://www.amplitude.com/docs/analytics/charts/retention-analysis/retention-analysis-calculation), [OpenStax §3.1](https://openstax.org/books/principles-managerial-accounting/pages/3-1-explain-contribution-margin-and-calculate-contribution-margin-per-unit-contribution-margin-ratio-and-total-contribution-margin), and [Strategyzer's Business Model Canvas description](https://www.strategyzer.com/library/the-business-model-canvas). Their limits are part of the reviewed content: a canvas describes a model, retention calculation defines measurement behavior, and contribution-margin arithmetic does not classify a particular company's costs.

## Verification and next step

Before 054-C packages anything, validate every manifest path, source ID, schema and revision against the pinned knowledge commit. Keep blocked mappings out of executable definitions. The release reader's existing hash and exact-ID tests remain applicable; release generation, drift CI, server and Docker checks are separate later acceptance work.
