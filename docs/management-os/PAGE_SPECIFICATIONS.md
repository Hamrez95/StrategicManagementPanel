# Complete initial page and navigation specification

2026-10-16. These are design decisions, not live route claims. Existing routes are preserved; planned routes appear only under their owning tasks/feature flags. Screen IDs P01–P40 identify specifications, not a separate backlog. Every page inherits DESIGN.md and INTERACTION_CONTRACTS.md.

## Navigation contract

Public pages → account → Workspace chooser → Workspace overview. Existing five sidebar groups remain: شناخت/Understand, تحلیل/Analyze, تصمیم/Decide, اجرا/Execute, شواهد و مدارک/Evidence. Account/theme/language/education live in utility navigation, not duplicated inside Journey. Workspace members/archive are in Workspace settings; service operator pages are a separate protected area.

At ≥1280px: current shell sidebar and a fluid main region with readable text max 72ch; dense tables may use full content width and local scrolling. At 768–1279px: compact/collapsible sidebar, stacked secondary panes. At <768px: existing accessible menu/Dialog, one main column, sticky local primary action only when it does not obscure content or focus. No new bottom tab bar. Breadcrumb uses Workspace → module → entity; browser back/forward and direct links remain functional.

New navigation entries are added within existing groups only when implemented: Metrics under Analyze, Attention/insights under Decide, Reviews under Execute and Evidence under Evidence. Keep current tool IDs/deep-link mappings. Do not show enabled links for an unimplemented route. Existing legacy tools retain their current access path and an honest migration boundary.

## Page inventory

For planned Workspace paths, prefix `/app/workspaces/:workspaceId`. Existing tool paths use `/tools/:toolId`. One main action is specified per page; secondary actions do not compete visually.

