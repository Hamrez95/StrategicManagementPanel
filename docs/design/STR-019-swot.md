# STR-019 — SWOT/TOWS Workspace design

## Data and ownership

`StrategyFactor` and `StrategyOption` are owned by one Workspace. The many-to-many `StrategyOptionFactor` relation stores source factors; the API resolves submitted factor IDs within the requested Workspace and checks that the option's category matches the selected factor types. A Workspace lock serializes writes, and each record has an optimistic revision to reject stale edits.

Factors require a specific statement and evidence, with an optional owner and priority from 1 to 5. Options are manually authored and hold a bounded action, rationale, testable hypothesis and optional cost or constraint. The product does not generate recommendations.

## Dependency behavior

Changing a factor's type, title, evidence or priority increments its revision and flags linked options for review. Changing only the follow-up owner does not change the underlying analysis and leaves linked options unchanged. A type change is rejected when it would make any linked option incompatible.

Deleting an unlinked factor needs no extra step. Deleting a linked factor first returns the dependent options and requires explicit confirmation. Confirmed deletion removes the factor links through the relation's cascade, retains every option, increments option revisions and sets `needs_review`. An editor repairs the option by choosing compatible factors and saving; that clears the review flag. This avoids a dangling reference while preserving the decision draft and its history in the UI.

## Interface

The Workspace route `/app/workspaces/:workspaceId/tools/swot` shows the four factor groups and four TOWS pairings. On narrow screens the matrix becomes a vertical sequence of labeled sections. Factor and option references are shown by title and category, while color only reinforces their visible labels. Loading, empty, error, pending, success, conflict and review states have separate UI treatment. Viewers can inspect all records and review flags but cannot edit them.

The screen follows the shared RTL/LTR, theme, keyboard focus and reduced-motion tokens. Unsubmitted factor and option drafts register with the Workspace switch guard so switching projects asks before discarding them. Screenshot and manual checks at 360, 768, 1280 and 1440 pixels in RTL and LTR, both themes, plus keyboard navigation are authored in the browser verifier and remain pending for the final verification phase.

## API and rollback

The Workspace-scoped API is documented in `docs/api/openapi.json`; errors include validation, permission, archived Workspace, revision conflict and factor dependency details. API coverage includes positive and negative scope, permission, pairing, conflict, dependency and archive cases.

Code rollback is a Git revert. Reversing the initial migration drops the new strategy tables and therefore erases SWOT/TOWS rows. Back up the database before reversing it after any real customer data has been stored. No server or Docker run has been performed as part of this development phase.

## Validation status

Implementation, API tests, and mocked browser scenarios are authored. They have not been executed. Migration application, keyboard review, screenshots, theme and responsive checks are deferred to the user-requested final system verification.
