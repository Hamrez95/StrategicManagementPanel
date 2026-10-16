# User journeys and behavioral decisions

Design baseline: 2026-10-16. Persona cases are synthetic requirements, not validated research. Stable flow IDs below are referenced by page specifications and implementation packets. All flows preserve current auth, Workspace, preferences, legacy access and execution behavior.

## Actors and shared entry rules

| Actor          | Main goal                                      | Allowed work                                                             |
| -------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| Owner          | Decide and operate one or more businesses      | Business writes plus members/archive/settings under current services     |
| Editor         | Maintain business evidence and deliver actions | Permitted business writes; no ownership/account billing changes          |
| Viewer/adviser | Inspect evidence, decisions and reports        | Read only; cannot accept a candidate or assign work                      |
| Operator       | Support the service                            | Separate internal authorization; never inherits arbitrary company access |

Authentication precedes company data. Existing invited users do not create a second Workspace to enter an invitation. Business scope is always visible. Device appearance may be chosen before sign-in; account preferences then synchronize through current code. Guided/compact is a presentation choice; it never changes a business rule.

## Owner-confirmed first-run and plan model — 2026-10-16

The owner confirmed this product sequence: registration → first-use questions about the intended business and goal → tailored follow-up → first business dashboard; one Workspace is one business; free access starts with one owned Workspace and some paid tools previewed as locked; paid access permits additional business Workspaces; each Workspace can start its own discovery flow. This confirms product intent, not a live billing entitlement or deployed Journey contract.

1. Keep current registration, email verification and sign-in as hard boundaries. For a new owner, ask only business kind (startup/new venture, operating business, organization), current objective and optional self-reported lifecycle stage. Name the Workspace before final creation. Existing profile/import records prefill known context; never ask the same fact again.
2. Ask follow-ups only when tied to the chosen objective and a current decision. A skipped stage stays unknown; team size or revenue alone cannot assign it. Organization-specific questions remain gated on stable reviewed IDs/adapters (STR-066). Do not make this first-use flow a blocker for invited members or returning owners.
3. Create the first Workspace after short context setup, then open its dashboard. Let the owner browse tools without completing every optional question. Keep a clear way to resume discovery from the current Workspace header.
4. Each owned Workspace represents one business. The header switcher names the active business; switching clears scoped cache and uses the existing dirty-draft guard. A new paid Workspace starts with a blank context; its setup flow writes only into that Workspace. No cross-business copying or aggregate KPI dashboard is implied.
5. Free access may include one owned Workspace. A membership joined by invitation is not owner quota. Show locked tools with their name, value, reason and access path; preserve useful previews. Never gate security, export/recovery or access to existing data. Exact quota, modules, prices, grace/downgrade and cancellation are controlled by configurable server entitlements under STR-028/029/035, not this UI.

### Design critique and unresolved product risks

- “Paid = everything/unlimited” is underspecified and creates a promise before plan boundaries exist. Treat paid as expanded configurable entitlement; avoid “unlimited” until it is an explicit plan contract.
- A blurred matrix communicates neither value nor reason and is weak for keyboard/screen-reader users. Prefer a named locked card with a useful preview, exact reason and plan comparison. Do not obscure the dashboard.
- A forced questionnaire can delay value and drive abandonment. Keep the first pass short, allow unknown/skip, ask only objective-relevant follow-ups, and let users reach core tools. Record gaps so the dashboard can resume them.
- “Organization” is not the same thing as an independent business. Workspace scope is one business, while BusinessUnit/venture scope is deferred. If one legal organization needs several business lines under shared governance, distinct Workspaces may isolate data incorrectly; STR-066/domain design must define a real scoped unit before production data is collected.
- Workspace membership and billing ownership are separate. Joining another owner’s Workspace should not consume the user’s owned-business allowance; inviting a team does not transfer the billing account.
- A new Workspace must not inherit the former business’s profile, assumptions, ICP, evidence or draft. Only account preferences are shared. Prevent stale query/cache state and show an empty dashboard until that business is entered.

`Register → Verify → Short business context → Objective-relevant follow-up → Create owned Workspace → Business dashboard → Resume discovery or open a tool`

## J01 — First-time founder, idea/no revenue (persona A)

**Success:** a scoped customer/problem hypothesis and a practical evidence-gathering action; no financial questionnaire.

