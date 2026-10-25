# Management modeling checkpoint — 2026-10-24

This checkpoint records implemented database/service work before the operator console. It supersedes older statements in STATUS.md that all server checks were deferred. It does not mark the research catalog or every frontend tool as a completed server feature.

## Inventory and ownership

The read-only [MODEL_INVENTORY.json](MODEL_INVENTORY.json) contains **59 application models**, including field types, nullable values, choices, relationships, delete policy, declared indexes and constraints. It excludes customer rows. Regenerate using `python manage.py audit_model_integrity --schema` after migrations.

| Domain | Canonical responsibility |
| --- | --- |
| accounts | Identity, Google identities/challenges, preferences and avatars; no Workspace ownership inferred from staff status |
| workspaces | Owner, billing account, membership, invitations, versioned business profile, setup, audit events and management entitlements |
| customer_context | Products, segments, Ideal Customer Profiles and migration identities |
| evidence | Claims, evidence, links and confidence assessments |
| metrics | Typed observations, evidence links, calculation runs and values |
| analysis | Versioned IFE/EFE records and retained revision snapshots |
| strategy | Factors, options and explicit links |
| execution | Decisions, goals, actions and events |
| documents | Document lifecycle, events and private attachment metadata |
| imports / exports | Idempotent import batches and frozen versioned export artifacts |
| academy | Curriculum projection, free samples, pricing/order/subscription records, progress and feedback; separate from management plans |

Workspace ownership remains explicit. Nested business references must belong to the same Workspace. Editors/viewers do not become billing owners. Joining someone else's Workspace does not consume an owned-Workspace allowance. Staff status alone never authorizes reading customer Workspace data.

Typed canonical entities remain the source of truth. JSON is retained for versioned calculation inputs, frozen snapshots and bounded event differences; it is not a replacement for every business entity in one generic answers table.

## Implemented database safeguards

PostgreSQL now has **112 expected custom guard objects** checked by the audit command. These include choice checks, composite tenant foreign keys and their unique parent keys, tenant-reparenting triggers, bridge-link scope checks, billing/Workspace owner consistency, duplicate-owner membership prevention and frozen subscription entitlement snapshots.

Owner identity cannot be reassigned by updating a Workspace or BillingAccount. A future transfer feature requires a dedicated reviewed workflow and explicit migration of this rule. Subscription plan edits cannot rewrite already granted capabilities.

`python manage.py audit_model_integrity --summary` runs **142 aggregate checks** across 59 models and checks installed guard coverage. The local database and an isolated restored copy both returned **zero violations and no missing guards**. Output contains rule names/counts, not customer identifiers or content. The command fails on violations and never repairs data automatically. CI runs it after migrations.

These additional guards require PostgreSQL. SQLite is not equivalent acceptance evidence. Future choices, tenant relations or models need an explicit guard migration: the audit's expected-object calculation deliberately fails when a newly required guard is missing. Migrations use historical model registries and freeze their initial model set; later additions have separate guard migrations.

Migration preflight: take and verify a backup, run the read-only audit, apply migrations on a restored copy, then apply to the intended database. Existing invalid records cause migration failure; no silent reassignment or invented data repair is performed. PostgreSQL constraint installation can lock tables, so schedule deployment against actual data volume. Reverse operations remove added guards; they do not reconstruct deleted business data.

## Management subscription policy

The owner's approved starting boundary is implemented as follows:

| Capability | Default free | Special grant |
| --- | --- | --- |
| Owned active Workspaces | 1 | Frozen grant allowance; `null` means no additional plan cap |
| Vision/business profile and drafts | Available | Available |
| Read existing authorized data | Available | Available |
| Personal raw JSON/CSV/ZIP export | Available | Available |
| Finalize verified IFE/EFE analysis | Draft retained; finalization unavailable | Available subject to scientific validation and membership |
| Run the implemented verified metric calculation | Unavailable | Available subject to required inputs and membership |
| Professional report rendering | Reserved capability only; renderer not implemented | Reserved capability only; renderer not implemented |

`ManagementPlan` is the configurable catalog. The seeded free plan is active; the special plan is inactive and unpriced. No price, duration, payment purchase or payment success was fabricated. The default free entitlement is resolved for every account without creating redundant per-user free-subscription rows. The default plan is configurable; a safe one-Workspace fallback exists if configuration is absent.

`ManagementSubscription` represents an explicitly authorized grant, not a payment receipt. It belongs to the owner's BillingAccount and freezes the plan revision, title, Workspace allowance, feature flags, effective window, granting operator and reason. Effective grants combine additively; expired, future, revoked and suspended-account grants do not unlock special capabilities. Revocation preserves records and grant events.

Creating/restoring a Workspace locks the owner's billing row before checking capacity. The concurrent creation test proves two simultaneous requests cannot both consume the last slot. Archiving releases capacity. Existing excess Workspaces are preserved. Member features follow the Workspace owner's grants, while viewer/archive write restrictions remain independent.

Server enforcement is connected to create/restore, analysis finalization and the implemented verified metric calculation. UI-only and local research previews are not payment-security boundaries or completed server calculators. Account UI shows capacity and capability availability; it does not offer a fake checkout.

