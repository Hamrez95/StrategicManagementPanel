# STR-018 — Workspace business profile and ICP

## Product behavior

Each Workspace starts with a blank business profile. Company context, products, customer groups, goals and ICPs are stored on that Workspace; no prototype company or sample ICP is copied into a new profile. An ICP keeps organization segment and persona details alongside two separate ledgers: observed evidence with source/date/confidence, and assumptions with a proposed test and status.

The company route is `/app/workspaces/:workspaceId/tools/company`. It is reachable from Workspace navigation, the overview and global search. The ICP search route includes `#icps`, and the ICP guide is available from the page header. An earlier saved revision loads into an editable draft; the user reviews and explicitly saves any restore. The API keeps up to 50 immutable snapshots per profile and returns the latest 10.

## Data and authorization

`WorkspaceProfile` owns the structured collections and revision counter. Its API validates each object against a closed field schema, applies bounded text/list limits, and checks Workspace membership and owner/editor permissions. The existing owner-only onboarding completion rule remains. A successful change creates a `WorkspaceProfileRevision` snapshot in the same transaction as the profile update. Each Workspace has its own profile and history.

The profile read/write API remains `GET/PATCH /api/v1/workspaces/{workspace_id}/profile/`; recent history uses `GET /api/v1/workspaces/{workspace_id}/profile/revisions/`. Responses are private. Revisions are optimistic: stale writes return the established revision conflict response.

## Interface notes

The page uses the Stratino light/dark tokens, Vazirmatn, RTL/LTR logical properties, keyboard-visible focus, native form semantics, responsive section cards and a searchable ICP index. Evidence and assumptions use different headings, explanatory copy and visual markers so color is not their only distinction. Sections remain optional, while named rows and recorded statements require text before save. A next-step prompt points back to ICP learning instead of presenting an empty form as a completed strategy.

## Verification status

API and browser coverage has been authored for blank defaults, independent Workspace data, evidence/assumption separation, invalid nested ICP data, permissions, revision conflicts and save/history UI. Per the requested work sequence, automated tests, screenshots, type/build checks and server/Docker/browser execution are deferred to the final verification pass. No result is claimed for those checks yet.
