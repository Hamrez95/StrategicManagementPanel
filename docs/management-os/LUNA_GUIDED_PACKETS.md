# Luna — guided Workspace backend integration, 2026-10-17

Read AGENTS, STATUS, [GUIDED_WORKSPACES](GUIDED_WORKSPACES.md), the selected parent issue and only the relevant existing service. These packets refine existing tasks; do not create a parallel catalog. Preserve the frontend design and previous 010-D → 013-D → 014-D → 015-D integration dependencies. Use Hamrez95 only. Complete local unit/contract checks now; defer actual server/PostgreSQL, Docker and physical acceptance to the final pass. None of the owning issues is Done merely because this frontend exists.

## 026-E — question state and contextual education

**Parent:** STR-026/#26 and STR-064. UI: `GuidedFlow.tsx`, `GuidedAnalysis.tsx`, `guidedDefinitions.ts`.

The exact page/step/field IDs and copy are implemented. Keep product input journeys separate from release-pinned scientific JourneyRun. Save current step and field bindings with a schema/definition version; changing an objective does not erase unrelated canonical data. Resolve existing inputs before asking again (STR-061), with explicit scope/period/source provenance and unresolved/conflict states. Do not turn `toolNotes`, `_step` or arbitrary text keys into a production schema. Unknown, observed, estimate and not-applicable are distinct. Preserve pause/back/re-entry and account education/motion preferences. Always show essential unit/error/method messages even when help is disabled.

Acceptance: resume exact step after reload; simultaneous editors cause revision conflict; failed save retains typed values and blocks false saved messages; existing canonical values are prefilled only with compatible context; viewer cannot write. Do not invent missing research routing rules.

## 018-E — typed profile, market, SWOT, retention and risk adapters

**Parents:** STR-018/#18, STR-019/#19, STR-057/058, later risk task as cataloged. UI: the six corresponding definitions and structured review.

Map segment/buyer/problem/alternative to `customer_context`; evidence/source/contradictions to `evidence`; keep assumptions as claims, never observations. Market scope includes product/customer/geography/period. Preserve SWOT factor identities and source context; explicit copy into a matrix produces a snapshot, not a live alias. Decision text maps to existing execution/decision schema under STR-021; next action creation is explicit and idempotent.

Retention inputs must identify the cohort, event, observation window, unique starting count and returned subset; nonnegative integers, original > 0, returned <= original. Persist typed numeric observations and calculation versions through STR-058 only when definition bindings are reviewed; do not infer LTV, survival curve, benchmark or stage. Risk records retain owner, cause/event/consequence, uncertainty/evidence, response and trigger; do not manufacture a probability score.

Acceptance: two Workspaces never share drafts/evidence/IDs; unknown remains unknown; conflicting/stale context triggers review; display copy and field IDs remain stable; skip is not completion evidence.

## 020-E — wire guided IFE/EFE to existing matrix service

**Parent:** STR-020/#20. Reuse `modules/analysis` and `features/analysis/api.ts`; frontend: `GuidedMatrix.tsx`.

Keep separate `ife-v1`/`efe-v1`, schema 1 and the current typed rows (`id`, `title`, `factor_type`, `weight`, `rating`, `evidence`). Store a draft with revision after each accepted edit; preserve missing values. Server recalculates using existing domain parity fixtures; no client score or `reviewed` flag is trusted for finalization. Total weights 100 under existing tolerance; IFE type/rating mismatch rejected; EFE response interpretation preserved. Finalization requires titles, IDs, evidence and valid numerics. Import from SWOT is an explicit idempotent copy with source revision/time; later SWOT edits do not mutate it. Preserve max 100 factors and archived/viewer write restrictions.

Acceptance: 60%×4 + 40%×2 = 3.2; 60%-only withholds a valid score; missing evidence remains draft; weights never silently normalize; EFE is not overwritten by IFE; stale write/duplicate import/finalized method mismatches fail safely. No universal success threshold at 2.5.

## 042-E — typed finance observations and reproducible calculations

**Parent:** STR-042/#42 plus STR-058. UI: `financeDefinition`, `guidedCalculations.ts`, `FinanceResults`.

Use canonical numeric InputObservation and CalculationRun boundaries already designed, exact decimals on the server and versioned definitions. Capture period start/end, currency, reporting scale, accounting/forecast basis, source record/date, cost scope and business scope. All labels/formulas and field names for 13 preview metrics are in GUIDED_WORKSPACES; these local outputs do not automatically promote unreviewed knowledge definitions. Bind only reviewed definitions and record a concrete review blocker for the rest; keep independent packets progressing.

Missing is not zero; parse Persian/Arabic digits at the UI boundary. Reject NaN/nonfinite/unsafe precision, negative nonnegative fields, fractional customer counts, impossible dates and backwards periods. Costs entered by behavior must not be added to COGS a second time. Positive denominators required; no finite runway with nonpositive net burn or finite break-even with nonpositive contribution. Monetary unit/currency/scale, cash-burn month and statement period must be compatible. Period ROA is not annualized; ROE is explicitly ending-equity based. Context changes invalidate/review dependent runs and never silently convert values. Scope/source changes require a new immutable run; retain the original inputs.

