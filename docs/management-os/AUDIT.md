# Management OS audit — 2026-10-15

## Scope and reproducibility

Baseline: local feature HEAD `5a4dafe`; origin/main `cf8a516`. At entry the only untracked work was `assets/management-knowledge/`. No tracked, staged or research files were discarded. Knowledge was preserved separately in `19bb2d4`. This is a research-foundation commit, not approval to execute every record.

The read-only audit reads and hashes **all 120 KB files**, parses JSON, YAML and any Markdown frontmatter, and independently reconstructs the canonical registry. See [knowledge-audit.json](knowledge-audit.json) for the exact file inventory, SHA-256 values, source depth and recommendation chains. Command: `node scripts/audit-management-knowledge.mjs --report docs/management-os/knowledge-audit.json`. The original research validator also passed: 6 synthetic personas, 16 guards, zero reported errors. Its generated outputs are deterministic research artifacts.

Counts: 31 metrics, 33 frameworks, 68 sources, 10 diagnostics, 11 rules, 8 recommendations, 8 actions, 8 anti-patterns and 11 glossary terms. Citation IDs resolve. Computational metric dependencies and organization prerequisites are acyclic. Startup stage transitions deliberately contain return paths; these must **not** be rejected as prerequisite cycles.

## Knowledge quality and source integrity

Source depth is 9 full-text, 52 relevant-sections, 5 search-excerpt and 2 abstract-only records. A resolvable citation is not proof that its claim is supported. The audit does not certify all 68 publications or all causal claims. No synthetic benchmark, confidence percentage or observed user result was accepted as evidence.

Primary pages reopened in this run:

