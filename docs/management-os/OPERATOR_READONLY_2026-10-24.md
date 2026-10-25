# STR-030 / #30 — read-only operator slice

Issue: https://github.com/Hamrez95/StrategicManagementPanel/issues/30. Dependencies remain the existing #10 (identity), #12 (tenant isolation) and #28 (management entitlements). The modeling checkpoint is the baseline; this slice does not close these issues or add commercial behavior.

## Boundaries

`/internal/{accounts,workspaces,plans,subscriptions,access,audit}` uses a separate lazy-loaded operator bundle. `GET /api/v1/operator/status/` exposes only the operator's permitted sections and MFA readiness. Six collection routes under `/api/v1/operator/` support bounded 25-item pagination, search, explicit state filters where meaningful, empty and error states. All return private/no-store responses with `Vary: Cookie`, including errors. Mutations return 405. This console covers **management** plans/grants; Academy commerce remains separate.

Each section requires a distinct `accounts.operator_view_<section>` permission, assigned directly or through a group, in addition to an active, email-verified staff identity. Identity and permission membership are reloaded on every request. Staff and superuser flags alone grant none of these permissions. No real operator or customer grant is created. No existing Workspace membership rule is widened.

## MFA prerequisite — blocked by design

There is no implemented operator MFA verifier in the current authentication stack. `operator_mfa_verified` therefore always returns false. Every collection returns `503 operator_mfa_unavailable` **before customer querysets are created**, in every environment. Headers, session booleans and environment flags cannot open it. The browser shows the prerequisite and makes no collection request when readiness is false. The pre-existing `/internal/django-admin/` is also closed with a private 503 response to prevent a raw admin alternative.

Before customer reads can be enabled, implement and review factor enrollment, challenge verification, proof binding to both the authenticated user and current session, freshness, logout/password/factor-change invalidation and recovery. Add integration tests for those flows. Replacing the constant with an environment toggle, accepting a browser assertion or bypassing it for development/superusers is not sufficient. Tests mock this verifier **only inside isolated synthetic tests** to exercise future read behavior. Successful test reads do not establish deployed MFA readiness.

No impersonation, tenant-content browser, unrestricted export, grant/revoke API, plan writer or raw model registration is added. Existing audited grant services remain separate. Future admin/mutation work must share the MFA boundary; an additional admin URL must not introduce a staff-only or development bypass.

## Minimal response contracts

| Section | Included | Excluded |
| --- | --- | --- |
| accounts | UUID, active/verified flags, join date; search by UUID or exact email | Email in results, name, phone, password, tokens, profile/preferences |
| workspaces | UUID, owner UUID, archive/create timestamps; search by record/owner UUID | Business name/profile, answers, files and domain content |
| plans | Existing management catalog fields and capabilities | Invented price, duration, checkout or renderer claims |
| subscriptions | UUID, owner UUID, frozen plan revision/title/caps, recorded status and window | Free-text reason, idempotency key, payment assumptions |
| access | Owner UUID and canonical `management_access` caps/features/usage | Grant lists, billing IDs, Workspace membership/content |
| audit | Existing Workspace/subscription events with source, ID, actor ID, event type, reference ID, time | Changes, snapshots, free-text reason, business payload |

Audit is a newest-first union with deterministic source/ID tie breaks. It is existing operational history, not a claim of tamper-proof logs. Recorded active subscription status is not the same as effective access; the separate access view uses the existing resolver. A null plan cap means no additional plan cap; null price/duration remains unconfigured. Report capability remains reserved while rendering is unimplemented. Search parameters must be redacted from deployment access logs, particularly exact-email lookup; no new application logging stores them.

## Design and validation

Reuse Vazir and the existing semantic tokens: light canvas `#f8fafc`, paper `#ffffff`, ink `#172b4d`, action `#2459ed`; existing dark equivalents apply. Heading, section navigation, search/filter, results and pagination form one reading order. No decorative KPI cards. Tables scroll in their region; controls remain reachable on narrow screens. Shared theme/language controls, RTL/LTR, locale numbers and reduced motion are retained.

Validation results are recorded in STATUS.md. Browser checks use empty/error responses only, never customer fixtures. Positive backend checks use a synthetic isolated PostgreSQL test database; no application migrations or account changes are applied to the live local database. Full MFA, production deployment and observed-user acceptance remain pending.

## Rollout and rollback

Keep the customer data gate closed until the MFA prerequisite passes review. Migration 0008 adds permission metadata only and assigns it to nobody; apply it through the existing backup/restored-copy migration process, not as an account-provisioning shortcut. There is no new table, customer-data migration or guard requirement. For rollback, remove the new routes/UI and migration state using the normal reviewed migration procedure; keep admin closed while MFA remains unavailable. Django can retain content-type permission rows on reversing metadata migrations; revoke any future explicit assignments separately through authorized administration. Never delete customer records to roll this slice back.