| ID  | Page / route                                                 | Main action and result                                                           | Authority / phase                                         |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| P01 | Public `/`                                                   | See how a real workflow becomes an action; sign in/create account                | Existing Site; STR-034 later refines claims               |
| P02 | Register                                                     | Create account, then verify                                                      | accounts; preserve current route                          |
| P03 | Verify / resend                                              | Confirm email or request a fresh link                                            | accounts; no enumeration details                          |
| P04 | Login / reset password                                       | Authenticate and return to intended permitted path                               | accounts/session/CSRF                                     |
| P05 | Workspace list `/app/workspaces`                             | Open/create a business; owned/joined remain distinct                             | existing Workspace services                               |
| P06 | First-use onboarding `/app/start`                              | Capture business kind, current objective and optional reported stage; create first Workspace | existing onboarding + STR-014; organization branches gated on STR-066 |
| P07 | Overview `/overview`                                         | Open next relevant action/attention item                                         | STR-027, first slice                                      |
| P08 | Assessment `/management/assessment`                          | Confirm unresolved context and obtain provisional scoped plan                    | STR-059                                                   |
| P09 | Journey `/tools/journey`                                     | Continue one applicable decision-relevant step                                   | STR-060/061/064                                           |
| P10 | Step detail `/tools/journey/steps/:stepId`                   | Reuse/enter unresolved input, save/defer/skip                                    | STR-064; nested route added explicitly                    |
| P11 | Business profile `/tools/company`                            | Maintain canonical company, product, segment, ICP context                        | existing profile + STR-056 migration                      |
| P12 | ICP/segment detail (profile subsection)                      | Review one segment's problem, actors, evidence and assumptions                   | same canonical service; no duplicate module               |
| P13 | Metrics `/management/metrics`                                | Inspect relevant measured/unknown values; open an input                          | STR-058; scoped registry-backed list                      |
| P14 | Metric detail `/management/metrics/:metricId`                | Review formula/variables/period/source and calculate from canonical observations | STR-058; allowlisted methods only                         |
| P15 | Evidence `/management/evidence`                              | Review or add a scoped observation/claim                                         | STR-057                                                   |
| P16 | Claim/evidence detail                                        | Inspect supporting/refuting provenance and record a review                       | STR-057; one shared detail body                           |
| P17 | Attention `/management/insights`                             | Choose one relevant candidate/gap for review                                     | STR-063/069                                               |
| P18 | Insight detail `/management/insights/:id`                    | Explain why and gather evidence/accept/dismiss/no_action                         | STR-063; no arbitrary health score                        |
| P19 | Decision journal `/tools/journal`                            | Record/review a decision and its source                                          | existing execution; future route migration preserves data |
| P20 | Execution `/tools/execution`                                 | Open/assign/update an owned action                                               | existing Decision/Goal/Action                             |
| P21 | Goals/KPI `/tools/scorecard`                                 | Link a canonical goal to a metric target/outcome                                 | STR-043; legacy preserved until new route ready           |
| P22 | Reviews `/management/reviews`                                | Start/resume a business review                                                   | STR-067                                                   |
| P23 | Review detail                                                | Review input snapshot, decisions and next commitments                            | STR-067; not a calendar clone                             |
| P24 | Risks `/tools/risks`                                         | Review a risk, evidence, mitigation and next review                              | STR-043; no invented probability                          |
| P25 | SWOT/TOWS `/tools/swot`                                      | Maintain factors, evidence and reviewed strategy options                         | existing strategy; method provenance visible              |
| P26 | Matrices `/tools/matrices`                                   | Complete/finalize permitted EFE/IFE or open preserved tools                      | existing analysis + STR-039–041 later                     |
| P27 | Environment/industry `/tools/environment`, `/tools/industry` | Maintain dated observations and competitors                                      | STR-051/040; current legacy access retained               |
| P28 | Resources `/tools/internal`                                  | Review capability evidence and framework assessment                              | STR-039; no universal maturity score                      |
| P29 | Economics `/tools/finance`                                   | Select a meaningful calculation and scope                                        | STR-058 first calculation; STR-042 advanced later         |
| P30 | Scenario `/tools/scenarios`                                  | Compare explicit parameter changes against an immutable baseline                 | STR-042 after data/calculation foundation                 |
| P31 | Documents `/tools/documents`                                 | Prepare/review a document and permitted attachments                              | existing documents/attachments                            |
| P32 | Reports `/tools/reports`                                     | Create/read immutable snapshot and export/print                                  | existing exports; extend trace later                      |
| P33 | Learning `/tools/learn`                                      | Find a concept and open Quick/Learn/Deep with sources                            | STR-026; reuse existing education content                 |
| P34 | Search (shell Dialog)                                        | Navigate to permitted content or tool                                            | STR-025; no fake search over inaccessible data            |
| P35 | Import `/imports`                                            | Preview/verify mapping and recoverable apply/archive                             | existing import + STR-056 canonical follow-up             |
| P36 | Workspace settings `/settings`                               | Manage permitted members/invites/archive/profile settings                        | owner-specific actions guarded                            |
| P37 | Account `/app/account`                                       | Maintain personal profile, appearance, language, motion, education               | existing account preferences                              |
| P38 | Subscription/billing (account area)                          | Inspect real entitlement, choose a plan or manage cancellation                   | STR-028/029/035; no invented prices/status                |
| P39 | Notifications (utility area)                                 | Open a real action/review event and control frequency                            | STR-052; opt-in reminder constraints                      |
| P40 | Operator `/internal/*`                                       | Perform a restricted support operation with audit                                | STR-030; no automatic company-data privileges             |

## P05–P06: choose/create a business

Layout: page heading, owned/joined filter, searchable business rows with role/archive state, one create action. No rollup of incompatible business metrics. New owner enters the short P06 setup before first Workspace creation: business kind, current objective, optional self-reported stage and a required Workspace/business name. Do not demand formal mission/vision or finance at registration. Existing context/imports prefill answers. After create, select the returned Workspace and route to its overview. Existing invite has a separate entry and never forces create. Duplicate click is disabled while pending; failure retains text. “No businesses yet” shows create plus invitation context, never a seeded customer business.

