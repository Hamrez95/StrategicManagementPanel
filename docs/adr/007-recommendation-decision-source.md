# ADR-007 — Recommendation provenance in existing execution

Status: accepted implementation design, 2026-10-16. Not applied to the database/API yet; STR-063 owns delivery.

Context: current execution.Decision creation requires source_kind analysis or strategy_option and a corresponding reviewed source in the same Workspace. A recommendation based on evidence cannot currently create a source-less Decision. The first vertical slice must not fabricate a finalized analysis to work around this.

Decision: add a narrow recommendation source kind and a nullable, explicitly typed FK to the immutable RecommendationInstance. Extend the existing at-most-one-source database constraint across all three source columns and require a valid selected source in the creation service. Preserve existing kinds and historic snapshot-only reads. Same-Workspace validation checks recommendation, evaluation, context and current membership; only reviewed/acceptable instances may be accepted.

Freeze the source title, recommendation/evaluation IDs, knowledge release, rule revision and input-revision references in the existing source snapshot, with company data remaining inside its Workspace. Follow the existing SET_NULL plus snapshot behavior for historical provenance when a source is removed, subject to data retention policy. No arbitrary generic source JSON supplied by the client. Creation/acceptance uses the same revision and idempotent service transaction, collecting required owner/date explicitly.

Consequences: additive migration; update OpenAPI discriminator/read/write DTOs, frontend decoders, execution source picker, exports/import compatibility and negative permission/idempotency tests together. Avoid top-level service import cycles; model FKs use lazy app labels and source resolution remains a small explicit branch. No changes are required for existing analysis/strategy decisions. Architecture implementation guide and STR-063 define the packet; no new duplicate execution system.
