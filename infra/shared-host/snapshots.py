"""Consistent stopped-writer snapshots, encrypted off-host backup and isolated drills."""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import time
import secrets

from configuration import read_env, SECRET_FILES, write_env

RESTIC_IMAGE = 'restic/restic:0.18.0'
FILE_IMAGE = 'alpine:3.22'
WRITERS = ('stratino-api', 'mazeduneh-api')


def private_directory(root):
    return Path(read_env(root / 'release.env')['HOST_SECRETS_DIR'])


def restic(root, execute, arguments, mounts=()):
    settings = private_directory(root) / 'restic.env'
    if not read_env(settings).get('RESTIC_REPOSITORY'):
        raise ValueError('Configure the off-host backup repository first.')
    mount_args = []
    for mount in mounts:
        mount_args.extend(['--mount', mount])
    return execute(['docker', 'run', '--rm', '--env-file', str(settings), *mount_args, RESTIC_IMAGE, *arguments])


@contextmanager
def backup_lock(private):
    import fcntl
    with (private / 'backup.lock').open('a') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def capture_database(compose, app, destination):
    with destination.open('xb') as stream:
        compose('exec', '-T', f'{app}-db', 'sh', '-c',
                'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc', stdout=stream)


def capture_files(execute, project, volume, destination, name):
    volume_name = f'{project}_{volume}'
    execute(['docker', 'volume', 'inspect', volume_name], capture_output=True)
    execute(['docker', 'run', '--rm', '--network', 'none', '--mount', f'type=volume,src={volume_name},dst=/source,readonly',
             '--mount', f'type=bind,src={destination},dst=/snapshot', FILE_IMAGE,
             'tar', '-czf', f'/snapshot/{name}', '-C', '/source', '.'])


def snapshot_manifest(directory, release):
    files = {}
    for path in sorted(directory.rglob('*')):
        if path.is_file() and path != directory / 'receipt.json':
            with path.open('rb') as stream:
                files[path.relative_to(directory).as_posix()] = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'release': release, 'sha256': files, 'created_at': datetime.now(timezone.utc).isoformat()}


def backup(root, compose, execute):
    private = private_directory(root)
    with backup_lock(private):
        return capture_and_upload(root, private, compose, execute)


def capture_and_upload(root, private, compose, execute):
    public = read_env(root / 'release.env')
    if not read_env(private / 'restic.env').get('RESTIC_REPOSITORY'):
        raise ValueError('Off-host repository required; no writers were stopped.')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    destination = private / 'snapshots' / stamp
    destination.mkdir(parents=True, mode=0o700)
    running = compose('ps', '--status', 'running', '--services', capture_output=True, text=True).stdout.split()
    restart = [service for service in WRITERS if service in running]
    # Stop all application writers before either database or file snapshot begins.
    try:
        compose('stop', '--timeout', '90', *WRITERS)
        capture_database(compose, 'stratino', destination / 'stratino.dump')
        capture_database(compose, 'mazeduneh', destination / 'mazeduneh.dump')
        capture_files(execute, public['COMPOSE_PROJECT_NAME'], 'stratino-files', destination, 'stratino-files.tar.gz')
        capture_files(execute, public['COMPOSE_PROJECT_NAME'], 'mazeduneh-media', destination, 'mazeduneh-media.tar.gz')
        keys = destination / 'private'
        keys.mkdir(mode=0o700)
        for name in SECRET_FILES:
            if name != 'restic.env':  # Recovery password must live outside its own encrypted repository.
                shutil.copyfile(private / name, keys / name)
                os.chmod(keys / name, 0o600)
        receipt = snapshot_manifest(destination, json.loads((root / 'release.json').read_text()))
        (destination / 'receipt.json').write_text(json.dumps(receipt, indent=2))
    finally:
        if restart:
            compose('start', *restart)
    restic(root, execute, ['backup', '/snapshot', '--tag', 'businesses'],
           [f'type=bind,src={destination},dst=/snapshot,readonly'])
    (private / 'last-backup.json').write_text(json.dumps({'uploaded_at': datetime.now(timezone.utc).isoformat()}))
    # Keep failed plaintext captures private for diagnosis. Delete only our successful capture.
    shutil.rmtree(destination)
    print('Encrypted off-host snapshot uploaded. A restore drill is still required.')


