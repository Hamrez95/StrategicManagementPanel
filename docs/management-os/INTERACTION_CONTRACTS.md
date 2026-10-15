# Shared interaction and component contracts

2026-10-16. Approved initial behavior for page specifications; reuse existing packages/ui and account/shell patterns. Luna implements these decisions rather than choosing new flows.

## Form and save behavior

| Operation                       | Interaction contract                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing profile draft/autosave | Reuse current revision/debounce/recovery implementation. Show Saving → Saved, or persistent Failed/Conflict. No duplicate autosave engine.                                                        |
| Reviewed observation/claim      | Explicit Save because provenance/period/scope changes are material; retain draft on error. Date/currency/basis labels are adjacent to input.                                                      |
| Calculate                       | Explicit reviewed calculation using current canonical input revisions. Invalid/missing inputs produce no fabricated value; result identifies definition/method and input refs.                    |
| Accept recommendation           | Preview Decision/Action → validate owner/date/source → commit once with idempotency key → open existing execution record. Disable double-submit; ambiguous network response retries the same key. |
| Review confidence               | Explicit submit, required axis reasons and evidence refs; user-selected legacy label is not upgraded automatically.                                                                               |
| Bulk/import                     | Preview counts/mappings/units/conflicts → choose reviewed resolutions → apply/archive → stable result and recovery path. No silent overwrite.                                                     |
| Discard                         | Destructive only to the current unsaved draft after explicit confirmation; does not delete canonical data.                                                                                        |

Validate on blur for local field syntax and on submit for cross-field/scope consistency. Do not announce an error on every keystroke. Server errors remain authoritative and attach to fields when possible; banner summarizes non-field errors and provides focus to first invalid field. Required indication describes the current decision, not a universal compulsory question.

Money accepts localized display entry, normalizes deliberately, and sends a plain decimal string plus explicit unit/currency. Never convert digit characters in IDs, URLs or source content. Dates display in selected locale but API dates remain ISO; business period and timezone are explicit. Percent changes and percentage-point changes use different labels. Blank is unknown, not numeric zero. Decimal precision/rounding belongs to the selected calculation method, never a formatting convenience.

## Navigation, dirty state and focus

One dirty-state coordinator per Workspace, reusing existing switchContext. Leaving a dirty editor offers Save and continue / Discard draft / Stay. Failed save keeps the current route and draft. Browser back/deep link receives the same behavior where supported; server revision always prevents silent overwrite even if navigation interception cannot run. New Workspace queries cannot reuse the old Workspace payload.

After route change focus the page heading, preserving normal browser history. Opening a Dialog stores its trigger; close/Escape restores it. A blocking pending mutation prevents accidental duplicate action, not every attempt to leave the entire app. Closing a purely explanatory panel does not create a save prompt. No nested modal stack: if an action needs a form, replace the panel body or navigate to its detail form.

## Presentation state versus business state

- Guided/compact selection is per-device presentation state initially; education-off remains existing account show_tutorial. Do not add a second global education flag.
- Step status: not_started / active / blocked / deferred / skipped / completed / needs_review. Completed stores release/input trace; changed evidence may create needs_review while old completion remains historical.
- Candidate lifecycle: proposed / accepted / dismissed / superseded. The payload is immutable; lifecycle events are separately auditable. Unknown evaluation is not a proposed business verdict.
- Evidence observations, review freshness and claim confidence are independent axes. Do not combine them into a single green/red badge or infer confidence from sample count alone.
- User can inspect sources/Why and navigate modules without completing every step. A prohibited commitment explains its exact missing dependency.

## Reusable component map

