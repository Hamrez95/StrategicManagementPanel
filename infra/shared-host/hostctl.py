#!/usr/bin/env python3
"""Linux-only operator commands for the bundled, single-server release."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

from configuration import adopt, initialize, read_env, validation_errors

ROOT = Path(__file__).resolve().parent


def execute(arguments, **options):
    return subprocess.run(arguments, check=True, **options)


def compose(*arguments, **options):
    return execute(['docker', 'compose', '--env-file', str(ROOT / 'release.env'),
                    '-f', str(ROOT / 'compose.yaml'), *arguments], cwd=ROOT, **options)


def check(launch=False):
    errors = validation_errors(ROOT, launch)
    if errors:
        raise ValueError('\n'.join(errors))
    compose('config', '--quiet')
    print('Configuration passed. Live TLS, email, payment, scanner and restore acceptance remain separate.')


def migrate(initial):
    compose('up', '-d', '--wait', 'stratino-db', 'mazeduneh-db')
    if initial:
        for app in ('stratino', 'mazeduneh'):
            result = compose('exec', '-T', f'{app}-db', 'sh', '-c',
                             'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname=\'public\'"',
                             capture_output=True, text=True)
            if result.stdout.strip() != '0':
                raise ValueError('--initial requires empty databases. Use migrate without --initial for an upgrade with backup.')
    else:
        from snapshots import backup
        backup(ROOT, compose, execute)
    compose('run', '--rm', '--no-deps', 'stratino-api', 'python', 'manage.py', 'migrate', '--plan')
    compose('run', '--rm', '--no-deps', 'stratino-api', 'python', 'manage.py', 'migrate', '--noinput')
    compose('run', '--rm', '--no-deps', 'stratino-api', 'python', 'manage.py', 'collectstatic', '--noinput')
    compose('run', '--rm', '--no-deps', 'mazeduneh-api', '--migrate')


def start():
    compose('up', '-d', '--wait', 'stratino-db', 'mazeduneh-db')
    compose('up', '-d', 'clamav', 'stratino-api', 'stratino-web', 'mazeduneh-api', 'mazeduneh-web', 'mazeduneh-admin')
    compose('run', '--rm', '--no-deps', 'edge', 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile')
    compose('up', '-d', 'edge')
    print('Services started. Keep ingress restricted to staging until the acceptance checklist passes.')


def bootstrap():
    compose('run', '--rm', '--no-deps', 'mazeduneh-api', '--seed-admin')
    compose('run', '--rm', '--no-deps', 'stratino-api', 'python', 'manage.py', 'bootstrap_operator',
            '--email', 'hamidrezaprogramming95@gmail.com')
    compose('run', '--rm', '--no-deps', 'stratino-api', 'python', 'manage.py', 'sync_academy_catalog', '--seed-free-samples')
    print('Bootstrap completed. Import the private Mazeduneh TOTP seed; enroll Stratino MFA and save recovery codes.')


def smoke():
    checks = [('https://stratino.ir/', 200), ('https://stratino.ir/api/v1/health/ready', 200),
              ('https://stratino.ir/api/v1/session/', 401), ('https://mazeduneh.ir/', 200),
              ('https://admin.mazeduneh.ir/', 200), ('https://api.mazeduneh.ir/health/ready', 200)]
    for url, expected in checks:
        try:
            with urllib.request.urlopen(url, timeout=15) as response:
                status = response.status
        except urllib.error.HTTPError as error:
            status = error.code
        if status != expected:
            raise ValueError(f'Unexpected HTTP status for {url}: {status}')
        print(f'PASS {url}: {status}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['init', 'adopt', 'check', 'build', 'migrate', 'bootstrap', 'start', 'status', 'stop', 'smoke', 'backup', 'backup-init', 'restore-drill'])
    parser.add_argument('--private-dir')
    parser.add_argument('--initial', action='store_true')
    parser.add_argument('--launch', action='store_true')
    parser.add_argument('--snapshot')
    args = parser.parse_args()
    if sys.platform != 'linux':
        raise ValueError('Run host commands on the trusted Linux deployment host. No Docker command was invoked.')
    if args.action in ('init', 'adopt'):
        if not args.private_dir:
            raise ValueError('init requires --private-dir outside the release bundle')
        return initialize(ROOT, args.private_dir) if args.action == 'init' else adopt(ROOT, args.private_dir)
    if args.action == 'status':
        return compose('ps')
    if args.action == 'stop':
        return compose('stop')  # Preserve containers, volumes and credentials.
    check(args.launch)
    if args.action == 'check':
        return
    if args.action == 'build':
        return compose('build', '--pull')
    if args.action == 'migrate':
        return migrate(args.initial)
    if args.action == 'start':
        return start()
    if args.action == 'bootstrap':
        return bootstrap()
    if args.action == 'smoke':
        return smoke()
    from snapshots import backup, restic, restore_drill
    if args.action == 'backup-init':
        return restic(ROOT, execute, ['init'])
    if args.action == 'backup':
        return backup(ROOT, compose, execute)
    if not args.snapshot:
        raise ValueError('restore-drill requires an exact --snapshot ID')
    return restore_drill(ROOT, execute, args.snapshot)


if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, subprocess.CalledProcessError) as error:
        # Environment and command output may contain credentials; never echo them.
        print(f'Operation failed ({type(error).__name__}). Review configuration or service logs privately.', file=sys.stderr)
        sys.exit(1)