- [Blank, startup first principles](https://steveblank.com/2010/01/25/whats-a-startup-first-principles/): model search and hypotheses support the distinction between discovery and execution; not the product's exact six stages.
- [Ries, principles](https://theleanstartup.com/principles): learning and experiments support iterative investigation; not automatic stage completion.
- [Strategyzer, Test Card](https://www.strategyzer.com/library/validate-your-ideas-with-the-test-card): hypothesis, test, measurement and threshold support explicit experimental contracts; not a universal success threshold.
- [Amplitude, funnel interpretation](https://amplitude.com/docs/analytics/charts/funnel-analysis/funnel-analysis-interpret): event sequence/window affect conversion. This does not establish a universally valid activation event.

All eight recommendation records structurally trace to a decision rule, an action, framework(s), and sources. Evidence is presently a field specification or named requirement, not a persisted business observation. Traceability therefore ends in a **knowledge contract**, not actual evidence proving a company-specific recommendation. Before runtime promotion STR-054/062 must record claim-level source support and reviewed input mappings.

Findings:

| ID  | Finding and implication                                                                                                                                      | Required response                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| K01 | 19 documents lack a document schema_version; 0.1.0 and 1.0.0 shapes coexist                                                                                  | Explicit version/shape adapters; unsupported records quarantined, never guessed (STR-054)                          |
| K02 | Applicability mixes customer, delivery, lifecycle and operating state; proposal mapping even suggests ideation/launch IDs absent from authoritative taxonomy | Use applicability-contract + field-mapping only; preserve raw values and unresolved tags (STR-054/059)             |
| K03 | Formula strings include sums, variants and explanatory conventions                                                                                           | No eval; implement only reviewed metric IDs with typed variables/units/null guards (STR-058)                       |
| K04 | Diagnostic node shapes differ; original validator checks targets but not every reachability/loop/terminal property                                           | Adapter-specific integrity plus bounded traversal and negative mutation tests (STR-053/062)                        |
| K05 | Supplemental startup predicates and two UX policies are not covered by the eight fixture routes                                                              | Keep policies distinct from scientific rules; test unknown/skip/import/conflict before promotion (STR-060/061/062) |
| K06 | MET-ACTIVATION-RATE cites retention documentation; its product-defined value event and eligibility need closer claim-level support                           | Review against funnel source and measurement specification before activation runtime use (STR-054/068)             |
| K07 | Organization questions have no stable IDs and completion criteria are repeated prose                                                                         | Author explicit question IDs and executable completion contracts; do not infer them (STR-066)                      |
| K08 | TOWS, Ansoff, TAM/SAM/SOM, broad HR/sales/industry rules and local finance remain research gaps                                                              | Preserve existing tools; label method provenance and block unsupported new advice (STR-019/041/051/068)            |
| K09 | Confidence is editorial ordinal and uncalibrated; freshness is phenomenon-specific                                                                           | Preserve axis reasons and contradictory evidence; no averaged score or global expiry (STR-057/069)                 |
| K10 | Scientific efficacy, Iranian accounting applicability and real usability are unverified                                                                      | Explicit research/release gates; six fixture passes are not user research (STR-004/038/068)                        |

Additional findings from the extended STR-053 audit:

- **K11:** LTV/NPV/IRR required inputs include series/context fields that are not one-to-one formula variables. Preserve series/window/currency semantics; explicit typed input adapters are required before promotion (STR-054/058/042).
- **K12:** Three operations/execution diagnostic trees contain entry_question prose, not an entry node ID. Edge targets/cycles can be checked, but a root must not be guessed. A reviewed entry adapter is required (STR-054/062/066).

The extended audit reports 28 warnings: 19 missing document versions, 6 variable/context mappings and 3 diagnostic entry contracts. These are research-to-runtime promotion blockers. Per-stage input/evidence/framework/decision/completion coverage for all six startup phases and eight organization steps is in `journey_coverage` in knowledge-audit.json.

## Can the KB answer the three product questions?

| Question              | Current ability                                                             | Missing bridge                                                                           |
| --------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| What is my situation? | Model/stage/maturity contracts, metric definitions and uncertainty policies | Canonical observations, assessment evidence, reviewed calculations                       |
| What matters most?    | Eight curated candidate routes, cash interruption, ten inquiry trees        | Context mapping, evidence/confidence, competing explanations, priority rationale         |
| What next?            | Eight investigation playbooks with practical outputs                        | Reviewed recommendation instance → existing Decision/Action/Goal, due date and dashboard |

Conclusion: adequate for a **restricted, reviewed first slice** after foundations; insufficient for a general autonomous Management OS.

## Journey and cognitive load

Startup has six phases, twelve stable questions, nine evidence requirements and ten conditional forward/return transitions. Each phase links to stage entry/exit criteria in taxonomy; questions carry why/decision_changed/derive_first/import/skip metadata. Phase optional/deferred/blocking/non-blocking content is explicit. Conditions and completion remain prose. Startup is adaptively designed but not an executable journey yet.

Organization has eight prerequisite steps, import/auto-complete/skip/expert policies and conditional modules. Baseline/context/constraint branching exists, but the default DAG still forces both context and constraint before choice. A local inventory problem should not require a full customer study. STR-066 must implement relevance gates, optional prerequisites and tested direct entry.

All 12 startup questions change a decision and should be **kept conditionally**, not asked at onboarding. Each checks scoped, verified existing data first. Customer/problem and actors reuse profile/ICP. Economics reuses MetricValues; cash/capacity asks only unresolved inputs. Unknown/skipped is retained and blocks only dependent commitments. Constraint, replication and accountability questions are deferred until their decision arises. The three context fields derive from Workspace/model/risk first. Organization questions are scoped prompts pending stable IDs, not a new compulsory questionnaire.

No question-count or time optimum has been observed. The fixture budget of 1–2 next questions is a product hypothesis. Guided and expert mode share the same rules; only disclosure/density differs.

## Existing product and regression risks

React/TypeScript/Vite, React Router, TanStack Query, UI primitives/tokens, Motion; Django modular monolith/PostgreSQL; private attachment interface. Real feature code exists for accounts/preferences, Workspace membership/invites, onboarding/profile/ICP, imports, SWOT/TOWS, EFE/IFE, execution, document metadata/attachments and report snapshots. Existence is not acceptance-test completion. Many catalog entries still say planned despite code/commits; preserve validation_pending rather than invent completion.

Canonical server ownership is Workspace → membership-checked service. Client query keys include Workspace. Device localStorage is appropriate for preferences and legacy prototype, not authoritative business data. Legacy `src/` and React prototype remain a parity boundary; placeholders/legacy tools do not constitute server implementation.

`WorkspaceProfile` currently embeds products, segments, goals, ICPs/evidence/assumptions as JSON. `execution.Goal` separately stores goals; Decision/Action already exist. Normalization must preserve old IDs, revision/history, export/import and evidence provenance. Existing low/medium/high ICP labels are self-reported legacy confidence; do not silently treat them as the new reviewed confidence rubric. No normalized MetricValue, Claim, JourneyRun or RecommendationInstance exists yet.

Preserve guided in-page lessons, previous/next, global education preference, fa/en, RTL/LTR, light/dark/system, reduced motion, modal/chart transitions and responsive behavior. React route registry and legacy links coexist; STR-026 education and STR-064 journey presentation have different responsibilities. Reuse `packages/ui`, account preferences, route boundaries, autosave and safe Workspace switching. No new theme or parallel education state store.

## Validation baseline and operations

- KB research validator: pass; independent structural audit: pass with 19 version-adapter warnings.
- API contracts: pass (68 operations); relevant formatting and whitespace checks: pass before knowledge work.
- `npm run typecheck`: **failed**, existing contract decoder/UI/routeRegistry mismatches; domain and UI workspaces ran after web failure. Root quality is not green. STR-055 is prerequisite to product integration.
- Django/PostgreSQL/Compose, physical Windows runner and screenshot/browser suite are deferred to the final validation queue per owner instruction; not reported as passed.
- Root `run-local.ps1` exists; do not replace it with another runner. Test and extend it only as needed in STR-008.
- Git commit author/committer is Hamidreza. Local HTTPS push fails 403 because GCM has only akbarAbdiX cached. GitHub connector is authenticated as Hamrez95 and can reconcile issues. Main merge remains pending; do not claim remote synchronization.

## Tracking audit

52 local task definitions/catalog entries and mapped GitHub issues; roadmap issue #53. GitHub search returned 47 open issues including the roadmap. Local catalog/specs are the versioned planning source; GitHub is the synchronized execution surface, with explicit map and sync evidence. Do not create a separate Management OS catalog. Every old task receives a KEEP/MODIFY/MERGE/SUPERSEDE decision and rationale in [TASK_MAP.md](TASK_MAP.md). No entire existing task is obsolete solely because the vision expanded.
