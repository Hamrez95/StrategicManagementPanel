# One host, two independent businesses

Prepared 2026-11-02 for a small initial audience. This is a deployable source package,
not evidence of a purchased host, live cutover, delivered SMTP, a real payment or restore.
Do not run Docker on the company computer. Linux commands below are for the future host.

## Selected base configuration

- One Linux x86-64 VPS, initially **4 vCPU, 8 GiB RAM, 100 GiB SSD**, with an upgrade path.
  This is a starting estimate, not a concurrent-user or latency guarantee. Runtime caps
  total 6,464 MiB; leave the remaining RAM for Linux, Docker and transient work.
  Do image builds on a separate builder/CI, or while the applications are stopped.
  Each PostgreSQL instance starts with 64 MiB shared buffers / 40 connections; the
  Mazeduneh pool is capped at 20 connections. Raise limits/workers only after measuring.
- One public Caddy edge on TCP 80/443. Cloudflare stays on Full (strict). The edge trusts
  only the reviewed official Cloudflare IP ranges and overwrites forwarding headers.
  The origin also works DNS-only for initial TLS verification; API ports are never public.
- Independent PostgreSQL processes, volumes, application roles, administrators, passwords,
  TLS certificates and private networks for each app. Neither app joins the other's data network.
- Persistent local Mazeduneh media and private Stratino files; no object-storage server or
  Redis is required on day one. Both applications retain their existing S3 migration paths.
- ClamAV included with a 4 GiB cap. Unavailable scanning still blocks Stratino uploads.
- SMTP with verified sender and STARTTLS on 587; no mailbox/SMTP server to administer on the VPS.
- Daily consistent, encrypted restic backup to an **off-host** repository, including both
  databases, both file volumes and application recovery keys. The encryption password
  must also live in the owner's password manager, independently of the server/repository.
- Five-minute readiness checks and backup-age/disk checks notify the owner only on changes.
  Backup failures have their own alert. A separate external uptime monitor is still needed
  to detect total server/network failure; a dead server cannot notify about itself.

