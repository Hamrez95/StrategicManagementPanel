# Production preparation and deployment

Scope: STR-037 preparation, with backup/security dependencies kept explicit. No server, DNS, paid service, production account, remote deployment or live email was changed. Per owner instruction, do not run Docker on the current company computer. Container files and host commands below are deliverables for a future Linux host, not evidence that they have run.

## Before buying hosting

Run from the repository root using Node.js 22.12+:

```sh
npm ci
npm run check:deployment
npm run quality
```

`check:deployment` parses the production YAML and checks network/port/logging boundaries and environment validation entirely offline. It does not invoke Docker. `quality` does not run the PostgreSQL API suite. Record actual results in PREPARATION_STATUS_FA.md; it is not a substitute for staging.

The following are prepared in source:

- Multi-stage web build and private API image with canonical Academy data.
- Same-origin Caddy routing, TLS termination, direct API/admin routing, Django static files, no public private-file volume and no SPA fallback for API/file failures.
- Production Compose template with persistent volumes, bounded logs, memory caps and restart policies. Only web publishes host ports.
- An opt-in trusted-proxy boundary preserving real client IPs for account rate limits. Caddy overwrites incoming forwarding headers. Never expose API port 8000, join untrusted containers to these networks, or put another proxy/CDN in front without reviewing this boundary.
- Local PostgreSQL TLS profile and an external PostgreSQL option. Self-hosted `require` encrypts the private-network connection but does not authenticate the server certificate. A managed connection should use provider CA verification (`verify-full`) and mount its CA at the libpq default root-cert path or extend the profile explicitly.
- Environment validator, read-only post-deployment smoke checker, consistent local-DB backup command and rollback/recovery instructions.

## Configuration and secret handling

The tracked template is `infra/.env.production.example`. Leave real credentials off this company computer. On an owner-controlled deployment machine, optionally run:

```sh
npm run prepare:production -- --init
```

This writes only `.local-dev/production.env`, refuses overwrite, generates independent cryptographic keys and does not print them. On Linux it requests mode 0600; verify NTFS ACLs if using Windows. Store the final keys in the owner's password manager and an independent encrypted recovery copy. Generate final production keys on the eventual deployment machine. Changing the MFA key without retaining old decryption keys locks out existing factors; append old keys to the key ring during rotation. Changing the Django key invalidates signed links/sessions.

Fill the domain, SMTP account/sender, database location and explicit Academy release flag. Keep the initial default `VITE_ACADEMY_PREVIEW=false` until the owner selects the release surface. Google login is optional; enabling it requires a Google web client configured for the final origin. Checkout remains disabled in application settings; no payment provider is provisioned.

```sh
npm run prepare:production -- --check .local-dev/production.env
```

The validator never contacts providers or prints secret values. Its success proves configuration shape only. The Git SHA must identify the committed release containing these changes. Do not reuse release tags for modified source. Keep web and API images from the same commit; record image IDs/digests and archive the previous release. Base tags in the build templates are not digest locks: resolve/pin reviewed base-image digests and scan dependencies/images during the future release process.

## Hosting profiles

**Managed application/database (preferred architecture direction):** build the same web/API images, provide a private ClamAV endpoint and persistent private-file storage. Route web and API under one HTTPS origin. Use external PostgreSQL with TLS, provider backups plus a tested export/recovery procedure. Omit the `database` profile and set `POSTGRES_HOST` to the private database endpoint. Platform routing must provide the equivalent header-overwriting trusted ingress, without direct public API bypass.