1. Public page → register → verify email → sign in. Invalid/expired links offer a bounded resend/restart, retaining intended destination. No fake authenticated fallback.
2. Workspace list → create business. Require company/project name only. Optional industry/context/goal can be skipped. New profile fields derive from existing onboarding; do not ask formal vision/mission up front.
3. Overview empty state → «شناخت گام بعدی / Find the next step». Import is an equal alternative when relevant data exists.
4. Initial assessment first checks saved profile, model and evidence. Ask whether the present work is finding a model or improving an existing operation only if unresolved. Headcount is not stage evidence.
5. Provisional idea/discovery scope → existing problem/customer record or one decision-relevant question. If ICP already exists, show its summary and ask only what is missing. Keep founder statements labeled hypothesis/estimate.
6. Review problem and riskiest uncertainty → candidate discovery action → proposed Decision/source contract (after STR-063) → user chooses owner and due date → action appears on overview and execution.
7. Next visit opens overview. The journey remains a useful Continue link, not a mandatory gate before opening modules.

**Branch decisions:** no revenue means no CAC/LTV/ROIC request. A materially constrained experiment requests permitted scope/review, not automatic launch advice. Unknown stage does not mean failed startup. Skip preserves the gap and allows browsing; only dependent commitment is blocked. If no action is warranted, record no_action rationale and optional review trigger.

`Public → Account → Workspace → Overview → Assessment → focused step → Why/review → Decision + Action → Overview`

## J02 — Early traction SaaS (persona B)

**Success:** reuse an ICP and financial observation, calculate one relevant amount, investigate repeatability and accept an owned next action.

1. Enter existing Workspace by selector/deep link; overview shows saved context and unresolved needs.
2. Select the current decision: a material acquisition expansion request. Prefill startup/model/segment from canonical records. A self-declared stage remains provisional until evidence supports it.
3. Show matched existing ICP/problem and evidence dates. No repeated persona form.
4. Business economics reuses scoped net revenue and variable costs or asks only missing observations with currency/period/cost-policy. MET-CONTRIBUTION-MARGIN is a contextual amount; it does not invent a retention threshold.
5. If expansion requested and retention evidence is insufficient, show the reviewed investigation candidate. If the required condition itself is missing, ask/abstain; do not infer low retention from missing data.
6. Why explains observation → rule → sources and contrary evidence. Immature cohort, one-off value model or a deliberately bounded acquisition test changes applicability; no universal PMF cutoff.
7. Manager records decision/action with owner/date and optional existing goal/metric binding. Idempotent retry returns the same records. Refresh shows them on overview/execution.

**Failure paths:** mixed periods/currency blocks numeric output; stale/conflicting evidence opens review; revoked member loses access; source change invalidates a draft candidate and requires reevaluation before acceptance.

## J03 — Existing company with usable records (personas C–F)

**Success:** start from the problem and existing evidence rather than repeat a startup wizard.

1. Select/create Workspace → overview → «ورود اطلاعات موجود / Import existing data» or choose current problem.
2. Import preview shows mapped records, units/time/scope, conflicts and unchanged data. Nothing is verified just because a file was uploaded. Current import archive behavior is preserved until reviewed canonical apply exists.
3. Confirm mappings → reuse observations → choose urgent decision/problem and business scope. Initial reported stage and size are independent dimensions.
4. Relevant baseline/constraint module opens directly. Unrelated context prerequisites are not mandatory. Missing required evidence creates a focused request; optional gaps remain nonblocking.
5. Review competing explanations → choose evidence task/decision/no_action → existing execution → operating review.

| Persona                               | Initial route                     | Decision-relevant inputs                                                                    | Suppressed requests / prohibited shortcut                                         |
| ------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| C ecommerce, 50 staff                 | Order contribution/economics      | Net order revenue, returns/cost policy; inventory ownership before working-capital metrics  | No DIO/CCC for dropship automatically; no revenue-only profitability claim        |
| D service SME, 80 staff, low profit   | Scoped project/service margin     | Delivery effort/cost policy, comparable periods, capacity                                   | No hiring/cost-cut recommendation from headcount alone                            |
| E manufacturing, 300 staff, inventory | Inventory/process inquiry         | Item family, movement, stockouts, quality holds, lead time and service boundary             | No full market questionnaire; no blanket inventory reduction from aggregate stock |
| F enterprise, 2000 staff, execution   | Priorities and capacity alignment | Existing Goal/Decision/initiatives, accountable owner, committed capacity, outcome evidence | No startup-stage assignment from size; no employee scoring or blame from delay    |

Current KB organization questions still need stable IDs and relevance adapters in STR-066. These journeys define the behavior to implement; they do not authorize converting narrative trees to runtime by guessing.

## J04 — Manager operating three businesses

**Success:** find each business's next meaningful commitment without leaking or merging its data.

1. Sign in → owned/joined Workspace list. Keep access and billing ownership separate. Free/paid capacity affects owned Workspaces only and comes from server entitlements.
2. Choose business → overview. Header always names current Workspace and offers permitted create/switch actions; all query keys and write commands include its scope.
3. Open action/Why/original evidence → finish work → switch Workspace.
4. If draft exists, show save/discard/stay options using current dirty guard. Failed save keeps the draft and current Workspace; switching must not send the old payload to the new business.
5. Clear scoped queries and load the new permitted context. Back/deep link resolves its Workspace and authorizes again.

