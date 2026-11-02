# Complete local development on Windows, without Docker

From PowerShell 7 at the repository root:

```powershell
.\run-local.ps1
```

Choose `Admin panel`, `Website` or `Both`. All three selections use the same connected web/API stack. The default source is freshly fetched `origin/main`, including explicit `-Refs main` and `-Refs origin/main`. A fetch failure stops the run; no old local-main fallback occurs. Your current checkout and uncommitted changes are preserved.

## What starts

- The built React app on a free loopback port starting at 4173.
- The actual Django API on a free loopback port starting at 8000.
- Portable PostgreSQL **17.11**, using a private project-local data directory and SCRAM password authentication. It does not use an existing company database or register a Windows Service.
- Mailpit **1.31.5**, SMTP starting at 11025 and an inbox UI starting at 8025. It captures account verification, reset and invitation mail locally; no relay is configured and inherited Mailpit/SMTP production settings are discarded.
- Database migrations and `sync_academy_catalog --seed-free-samples`. The catalog must return real course data before the launcher reports readiness. This preserves actual account/subscription rules; it does not unlock all paid content or fake authentication.

All services bind to `127.0.0.1`. No Docker command, machine PATH edit, firewall edit, Windows Service installation or paid service is required for this mode. The existing `-WithBackend` option explicitly selects the legacy Docker mode for other environments; do not use it on the company computer.

Prerequisites: Node.js 22.12+, Git, PowerShell 7, and an existing Python 3.11+ x64 interpreter. Pass `-PythonPath C:\path\to\python.exe` if Python is not discoverable. The launcher can reuse the interpreter from the repository's `.venv` without altering that interpreter's global packages. It creates a separate cache keyed by the selected ref's hashed requirements. Python is not installed machine-wide automatically. First run needs package/network access; later runs reuse the local dependency/tool cache.

Portable binary provenance and pinned SHA-256 values are in `scripts/native-runtime.py`: PostgreSQL comes from the [Zonky PostgreSQL binary release](https://github.com/zonkyio/embedded-postgres-binaries/releases/tag/v17.11.0) via Maven Central; Mailpit comes from its [official release](https://github.com/axllent/mailpit/releases/tag/v1.31.5). Hash mismatches fail before extraction/execution. No npm or system registry settings are changed to download them.

## Useful commands

```powershell
# Skip the menu; start the full native stack and open both entry points.
.\run-local.ps1 -Target both

# First local operator setup, only when you explicitly request it.
.\run-local.ps1 -Target admin -SetupAdmin

# A configured alternate owner can be selected explicitly.
.\run-local.ps1 -Target admin -SetupAdmin -AdminEmail hamidrezapakpour95@gmail.com

# Full API suite against a separate test database, plus real-browser content checks.
.\run-local.ps1 -Target both -VerifyApi -VerifyBrowser -NoBrowser -SmokeTest -EvidencePath test-results/native.json

# Deliberately frontend-only: connected Academy/account features will be unavailable.
.\run-local.ps1 -Target site -WebOnly
```

`-SetupAdmin` calls the existing owner-bootstrap command interactively, accepts only a configured owner, reads the temporary password privately, and never resets an existing account automatically. On first login, replace the temporary password and enroll MFA. Keys persist in the local state directory. It does not grant a superuser bypass or disable MFA. Normal users can sign up through the real app and use verification links from the printed Mailpit inbox URL.

`-VerifyApi` runs `manage.py test --noinput` in a separate Django test database on this owned cluster. It does not run Docker. `-VerifyBrowser` requires Chrome or the configured `PLAYWRIGHT_CHANNEL`; it renders the actual Academy guide and admin login, checks real catalog data and Django static routing, and saves screenshots/reports under `test-results/native-browser-<index>/`. It also creates a synthetic local account, verifies its actual Mailpit email, logs in, saves a Workspace and learning note, rereads the note and checks that logout revokes access. Those synthetic records remain only in this local development database. It uses no network mocks. These flags are optional so a normal launch does not run the entire suite each time.

## Persistence, shutdown and isolation

Each selected commit/ref slot has its own data under `.local-dev/native/data/<slot>-<commit>/`. Restarting the same commit preserves accounts, records, files, MFA keys and inbox. A new commit gets a separate database to avoid silently upgrading or downgrading another version's test data. Tool/virtual-environment caches are reused independently. Do not delete these folders if you need their data. None is committed or included in container build contexts.

Only this project's generated data directory gets a restricted NTFS DACL for the current user and SYSTEM. No machine-wide ACL or audit policy is changed. Secrets are never printed. `environment.json` contains only app settings; unrelated company/cloud environment credentials are not persisted.

Ctrl+C stops the web process, signals the native supervisor, terminates its API/Mailpit children and uses the owned cluster's `pg_ctl -m fast` to stop PostgreSQL and its children. The supervisor also watches a handle to the original launcher process so closing that launcher cannot leave the ready native services running indefinitely. It never searches for/kills unrelated PostgreSQL processes. Data is retained; temporary worktrees are removed after services stop. A locked data directory rejects a second concurrent run of that exact commit/slot. On a shutdown timeout/error, the checkout is retained and the run fails for inspection.

The printed service addresses may move when ports are occupied. Do not reuse an old browser tab's port and assume it points to the new run. Close the old frontend-only runner with Ctrl+C and open the URL printed by this run. Readiness evidence includes `backend: native`, real catalog count and service addresses, not just HTTP 200 from an HTML fallback.

## Boundaries of local confidence

Native startup covers actual web/API/database/content/session/email components. It does not claim every external integration is available:

- Antivirus is not silently mocked. If no scanner is configured, a prominent startup warning states that attachment uploads remain blocked. To test actual clean/infected-file handling, provide a working ClamAV service with `-ScannerHost 127.0.0.1 -ScannerPort 3310`. No antivirus configuration on the company computer is changed. Scanner-mocked unit tests are not a real malware-scan acceptance test.
- Google login needs a web client configured for the selected local origin. The native default leaves it disabled, without inheriting production credentials.
- Checkout/payment remains governed by the application's disabled release gate. A local stack does not enable a payment provider.
- Production TLS/proxy/certificate behavior and remote SMTP delivery still require staging. Native development intentionally uses HTTP and a loopback PostgreSQL connection; these are never production settings.

Inspect the printed run logs and the state directory's `services.log` after failure. A failed dependency install, migration, content load or service process aborts the launch instead of silently presenting a disconnected frontend.

## Recorded verification — 2026-11-01

On fetched main `f8981e7d4ac2f11fea72d105ca1e4083e098622c`, the native stack started, stopped and restarted using its retained PostgreSQL database. The full API suite ran 405 tests: 404 passed, one symlink test was skipped on Windows. The separate test database was destroyed successfully. Real Chrome rendered the guide and admin login; real HTTP/SMTP checks completed signup, captured verification mail in Mailpit, verified the account, logged in, saved a Workspace and a learning note, reread that note, and confirmed a 401 after logout. There were no browser JavaScript errors or network mocks. The run receipt recorded no remaining native/web processes or worktrees, and the PostgreSQL supervisor confirmed shutdown. Root bootstrap guard tests also passed (4 tests). A final restart/browser-flow/cleanup check passed after adding launcher-lifecycle supervision. Antivirus/production-TLS/payment-provider acceptance is not claimed by these results.

Evidence generated locally: `test-results/native-verified.json`, `test-results/native-browser-0/report.json`, and `test-results/native-browser-0/academy-guide.png`. These ignored artifacts contain synthetic test results, not production credentials.