The Workspace switcher in the authenticated header always names the active business and lists owned/joined access distinctly. Owners see create only when authoritative entitlement permits it. A new paid Workspace opens empty and offers «شروع راهنمای شناخت» in its own header. Context questions update only that Workspace. Pending drafts use the shared switch guard; switching clears business-scoped caches. A membership invitation does not count against an owned-Workspace quota.

For initial free access, show a useful dashboard and named locked-tool cards. Each card explains what the module supports, why it is unavailable on this plan, and where to review access. Do not blur content as the only lock signal. Never lock data access, security, export or recovery. Plan, price, quota, payment, grace and downgrade states must come from STR-028/029/035 server contracts. The current preview's free/expanded selector is a demonstration control, not entitlement enforcement or a price offer.

First-use setup is not a required gate for invited members or returning owners. Follow-up questions depend on objective and unresolved canonical data. Unknown stage remains unknown. Organization-specific branches remain gated until stable question IDs/adapters in STR-066 exist; current Workspace scope cannot represent a venture/business unit inside a company without an explicit domain decision.

## P07: operating overview

Order: scoped business header → situation row → attention/next-action rows → priorities/commitments → upcoming review → optional Continue Journey. Situation uses actual values with unit/period and unknown/stale labels. No combined score. Each attention row names the unresolved decision and a short reason; Why opens P18. Each accepted action links to P20; unaccepted candidate is labeled candidate and cannot look assigned. No empty KPI-card wall. The primary action is the highest applicable reviewed next step, or a neutral context/evidence action when ranking is unavailable.

## P08–P10: assessment and focused steps

Header: current scope and decision, optional presentation switch. Body: already-known summary; one next unresolved question or compact grouped compatible inputs; reason; derive/import alternative; optional Learn; outcome preview; persistent save state. Footer: Previous, Defer, context-permitted Skip, Save and continue. Next button does not imply business gate success. Scope change with a dirty draft invokes the same guard as Workspace switching. Required-for-current-decision is distinct from required-for-navigation.

Use the 12 startup question IDs/prompts from the actual KB; no new “scientific” questions generated by Luna. A new question must be approved with answer binding, branch/calculation/confidence/action effect and import/derive policy. Organization prompts remain blocked until STR-066 IDs/adapters. Question component selection is explicit from a reviewed definition, not inferred from field names.

## P11–P12: profile and ICP

Keep current profile surface and existing autosave. Sections: business identity/context; products/services; customer segments; ICP detail; problem/goal; evidence/assumptions. Use compact summary rows and one detail editor, not a giant all-fields form. Clicking a Journey reference opens the same record ID. Distinguish buying actor, problem, context and claim confidence. Mission/vision fields may be edited deliberately but must not overwrite the legacy mission field blindly: existing screens sometimes label that data goal/challenge. Migration preserves the entered meaning as reported until reviewed. Do not demand formal mission/vision statements to compute a basic next step.

## P13–P14 / P29: metrics and economics

List columns: metric, scoped latest value or unknown, unit/period, source freshness, review state and Open. Only applicable approved metrics appear; an unavailable calculation is not an empty chart. Detail: definition/variant, canonical input bindings, explicit period/currency/basis, result state and input provenance, historical runs, sources and linked decision/action. First slice implements contribution amount only. Formula is displayed as explanatory text, executed only through the reviewed function registry. Input edits create new revisions/runs; saved actuals are not scenario sliders.

## P15–P16: claims and evidence

List filters: scope, claim type, origin, review/freshness, supports/refutes. Detail separates claim from supporting/refuting evidence; source, method, sample, observed/imported/review dates and limitations are visible. A claim can have multiple conflicting observations. Primary contextual action is Add evidence or Record review. A file attachment has its own quarantine/ready state and cannot count as approved evidence by existence. Confidence editor requires axis reasons and appropriate permissions; never infer high from “fact” or count alone.

## P17–P18: attention and explanation

