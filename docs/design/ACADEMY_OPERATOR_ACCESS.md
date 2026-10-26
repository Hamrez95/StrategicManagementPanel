# Academy sample and manual-access operations

This is the #30/#101 continuation of the existing operator console. Use the same green operator tokens, Vazir typography, bounded dialog motion and responsive dialog with visible header/save/cancel actions. Search and card-title details are disclosed on demand to keep ordinary edits compact. Customer screens keep their existing design.

## Canonical ownership

No second entitlement flag or localStorage access store is introduced. `FreeSample`, `AcademySubscription` and `SubscriptionArea` remain the canonical owners. Manual access is distinct from orders and payment; it never creates a purchase or changes a payment to paid. The existing Academy access resolver, account summary and authorized lesson projection consume these records. Revoking one grant preserves all other grants, learning progress, notes and purchase history; refunds require the separate payment workflow.

## API and authority

All endpoints require active verified staff, explicitly approved OperatorAccess, the relevant section and a fresh session-bound MFA proof. Staff/superuser alone never suffices. Approved configured owners may perform the actions within their section access. Delegated administrators require the explicit permissions listed below. Mutations additionally require CSRF, a reason and strict allowlisted fields. Responses are private/no-store. Only catalog metadata is returned; no lesson answer keys or learner notes are exposed.

| Endpoint | Purpose | Delegated permissions |
|---|---|---|
| `GET/POST /api/v1/operator/academy_samples/configure/` | Search at most 50 lesson units; read/edit first-card sample prefix | `academy.add_freesample` and `academy.change_freesample` |
| `GET/POST /api/v1/operator/academy_subscriptions/grant/` | Read active choices; explicitly grant selected coverage to an account | `academy.add_academysubscription` |
| `GET/POST /api/v1/operator/academy_subscriptions/{id}/` | Read grant and revoke only that grant | `academy.change_academysubscription` |

Team administration exposes these permissions separately. Capabilities come from the server and only control whether controls are displayed; every endpoint enforces the same boundary independently.

## Sample policy and concurrency

The count selects the first N cards in canonical `(order,id)` order, including count zero to disable that lesson's sample. Reviews are excluded. General lessons remain independent. Enabling a specialty lesson disables samples on all other specialty lessons in the same transaction, matching the owner's single selected specialty lesson policy. All specialty areas are locked in a stable order before the unit lock so concurrent editors cannot enable two specialty lessons. The version hash includes the active specialty selection across lessons; stale editors receive 409 and keep their form until they explicitly reload. Titles can be inspected without returning content or assessments.

## Grant/revoke behavior

The operator chooses an active special plan, recipient account ID, explicit start/end instants and (only for specialty coverage) one or more active specialty IDs. No expiry requires an explicit form choice; no duration or commercial policy is guessed. Coverage is frozen at grant time. `request_id` is a UUID bound to actor, recipient and normalized payload in the immutable audit event. Matching retries return the same current subscription, including its revoked state; changed payloads or another actor cannot reuse that request. Recipient locking serializes matching retries; uniqueness prevents cross-recipient collisions.

Revocation uses a version checked under a subscription row lock. The form identifies the account and subscription and requires explicit confirmation and reason. Audit insertion and every mutation share the same transaction; audit failure rolls back access changes. The operator's effective-access indicator uses the same purchase-state, time-window and active-specialty rules as the account resolver, including refunded orders.

## Migration and verification

`operations.0008_academy_access_audit` extends both event-type guards. It adds no parallel access model. Existing audit records are retained. Reverse migration deliberately refuses to remove event types after new events exist; roll back application code while retaining the additive schema, or restore a full pre-change backup to an isolated destination. Never delete immutable audit rows to force a downgrade.

Regression suites: `modules.operations.test_academy_access`, `modules.operations.test_academy_plans`, and `scripts/verify-academy-operator-actions.mjs`. Server tests cover permission/MFA/CSRF, exact prefixes, cross-specialty conflicts, PostgreSQL concurrent edits/retries, scheduled/expired/revoked grants, payment-history preservation and audit rollback. Browser tests use isolated synthetic fixtures for four width/theme/language combinations, modal fit/accessibility, revision conflict recovery, manual grant retry UUID retention, revocation and read-only controls. No actual user access is changed by these browser fixtures.
