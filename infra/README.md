# Infrastructure boundary

Development services and provider-neutral deployment belong here (STR-008/009/037). No cloud resources are provisioned. Serve public pages and the authenticated app behind one origin, forward `/api/` to Django and allow SPA fallback only for non-API navigation; API/file failures must never return the public index HTML.

Production preparation: [runbook](../docs/runbooks/PRODUCTION.md), [pre-purchase status](../docs/runbooks/PREPARATION_STATUS_FA.md), `compose.production.yml`, `Caddyfile`, `Dockerfile.web`, `Dockerfile.api`, `Dockerfile.postgres` and `.env.production.example`. Validate structure without Docker using `npm run check:deployment`. These templates require staging build/runtime evidence before launch. Do not run Docker on the current company computer.
