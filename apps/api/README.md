# API boundary

STR-009 implements the Django 5.2 LTS / DRF foundation and a PostgreSQL-only database. Email-based UUID users and migrations establish ownership identity before STR-010; there are no login, registration, workspace or upload endpoints yet. Business API operations remain planned in the OpenAPI design contract.

From the repository root, copy `.env.example` to an ignored `.env` and generate independent local values for `POSTGRES_PASSWORD` and `DJANGO_SECRET_KEY` (at least 50 random characters). With Docker Compose installed:

```sh
docker compose --env-file .env -f infra/compose.dev.yml build api
docker compose --env-file .env -f infra/compose.dev.yml up -d --wait db mailpit
docker compose --env-file .env -f infra/compose.dev.yml run --rm api python manage.py migrate --noinput
docker compose --env-file .env -f infra/compose.dev.yml up -d --wait api
```

API readiness: `http://127.0.0.1:8000/api/v1/health/ready`; email catcher: `http://127.0.0.1:8025`. Database has no published port; service networking is internal. Mailpit has no relay configured. Every API response is private/no-store. Private bytes live in a named volume with no public media route or storage URL. This storage is a development foundation; workspace download authorization and file quarantine arrive in STR-023.

`health/live` checks the process; `health/ready` requires PostgreSQL connectivity and all migrations applied. Neither reveals database/credential/version details. Production rejects debug mode, absent/weak secrets, wildcard hosts and insecure database settings. These checks do not by themselves make the application ready for production. A deployment needs email, proxy, permissions, backups, and the later release gates.

For a native Python 3.12 environment use `pip install --require-hashes -r apps/api/requirements.txt`, set PostgreSQL environment variables, and run commands from `apps/api`. Regenerate the universal hashed lock with `uv pip compile apps/api/requirements.in --python-version 3.12 --universal --generate-hashes -o apps/api/requirements.txt`.

The API CI job builds the exact Compose services, migrates an empty database and checks a repeat/upgrade, runs database and negative boundary tests, checks safe production settings, sends only synthetic mail to Mailpit, and checks private bytes after an API restart. Local Docker is not available in the recovery environment; final CI results must be recorded before completing STR-009.

Stop with `docker compose --env-file .env -f infra/compose.dev.yml down` to retain data. Do not use `--volumes` on personal data. Use a distinct Compose project name and API/mail ports for each ref. The Windows two-ref integration remains in STR-008. Reverting code cannot downgrade an existing migrated database: retain a backup and test migration rollback first.
