# STR-007 — quality gates (frontend stage)

Status: frontend/contract pipeline prepared and tested locally. STR-007 remains open until the Django/PostgreSQL migration and runtime API tests land with STR-009. Static OpenAPI checks are not runtime API drift verification.

## Commands

- `npm ci`: exact lockfile, no hidden globally installed build tools.
- `npm run quality`: legacy syntax, ESLint TS/React hooks, formatter, strict types, OpenAPI conventions, unit/DOM/schema tests, independent calculator parity and complete production build.
- `npm run test:gate`: isolated synthetic schema fixture passes, deliberately broken assertion returns exit 1, restored fixture passes; real source and customer data never change.
- `npx playwright install --with-deps chromium`: browser dependency on CI/fresh developer machine.
- `npm run test:browser:all`: starts owned production/dev servers, waits readiness, runs UI/axe/contrast/keyboard, production route/session contract checks, legacy pages/tours/offline and record-preservation test, then stops owned servers.

CI `.github/workflows/quality.yml` runs on pull requests and main; static checks precede browser checks. Concurrent obsolete runs cancel. Permissions are read-only; trusted action commits are pinned from official release refs reviewed 2026-10-14. Failure-only screenshots/report use synthetic fixtures and expire after three days; no HAR, tokens, customer files or raw session captures are collected. Real production probes must never be substituted for this synthetic suite.

## Tool compatibility

TypeScript 7 in the initial foundation exceeded typescript-eslint's declared support (`>=4.8.4 <6.1.0`). Pin TypeScript 6.0.3 and supported ESLint 10 instead of ignoring peer dependency checks. Strict type checks and calculator parity still run. Updating one tool requires validating its declared peer ranges; an install with `--force` is not a fix.

## Remaining server gate and protection

STR-009 adds a PostgreSQL service and backend dependency lock, blank-DB and upgrade migrations, missing/unsafe production configuration tests, standard error/health contract verification. STR-010/012 extend real authentication/permission negative tests. Planned API operations cannot be advertised as implemented simply because OpenAPI is valid.

Merge only after all actual checks complete successfully for the exact head SHA. Creating a workflow does not itself configure GitHub branch protection. The current repository main is unprotected; required-check enforcement needs repository administration access, which the connected app does not expose. Our authorized merge workflow still verifies checks explicitly. This limitation remains recorded rather than claimed away.
