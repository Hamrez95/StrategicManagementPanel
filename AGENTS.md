# Stratino / استراتینو — project instructions

## Owner identity — mandatory

The owner is Hamidreza Pakpour, GitHub **Hamrez95**. Every commit must use author and committer `Hamidreza Pakpour <136631329+Hamrez95@users.noreply.github.com>`. Verify repository-local Git identity before committing and authenticated GitHub login before remote mutations. Do not use, alter, sign out, delete or publish through the unrelated akbarAbdiX account or its credentials. If Git authenticates as another account, stop that remote operation and use an already-authorized Hamrez95 connection; never claim a push/merge succeeded when it failed.

Read the selected issue and its dependencies, then only the relevant sections of docs/PRODUCT_CONTEXT_FA.md and docs/ARCHITECTURE_STRATINO.md. The prioritized catalog is docs/backlog/README.md.

- Product: Persian-first strategy management for independent project Workspaces; preserve current tools while migrating safely.
- Stack direction: React + TypeScript + Vite, Django modular monolith, PostgreSQL, private S3-compatible files. Do not buy services or deploy merely to complete a coding task.
- Public site, auth/onboarding, authenticated Workspace app and restricted operator console have explicit boundaries. Every API/file/search/export operation enforces Workspace membership server-side.
- For UI/UX work, read .agents/skills/frontend-design/SKILL.md and docs/UX_STANDARD.md. Apply readable Persian typography, RTL/LTR, locale numbers, accessible states, dark theme, responsive layout and reduced motion. Plan briefly, build, inspect real screenshots and critique.
- Graphify is mandatory for code impact analysis before broad source reads and after code changes. Use local code-only/update modes; no paid/cloud/semantic extraction without explicit scope.
- Apply docs/DEVELOPMENT_WORKFLOW.md for focused reads, targeted checks, honest evidence and small PRs. Do not close a task just because its UI is present.
- Use relevant available skills; do not pretend missing PM skills are installed. Pricing and market validation are hypotheses until evidence exists.
- For Persian user-facing copy and educational content, read the installed `persian-conversational`, `persian-writing`, and `persian-technical-writing` skills and apply the relevant parts. `docs/CONTENT_STYLE_FA.md` is the single product voice guide and overrides any automatic register choice in those skills. Do not use `virastar` unless the text is genuinely academic. Preserve meaning, approved names, answers, identifiers, and placeholders; leave ambiguous copy unchanged and report it. Do not invent Academy topics, sources, lesson text, or section order before the owner approves them. Once approved material is implemented, apply the product voice consistently.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

## Management OS continuation

Initial architecture and UX decisions are in docs/management-os/DESIGN_INDEX.md. Read STATUS.md and the selected LUNA_WORK_PACKETS.md entry before implementation; use the page/domain/state/interaction contracts relevant to that packet. Do not redesign the system or infer scientific thresholds while doing a simple implementation task. Unresolved design/research contradictions must be recorded with evidence, not silently guessed.
