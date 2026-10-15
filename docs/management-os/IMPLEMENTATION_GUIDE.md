# Implementation sequencing and boundary contracts

2026-10-16. This refines ARCHITECTURE.md into small deliveries for the existing catalog. Paths below are intended new files unless marked existing. Endpoint names are proposals and must be added to OpenAPI in their owning task; they are not live API claims.

## Approved module layout

| Responsibility                       | Location                                                               | Dependencies / prohibition                                                          |
| ------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Offline research integrity           | existing scripts/audit-management-knowledge.mjs and knowledge workflow | Reads all research, no runtime promotion                                            |
| Reviewed release build               | scripts/build-knowledge-release.mjs                                    | Explicit reviewed manifest + original KB; no inferred executable prose              |
| Runtime registry                     | apps/api/modules/knowledge/                                            | Immutable definitions; no ORM/company state dependency                              |
| Canonical context/customer data      | workspaces plus small customer/context module if needed                | Reuse Workspace/Profile services; stable entity IDs and compatibility reads         |
| Claims/evidence/confidence/freshness | apps/api/modules/evidence/                                             | Workspace membership + canonical refs, no runtime AI dependency                     |
| Metric observation/calculation       | apps/api/modules/metrics/                                              | Reviewed registry + evidence; pure functions separated from ORM services            |
| Assessment/Journey/question planning | apps/api/modules/management/                                           | Reads context/evidence/metrics; explicit service methods, not a generic mega-engine |
| Diagnostics/recommendations          | management evaluation submodules                                       | Pure reviewed rules, frozen runs; accepts through existing execution services       |
| Presentation                         | apps/web/src/features/management/                                      | Existing api/client/contracts/queryKeys, shell, account preferences, packages/ui    |

Do not create all empty modules at once. Introduce each when a selected task needs it. A registry importing Django models is a boundary violation; pure evaluation must be testable with input snapshots. Avoid a service that loads every Workspace table for every question.

## STR-054 delivery packets — exact next foundation

**A. Release contract and reader.** Define release ID, normalized schema version, source KB commit, normalized-content SHA-256, approved IDs, per-record revision/adapter/source-support state, and rejected/unmapped record diagnostics. Normalize text encoding/newlines explicitly before hashes so Windows/CI agree. Use immutable release files and a resolver by release ID. Never resolve a historic run to an unpinned latest registry.

**B. Curate the minimal manifest.** Review discovery and retention-before-scale rules and their actual framework/source/action/recommendation dependencies plus MET-CONTRIBUTION-MARGIN. Record whether a claim is source-supported or an explicit product heuristic and which source section supports it. Keep supplemental UX policies distinct. No automatic activation/organization/full-finance promotion. Do not add raw applicability tags to runtime predicates; enumerate the needed axis mappings and unresolved tags.

**C. Build and package.** Research remains canonical at root assets/management-knowledge. Current Compose builds the API from **apps/api**, and its Dockerfile copies that context only. Therefore emit the approved immutable artifact into `apps/api/modules/knowledge/releases/<release_id>.json` (or an equally explicit package-owned artifact). The artifact is derived, generated_by-marked and checked against its manifest in CI; do not move/copy the entire research tree into public web assets. Runtime uses package-relative paths and does not require the repository root or a network request. Add an API app only if configuration/integration requires it.

**D. Verification.** Reader tests cover repeat load, immutable history, missing file, tampered hash, unknown schema/operator/tag, missing approved source/dependency and exclusion of PLAN-* / unapproved records. A pure Python reader can be tested with the available pinned Python runtime without starting a server. Runtime/container packaging check remains queued for final server validation. Expose no new company endpoint merely to demonstrate that a file was loaded.

Task STR-054 remains open until all packets satisfy its criteria. Use small coherent commits; no broad Journey UI in this task.

## STR-056 migration packets

1. Inventory real saved profile rows and consumers; no actual customer migration during planning. Define typed Product/Segment/ICP bindings and map profile goals to existing execution.Goal. Preserve business meaning; title equality is not identity.
2. Add schema and a dry-run command that produces stable ID mappings, preserved source payloads, conflicts and counts. Existing client/import/export fields remain compatible through a projection.
3. Implement one canonical write owner and reviewed apply transaction with revision checks. Never run two unsynchronized write paths. Import ambiguity requires review, retaining source data.
4. Prove empty/upgrade/rerun/rollback/restore behavior and old route/report parity before retiring old writes. Removing JSON columns is a later explicit migration, not part of initial additive normalization.

