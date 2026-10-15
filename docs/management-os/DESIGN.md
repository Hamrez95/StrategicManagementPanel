# Management OS experience design — implementation brief

2026-10-16. Reviewed against the installed frontend-design skill, existing `docs/design/SYSTEM.md` and `docs/UX_STANDARD.md`. This is the design contract for later implementation, not a claim that new screens have been built or visually tested.

## Product job and information architecture

The manager should identify the situation, a relevant concern and the next decision/action quickly. Journey scaffolds understanding; it is not the permanent home screen. Preserve the existing authenticated shell, Workspace selector, account/preferences, search, history/deep links and tool routes. Public marketing and operator console keep their current boundaries.

Use the existing groups: Understand → Analyze → Decide → Execute → Evidence. The operating overview is the landing page. Journey is an explicit route within the Workspace, with a contextual Continue link on overview when useful. Customer/ICP, financial inputs and execution modules own their data; Journey links into those records. Do not add a second sidebar or a full-screen wizard that traps experienced managers.

## Visual plan and critique

Reuse the existing semantic palette: canvas `#f8fafc`, surface `#ffffff`, ink `#172b4d`, action `#2459ed`, evidence accent `#0f766e`, essential control border `#718198`. Use existing dark tokens, not a new palette. Vazirmatn remains the local font: 16px body, 14px supplementary text, 24px section headings and existing responsive page headings. Existing 4/8/12/16/24/32 spacing and control/panel radii remain authoritative.

A generic proposal would put health percentages and several oversized metric cards above a long questionnaire. Reject that composition: unknown data would look measured and the manager would need to search for work. The reviewed layout uses a compact context row, attention/action rows, and a focused Why panel. The distinctive element is a visible chain from observation to a practical action. Borders and accents encode grouping/status, not decoration. No gradient washes, repeated entrance animation or gamified completion score.

RTL layout is right-aligned; formulas/IDs and mixed technical values have deliberate LTR spans. English reverses reading order using logical CSS, not manually mirrored data. Motion follows the existing 120–240ms action/opening conventions; reduced motion removes nonessential movement. No new branding or typography system.

## Operating overview

```text
[Workspace selector]             [Search] [Account / appearance]
 Business name                 Scope / period / data reviewed at

 Situation       Known context and a few relevant measured values
                 Unknown or stale values have explicit text

 Needs attention                         Next action
 Retention evidence not reviewed         Review cohort definition [Open]
   Why?                                  Owner / due date when accepted
 Cash information missing               Collect needed cash evidence

 Current priorities / commitments       Upcoming review
 [Existing Goal / Decision / Action]     [Review inputs and decisions]

 Continue guided understanding (only if useful)  [Continue]
```

No overall numeric health indicator. Rank attention only when its reviewed rule/priority rationale is available; otherwise use neutral grouping. Missing metric is a gap only when relevant to this business/model/decision. The first slice may show an evidence collection candidate; do not populate empty space with demo recommendations.

## Guided step and expert presentation

```text
[Back to overview]  Topic / scoped decision         [Guided | Compact]
 What decision are we preparing?
 Short reason (Quick)                      [Learn] [Sources / Deep dive]

 Already available: ICP / metric / observation      [View original]
 Missing information: one unresolved input
 [Label] [Existing / Import / Enter] [Why we ask]
 Inline units / period / source / validation

 Consequence of skipping: only this commitment stays unresolved
 [Previous]                  [Defer] [Skip if allowed] [Save and continue]
 Saved / saving / error / revision conflict (persistent, not toast only)
```

Compact mode keeps the same decision, prefill and validation, exposes bulk/import controls and collapses coaching by default. Guided mode offers examples and optional explanation. Mode switching preserves draft and position. Education-off is the existing account preference; do not invent a second per-Journey global toggle. Necessary error, permission, uncertainty and source notices remain visible when teaching is disabled.

Do not present all twelve startup questions initially. Ask only when its decision is relevant and canonical/imported/derived data cannot resolve it. Previous/next navigate an adaptive set, not a fixed count. A step can be deferred without being successful; show a short consequence and a route back. Import opens a preview/verification flow and never silently replaces an existing fact.

## Why panel and accepting a candidate

