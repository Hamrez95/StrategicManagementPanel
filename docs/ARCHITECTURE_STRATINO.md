# Stratino architecture decision — accepted development direction

Current Management OS extension (2026-10-15): [audited architecture](management-os/ARCHITECTURE.md), [ownership and ADR decisions](management-os/DECISIONS.md), [first vertical slice](management-os/VERTICAL_SLICE.md). The stack/security boundaries below remain in force; the linked plan supplies canonical data, knowledge-release, journey and evidence contracts. These documents describe intended development, not completed runtime features.

## Stack and boundaries

React + TypeScript + Vite, React Router, TanStack Query, accessible headless primitives, CSS design tokens and Motion for React. Use small feature modules rather than another giant app component. Pin compatible stable versions and lockfiles at implementation time; do not guess version numbers from this document.
Django supported LTS + Django REST Framework + PostgreSQL, modular monolith. Standard Django sessions in HttpOnly/Secure cookies and CSRF protection for a same-origin browser client; no long-lived auth token in localStorage. Use an established maintained email-confirmation flow rather than custom cryptography.
Typed OpenAPI client; server validation and canonical calculations. Move existing JS calculations into a tested TS domain package and compare backend calculation fixtures; client previews are not authoritative saved outputs.

One repository, proposed paths:

- `apps/web/`: public pages, auth, onboarding and `/app/workspaces/:workspaceId/…`.
- `apps/api/`: accounts, workspaces, strategy, execution, documents, billing and operations modules.
- `packages/domain/`: pure calculation/types, with no UI or browser storage dependencies.
- `packages/ui/`: shared visual primitives and design tokens; keep small until reuse exists.
- `infra/`: container definitions and provider-neutral deployment/runbooks.
- Existing prototype stays operational until the replacement passes parity checks. Document its eventual move to `legacy/`; do not relocate it in this planning commit.

Public site, authenticated product and restricted operator console are separate route/auth/bundle boundaries. Avoid separate microservices or three independently maintained applications for the first release. Deploy the built web assets and API behind one origin; public pages may be prerendered for SEO without adopting a second frontend framework.

## Data and authorization

User → Membership → Workspace; roles owner/editor/viewer. Workspace owns project profile, analyses, decisions, actions, documents and attachments. BillingAccount belongs to an owner; entitlements count owned active workspaces and actual bytes. Joined workspaces do not consume owned-workspace quota. Every read, write, search, export and download checks membership on the server.
Prefer normalized records for entities and versioned validated JSON for heterogeneous analysis inputs. Never store the entire app as one shared JSON row. Concurrency revision fields prevent silent overwrites. Framework staff roles are separate from workspace roles.
Attachment bytes go to private S3-compatible storage; metadata/checksum/version belongs to Postgres. Quarantine, authorization, size/type validation and short-lived downloads are required; filenames are not object keys. Provider SDK stays behind a storage interface.

## Shipping and operation

Development defaults local Postgres, local S3-compatible storage and a local email catcher; no paid service or external sending needed. Docker Compose only for local/single-host operation. Do not add Redis/Celery until a measured queue need exists; reliable email dispatch must still have retries/idempotency.
Primary first paid-host option: managed app/database in Iran; shared VPS is a documented fallback with isolated networks/DB users and resource caps per product. No provider purchase is authorized by this plan.
CI: existing calculations and prototype checks, TS lint/typecheck/build, API tests using Postgres, generated-contract drift, permission tests and targeted Playwright journeys.
Backups include database AND attachment bytes, independent encrypted copy, retention, restore drill and key recovery. Operator MFA, least privilege, dependency updates and redacted logs are required before public paid release.

## Deferred complexity

No Kubernetes, microservices, Elasticsearch, realtime collaboration, native apps, offline business writes, paid AI or automatic recurring card debit in MVP. International expansion requires its own payment, residency and content assessment; adding translations alone is not international launch.