The first slice can use Workspace + a canonical segment scope. Do not invent BusinessUnit/enterprise multi-scope persistence until its concrete task; unsupported scopes return an explicit unavailable/unknown result rather than being coerced into whole-business scope. Enterprise/new-venture cases remain in the assessment and later organization tests.

## Common data and service contracts

| Contract      | Required semantics                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope         | Workspace from authenticated route/service context; segment/model/venture ref when relevant; whole-business scope is explicit                                           |
| Period        | ISO dates with declared start-inclusive/end-exclusive measurement window; cohort eligibility and timezone separate; do not reinterpret existing due_on dates            |
| Unit/currency | Decimal serialized as plain decimal string; explicit amount/percent/count/duration unit, currency and accounting basis; IRR and IRT are distinct, never an implicit ×10 |
| Value state   | observed_zero is a real numeric zero; unknown/missing, invalid and not_applicable(with reason) carry null and distinct status                                           |
| Provenance    | Source record/ref/revision, observed_at vs imported_at, method/sample/limits, evidence IDs and owner/review_due                                                         |
| Revision      | Existing positive integer conflict pattern; reject stale writes with 409 and preserve draft                                                                             |
| Idempotency   | Acceptance/import creates have keys scoped to Workspace + actor + operation; same key/different payload rejects, retries reuse result                                   |
| Permission    | Server membership and explicit nested same-Workspace checks; model clean() alone is insufficient because save() does not automatically call it                          |
| Trace         | knowledge release + method/rule revisions + frozen input/evidence refs; historic runs never silently mutate                                                             |

Service order: authorize current membership → validate scope/units/revisions → lock records in a consistent order → compute pure result → persist result/links atomically → return explicit DTO. Existing Workspace lock/revision conventions should be reused. Async jobs are not needed for the first slice. If later introduced, they recheck current authorization and input revision before committing.

## Proposed first-slice API surface

| Operation                           | Contract / owning task                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Read scoped context/evidence/metric | Existing profile routes plus new typed module endpoints in 056–058; do not introduce an alternative snapshot write API                      |
| Read next management plan           | Candidate GET under `/api/v1/workspaces/{id}/management/plan/`; 060/061 owns stable scope query and bounded response                        |
| Evaluate a reviewed candidate       | 062/063 service pins release/input revision and returns candidate/unknown/not_applicable plus trace; request cannot choose foreign evidence |
| Accept/dismiss/request evidence     | 063 command with result ID, revision and idempotency key; acceptance collects existing execution-required source/owner/date                 |
| Read run explanation                | Membership-protected immutable evaluation detail; no raw private source objects leaked to public knowledge endpoints                        |

Important current constraint: execution.Decision creation **requires** a finalized Analysis or reviewed StrategyOption. A general evidence-based recommendation cannot currently create a source-less Decision. STR-063 must add a narrowly typed recommendation/evaluation source alternative with same-Workspace validation and snapshot, preserving existing source kinds and readers. Do not bypass `_source`, fabricate a finalized analysis or use an arbitrary JSON source. Update schema, source discriminator, API decoder, permission tests, import/export and revision behavior together. This is a required additive execution change before accepting the first-slice action.

Query keys: Workspace + scope + resource/run/release as appropriate; invalidate only affected projections on canonical writes. Workspace switch/revocation clears scoped queries using current shell conventions. GET must not auto-accept recommendations or create business observations. Use existing session/CSRF/error patterns rather than another client/auth library.

## Testing and integration gates

Unit: release reader/adapters, three-valued predicates, calculation guards, confidence caps, applicability/skip/import and dependency cycles. Contract: actual catalog/DTO fixtures and invalid/null responses, not existence-of-text assertions. Service: membership, nested IDs, viewer/revoked member, duplicate acceptance, revision conflict. Migration: dry-run/repeated apply/backup/restore and compatibility reads.

UI/physical/Compose checks remain the final tracked queue per owner. A task may record development complete with validation_pending, but issue closure requires its real acceptance evidence and merge. Root quality has to remain green as changes accumulate; do not disable gates to work around unrelated failures. Scientific promotion review is not replaced by compiler/test success.

## Bounded work packets for Luna

One turn/commit handles one packet: read selected task, exact affected contracts, scoped Graphify query, implement, run relevant checks, update graph/status, commit, then next packet. Read STATUS/NEXT_ACTIONS and the selected task instead of the entire KB/backlog. If a source/applicability mapping is unresolved, preserve the gate and continue another independent packet; do not invent it. Do not rerun the one-off planning generator or recreate existing GitHub issues.
