# Workspace authorization boundary

`Workspace.owner_id` is the only owner authority. Owner/editor/viewer is resolved centrally: owner is derived from that field, while `Membership` stores only editor or viewer. `is_staff` is an operator capability and never grants access to a customer's Workspace.

Use `accessible_workspaces_for(user)` for every Workspace list and detail lookup. Use `scope_queryset_to_user_workspaces(queryset, user, workspace_field, workspace_id)` before reading, changing, deleting, searching, exporting or processing child rows. Resolve a nested ID with `get_workspace_child_or_404`; the route Workspace remains authoritative. Validate every nested relation with `validate_related_workspaces` before save. Bulk operations must be applied to the scoped queryset, never to an unfiltered model manager.

Views that write must define an explicit `workspace_roles` allow-list and apply `WorkspaceRolePermission`. Editors can write business resources; viewers can only read and export; owner-only operations must allow only `owner`. A missing/non-member Workspace or nested row uses a generic 404. A visible Workspace with an insufficient role returns 403. Use `workspace_role(assignee, workspace)` to validate assignments. Never grant access by accepting a Workspace ID from a child payload.

Membership changes are owner-only and transactional. Owner identity is not a Membership row, so a member-removal operation cannot remove the last owner. Invitations accept only editor/viewer, expire after seven days, store only an HMAC digest of the one-use token and require a verified account whose email matches the invite. Links carry the token in the fragment, which the browser clears before posting it. Every request re-queries current membership; do not cache an authorization decision or a private download URL. API responses are `private, no-store`. A future download endpoint must re-check membership on each request and stream through private storage. The server currently has no analysis, document, attachment, search, export or job endpoints; when introduced, each must use the scoping helpers above before this boundary can be considered complete for that resource family.

`GET /api/v1/workspaces/` returns at most 100 authorized rows and uses a one-hour, per-account signed cursor. `BillingAccount` currently establishes the required owner-to-Workspace relationship only. Plans, quotas, invoices and payment behavior are deferred to STR-029. Workspace creation always obtains the owner's own account through `create_owned_workspace`; no client-supplied billing account is accepted.

## STR-013 management API

- `POST /api/v1/workspaces/` creates an owner-controlled Workspace. `GET/PATCH /api/v1/workspaces/{id}/` reads, renames, archives or restores it; writes require the current `revision` and stale writes return `409 revision_conflict`.
- `GET /api/v1/workspaces/{id}/members/` and `GET/POST /api/v1/workspaces/{id}/invitations/` are owner-only. Members can be changed or revoked at `/members/{user_id}/`; pending invitations can be revoked at `/invitations/{invitation_id}/`.
- `POST /api/v1/workspace-invitations/accept/` consumes a seven-day, one-use token only for the matching verified account. The raw token is sent only in an email URL fragment and never returned by the API. Only `editor` and `viewer` can be invited; the owner is not represented by a Membership row.
- Archiving retains Workspace data, removes it from active member sessions and selectors, and revokes all pending invitations. Owners can restore it from their archived list. Authorization is still evaluated from current Workspace state on every request.

API view tests cover authorization, revision conflicts, archived state, role changes, invitation normalization, duplicate/invalid role rejection, expiry, revocation, one-use acceptance, email matching and mail-delivery failure. They are authored but held for the final validation batch.

## STR-014 onboarding and project profile

`GET/PATCH /api/v1/workspaces/{id}/profile/` stores the optional industry, stage and mission fields with an optimistic `revision`. Owners and editors may read and change these fields; viewers may read only. Only the owner may set `complete: true`, which records the onboarding completion timestamp. Existing Workspaces receive an empty profile during migration, and new Workspaces create one in the same transaction. Completion is navigation state only and never grants Workspace access.
