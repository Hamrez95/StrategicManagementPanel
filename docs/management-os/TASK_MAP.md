# Unified task reconciliation

2026-10-15. The existing docs/backlog/catalog.json and task files remain the single versioned plan; GitHub issue-map is synchronized from those definitions. This is an audit view, not a parallel roadmap. No old task is closed solely due to age; partial scopes can be superseded without deleting the issue. New task IDs continue STR-053–069; GitHub issue numbers are separate.

## Existing 52 tasks

| Task                             | Decision  | Reason / resulting ownership                                                                                                                                                                                    | Added dependencies |
| -------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| [STR-001](../backlog/STR-001.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-002](../backlog/STR-002.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-003](../backlog/STR-003.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-004](../backlog/STR-004.md) | MODIFY    | Validate the three Management OS questions and observed question burden with personas; retain pricing research as a separate hypothesis.                                                                        | —                  |
| [STR-005](../backlog/STR-005.md) | MODIFY    | Extend accepted ownership ADR with Business Twin projection and additive migration; do not reopen established tenant boundaries.                                                                                | —                  |
| [STR-006](../backlog/STR-006.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-007](../backlog/STR-007.md) | MODIFY    | Include independent knowledge integrity and negative mutation checks; API/runner gates remain required.                                                                                                         | —                  |
| [STR-008](../backlog/STR-008.md) | KEEP      | Reuse existing root run-local.ps1; final physical Windows/Compose tests still pending.                                                                                                                          | —                  |
| [STR-009](../backlog/STR-009.md) | KEEP      | Keep modular monolith/Postgres and infrastructure; code presence does not complete runtime acceptance.                                                                                                          | —                  |
| [STR-010](../backlog/STR-010.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-011](../backlog/STR-011.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-012](../backlog/STR-012.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-013](../backlog/STR-013.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-014](../backlog/STR-014.md) | MODIFY    | Keep onboarding short; reuse canonical profile and defer assessment questions to the dependent decision. Canonical migration is a follow-up in STR-056, not a prerequisite that reopens existing onboarding.    | —                  |
| [STR-015](../backlog/STR-015.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-016](../backlog/STR-016.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-017](../backlog/STR-017.md) | MODIFY    | Extend safe import mappings to canonical identities/provenance only through dry-run and versioned merge preview in follow-up STR-056; existing import is a migration input, not dependent on its own migration. | —                  |
| [STR-018](../backlog/STR-018.md) | MODIFY    | Reuse/migrate profile products/segments/ICPs/evidence; do not create a parallel Journey ICP store.                                                                                                              | —                  |
| [STR-019](../backlog/STR-019.md) | MODIFY    | Keep existing SWOT/TOWS tool and method provenance; KB TOWS research is deferred, not evidence for new automatic advice.                                                                                        | —                  |
| [STR-020](../backlog/STR-020.md) | KEEP      | Preserve reviewed EFE/IFE calculation/method snapshots; do not reinterpret them as universal business health.                                                                                                   | —                  |
| [STR-021](../backlog/STR-021.md) | MODIFY    | Existing Goal/Decision/Action are canonical; accept recommendation transactionally through this module.                                                                                                         | —                  |
| [STR-022](../backlog/STR-022.md) | MODIFY    | Documents may link knowledge/evidence context; attachment existence is not verified evidence or successful completion.                                                                                          | —                  |
| [STR-023](../backlog/STR-023.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-024](../backlog/STR-024.md) | MODIFY    | Extend exports with release/input/evidence trace and compatible schema only after canonical migration; preserve current snapshots.                                                                              | —                  |
| [STR-025](../backlog/STR-025.md) | MODIFY    | Search both approved public knowledge and permitted Workspace content with distinct provenance; retain membership filters.                                                                                      | —                  |
| [STR-026](../backlog/STR-026.md) | MODIFY    | Own shared coaching/quick-learn-deep/previous-next and global off preference; STR-064 owns adaptive Journey presentation.                                                                                       | —                  |
| [STR-027](../backlog/STR-027.md) | SUPERSEDE | Replace arbitrary project health/completion percentage with situation, attention and next action; keep dashboard implementation in this issue.                                                                  | STR-063            |
| [STR-028](../backlog/STR-028.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-029](../backlog/STR-029.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-030](../backlog/STR-030.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-031](../backlog/STR-031.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-032](../backlog/STR-032.md) | MODIFY    | Add redacted knowledge release/evaluation trace and data revisions; never log company evidence text.                                                                                                            | —                  |
| [STR-033](../backlog/STR-033.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-034](../backlog/STR-034.md) | MODIFY    | Describe actual Management OS capabilities and limits; no unimplemented AI/health claims.                                                                                                                       | —                  |
| [STR-035](../backlog/STR-035.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-036](../backlog/STR-036.md) | MODIFY    | Include guided/expert journey and operating dashboard regression scenarios, all themes/locales/motion.                                                                                                          | STR-065            |
| [STR-037](../backlog/STR-037.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-038](../backlog/STR-038.md) | MODIFY    | Add end-to-end Management OS slice, traceability and real observed journey validation to release gates.                                                                                                         | STR-065            |
| [STR-039](../backlog/STR-039.md) | MODIFY    | Map existing QSPM/VRIO to versioned knowledge assessments without replacing legacy calculation semantics.                                                                                                       | —                  |
| [STR-040](../backlog/STR-040.md) | MODIFY    | Reuse canonical competitor/market records; no duplicate BCG/SPACE/CPM state.                                                                                                                                    | —                  |
| [STR-041](../backlog/STR-041.md) | MODIFY    | Preserve legacy tools; new Ansoff runtime promotion requires primary-source review, no invented universal thresholds.                                                                                           | —                  |
| [STR-042](../backlog/STR-042.md) | MERGE     | Shared MetricValue/calculation foundation moves to STR-058; this issue retains advanced calculations and Scenario Lab after foundations.                                                                        | STR-058            |
| [STR-043](../backlog/STR-043.md) | MERGE     | Reuse canonical KPI/Goal/Decision; review scheduling/agenda engine belongs to STR-067, this issue retains BSC and Risk.                                                                                         | STR-057, STR-058   |
| [STR-044](../backlog/STR-044.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-045](../backlog/STR-045.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-046](../backlog/STR-046.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-047](../backlog/STR-047.md) | MODIFY    | Keep opt-in contextual copilot; deterministic engines own formulas, branching/completion/confidence; drafts require review.                                                                                     | STR-063            |
| [STR-048](../backlog/STR-048.md) | KEEP      | Organizational collaboration/integrations remain future; Business Twin does not justify microservices or graph DB.                                                                                              | —                  |
| [STR-049](../backlog/STR-049.md) | KEEP      | Still necessary for secure operation, parity or staged launch; Management OS does not replace this responsibility.                                                                                              | —                  |
| [STR-050](../backlog/STR-050.md) | MODIFY    | Measure actual first-slice activation, question burden and return; distinguish product analytics from customers’ business metrics.                                                                              | —                  |
| [STR-051](../backlog/STR-051.md) | MODIFY    | Reuse canonical dated market/competitor observations with sources and explicit scope; no blanket industry recommendation.                                                                                       | STR-057            |
| [STR-052](../backlog/STR-052.md) | MODIFY    | Use actual action/review events and cadence links; opt-in/idempotency/tenant membership remain essential.                                                                                                       | —                  |

