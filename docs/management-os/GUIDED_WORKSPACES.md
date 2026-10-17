# Guided Workspace tools — owner revision, 2026-10-17

The owner reviewed the two recordings `20261016-2013-21.1471873.mp4` and `20261016-2025-35.2328331.mp4`: preserve the calm public/welcome/Workspace structure, replace empty expert-only analysis forms with contextual coaching, and restore the researched document catalog. Initial discovery stays short. These changes implement the eight tools currently exposed by the redesigned Workspace; they do not claim completion of later STR-039/040 methods or production integration.

## Design and interaction contract

- Reuse blue `#0C66E4`, navy `#172B4D`, paper `#FFFFFF`, background `#F7F8FC`, muted `#52627B` and line `#DFE4ED`; dark colors come from the existing semantic tokens. Use local Vazirmatn and existing 16px body hierarchy.
- Page: short heading → one start/continue action → one focused question card → review/result. Help/example is collapsed inside the current card. Pause preserves answers and current step. A refresh reopens the cover with a continue action. Previously entered data stays editable; skips remain unknown.
- Card transition answers user navigation, 180ms horizontal change and progress adjustment. No forced delay or continuously moving decorations. Respect OS and account reduced-motion settings; keyboard focus moves to the new question heading.
- Result: summary and next action, then collapsed input sections. Financial results have three groups (income/cost, liquidity, acquisition/return); unknown metrics are disclosed on request. Matrix factor tables scroll within their panel. Mobile keeps the question and primary action readable.
- Local write failure preserves typed values in memory and exposes an error; navigation within the guide retries the current draft. Refresh cannot recover values that the browser refused to persist. Production conflict/offline protection belongs to the adapters below.

## Implemented tools and source bindings

| Tool | Question sequence | Result / boundary |
| --- | --- | --- |
| Customer | segment and buyer/user → job/context/impact → alternative → evidence/contradiction → next experiment | Structured profile review; no invented stage or validation score. |
| Market | customer/product/geography/period → alternatives/differentiation → external changes → dated sources/questions | Scoped research review; no invented market size. |
| SWOT | scope/horizon → strengths → weaknesses → opportunities → threats → possible strategic connection | Guided factor register, explicit independent copy into IFE/EFE; no automatic recommendation. |
| IFE / EFE | factor/type/evidence → importance weight → appropriate rating → next factor → review | Actual `evaluateMatrix` from `@stratino/domain/evaluation-matrices`; separate records and methods; 0–100 weights total 100, existing tolerance, ratings 1–4. IFE weaknesses 1–2 / strengths 3–4. EFE rates organizational response. Missing evidence leaves a draft; midpoint 2.5 is not a universal success threshold. No automatic normalization or decision. |
| Finance | dates/currency/scale/basis → revenue/COGS/net income → variable/fixed costs and scope → balance sheet → cash/monthly net burn → acquisition → sources/estimates | 13 locally calculated outputs using existing domain financial functions and dependency guards; no unknown-to-zero conversion. |
| Decisions | question/owner/deadline → alternatives → criteria/evidence → choice/reason/review | Reviewable decision draft; action registration remains an explicit separate step. |
| Retention | cohort/event/window → original/returned unique counts → evidence/next investigation | Returned subset / original cohort. Whole counts; no customers added to denominator; no generic benchmark. This is neither revenue retention nor predicted loyalty. |
| Risk | cause/event/consequence/scope → evidence/uncertainty → response/owner/trigger/review | Scoped risk draft; no invented probability or automatic score. |

Finance outputs: gross profit, gross margin, contribution amount/rate, operating surplus **within the entered cost model**, break-even sales, net margin, working capital, current ratio, constant-burn cash runway, mean CAC, period ROA, and ROE using explicitly labeled ending equity. Nonpositive required denominators withhold ratios; nonpositive contribution withholds finite break-even; zero/negative burn withholds finite runway. Acquisition counts must be whole. All observations in a local financial run share the chosen unit, scale and period. Changing that context does not convert older numbers; the source report must be checked again. These are browser arithmetic previews, not immutable approved calculation runs, audited statements or automatic business diagnoses.

Internal sources: `packages/domain/src/index.ts`, `evaluation-matrices.ts`, `docs/design/STR-020-efe-ife.md`, `assets/management-knowledge/metrics/finance/`, `metrics/finance-investment/met-break-even.json`. Primary educational references checked for formulas: [OpenStax contribution margin](https://openstax.org/books/principles-managerial-accounting/pages/3-1-explain-contribution-margin-and-calculate-contribution-margin-per-unit-contribution-margin-ratio-and-total-contribution-margin), [OpenStax break-even](https://openstax.org/books/principles-managerial-accounting/pages/3-2-calculate-a-break-even-point-in-units-and-dollars), [OpenStax liquidity ratios](https://openstax.org/books/principles-finance-2e/pages/6-3-liquidity-ratios). Wording is authored for this product. No new research definition is promoted into the runtime knowledge release.

## Documents and files

Reuse **all 60 documents / 12 sections** of `src/document-catalog.json`; do not pretend the 120 research files are 120 mandatory company documents. Category, search, writing-state filter and pagination expose at most 12 document cards. Notes/evidence retain their own tab.

Each document route has its topic, purpose, audience, writing guide, required outline, suggested owner/reviewer, timing and access note. Examples remain labeled educational and are never copied into user data. `catalog_only` entries remain preliminary outlines requiring adaptation; the first five MVP guides retain their richer content. Legal/professional notes are shown where the catalog supplies them. The list is a managerial recommendation, not an assertion that every company legally needs every document.

The writing journey asks for real owner/reviewer names, then one outline section per card. It saves a draft, offers a readable review and Markdown download. Entering names or attaching files does not grant approval or mark a document ready.

The local attachment adapter persists actual `File` bytes in IndexedDB under an exact `[workspaceId, documentId]` scope, independently from text localStorage. Add/list/download/delete are functional across refresh. Supported extensions are explicit; empty files, executable/HTML/SVG and files over 20 MiB are rejected. At most ten files per document in this fixture. Files download as files, never execute or embed. There is no server upload, antivirus, team sharing or server authorization claim. The 20 MiB/ten-file values are fixture bounds, not commercial quotas. Browser-cleared storage can remove files; originals must remain with the owner. JSON report export contains text/state, not attachment bytes. Workspace-delete cleanup and cross-tab write races still need the server/file lifecycle packet; do not treat IndexedDB as production storage.

## Integration

See [LUNA_GUIDED_PACKETS](LUNA_GUIDED_PACKETS.md). The fixture still uses namespaced string records under the existing local `toolNotes`; production must map to the existing typed canonical modules, never ship this as a generic answer-store API. Existing `/app` tools and scientific release gates remain intact. A local wizard visit is not a research JourneyRun or business stage transition.
