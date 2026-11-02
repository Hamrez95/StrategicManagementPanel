#!/usr/bin/env bash
# Future Linux host only. This file is not executed during offline preparation.
set -euo pipefail
umask 077
if [[ $# != 3 || "$3" != --stop-writers ]]; then
    echo 'Usage: bash scripts/backup-production.sh /absolute/production.env /absolute/new-backup-dir --stop-writers' >&2
    exit 2
fi
project_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
env_file=$(realpath -- "$1")
backup_dir=$(realpath -m -- "$2")
if [[ -e "$backup_dir" || "$backup_dir" == "$project_root" || "$backup_dir" == / ]]; then
    echo 'Backup destination must be a new, dedicated directory.' >&2
    exit 2
fi
compose=(docker compose --env-file "$env_file" -f "$project_root/infra/compose.production.yml" --profile database)
mkdir -p -- "$project_root/.local-dev"
exec 9> "$project_root/.local-dev/backup.lock"
if ! flock -n 9; then
    echo 'Another production snapshot is already running.' >&2
    exit 1
fi
# This implementation intentionally fails for managed databases: use their consistent
# snapshot/export workflow, keeping all app writers stopped until files are captured.
"${compose[@]}" exec -T api python -c 'import os; assert os.environ["POSTGRES_HOST"] == "db", "Use the managed database backup runbook"'
if [[ -z "$("${compose[@]}" ps --status running -q api)" ]]; then
    echo 'A running source API is required.' >&2
    exit 1
fi
mkdir -m 700 -- "$backup_dir"
restart_required=0
restart_api() {
    if [[ "$restart_required" == 1 ]]; then
        "${compose[@]}" start api
    fi
}
trap restart_api EXIT
restart_required=1
"${compose[@]}" stop --timeout 90 api
"${compose[@]}" exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_dir/database.dump"
"${compose[@]}" run --rm --no-deps --user 0 -v "$backup_dir:/snapshot" api \
    python scripts/private_file_snapshot.py create --root /private-files --output /snapshot/private-files.tar.gz --quiesced \
    > "$backup_dir/files-receipt.json"
(cd -- "$backup_dir" && sha256sum database.dump private-files.tar.gz > SHA256SUMS)
"${compose[@]}" start api
restart_required=0
"${compose[@]}" up -d --no-deps --wait api
printf 'Snapshot captured. Encrypt and copy off-host; restore has NOT been verified by this command.\n'