**One Linux VPS (fallback):** use an isolated Compose project and the `database` profile below. Keep SSH limited to keys and trusted admins, firewall public ingress to the chosen SSH port plus 80/443, enable host security updates, time synchronization and log/disk monitoring. Never reuse another product's volumes, database user, network or project name. The supplied memory caps total about 6.25 GiB, excluding host overhead and builds; size the host after a staging measurement, particularly ClamAV signature loading. The scanner cap is 4 GiB following [ClamAV's container guidance](https://docs.clamav.net/manual/Installing/Docker.html). Build elsewhere if the host cannot accommodate build peaks. On a shared VPS, give Caddy one deliberate edge entry point rather than competing products binding 80/443.

The database initialization script creates a separate non-superuser application role with schema creation rights for Django migrations. Cluster administration/backup uses `POSTGRES_ADMIN_USER` and its independent password, which are never passed to the API. Initialization runs only on a new volume; changing env values does not rotate an existing database password. For a managed database, provision the equivalent restricted application role with the provider. The existing PowerShell backup tool must be passed `-DbUser stratino_admin` for this production local-DB profile instead of its development default.

No provider, price, capacity guarantee or region is selected by this preparation.

## First deployment — future host only

Prerequisites: committed reviewed release; secure host; Docker/Compose functional there; domain A/AAAA points to the host; SMTP STARTTLS on 587 available; sender-domain SPF/DKIM/DMARC configured according to the mail provider; off-host encrypted backup destination chosen. A stale AAAA record can break certificate issuance; validate both address families. Caddy obtains/renews certificates only when DNS and ingress permit it.

These commands are intentionally manual, to keep schema changes and exposure reviewable:

```sh
# In a Bash session on the future Linux host, from repository root:
ENV_FILE="$PWD/.local-dev/production.env"
dc() { docker compose --env-file "$ENV_FILE" -f infra/compose.production.yml --profile database "$@"; }
node scripts/prepare-production.mjs --check "$ENV_FILE"
dc config --quiet
dc build
dc run --rm --no-deps web caddy validate --config /etc/caddy/Caddyfile
dc up -d --wait db
dc up -d clamav
dc run --rm --no-deps api python manage.py check --deploy --fail-level WARNING
dc run --rm --no-deps api python manage.py migrate --plan
# On an upgrade, capture a consistent backup BEFORE the following migrate.
dc run --rm --no-deps api python manage.py migrate --noinput
dc run --rm --no-deps api python manage.py migrate --check
dc run --rm --no-deps api python manage.py collectstatic --noinput
dc up -d --wait api
```

For managed PostgreSQL, omit `--profile database`, `dc up db`, and the local-database backup command. Never publish `dc config` output: it contains interpolated secrets. Use `config --quiet` for validation. No automatic migration or operator bootstrap runs in the API entrypoint.

Initially keep web behind a staging access restriction/firewall. Bootstrap each configured owner interactively with `dc run --rm --no-deps api python manage.py bootstrap_operator --email <configured-owner>`. Passwords are entered privately, not passed in arguments. Then start restricted staging web with `dc up -d web`; change each temporary password, enroll MFA and save recovery material. Run:

```sh
dc exec -T api python manage.py check_operator_readiness
dc exec -T api python manage.py audit_model_integrity --summary
node scripts/check-live-deployment.mjs https://YOUR-ACTUAL-DOMAIN
```

The readiness command requires **all** configured owner accounts, not just one. Do not disable MFA to clear this gate. Do not open public registration before the acceptance checks below pass.

## Release acceptance evidence

On synthetic accounts, record date, commit SHA, image IDs, domain and observed results, without secrets or customer content:

1. Empty database migrations, repeat migration and upgrade from the preceding release succeed. PostgreSQL API tests and migration drift checks pass on the release.
2. HTTPS does not loop behind proxy; HTTP redirects; secure CSRF/session cookies work; deep links and admin static files load. Unknown API/media/assets return failures, not SPA HTML.
3. Signup/verification, reset, email-change and invitations arrive in a real inbox with correct HTTPS links. Verify SPF/DKIM and provider delivery errors. Do not treat an SMTP connection as delivered mail.
4. Two users in different Workspaces cannot read/write/search/export/download each other's records. Viewer edits fail. A membership revocation takes effect. Login limits cannot be bypassed by forged forwarding headers and different clients do not share the proxy's limiter bucket.
5. Upload clean files, verify checksum/download permissions and persistence after restart. A scanner test file is quarantined/rejected; unavailable ClamAV fails closed. Confirm signatures have updated before uploads are offered.
6. Both owners pass MFA readiness; no test accounts/demo writes are seeded into production.
7. Backup includes database **and** private files from the same stopped-writer interval. Restore into an isolated project, validate hashes, run model integrity audit and verify real file downloads. Test a nonempty file set.
8. Restart the host/services; confirm recovery. Exercise an app rollback compatible with its schema. Measure memory, disk and latency, and trigger a test monitoring failure.

These are launch gates, not claims that all existing product features are complete. STR-031/032/033/037 remain subject to their runtime/dependency evidence.

## Backup, retention and recovery

For the local database profile, stop **all external writers/jobs** first. The command stops the API during the consistent snapshot and restarts it on exit, including failure. It refuses to overwrite an existing destination and never deletes volumes:

The future Linux host needs Bash, `realpath`, `sha256sum` and `flock` (util-linux). A project-local lock prevents overlapping runs of this backup command.

```sh
bash scripts/backup-production.sh "$ENV_FILE" /srv/stratino-backups/UNIQUE-UTC-TIMESTAMP --stop-writers
```

This captures raw sensitive data with owner-only directory permissions. It does not encrypt, transfer or prove restore. Use an owner-selected encryption tool (for example age with a separately held recovery key) and copy encrypted snapshots off-host before counting them as protected. Proposed policy for owner approval: nightly consistent snapshots, retain 7 daily + 4 weekly, and one pre-migration snapshot until upgrade acceptance. Set RPO/RTO from business needs; do not promise zero loss from daily snapshots. Schedule maintenance and cron/systemd on the future host only after a manual capture/restore succeeds. Alert on failed/missing snapshots, verify off-host copies, monitor backup disk growth, and perform a restore drill after schema/storage changes and periodically.

For an isolated restore, create a **different Compose project name**, database, DNS/access boundary and private-file volume; keep SMTP disabled or redirected to a catcher with a reviewed staging override. Verify `SHA256SUMS`; restore `database.dump` using `pg_restore --exit-on-error --no-owner --no-privileges` into the empty scratch DB. Restore files using the shipped checksum/path-validating `scripts/private_file_snapshot.py restore --archive ... --destination ...`; destination must be new. Copy the restored files into the scratch private volume with uid 10001 ownership. Apply migrations only to the scratch DB, run `audit_model_integrity --summary`, compare key record IDs/counts and validate authenticated downloads. Never point a drill at the live database or overwrite live files. The existing `scripts/backup-recovery.ps1 -TestRestore` provides an additional isolated count/ID/model/files audit for the existing local DB container topology; it is not run on this company computer.

Managed database recovery must coordinate its provider snapshot/export with the stopped-writer file snapshot. Its retention and restore capability need actual provider evidence; this package does not claim that integration is finished.

## Upgrade and rollback

Record current commit, image IDs, migration state and backup receipt. Build reviewed next-release images without overwriting old tags. Restrict writes, take a consistent verified backup, inspect `migrate --plan`, apply migrations and collect static files, then recreate API/web using matching release tags. Run smoke and acceptance checks before reopening writes.

An application rollback is allowed only if the old code is compatible with the applied schema/data. Select the saved release's `RELEASE_ID` and artifacts and recreate API/web; never rebuild an old tag from today's modified source. Shared Django static assets must be recollected for that release. A Git revert does not undo a database migration. For an incompatible migration, restore the pre-upgrade database AND files into an isolated replacement project, verify it, then deliberately switch traffic. Writes since that snapshot require a reconciliation plan; do not discard them automatically. Never use `down --volumes` on customer data.

## Operations and incidents

On the future host, configure an external monitor for HTTPS `/api/v1/health/ready` and public `/`, TLS expiry, RAM/restarts, free disk (database, files, logs and backups), SMTP failures, backup freshness and ClamAV signature health. Select an alert destination owned by the operator and prove a test failure is delivered. Container healthchecks alone do not send alerts or restart an unhealthy process. Bounded logs are provided; centralized error capture/retention and notification integration remain provider decisions. Avoid logging request bodies, credentials, email tokens, private document text or financial data. The Caddy template does not enable access logging of URLs.

For an incident: restrict traffic/writes, record the affected release and sanitized evidence, preserve logs/backups with limited access, revoke compromised sessions/credentials through the appropriate operator flow, recover on an isolated target and verify boundaries before reopening. Keep previous MFA decryption keys until rotation and recovery are verified. Review any required customer communication separately; this runbook sends no messages.

References: [Django deployment checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/), [Django proxy trust](https://docs.djangoproject.com/en/5.2/ref/settings/#secure-proxy-ssl-header), [Caddy routing](https://caddyserver.com/docs/caddyfile/directives/route), [Caddy forwarded headers](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers).
