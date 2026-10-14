# API boundary

STR-009 implements the Django 5.2 LTS / DRF foundation and a PostgreSQL-only database. STR-010 adds email-based UUID accounts, session authentication and account recovery. STR-011 adds account profile and preferences. STR-012 adds owner/editor/viewer Workspace authorization, private Workspace list/detail endpoints and scoped-query helpers. Workspace creation and invitation flows are in STR-013; analysis, document, attachment, search, export and job endpoints remain future work.

STR-010 adds same-origin session authentication. The browser first loads `GET /api/v1/csrf/`, then sends the `csrftoken` cookie value in `X-CSRFToken` for every account-changing request. `GET /api/v1/session/` returns the current verified account or 401. Account endpoints are `POST /api/v1/accounts/signup/`, `verify-email/`, `resend-verification/`, `login/`, `logout/`, `password-reset/request/`, and `password-reset/confirm/`. STR-011 adds authenticated `GET/PATCH /api/v1/account/profile/` and `GET/PATCH /api/v1/account/preferences/`, plus `POST /api/v1/account/email-change/` and the signed-link confirmation endpoint.

Email verification and email change use Django's timestamped signing with rotating per-user nonces; password recovery uses Django's `PasswordResetTokenGenerator`. Links carry secrets only in the URL fragment, which the browser removes before submitting the token in a POST body. Reset links expire after one hour; verification and email-change links expire after 24 hours. Password change invalidates existing Django sessions through the session auth hash. Signup, login, resend and recovery use database-backed fixed-window rate limits keyed by Django-keyed IP/email hashes. SMTP delivery retries three times with short backoff; a final failure is recorded without logging recipient, token, password or message content. Configure `STRATINO_PUBLIC_URL` to the browser's local origin so email links return to the right checkout; `run-local.ps1 -WithBackend` sets this per ref/port automatically. Mailpit remains local and does not relay email externally.

From the repository root, copy `.env.example` to an ignored `.env` and generate independent local values for `POSTGRES_PASSWORD` and `DJANGO_SECRET_KEY` (at least 50 random characters). With Docker Compose installed:

```sh
docker compose --env-file .env -f infra/compose.dev.yml build api
docker compose --env-file .env -f infra/compose.dev.yml up -d --wait db mailpit
docker compose --env-file .env -f infra/compose.dev.yml run --rm api python manage.py migrate --noinput
docker compose --env-file .env -f infra/compose.dev.yml up -d --wait api
```

API readiness: `http://127.0.0.1:8000/api/v1/health/ready`; email catcher: `http://127.0.0.1:8025`. Database has no published port; service networking is internal. Mailpit has no relay configured. Every API response is private/no-store. Private bytes live in a named volume with no public media route or storage URL. This storage is a development foundation; workspace download authorization and file quarantine arrive in STR-023.

`health/live` checks the process; `health/ready` requires PostgreSQL connectivity and all migrations applied. Neither reveals database/credential/version details. Production rejects debug mode, absent/weak secrets, wildcard hosts and insecure database settings. These checks do not by themselves make the application ready for production. A deployment needs email, proxy, permissions, backups, and the later release gates.

Workspace authorization rules and mandatory queryset helpers are documented in `modules/workspaces/README.md`. Every endpoint that returns private API data is `private, no-store`; future file downloads must repeat the membership check on every request. STR-012's negative permission, IDOR, migration and endpoint checks are deferred to the final validation batch as requested.

For a native Python 3.12 environment use `pip install --require-hashes -r apps/api/requirements.txt`, set PostgreSQL environment variables, and run commands from `apps/api`. Regenerate the universal hashed lock with `uv pip compile apps/api/requirements.in --python-version 3.12 --universal --generate-hashes -o apps/api/requirements.txt`.

The API CI job builds the exact Compose services, migrates an empty database and checks a repeat/upgrade, runs database and negative boundary tests, checks safe production settings, sends only synthetic mail to Mailpit, and checks private bytes after an API restart. Local Docker is not available in the recovery environment; final CI results must be recorded before completing STR-009.

Stop with `docker compose --env-file .env -f infra/compose.dev.yml down` to retain data. Do not use `--volumes` on personal data. Use a distinct Compose project name and API/mail ports for each ref. The Windows two-ref integration remains in STR-008. Reverting code cannot downgrade an existing migrated database: retain a backup and test migration rollback first.
