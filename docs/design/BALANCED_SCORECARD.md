# Workspace Balanced Scorecard

## Scope and implementation plan

This additive feature keeps the existing Goal, Decision, Action and execution routes. BSC is a separate aggregate in the existing execution module, not a second action register.

- [x] Relational card/objective/indicator/action-link models and additive migrations.
- [x] Workspace-scoped reads, owner/editor writes, archived-write rejection, revision conflicts, transactional revision history.
- [x] Append-only observations/reviews with actor/payload-bound retry keys and historical indicator definitions.
- [x] Four-perspective editor, explicit fictional example, strategy hypotheses, observations and meeting reviews.
- [x] Academy-to-Workspace chooser and reverse learning links without changing lesson draft status.
- [x] Print/PDF view and additive full JSON/Excel/AI snapshot sections; historical snapshots remain optional-field compatible.
- [x] Final local browser/PDF inspection, regression gates and local backup/migration (evidence in Management OS STATUS).
- [ ] Remote PR review/checks and merge; no deployment is implied.

## Design

Use the customer shell's existing cream paper, pastel blue actions, Vazirmatn, dark tokens and logical RTL spacing. Four perspective accents distinguish finance (gold), customer (blue), process (lavender) and learning (rose). No unrelated dashboard redesign. Direction/period → objectives/indicators → hypothesis map → observations/review. Indicator details expand; mobile uses labeled single-column fields. A brief map reveal respects reduced motion. Color never carries status alone.

## Model and mutation contract

`Scorecard` owns `ScorecardObjective`; each objective has indicators and explicit links to canonical actions, plus an optional canonical Goal. A card can reference a canonical strategic Decision. Creating an action from a BSC objective uses the existing action service, required decision, member owner and due date; it links the objective and the objective's existing Goal atomically. Existing Goal data is never rewritten by a card edit.

Save the card aggregate using its revision. A client UUID survives uncertain creation responses; a repeated creation returns conflict rather than duplicating. Nested IDs may never move to another parent. Omitting a persisted objective/indicator is rejected rather than deleting history. Relationships may be removed; old versions remain in `ScorecardRevision`. Incomplete definitions are saved, provided titles and value/date pairs are valid. The server never silently defaults an unknown measurement to zero.

Observation and review endpoints append only; no update/delete endpoint exists. PostgreSQL blocks modification/deletion of observation, review and revision rows, and checks nested tenant references even outside the API. A new observation records the indicator's complete definition/target snapshot. New-action and append retries bind request UUID to the actor and payload. All writes serialize under the Workspace lock and require the current card revision. No browser-only business-data store is used. Unsaved form values remain in memory after errors/conflicts; the existing navigation guard is registered. A conflicted draft can be downloaded, the saved list refreshed and the latest version explicitly opened. Saved incomplete cards can be resumed across sessions. Unsaved edits do not survive a forced tab close or browser crash.

## Explicit calculation policy

Decimal inputs are strings, up to 18 integer digits and 6 decimal places. Null means unknown. Formulas are human-readable descriptions and are never evaluated as code.

- Increasing: actual ≥ target is on target. Decreasing: actual ≤ target is on target.
- Range: both inclusive bounds are required together. Difference is actual minus the nearest bound, or zero inside the range.
- Outside the target, an absolute, user-entered nonnegative warning margin in the indicator's own unit produces “near target”; otherwise “off target”. No universal margin is invented. Missing target/actual or changed operational definition gives unknown.
- Baseline progress is `100 × (actual − baseline) / (target − baseline)`, only for a monotonic target in the declared direction, a dated baseline no later than the observation and a nonzero span. It is explicitly baseline-to-target progress, not actual/target attainment. It may be negative or exceed 100%. Zero targets are valid. Ranges and zero spans have no percentage. No composite BSC score or perspective average exists.
- Latest means latest observed date not after today, then creation time/ID. Unknown latest readings do not fall back to an older known number. Future observations are rejected. Observations stay inside the card's period.
- Trend is the raw change between the latest two readings only when both are known, on distinct dates and have identical recorded definitions. It is not a causal forecast.
- Cadence is explicitly an interval in days, not a calendar-month approximation. Next due = last observed date (including unknown readings), otherwise baseline date, plus cadence. Missing definitions, unknown/off/near target, overdue measurement or elapsed target deadline prompt review.

## Learning and scientific limits

The lessons `C07-ST05-L03` and `S01-C4-ST02-L04` retain their original `draft` status, content, identifiers and answers. Their CTA opens `/app/scorecards?from=…`; the chooser preserves the lesson and the onboarding destination. Inside a Workspace use `/app/workspaces/:workspaceId/tools/scorecard`.

Existing source-informed framework: `assets/management-knowledge/frameworks/execution/balanced-scorecard.json`. No scientific approval was added to it. Four perspectives and the strategy-first relationship between objectives, measures and initiatives follow Kaplan's [Conceptual Foundations of the Balanced Scorecard](https://www.hbs.edu/ris/Publication%20Files/10-074_0bf3c151-f82b-4592-b885-cdde7f5d97a6.pdf) and Kaplan & Norton's [Linking the Balanced Scorecard to Strategy](https://cmr.berkeley.edu/1996/11/39-1-linking-the-balanced-scorecard-to-strategy/). The software's warning/status and baseline-progress policies above are disclosed product rules, not a claimed standardized Kaplan–Norton scoring algorithm. Map links are testable managerial hypotheses with rationale and test method, never proven causality. Fictional examples enter a real card only after explicit confirmation.

## Export and rollout

The readable report uses actual saved card data, business name, period, generation date, all perspectives/objectives/indicators/history, owners, actions, hypotheses and reviews. Browser Print → Save PDF uses the existing local font. Readable browser PDF is distinct from a signed/certified university document.

Version-2 exports add eight allowlisted `scorecard_*`/`scorecards` sections, including original decimal strings, links, observation definitions and full revisions. Full workbook/AI package reuse existing authorized immutable snapshots; no automatic AI sending or formula execution. Existing v1 and old v2 snapshots remain readable. No import contract is silently expanded.

Apply `python manage.py migrate` including execution migrations 0002–0005 (and dependencies). No new package/environment setting is required. Back up first. Roll back application routing before rolling back schema; schema downgrade removes BSC tables/data and is not a data-preserving rollback. Keep the backup/full export if a downgrade is required. Do not roll back only guard migrations while keeping writable BSC code, because they remove enforcement.

Verification sources: `modules.execution.test_scorecards`, existing execution/export/core regressions, and `scripts/verify-scorecards.mjs` (synthetic HTTP UI fixtures, not claimed as live backend tests). Final evidence must identify which commands actually passed and any unresolved failure.