Acceptance: local golden fixture (200 revenue, 120 COGS, 80 variable, 60 fixed) yields 80 gross, 120 contribution, 60 operating-model surplus, 100 break-even; missing/zero distinction, cost-boundary conflicts, units mismatch and ratio denominator tests. Compare exact Decimal outputs with JS display within documented rounding. No health score, profitability guarantee or audited-account claim.

## 022-E — full catalog, guided drafts and review lifecycle

**Parent:** STR-022/#22. Reuse `src/document-catalog.json`, existing documents/catalog service and revisioned document records.

Expose the 60 current bilingual entries / 12 categories without duplicating the catalog. Preserve per-item topic, purpose, owner/reviewer, audience, timing, outline, writing guide, example/advisory/access metadata and `mvp` versus `catalog_only` status. UI routes: `library` and `document/:documentId`. Paginate/filter/search with Workspace permission, not client trust. Draft structure is an ordered list of versioned outline IDs/sections; assign actual members by canonical ID (local name text is a design fixture), and retain suggested roles separately.

Save one section at a time with revision and draft version; evidence links keep provenance. Editing a reviewed/ready record returns it to draft under the existing rules. File attachment and completion of input cards never marks it ready. Only authorized reviewer/owner can approve; prohibit self-asserted local `reviewed` flags. Do not claim all company documents are universally mandatory.

Acceptance: all catalog IDs resolve; original notes preserved; inventory items do not become approved templates; content/version conflicts preserve both drafts; two Workspaces cannot see each other's document sections; review/ready transition and viewer rejection checked locally.

## 023-E — replace IndexedDB adapter with existing private files

**Parent:** STR-023/#23. Frontend: `localAttachments.ts` and `AttachmentPanel`; reuse `modules/documents/attachments`.

Local adapter proves actual byte add/list/download/delete but is not a server client. Map to existing attachment upload/list/download/delete APIs; enforce Workspace/document membership on every operation and recheck on download. Server owns actual quotas, content validation, private keys, MIME/signature validation, filename normalization, scan/quarantine/ready states and audit metadata. Never render arbitrary HTML/SVG or execute a file. Failed/aborted upload stays failed/retryable; don't announce saved until the server commits. Versioned files, duplicate retry key, revoked access, CSRF, signed link expiry and archived scope follow existing contracts.

The local 20 MiB/ten-file bounds are not production-plan promises. Do not silently upload browser files during integration: offer explicit reviewed migration per Workspace, preserve original bytes until verified hash/size and scoped server commit succeed, then let user remove local copies. Workspace deletion must clean attachment metadata/storage under existing retention rules; local orphan/cross-tab lifecycle is not accepted as the production behavior.

Acceptance: synthetic upload/download checksum, unauthorized cross-Workspace read/write/delete, wrong document, expired access, unsupported content, quota, scan failure, interrupted upload, retry and version history. PostgreSQL/S3/scan-engine real integration belongs to the deferred final run.

## 024-E — readable report/export of guided records

**Parent:** STR-024/#24. UI: `GuidedReport.tsx`, existing Report page.

Use the existing authorized immutable reporting snapshot. Export user-facing labels and values; exclude UI progress/internal JSON keys from rendered reports. Include exact calculation methods/versions, units/period/basis, missing inputs, draft evidence status, matrix factors and document draft/review states. No attachment bytes are promised inside a text JSON download; secure file archives use existing attachment-ready and membership rules. Matrix/financial outputs are recalculated/verified server-side before an immutable report run is marked generated. Preserve personal data export access.

Acceptance: report includes guided data with readable labels; no `_step`/raw matrix JSON in print view; missing answers remain unknown; attachments require separate permitted downloads or explicit archive; input edits do not change an already-generated snapshot.

## Later preserved method work

2026-10-26 connection update: `/app` now has typed planning records, canonical finance captures and qualitative option comparison rather than the temporary tool-availability page. See [STATUS](STATUS.md#typed-workspace-tool-connections--2026-10-26). Those records are usable inputs; they do not promote the unreviewed calculation methods below. Keep the same issue IDs and method acceptance gates.

STR-039/#39 (QSPM/VRIO) and STR-040/#40 (CPM/SPACE/BCG) retain their existing review/dependencies. When their definitions are approved, use the same guided interaction: scoped setup, factor-by-factor inputs with examples, explicit source reuse/snapshot, validity gate, then calculation and limitations. Do not enable a fake result or copy unsupported thresholds to make the directory look complete. STR-042's investment/scenario submethods similarly need their existing method/unit/period acceptance; the 13 statement-derived previews are not completion evidence for every financial method.