```text
 Why am I seeing this?                              [Close]
 Candidate: investigate repeatability before broad expansion
 Reason and declared rule scope
 Observations / metric / required missing evidence  [Open original]
 Confidence: insufficient / low / medium / high + axis reasons
 Uncertainty / contrary evidence / freshness
 Expected impact (bounded narrative, no invented uplift)
 Risks and alternative actions
 Source / framework / rule revision / knowledge release

 [Gather evidence] [Dismiss with reason] [Record decision / action]
```

Acceptance form asks for the existing execution module's required owner and due date and lets the manager link an existing Goal. Show the proposed Decision and action before committing. Retry is idempotent. Do not treat accepting a candidate as proof that the business claim is true. A changed input/release creates a new evaluation; it does not rewrite the explanation of an earlier accepted action.

Use a semantic side panel on larger screens if consistent with existing Dialog primitives; on mobile use one full-width accessible Dialog/page with clear Back. Focus moves to the title, Escape/back returns to the trigger, and the underlying draft is retained. Readable source content is available without requiring hover.

## State specification

| State                   | Presentation and action                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| No business data        | Explain the next useful input; allow existing record/import; no demo facts                                               |
| Loading                 | Scoped skeleton/status; keep Workspace and previous saved context visible                                                |
| Missing/unknown         | State exactly which decision needs which observation; offer defer/evidence task                                          |
| Not applicable          | Show reviewer/scope/reason; do not treat as zero or silently remove an essential gate                                    |
| Stale/conflicting       | Keep original and competing observations; request review, not duplicate re-entry                                         |
| Invalid unit/period     | Link error to field and preserve draft; no result until compatible                                                       |
| Network/session failure | Keep unsaved text, explicit retry/re-authentication and clear save state                                                 |
| Revision conflict       | Show latest revision and retained draft; reviewed merge/reload, no blind overwrite                                       |
| Viewer                  | Read context/trace and existing actions; writes unavailable with reason                                                  |
| Revoked membership      | Clear scoped queries and deny routes/files; no cached evidence remains visible                                           |
| Definition unavailable  | Identify affected knowledge release/record internally; user sees bounded explanation and existing tools remain available |

## Accessibility, responsive and acceptance

Reuse Button/Input/Dialog/Toast/Skeleton/EmptyState and the account UIProvider. Tables scroll inside their own region; mobile stacks priority/action rows while preserving labels/units. No page-wide overflow. Touch controls follow existing 44px target; all actions have text names, visible focus and keyboard order. Status never depends only on color. Error messages associate with fields; asynchronous save/plan changes use appropriate live status without repeated announcements.

Acceptance matrix: fa/en × RTL/LTR × light/dark/system × guided/compact × 360/768/1280/1440; 200% zoom, system/personal reduced motion, keyboard dialog containment/restoration, education disabled, empty/error/conflict/revoked member and refresh. Required screenshots and critique remain in the final browser queue, not reported as already passed. Shared business outputs must be identical between presentations.

## Static design inspection — 2026-10-16

The standalone preview was rendered in the installed Edge through Playwright (the bundled Chromium binary was absent; no browser download). All 40 screen selections rendered with a heading and zero uncaught JavaScript errors. Why opened and Escape closed it. The mobile 360px viewport had no whole-page horizontal overflow; empty/loading/error/conflict variants rendered. Three captured images were visually inspected: Persian overview, English dark explanation, Persian mobile step.

Critique: hierarchy, direction and readable Persian work across these samples; mobile steps had a duplicated primary action in the heading/footer, so the heading action was removed for the step family and screenshots refreshed. The overview uses a situation statement and attention/action rows rather than invented health numbers. This is an initial design prototype with shared screen-family templates: public/auth boundaries, real permissions, engine eligibility and actual source evidence are specified in PAGE_SPECIFICATIONS and are not implemented by this file. Production dialog focus, 200% zoom, keyboard, all breakpoints and all state combinations still require the final product QA queue.

Screenshots: [Persian overview](design-preview-fa.png), [English dark explanation](design-preview-en-dark.png), [Persian mobile step](design-preview-mobile.png). The prototype and these images are references; use existing production primitives and actual DTOs when implementing.