First release uses the existing Workspace list/selector, surfaced consistently in the header. A newly created business starts blank and can run the short discovery flow again against its own scope. A cross-business portfolio summary is a later read projection, not a prerequisite or new dashboard for the first slice. Any future rollup requires per-row membership and explicit currency/period compatibility; never add different businesses' values merely because they share a label.

## J05 — Invited editor or adviser

Invitation → sign-in/verify matching account → accept valid invitation → selected Workspace overview. Expired/revoked/wrong-account invitation gives a clear route to request a fresh invite; no secret invitation details shown to unrelated users. Existing invitation services remain authoritative.

Editor edits permitted observations and actions. Viewer sees the same sources/uncertainty but cannot mutate, accept recommendations or upload. Viewer is not sent through owner onboarding or payment. Owner-only settings remain separate. Removed membership immediately blocks page, export and download, including nested deep links.

## J06 — Guided learning and expert mode

At any step: Quick explanation by default in guided presentation; Learn expands inline; Deep dive opens source-backed detail. Previous/next navigates only applicable work. Compact mode hides coaching, preserves canonical values and offers bulk/import/keyboard controls. Switching modes preserves draft and result; no server business reevaluation is triggered solely by presentation mode.

Account education-off persists globally and across routes/devices using existing preferences. It hides coaching/prompts, not form validation, risk/uncertainty or permissions. A deliberate «راهنما / Help» request can still open content without changing the global preference. Missing translation never silently presents another locale's user-entered text as translated.

## J07 — Evidence and confidence review

Concern/metric/ICP → inspect claim → original supporting/refuting evidence → provenance/method/sample/date/scope → record review or collect missing evidence. User-entered confidence remains reported until reviewed. Contradictions remain visible and lower/cap reviewed confidence under the rubric; more copies of one interview are not independent corroboration.

An editor may add evidence; a reviewer can record a reasoned assessment under service permissions. File upload is quarantined/scan-aware and not evidence approval. Expired review_due shows stale context without deleting the historical observation. A changed claim creates a new revision and reevaluation candidate; old decision trace stays frozen.

## J08 — Weekly/monthly operating review

Overview review link → template choice → scoped input snapshot and missing/stale notices → short agenda → inspect deviations and competing causes → record decisions/actions/no_action → owners/dates/metric follow-up → next overview. Cadence is not a calendar-only item. Monthly reviews compare compatible closed periods; forecasts remain assumptions, not observed actuals.

Daily/weekly/monthly/quarterly/annual frequencies are configurable product templates, not universal rules. Reminders use STR-052 opt-in/idempotency/timezone behavior. Do not send automatic email during setup. An urgent cash concern interrupts routine agenda for a review; the tool does not declare insolvency.

## J09 — Existing analysis → decision → execution (preservation flow)

Existing EFE/IFE or SWOT/TOWS route → valid input/evidence → reviewed/finalized result → select analysis/strategy option as source → Decision → Goal/Action → report. Preserve weights, irrelevant-factor semantics, method revisions, snapshots and source permissions. A new knowledge release does not reinterpret a saved legacy analysis. Unsupported future matrix remains in its existing legacy route until migration criteria pass.

## J10 — Report and data portability

Reports → explicit scope → immutable snapshot → preview with unknown/stale/source notes → print/PDF or JSON/CSV/ZIP. Only authorized ready attachments are included. Missing artifact returns a bounded failure, not success. Imported export first creates a recoverable preview/archive; destructive apply is not inferred. Server membership is checked at creation and download. No education/theme state changes the underlying business result.

## J11 — Recovery, privacy and account lifecycle

Session expiry preserves recoverable local draft without retaining private company caches beyond permission; re-authenticate → authorize context → offer reviewed resume. Network loss shows unsaved/error state and explicit retry; no offline business-write promise. Account preferences differ from Workspace profile; changing personal email follows verification. Archive keeps business data; deletion/export/retention and subscription cancellation follow existing trust/billing tasks with clear effects and no dark patterns.

## Validation plan for these journeys

Synthetic acceptance: A–F, editor/viewer/owner, three Workspaces, skipped/imported/stale/conflicting evidence, duplicate submit, refresh/deep link, revocation and network/session recovery. Assert no duplicated ICP/revenue/Goal and no irrelevant required questions. Real observed sessions later measure time to first useful action, repeated questions, interpretation of uncertainty, task recovery and return; these are unvalidated design hypotheses until tested.