## Epics and new tasks

### MOS-KNOWLEDGE — Knowledge release and scientific traceability

- [STR-053](../backlog/STR-053.md)
- [STR-054](../backlog/STR-054.md)
- [STR-068](../backlog/STR-068.md)

### MOS-QUALITY — Regression-safe application foundation

- [STR-007](../backlog/STR-007.md)
- [STR-008](../backlog/STR-008.md)
- [STR-055](../backlog/STR-055.md)
- [STR-036](../backlog/STR-036.md)

### MOS-TWIN — Canonical business data and evidence

- [STR-056](../backlog/STR-056.md)
- [STR-057](../backlog/STR-057.md)
- [STR-058](../backlog/STR-058.md)
- [STR-018](../backlog/STR-018.md)

### MOS-JOURNEY — Assessment and adaptive inputs

- [STR-059](../backlog/STR-059.md)
- [STR-060](../backlog/STR-060.md)
- [STR-061](../backlog/STR-061.md)
- [STR-064](../backlog/STR-064.md)
- [STR-026](../backlog/STR-026.md)

### MOS-INTELLIGENCE — Explainable diagnosis and next action

- [STR-062](../backlog/STR-062.md)
- [STR-063](../backlog/STR-063.md)
- [STR-069](../backlog/STR-069.md)

### MOS-SLICE — First usable Management OS slice

- [STR-065](../backlog/STR-065.md)
- [STR-027](../backlog/STR-027.md)

### MOS-OPERATIONS — Organization management and review loop

- [STR-066](../backlog/STR-066.md)
- [STR-067](../backlog/STR-067.md)
- [STR-042](../backlog/STR-042.md)
- [STR-043](../backlog/STR-043.md)
- [STR-051](../backlog/STR-051.md)
- [STR-052](../backlog/STR-052.md)

### MOS-COPILOT — Optional contextual AI after deterministic foundations

- [STR-047](../backlog/STR-047.md)

## Dependency ordering

`053 → 054; 055` establish integrity/quality/loader; `056 → 057 → 058` establishes canonical data and evidence-backed metric. `054 + 056 + 057 → 059 → 060 → 061`; `054 + 057 + 058 + 060 → 062 → 063`; `061 + 063 + 055 + shared UI → 064`; `064 + 026 + 027 → 065`. Expand to 066/067/069 only after the first slice. STR-042 scenario follows STR-058; STR-047 AI follows STR-063 and existing privacy/budget/launch gates.

`STR-043 → STR-067` because BSC/Risk records are reused by cadence; this is not a circular engine dependency. STR-027 depends on 063, not 065. Server/Compose/browser/physical checks are queued in NEXT_ACTIONS, not erased from DoD.

## Status policy

Historical completed tasks remain completed. Code-backed but unverified 008–016 now in_progress with honest evidence. Existing 017–024 remain in_progress. New tasks are planned until their own evidence exists; development_complete/validation_pending is tracked as evidence, never a fabricated completed state.