def verify_capture(directory):
    receipt = json.loads((directory / 'receipt.json').read_text())
    required = {'stratino.dump', 'mazeduneh.dump', 'stratino-files.tar.gz', 'mazeduneh-media.tar.gz'}
    if not required.issubset(receipt.get('sha256', {})):
        raise ValueError('Incomplete backup manifest.')
    for name, expected in receipt['sha256'].items():
        path = (directory / name).resolve()
        if not path.is_relative_to(directory.resolve()) or not path.is_file():
            raise ValueError('Snapshot manifest points outside the capture.')
        with path.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != expected:
                raise ValueError('Snapshot checksum mismatch.')


def extract_files(archive, destination):
    with tarfile.open(archive) as package:
        for member in package.getmembers():
            if member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
                raise ValueError('File snapshot contains an unsupported link or device.')
            if not (destination / member.name).resolve().is_relative_to(destination.resolve()):
                raise ValueError('File snapshot path escapes its destination.')
        package.extractall(destination, filter='data')


def verify_database(execute, dump, name, scratch):
    env_path = scratch / f'{name}.env'
    write_env(env_path, dict(POSTGRES_USER='restore_admin', POSTGRES_PASSWORD=secrets.token_hex(32), POSTGRES_DB='restored'))
    execute(['docker', 'run', '-d', '--name', name, '--network', 'none', '--env-file', str(env_path), 'postgres:17.11'])
    try:
        for attempt in range(30):
            try:
                execute(['docker', 'exec', name, 'pg_isready', '-U', 'restore_admin', '-d', 'restored'], capture_output=True)
                break
            except subprocess.CalledProcessError:
                if attempt == 29:
                    raise
                time.sleep(1)
        with dump.open('rb') as stream:
            execute(['docker', 'exec', '-i', name, 'pg_restore', '--exit-on-error', '--clean', '--if-exists', '--no-owner', '--no-privileges',
                     '-U', 'restore_admin', '-d', 'restored'], stdin=stream)
        restored = execute(['docker', 'exec', name, 'psql', '-U', 'restore_admin', '-d', 'restored', '-tAc',
                            "SELECT count(*) FROM pg_tables WHERE schemaname='public'"], capture_output=True, text=True)
        if not restored.stdout.strip().isdigit() or int(restored.stdout.strip()) == 0:
            raise ValueError('Restored database has no application tables.')
    finally:
        execute(['docker', 'rm', '-f', '-v', name])  # Only the unique, network-isolated drill container.


def restore_drill(root, execute, snapshot):
    if not re.fullmatch(r'[a-f0-9]{8,64}', snapshot):
        raise ValueError('Pass an exact restic snapshot ID, never latest or a path.')
    scratch = private_directory(root) / 'restore-drills' / secrets.token_hex(12)
    scratch.mkdir(parents=True, mode=0o700)
    restic(root, execute, ['restore', snapshot, '--target', '/restore'], [f'type=bind,src={scratch},dst=/restore'])
    capture = scratch / 'snapshot'
    verify_capture(capture)
    for app, filename in [('stratino', 'stratino-files.tar.gz'), ('mazeduneh', 'mazeduneh-media.tar.gz')]:
        extract_files(capture / filename, scratch / f'{app}-files')
        verify_database(execute, capture / f'{app}.dump', f'businesses-drill-{app}-{secrets.token_hex(8)}', scratch)
    print('Checksums, safe file extraction and both isolated PostgreSQL restores passed.')
    print('Retain this private drill evidence; authenticated file/order/application acceptance is still required.')
