# Exact continuation

1. Read STATUS.md, AUDIT.md findings K01–K10, ARCHITECTURE.md and selected task/dependencies. Check git status; preserve any new owner work. Do not rerun research or regenerate the task plan over new edits.
2. Sync unified local task definitions and epic membership to GitHub, mapping actual issue numbers in existing issue-map/catalog. Existing #53 remains the one roadmap. Do not duplicate issues, close partial tasks or create a separate Management OS tracker.
3. Finish STR-053: read-only independent integrity check, generated inventory/report, strict duplicate JSON/frontmatter handling, typed references, prerequisite-vs-transition distinction, mutation regression tests and isolated CI. Test that malformed/missing/deleted knowledge fails. Mark development evidence, then require merge/check evidence before issue closure.
4. STR-055 repairs baseline web type errors without blanket casts/suppression. Record root typecheck, decoder/domain/contract tests and build. Do not treat failed baseline as permission to disable quality gates.
5. STR-054 explicit reviewed loader/manifest; no automatic promotion of all research records. Source/claim review for the first slice is a prerequisite, including activation-source mismatch if that metric is selected. No organization prose or PLAN-* concept may become executable by guess.
6. STR-056 → 057 → 058: canonical profile migration, evidence/confidence/freshness and contribution metric. Dry-run/rollback/negative permissions first. Existing Decision/Goal/Action and Workspace IDs remain canonical.
7. STR-059 → 060 → 061 → 062 → 063, then shared education STR-026, presentation STR-064, dashboard STR-027 and end-to-end STR-065. First-slice contribution calculation is context, not an invented retention-rule threshold.
8. Expand organization/cadence/scenarios only after the restricted slice's data and behavior contracts pass. Research STR-068 fills gaps in small batches; no arbitrary health score or opaque AI business logic.

## Final validation queue — owner-requested deferral

- STR-007/008/009: PostgreSQL/API migrations, production settings, Compose health and physical Windows two-ref PowerShell runner/cleanup.
- STR-010–024 and new persisted modules: auth/session/CSRF, nested membership, revoked access, concurrent writes, idempotency, private file quarantine/scan/download, report round-trip/backup/restore.
- Any canonical migration: empty DB + upgrade + dry-run + repeated apply + rollback/restore with preserved IDs/history and exports.
- STR-026/027/064/065: real browser screenshots and critique at 360/768/1280/1440, fa/en RTL/LTR, both themes, 200% zoom, keyboard/focus, reduced motion, guided/expert, education off; network/session/conflict states.
- STR-004/038/068: actual consenting manager sessions and expert source/domain review. Synthetic A–F fixtures are not observed research.

Deferral does not make tests passed or tasks Done. Keep a validation_pending item and exact command/scenario when implementation is ready. No buying services, deploying publicly or contacting people is authorized by this queue.

## Git completion

After Hamrez95 signs into Git Credential Manager, use a repository-scoped username selection; verify author/committer and remote before push. Push coherent branch commits, create/attach a PR and merge only after required checks have completed successfully (unless owner explicitly changes the gate policy). Fetch and verify local/remote main equality. Current main merge request remains open work; a connector issue update is not a Git push.