List rows group reviewed risk/priority and evidence gaps, with neutral ordering when priority is not established. A candidate row shows subject, reason, confidence state, freshness and Open; no unsupported uplift/risk percentage. Detail follows DESIGN.md Why order. Desktop contextual Why uses existing accessible Dialog at 480px width on logical inline-end; below 768px it is full-width/full-height with a visible close/back control. A direct P18 URL renders the same detail content in the main page with breadcrumb. Detail component, query and accepted records are shared; no second explanation implementation.

Acceptance is a separate form section: proposed decision title/reason/source; existing Goal optional; owner and due date required by current Action contract. Preview exact resulting records before Save. Missing evidence permits a bounded collection action only if the reviewed rule allows it. Dismiss/no_action require a reason, not a forced negative business judgment. Changed inputs require reevaluation before final commit.

## P19–P24: decisions, execution and reviews

Preserve the existing execution board/list and filters. Decision detail contains source snapshot, rationale, assumptions, review trigger, status and linked Goal/Action. Action drawer contains title, description, owner, due date, status and source Decision; blocked state has a reason. A done action records completion evidence where its definition requires it; completion is not automatically business success. KPI links a metric definition/variant/context to a target and period, not a second actual-value field. Risk and review records retain rationale/history.

Review list shows type/scope/date/owner/open commitments. Review detail has Inputs → Agenda → Decisions → Actions → Follow-up; each tab retains unsaved content. Missing/stale inputs visibly limit conclusions. Finalize review only after explicit outcomes or no_action reasons; starting another period creates another snapshot. Calendar scheduling and reminders remain secondary and opt-in.

## P25–P28: existing strategic analysis

Keep actual input/validation/method semantics and legacy paths. Forms show evidence/source and review freshness before charts. EFE/IFE totals/rating errors block finalization but permit a labeled draft. SWOT factors and option pairings remain traceable. New automatic recommendations require reviewed KB methods; existing TOWS/Ansoff UI presence does not fill research gaps. A decision action links the saved reviewed analysis/option, not the current unsaved chart.

## P30: Scenario Lab (P2)

Baseline selector (immutable actual/input snapshot) → named scenario → explicit changed parameters and units → compare result/deltas → assumptions, uncertainties and constraints → optional record Decision. Show base/scenario differences in a table before charts. Price +10% or churn +2pp modifies a scenario copy; does not edit actual revenue or retention. Unsupported function/forecast returns unavailable with reason. No default scenario probabilities or “best plan” ranking without reviewed basis. NPV/IRR extensions require their own methods/ambiguity guards.

## P31–P35: documents, reports, learning, search and import

Documents reuse the current three-pane concept responsively: filtered list, selected guide/content and assignment/status. Guide structure is bilingual string arrays. Attachments show progress/quarantine/ready/rejected, size and permission-aware download. Report snapshot selector separates current live data from frozen output and clearly marks missing/stale context. Learning uses the same Quick/Learn/Deep source content as in-page help.

Search Dialog: input + permitted result groups + keyboard selection + no-results guidance; query normalization preserves actual company text. Tool discovery is distinct from private content search; membership is enforced server-side. Import requires preview and scope/mapping verification; conflicts show retained current vs imported values. No destructive replacement or data verification is inferred from upload.

## P36–P40: settings and operating surfaces

Workspace settings separate members/invites/archive from account preferences. Owner-only controls explain impact and protect last owner. Account settings preserve current theme/language/motion/education synchronization and email-verification flow. Billing displays actual plan/quota/payment state; join/own workspace counts remain distinct; cancel and export remain discoverable. Notifications derive from real events and open a permitted target; revoked membership removes visibility. Operator mutations require explicit operator role, audit and limited purpose; no impersonation bypass is designed here.

Future billing/operator/provider-specific forms must stay within their existing tasks' verified backend contracts. This design locks information hierarchy, permission boundaries and recovery; Luna must not invent prices, provider eligibility, statutory requirements or production data.