References: [ClamAV memory](https://docs.clamav.net/manual/Installing/Docker.html),
[Caddy proxy trust](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy),
[restic restore](https://restic.readthedocs.io/en/v0.18.0/050_restore.html).

## Domains and release behavior

| Address | Destination |
| --- | --- |
| `mazeduneh.ir` | Production Next.js server, live API mode, demo/static-export disabled |
| `www.mazeduneh.ir` | Redirect to HTTPS apex, preserving path/query |
| `api.mazeduneh.ir` | .NET API; local media is served through the application |
| `admin.mazeduneh.ir` | Secure Flutter Web entry point |
| `stratino.ir` | Website, Academy and authenticated application; API/static routing on the same origin |
| `www.stratino.ir` | Redirect to HTTPS apex, preserving path/query |

Do not point any production DNS at this host until restricted staging passes. Keep the
current Mazeduneh Pages preview unchanged until the deliberate cutover. Add proxied A
records only after the actual server IPv4 is known; add AAAA only after IPv6 is verified.
The `www` aliases/redirects already exist in Cloudflare. DNS delegation activation remains
independent of this package. No fabricated IP address is included.

Academy is built in with its existing access rules and free samples. Stratino checkout
remains disabled in application settings. Mazeduneh sandbox payment is disabled and no
real merchant is invented. No pricing, inventory, legal terms or customer records are seeded.

## Produce an immutable bundle (development machine or CI)

Both checkouts must be clean and committed. Use the intended, reviewed release branches:

```sh
node scripts/bundle-shared-host.mjs /path/to/Mazeduneh /new/output/path python3
```

The bundle contains both Git source archives, safely extracted build contexts, public host
configuration and a `release.json` with full commit SHAs and archive SHA-256 digests.
It excludes ignored local files, credentials and dependency caches. It refuses overwrite.
Never edit a release in place; produce another directory for the next release.

The manual GitHub workflow **Build shared-host release package** accepts a reviewed
Mazeduneh full SHA and pins Stratino to the workflow's commit. It builds sequentially
on the CI builder without runtime credentials and returns `shared-release.tar.gz`,
`images.tar.gz` and `SHA256SUMS` (three-day artifact retention). Download/retain the
approved artifacts, verify `sha256sum -c SHA256SUMS`, and `docker load -i images.tar.gz`
on the future host. This avoids building Flutter, Next and .NET on the small live VPS.
The manual image workflow has not been dispatched during this preparation.

## First host setup

Prerequisites: trusted Linux x86-64 host, Docker Engine and Compose **2.30+** (raw env files),
Python **3.11+**, correct time synchronization, SSH keys, restricted SSH ingress, provider
console/recovery access and a plan for security updates. Only 80/443 should be public for
the app. Review Docker firewall behavior at the provider firewall; publishing a database
or assuming a host firewall automatically blocks Docker ports is not acceptable.

Place the bundle at `/srv/businesses/releases/<release-id>`, with `/srv/businesses/current`
pointing at that directory. Preserve `/srv/businesses/private` across upgrades; app keys
and passwords must not be regenerated on every release. Restrict directory access to root.

```sh
cd /srv/businesses/current
python3 hostctl.py init --private-dir /srv/businesses/private
# Enter owner password and verified SMTP settings privately. No values are printed.
# Configure restic.env with a separate off-host repository and its restricted credentials.
python3 hostctl.py check
python3 hostctl.py build  # Or load the images built for exactly this release on CI/a builder.
python3 hostctl.py migrate --initial  # Refuses a nonempty database.
python3 hostctl.py bootstrap
python3 hostctl.py backup-init  # Once only for a NEW backup repository; never on each release.
python3 hostctl.py start
python3 hostctl.py smoke
```

`init` is Linux-only and refuses an existing private directory. Environment files use
literal values (no shell interpolation) and mode 0600. The private folder is mode 0700.
Owner login uses MFA. Import the Mazeduneh owner's TOTP seed from the private env file
into the authenticator; Stratino's existing bootstrap enforces its own password/MFA flow.
Never paste those keys into chat, Git, issue bodies or logs.

For an upgrade, run `python3 hostctl.py adopt --private-dir /srv/businesses/private` in
the new bundle. It reuses the installation's project name and keys and attaches the new
release SHAs without replacing an existing file. Keep the same private directory.
Keep previous images. `python3 hostctl.py migrate` captures an off-host backup before schema
changes. Migration failure requires operator review; rollback is not an automatic database
revert. Switch application images back only when schema-compatible; otherwise recover into
separate databases/volumes and validate before traffic changes.

## Backup, restore and timers

```sh
python3 hostctl.py backup
# Obtain the exact uploaded restic snapshot ID from its output/repository listing.
python3 hostctl.py restore-drill --snapshot FULL_SNAPSHOT_ID
```

Backup holds a host lock, stops both app writers, captures both databases/files and keys,
and restarts only writers that were running. Failures retain private plaintext for diagnosis;
successful uploads remove only their own plaintext capture. Watch disk space after failures.
No retention deletion is automatic. Proposed policy: 7 daily, 4 weekly and 6 monthly snapshots;
set/prune only after the owner approves retention and a restore succeeds.

The drill restores into a new private directory and unique network-isolated PostgreSQL
containers. It checks hashes, rejects archive traversal/links/devices, restores both dumps
and requires nonempty application schemas. It never targets live databases or file volumes.
It retains drill evidence. Afterward, separately validate actual authenticated downloads,
sample orders/ledger integrity and recovery-account/MFA behavior on isolated application instances.

After a manual encrypted backup, isolated restore and test notification succeed:

```sh
cp businesses-*.service businesses-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now businesses-backup.timer businesses-monitor.timer
systemctl list-timers 'businesses-*'
```

Timers use `/srv/businesses/current`, so upgrades keep the same management commands.
Backup is scheduled for 02:30 UTC with a randomized delay. The SMTP owner alert destination
is the configured Mazeduneh owner. Logs must stay private. Do not enable timers before SMTP
and off-host backup have actually been configured and verified.

## Required staging acceptance before public launch

1. Verify actual image builds, Caddy/TLS and DNS, cookie/CSRF/proxy identity, all domain routes
   and negative API/file paths. Refresh Cloudflare ranges from its official `/ips` API.
2. Test owner MFA/recovery and restricted users. Verify cross-workspace/business denials.
3. Deliver signup/reset mail to an actual inbox; verify sender-domain authentication using
   the chosen mail provider. Local Mailpit evidence is not real SMTP delivery.
4. Verify persistent media upload/read after restart. Test ClamAV with an approved scanner
   test fixture and scanner unavailable; fail closed. Do not disable scanning to save RAM.
5. For Mazeduneh, use real approved products/batches/prices, check reservation, payment
   success/cancel/retry/duplicate callback, invoice, fulfillment and stock/accounting reconciliation.
6. Run encrypted off-host backup, isolated restore, application-level recovery and an alert.
   Test a full host restart and measure RAM/disk/latency with the expected pilot load.
7. Run `python3 hostctl.py check --launch` after adding the real merchant/off-host repository.
   It is a configuration gate; it does not substitute for any acceptance test above.

## Remaining owner inputs

Server budget/region; verified transactional SMTP credentials/sender; off-host backup
account/location and retention approval; real payment merchant/registration; initial
Mazeduneh products, prices, stock and shipping rules; approval of pilot/commercial policy.
Secrets are entered privately on the eventual host, not in this repository or chat.
