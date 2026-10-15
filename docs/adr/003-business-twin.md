# ADR-003 — Business Twin and canonical ownership

Status: accepted for development, 2026-10-15.

Context: Workspace is the current tenant/business boundary; profile JSON embeds entities while execution already owns Goal/Decision/Action.

Decision: Business Twin is a read projection across scoped canonical records. Keep Workspace and execution ownership, normalize profile products/segments/ICPs incrementally, and use explicit venture/segment/period bindings. Answer records reference data rather than copying business values. Same-tenant checks apply to every nested reference.

Migration: additive schema, dry-run/backup, stable legacy-ID map, conflict report, idempotent apply and compatibility projection. Only one write owner at a time. Restore-tested data rollback precedes destructive retirement. STR-056 owns migration; no schema is applied by this ADR.

Consequence: no separate Business mega-object, graph database or parallel Journey ICP/revenue/goal store. Expand entities only when a concrete lifecycle/query requires them.