Grant/revoke services require a freshly loaded active, verified staff user with explicit Django model permission, a reason and an idempotency UUID for granting. They are not exposed as public mutation endpoints. No real operator privileges or customer special grants were created in this task. Concurrent reuse of the same UUID across different billing accounts is protected by a database unique key; a future operator API should translate that rare conflict into its normal validation response.

## Versioning and operational history

Analysis create/update writes an `AnalysisRevision` in the same transaction. The read-only history endpoint paginates 50 revisions and remains available to authorized members after source deletion. Initial backfill stores only the current known version, marks `is_backfill`, and leaves the unknown historical actor null. It does not invent earlier versions.

Workspace creation, meaningful name/archive changes, membership changes and invitation lifecycle actions now write bounded audit events. No-op member grants do not create duplicate events. Failed invitation delivery revokes and records the failure atomically without persisting the invitation token or email body in changes. New invitation hashes use SHA-256; existing short-lived SHA-1 digests are accepted for their original validity window without extending validity.

History/event model save methods reject edits. These are service/application immutability rules, not a claim of tamper-proof logging against a privileged database administrator. The PostgreSQL subscription snapshot trigger provides an additional database-level rule for grant fields. Future admin screens must expose history read-only and use audited services for changes; do not bulk-register raw model editing.

New live read routes and pagination/visibility semantics are documented in [OpenAPI](../api/openapi.json). Member entitlement reads exclude billing identifiers and owner grant lists. Account subscription reads are owner-only, private and not cached.

## Defects repaired during verification

- API reference resources are packaged under `apps/api/resources`; Docker no longer depends on repository parent depth. `scripts/sync-api-resources.mjs --check` rejects drift from canonical catalog/fixtures in CI.
- Nullable related-table joins no longer break PostgreSQL row locking when updating documents or calculating persisted metrics; locks target the intended record.
- Existing tests were corrected for current import-size/count contracts, authentic profile creation and the 16 previously approved Academy enrichment cards. Lesson identifiers, questions and answer keys were not changed.
- Cross-Workspace references, bulk reparenting, invalid enum writes and inconsistent owner/billing links are now rejected even outside normal HTTP service paths.

## Verification evidence

- Initial full PostgreSQL baseline: 200 tests, 10 failures and 12 errors. Final full module run: **223/223 passed**.
- After the final owner-identity migration: **7/7 targeted integrity and profile-migration tests passed**.
- Full final test run used MD5 only as a process-local synthetic-test hasher to avoid repeatedly paying production password costs. Production settings and stored real-user hashers were unchanged.
- Django migration drift check and production-configured deployment system check passed. These checks are not evidence of a production deployment or external service configuration.
- Changed/new Python files passed focused Ruff checks. Existing unrelated whole-tree lint findings remain outside this checkpoint.
- Web TypeScript, focused ESLint and production build passed. Actual account UI inspected at desktop and 360 px; no horizontal page overflow.
- Pre-change and final PostgreSQL dumps retained in locally ignored `.local-backups/`; not committed. Final dump restored into a newly created isolated database, integrity audit passed, and only that temporary database was removed. Live data was not overwritten. This validates database restore, not offsite retention or object-file restore.
- Resource drift and OpenAPI contract checks passed. Final AST Graphify update accompanies the implementation.

## Remaining work and admin handoff

1. Build the restricted operator surface: explicit permissions per action, strong operator authentication/MFA, read-only customer summaries and audit views. Do not add automatic tenant impersonation or staff access bypasses.
2. Add plan configuration screens and audited grant/revoke actions through the existing services. Frozen grant fields must stay read-only. Commercial prices, durations and checkout need owner decisions; management orders, payment attempts, refunds and professional report rendering are separate implementation work.
3. Extend versioned exports explicitly. The current v1 export's 14-section contract does not yet include every normalized observation/evidence record or the newly retained analysis history. Keeping raw export free does not mean its existing schema exports every database table.
4. Continue the approved domain packets for advanced frameworks, observations and evaluation/recommendation/review engines. The 64 frontend catalog entries and local drafts are not 64 authenticated server engines. This work does not approve scientific gaps or invent thresholds/formulas.
5. Before production: verify offsite database retention, private object-file backup/restore, monitoring and operator MFA with real deployment configuration. The local database restore drill does not close those tasks.

The safe next admin slice is plan/user/subscription **read views first**, then scoped audited mutations. The database inventory and integrity gate provide the review baseline; unfinished domain engines remain explicitly unfinished.

## STR-029 implementation follow-up — 2026-10-25

See [STATUS](STATUS.md) for the order/payment/refund state and authorization contract. The implementation adds payment models and a provider-agnostic server service boundary while leaving checkout and discounts closed. Twenty-three focused tests ran under SQLite (21 passed; PostgreSQL-only database-guard and row-locking checks skipped); this is supplementary evidence. The required PostgreSQL and isolated-restore acceptance has not been completed because Docker/PostgreSQL became unreachable during the run; no payment-specific PostgreSQL pass is claimed.