| Component          | Inputs / behavior                                                                              | Existing building blocks                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| ContextHeader      | Workspace, explicit business/segment scope, period, freshness; contextual change command       | shell, headings, Input/Select; no second Workspace selector     |
| CanonicalReference | Entity title/ID, small saved summary, source/revision, Open original                           | Link + text; no copied editable value                           |
| ManagementInput    | Definition-bound renderer, value/provenance state, why/required_for, import/derive alternative | Input and existing form patterns; reviewed renderer key only    |
| SaveStatus         | saving/saved/error/conflict with retry/reload and retained draft                               | status text + Notice; essential errors not timed Toast          |
| EvidenceStatus     | observation origin, review_due, contradiction and separate confidence reasons                  | text badge + accessible detail trigger                          |
| MetricValue        | value or status, unit/period/variant, source and calculation link                              | locale formatter + text/table; chart optional                   |
| AttentionRow       | subject, bounded reason, state, next action and Why                                            | semantic list/table row, Button/Link                            |
| ExplanationBody    | reason, evidence, confidence axes, alternatives/risks, sources and immutable trace             | sections + source links; shared between Dialog and direct route |
| StepActions        | Previous, Defer, conditional Skip, Save and continue                                           | Button variants; one primary action                             |
| ReviewAgenda       | input snapshot + issue list + decisions/actions/no_action                                      | Tabs/Dialog where already available; no duplicate calendar      |

Keep feature components local until reused by at least two real screens. Do not create a generalized component framework for all future engines. New semantic tokens require design review; use current tokens for ordinary states.

## Initial copy dictionary

| Meaning          | فارسی                                               | English                                                   |
| ---------------- | --------------------------------------------------- | --------------------------------------------------------- |
| Unknown          | هنوز اطلاعات کافی نداریم                            | Not enough information yet                                |
| Existing value   | از اطلاعات ثبت‌شده استفاده می‌شود                   | Using saved information                                   |
| Why              | چرا این را می‌بینم؟                                 | Why am I seeing this?                                     |
| Ask reason       | این پاسخ چه تصمیمی را تغییر می‌دهد؟                 | What decision does this answer affect?                    |
| Defer            | بعداً بررسی می‌کنم                                  | Review later                                              |
| Skip             | اکنون مرتبط نیست                                    | Not relevant now                                          |
| Skip consequence | این تصمیم تا روشن‌شدن شواهد باز می‌ماند             | This decision stays unresolved until evidence is reviewed |
| Save             | ذخیره و ادامه                                       | Save and continue                                         |
| Saved            | ذخیره شد                                            | Saved                                                     |
| Save failure     | ذخیره انجام نشد؛ اطلاعات شما در فرم مانده است       | Could not save; your input is still in the form           |
| Conflict         | اطلاعات هم‌زمان تغییر کرده؛ نسخه تازه را بررسی کنید | Information changed elsewhere; review the latest version  |
| Evidence         | ثبت شاهد                                            | Add evidence                                              |
| Candidate action | پیشنهاد برای بررسی                                  | Candidate for review                                      |
| Commitment       | ثبت تصمیم و اقدام                                   | Record decision and action                                |
| Stale            | زمان بازبینی این اطلاعات رسیده است                  | This information is due for review                        |
| Not applicable   | با دلیل ثبت‌شده، در این زمینه کاربرد ندارد          | Not applicable in this context, with a recorded reason    |

Keep user-entered names/claims in their original language. Sources show actual publication language; authored explanatory translations must not imply that original text was quoted. No “AI thinks” justification, forced questionnaire completion or celebratory score before evidence exists.

## Keyboard, motion and responsive rules

Existing shell search uses its current discoverable shortcut; avoid conflicting global shortcuts. Add Previous/Next keyboard shortcuts only inside an explicit step control and never while typing. Tab order follows document order. Scope/mode filters use labeled controls, not unlabeled icons. Disclosure triggers expose expanded state; graph/chart result has a textual/table alternative. Announce one plan update on user action, not every rerender.

Contextual Why uses 480px Dialog on logical inline-end desktop, full screen below 768px; standalone URL uses main-page layout. Focus trap/Escape/return follow existing primitives. At 200% zoom and 360px all primary actions reflow; sticky footers reserve space and do not hide focused input. Reduced motion removes sliding/animated count changes and preserves immediate state feedback. Charts do not invent interpolation for absent data.

## Undo and irreversible operations

Archive/restore uses current Workspace service and clear consequences. Recommendation dismissal is reversible via a new lifecycle event where permissions allow; accepting again uses the same accepted record unless a new evaluation is explicitly generated. Deleting evidence referenced by accepted decisions follows retention/snapshot rules, never silently erases explanation. Payment, ownership transfer, account deletion and production data migration remain separately tested flows under existing tasks; Luna must not create permissive shortcuts to complete a design preview.
