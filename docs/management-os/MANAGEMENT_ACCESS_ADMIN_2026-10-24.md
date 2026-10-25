# Management access admin — #28 / #30

This slice connects the existing Management OS catalog and audited grant/revoke services to a dedicated Django admin site at `/internal/management/`. It does not close [#28](https://github.com/Hamrez95/StrategicManagementPanel/issues/28) or [#30](https://github.com/Hamrez95/StrategicManagementPanel/issues/30).

## Boundary and remaining dependency

The entire site is **closed by default in every environment**, including for superusers, until #30 supplies a reviewed session-bound operator MFA verifier. `operator_mfa_verified` deliberately returns false. There is no environment switch, trusted browser header or session-boolean bypass. Tests replace that function only while using a disposable synthetic database. Real operator privileges, grants and catalog values were not created or changed.

The plan catalog is read-only. No audited plan-edit service exists in the current model contract; exposing raw edits would change free access and future grants without that contract. Plan editing remains dependent on a reviewed audited workflow. The seeded special plan remains inactive and unpriced. The renderer capability remains reserved, as in the modeling checkpoint; displaying it does not implement report rendering or checkout.

Grant requires current verified active staff identity plus `add_managementsubscription`, `view_managementsubscription`, `view_managementplan` and `view_billingaccount`. Revoke requires `change_managementsubscription` and `view_managementsubscription`. Each mutation reuses the existing service's fresh actor check. Subscription-event history additionally requires `view_managementsubscriptionevent`. This preserves the current service permission policy; it does not introduce tenant-content access or impersonation.

## Behavior and data

- Catalog: search by code/title; filter active/default; show actual price/currency/duration with missing values retained.
- Subscriptions: bounded 50-row pages, search by exact subscription/billing/request identifier and status/plan filters. No owner email, Workspace names or customer content appear.
- Grant: exact billing UUID, an active non-default plan, reason, request UUID and explicit confirmation. Effective dates/features/revision come only from the locked service snapshot. Failed submission keeps the entered reason/key. Duplicate requests reuse the service receipt; the message asks the operator to inspect its actual status rather than claiming a revoked receipt is active again.
- Revoke: dedicated confirmation page identifies the subscription/billing account and frozen plan. The existing lock/status transition is idempotent and adds only one revocation event. Repeated revocation retains the original event/actor/reason; it is not an independently keyed new operation.
- All model add/edit/delete routes are disabled. Catalog, snapshot and audit inline are read-only even for superusers. No bulk mutation actions exist. History exposes only actor UUID, event, reason and time. GET never changes access; mutations retain Django CSRF and admin no-cache protection.
- Concurrent grant UUID collisions are converted into a recoverable validation error inside a savepoint. No raw constraint details or customer payloads are returned.

## Design

Use the existing Django admin semantic palette and light/dark behavior, with its primary/secondary/header/body/error tokens, rather than a new product theme. Local licensed Vazir regular/bold provide readable Persian text; controls use a 16px base, logical spacing, wrapped identifiers, keyboard focus and reduced-motion handling. The layout is a single operation form with the actual target, reason and confirmation; list tables retain their own responsive scrolling. The public/authenticated Workspace application is unchanged.

## Verification

Evidence and limitations are recorded in the accompanying STATUS entry. PostgreSQL tests run against a uniquely named disposable test database through the existing development image, with the source mounted separately read-only; no live migration or grant is required. The browser fixture also uses a separate disposable PostgreSQL database, synthetic accounts and a process-local verifier replacement. This is interface and service integration evidence, not an enrolled-factor, real-customer or production acceptance result.

Rollback: remove the `/internal/management/` URL and this site's registration/templates/static files. There are no migrations in this slice and no existing rows to roll back. Any later authorized live grant must be revoked through the same audited service, never removed or rewritten.
