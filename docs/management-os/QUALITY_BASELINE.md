# Quality checkpoint — 2026-10-16

This records real command results for the Luna handoff. No browser/server/Compose result is implied.

| Check | Result |
|---|---|
| npm run typecheck | PASS, web/domain/UI exit 0 after STR-055 repairs |
| npm test | PASS, 70/70, exit 0; includes 18 knowledge mutation tests and 3 new document-contract/decoder tests |
| npm run check:contracts | PASS, 68 unique operations, exit 0 |
| npm run build | PASS, legacy + domain + React production build, exit 0 |
| original KB validator | PASS, 6 synthetic personas / 16 guards; research unchanged |
| independent knowledge audit | PASS, 120 files; 28 explicit runtime-adapter warnings |
| npm run quality | NOT GREEN; original lint script failed directory-glob resolution; scripts now use explicit existing workspace paths |
| npx eslint apps/web/src packages/domain/src packages/ui/src | FAIL, 8 existing baseline errors below |
| npm run format:check | FAIL, 32 existing source files below |

## Remaining STR-055 packet A — lint (8 errors)

- `apps/web/src/api/client.ts:150`: prefer const for payload.
- `features/auth/AuthPages.tsx:278,351`: effect dependencies omit errors. Review whether dependency should be a stable derived field; do not blindly add an object and create a loop.
- `features/auth/api.ts:36`: default generic `{}` is too broad; choose the correct object/unknown contract without weakening decoding.
- `features/onboarding/OnboardingPage.tsx:64,69,76`: effects omit accountQuery.data, ownedWorkspace and profileQuery.data. Preserve resume/prefill and unsaved user edits; prove no fetch/update loop.
- `pages/Workspace.tsx:75`: effect omits workspaceQuery.data; preserve editable local draft during query refresh.

These refer to source under `apps/web/src/` unless a full prefix is given. Use Graphify before reading the related code. Fix behavior deliberately; no eslint-disable or dependency suppression.

## Remaining STR-055 packet B — formatting

Prettier currently reports 32 files: api/client; ErrorBoundary; features/account (AccountSettingsPage/api); analysis (api/EvaluationMatrixPage); auth (api/AuthPages); documents (api/DocumentAttachmentsPanel); onboarding/OnboardingPage; strategy (api/SwotPage); workspaces (api/CompanyProfilePage/InvitationAcceptPage/switchContext/WorkspaceManagementPage/WorkspaceRoutePages); main/session; pages (Account/component-lab.css/ComponentLab/Operator/Site/Workspace); packages/domain/src (evaluation-matrices/index); packages/ui/src (index/primitives/styles).

Formatting-only changes can be a separate coherent commit after semantic lint fixes. Do not reformat OpenAPI wholesale; preserve the targeted document-outline schema diff. Then run root quality once. If it passes, record its actual exit; browser/physical/API validation is still the separate final queue.

## Repairs already made

Typed flatMap preserves route union; explicit factor type for strategy pairing; execution status/source type exports; narrowed decision source captured before async closure; browser Location.replace used for legacy hash redirect; missing Notice content; removed unreachable duplicate theme handler while keeping account appearance controls; real bilingual document outline arrays validated by frontend and OpenAPI; preference test covers boolean global education setting. No broad casts, any or suppressed compiler checks.

The nullable allOf wrappers elsewhere in the existing OpenAPI are not compiled by the new outline-only AJV test; that test deliberately verifies the affected outline contract. Full response/nullability coverage remains part of STR-005/016 contract hardening, not a claimed result here.
