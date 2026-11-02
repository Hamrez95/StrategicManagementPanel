"""Own one persistent local cluster and short-lived API/inbox processes. No services or Docker."""
import argparse
import hashlib
import io
import json
import os
import secrets
import socket
import subprocess
import sys
import tarfile
import time
import urllib.request
from contextlib import ExitStack
from pathlib import Path
from zipfile import ZipFile

import psycopg
from psycopg import sql
from cryptography.fernet import Fernet

PG_URL = 'https://repo.maven.apache.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/17.11.0/embedded-postgres-binaries-windows-amd64-17.11.0.jar'
PG_SHA256 = '98040fae18dd9633ff95932125b0cecf0a45a1a9312e216e2a33ad03a31d4251'
MAILPIT_URL = 'https://github.com/axllent/mailpit/releases/download/v1.31.5/mailpit-windows-amd64.zip'
MAILPIT_SHA256 = '9637e21c02b33185fe69268ba05317152a5d8ac7877115e8a70e29b7e199e8dc'
ROOT = Path(__file__).resolve().parent.parent


class ParentProcess:
    """Hold the launcher's process handle so PID reuse cannot keep an orphan alive."""
    def __init__(self, pid):
        import ctypes
        from ctypes import wintypes
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.kernel.OpenProcess.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
        self.kernel.OpenProcess.restype = wintypes.HANDLE
        self.kernel.WaitForSingleObject.argtypes = (wintypes.HANDLE, wintypes.DWORD)
        self.kernel.CloseHandle.argtypes = (wintypes.HANDLE,)
        self.handle = self.kernel.OpenProcess(0x00100000, False, pid)  # SYNCHRONIZE only.
        if not self.handle:
            raise RuntimeError('Cannot track the launcher process safely.')

    def alive(self):
        return self.kernel.WaitForSingleObject(self.handle, 0) == 258  # WAIT_TIMEOUT.

    def close(self):
        self.kernel.CloseHandle(self.handle)


def save_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value), encoding='utf-8')
    temporary.chmod(0o600)
    temporary.replace(path)


def verified_download(url, archive, checksum):
    if not archive.exists():
        print(f'Downloading {archive.name} (first run only)...', flush=True)
        partial = archive.with_suffix('.download')
        with urllib.request.urlopen(url, timeout=30) as response, partial.open('wb') as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        partial.replace(archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != checksum:
        raise RuntimeError('Native tool archive checksum mismatch. No binary was executed.')


def postgres_tools():
    if sys.platform != 'win32':
        raise RuntimeError('The portable native runner currently supports Windows x64 only.')
    tools = ROOT / '.local-dev/native/tools'
    tools.mkdir(parents=True, exist_ok=True)
    destination = tools / 'postgres-17.11'
    marker = destination / '.verified'
    if marker.exists() and marker.read_text() == PG_SHA256:
        return destination / 'bin'
    archive = tools / 'postgres-17.11.jar'
    verified_download(PG_URL, archive, PG_SHA256)
    destination.mkdir(exist_ok=True)
    with ZipFile(archive) as package:
        with tarfile.open(fileobj=io.BytesIO(package.read('postgres-windows-x86_64.txz')), mode='r:xz') as binary:
            binary.extractall(destination, filter='data')
    for name in ('postgres.exe', 'initdb.exe', 'pg_ctl.exe'):
        if not (destination / 'bin' / name).is_file():
            raise RuntimeError('Incomplete PostgreSQL archive.')
    marker.write_text(PG_SHA256)
    return destination / 'bin'


def mailpit_tool():
    tools = ROOT / '.local-dev/native/tools'
    tools.mkdir(parents=True, exist_ok=True)
    archive = tools / 'mailpit-1.31.5.zip'
    verified_download(MAILPIT_URL, archive, MAILPIT_SHA256)
    destination = tools / 'mailpit-1.31.5/mailpit.exe'
    if not destination.exists():
        destination.parent.mkdir(exist_ok=True)
        with ZipFile(archive) as package:
            destination.write_bytes(package.read('mailpit.exe'))
    return destination


MANAGED_PREFIXES = ('DJANGO_', 'STRATINO_', 'POSTGRES_', 'EMAIL_', 'CLAMAV_', 'GOOGLE_')


def base_environment():
    return {key: value for key, value in os.environ.items() if not key.startswith(MANAGED_PREFIXES + ('MP_',))}


def environment_for(state, checkout, args):
    secret_file = state / 'secrets.json'
    if not secret_file.exists():
        save_json(secret_file, {'django': secrets.token_hex(64), 'postgres': secrets.token_hex(32), 'mfa': Fernet.generate_key().decode()})
    keys = json.loads(secret_file.read_text())
    # Never inherit production settings, SMTP relay credentials or external Google auth.
    env = base_environment()
    env.update(STRATINO_ENV='development', DJANGO_DEBUG='1', DJANGO_SECRET_KEY=keys['django'],
               DJANGO_ALLOWED_HOSTS='127.0.0.1,localhost', STRATINO_OPERATOR_MFA_KEYS=keys['mfa'],
               STRATINO_OPERATOR_MFA_OPTIONAL_IN_DEVELOPMENT='0', STRATINO_ALLOW_TEST_ACCOUNT='1',
               POSTGRES_DB='stratino', POSTGRES_USER='stratino', POSTGRES_PASSWORD=keys['postgres'],
               POSTGRES_HOST='127.0.0.1', POSTGRES_PORT=str(args.db_port), POSTGRES_SSLMODE='disable',
               EMAIL_HOST='127.0.0.1', EMAIL_PORT=str(args.smtp_port), EMAIL_HOST_USER='', EMAIL_HOST_PASSWORD='',
               DEFAULT_FROM_EMAIL='local@stratino.test', GOOGLE_OAUTH_CLIENT_ID='',
               STRATINO_PUBLIC_URL=f'http://127.0.0.1:{args.web_port}',
               DJANGO_CSRF_TRUSTED_ORIGINS=f'http://127.0.0.1:{args.web_port}',
               STRATINO_PRIVATE_FILES=str(state / 'private-files'),
               STRATINO_ACADEMY_ROOT=str(checkout / 'docs/learning-design'),
               CLAMAV_HOST=args.scanner_host, CLAMAV_PORT=str(args.scanner_port),
               PYTHONUTF8='1', PYTHONUNBUFFERED='1')
    (state / 'private-files').mkdir(exist_ok=True)
    return env


def wait_http(url, process, *, timeout=90):
    deadline = time.monotonic() + timeout
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('A local service exited. Inspect its local log.')
        try:
            with opener.open(url, timeout=2) as response:
                return json.load(response)
        except (OSError, ValueError):
            time.sleep(0.3)
    raise RuntimeError('Local service readiness timed out.')


def start_postgres(binary, state, env, stack, processes, log):
    data = state / 'database'
    password_file = state / 'postgres.password'
    if not (data / 'PG_VERSION').exists():
        password_file.write_text(env['POSTGRES_PASSWORD'], encoding='ascii')
        password_file.chmod(0o600)
        subprocess.run([str(binary / 'initdb.exe'), '-D', str(data), '-U', 'stratino', '-A', 'scram-sha-256',
                        '--pwfile', str(password_file), '--encoding=UTF8', '--locale=C'], check=True, stdout=log, stderr=log, env=env, timeout=120)
        password_file.unlink()
    process = subprocess.Popen([str(binary / 'postgres.exe'), '-D', str(data), '-h', '127.0.0.1', '-p', env['POSTGRES_PORT']],
                               stdout=log, stderr=log, env=env)
    processes.append(process)
    # pg_ctl stops the postmaster AND its children; never kill unrelated postgres processes.
    stack.callback(stop_postgres, binary, data, log, process)
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('Local PostgreSQL exited. No system database was used.')
        try:
            with psycopg.connect(host='127.0.0.1', port=env['POSTGRES_PORT'], user='stratino',
                                 password=env['POSTGRES_PASSWORD'], dbname='postgres', connect_timeout=2, sslmode='disable', autocommit=True) as db:
                if not db.execute('SELECT 1 FROM pg_database WHERE datname=%s', ('stratino',)).fetchone():
                    db.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier('stratino')))
            return
        except psycopg.OperationalError:
            time.sleep(0.3)
    raise RuntimeError('Local PostgreSQL did not become ready.')


def stop_postgres(binary, data, log, process):
    if process.poll() is None:
        subprocess.run([str(binary / 'pg_ctl.exe'), '-D', str(data), '-m', 'fast', '-w', '-t', '30', 'stop'],
                       stdout=log, stderr=log, check=True, timeout=40)
        process.wait(timeout=10)


def stop_process(process):
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=15)


def start_process(command, env, cwd, log, stack, processes):
    process = subprocess.Popen(command, env=env, cwd=cwd, stdout=log, stderr=log)
    processes.append(process)
    stack.callback(stop_process, process)
    return process


def run(args):
    import msvcrt
    state, checkout = Path(args.state).resolve(), Path(args.checkout).resolve()
    state.mkdir(parents=True, exist_ok=True)
    with (state / 'runtime.lock').open('a+b') as lock, ExitStack() as stack:
        parent = ParentProcess(args.parent_pid or os.getppid())
        stack.callback(parent.close)
        lock.seek(0)
        lock.write(b'0')
        lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as error:
            raise RuntimeError('This local database is already in use by another run.') from error
        env = environment_for(state, checkout, args)
        # Persist only this app's settings, never unrelated company/cloud credentials.
        stored = {key: value for key, value in env.items() if key.startswith(MANAGED_PREFIXES) or key == 'DEFAULT_FROM_EMAIL'}
        save_json(state / 'environment.json', {'env': stored, 'checkout': str(checkout)})
        binary = postgres_tools()
        mailpit = mailpit_tool()
        if not parent.alive():
            raise RuntimeError('The launcher closed during native preparation.')
        processes = []
        logs = stack.enter_context((state / 'services.log').open('a', encoding='utf-8'))
        start_postgres(binary, state, env, stack, processes, logs)
        inbox = start_process([str(mailpit), '--listen', f'127.0.0.1:{args.mail_port}', '--smtp', f'127.0.0.1:{args.smtp_port}',
                               '--database', str(state / 'mailpit.db'), '--disable-version-check', '--smtp-disable-rdns'], env, ROOT, logs, stack, processes)
        wait_http(f'http://127.0.0.1:{args.mail_port}/api/v1/messages', inbox)
        manage = [sys.executable, str(checkout / 'apps/api/manage.py')]
        for command in (['migrate', '--noinput'], ['sync_academy_catalog', '--seed-free-samples']):
            if not parent.alive():
                raise RuntimeError('The launcher closed during native startup.')
            subprocess.run(manage + command, cwd=checkout / 'apps/api', env=env, stdout=logs, stderr=logs, check=True, timeout=240)
        api = start_process(manage + ['runserver', f'127.0.0.1:{args.api_port}', '--noreload'], env, checkout / 'apps/api', logs, stack, processes)
        wait_http(f'http://127.0.0.1:{args.api_port}/api/v1/health/ready', api)
        catalog = wait_http(f'http://127.0.0.1:{args.api_port}/api/v1/academy/catalog/', api)
        if not catalog.get('courses'):
            raise RuntimeError('The Academy API returned an empty catalog.')
        save_json(Path(args.ready), {'database': 'PostgreSQL 17.11', 'api': True, 'catalogCourses': len(catalog['courses']),
                                     'mailUrl': f'http://127.0.0.1:{args.mail_port}', 'scannerConfigured': bool(args.scanner_host), 'state': str(state)})
        print('Native API, PostgreSQL, Academy content and local email are ready.', flush=True)
        while not Path(args.stop).exists() and parent.alive():
            if any(process.poll() is not None for process in processes):
                raise RuntimeError('A native service stopped unexpectedly. Inspect services.log.')
            time.sleep(0.3)
    save_json(state / 'last-stop.json', {'stopped': True})


def manage(args):
    state = Path(args.state).resolve()
    data = json.loads((state / 'environment.json').read_text())
    env = data['env']
    if env.get('STRATINO_ENV') != 'development' or env.get('POSTGRES_HOST') != '127.0.0.1':
        raise RuntimeError('Native management commands are restricted to the local development database.')
    arguments = args.arguments[1:] if args.arguments[:1] == ['--'] else args.arguments
    return subprocess.call([sys.executable, str(Path(data['checkout']) / 'apps/api/manage.py'), *arguments],
                           cwd=Path(data['checkout']) / 'apps/api', env={**base_environment(), **env, 'PYTHONUTF8': '1'})


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='operation', required=True)
    start = sub.add_parser('run')
    for name in ('state', 'checkout', 'ready', 'stop'):
        start.add_argument('--' + name, required=True)
    for name in ('web-port', 'api-port', 'db-port', 'smtp-port', 'mail-port'):
        start.add_argument('--' + name, type=int, required=True)
    start.add_argument('--scanner-host', default='')
    start.add_argument('--scanner-port', type=int, default=3310)
    start.add_argument('--parent-pid', type=int)
    command = sub.add_parser('manage')
    command.add_argument('--state', required=True)
    command.add_argument('arguments', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.operation == 'manage':
        return manage(args)
    run(args)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(f'Native runtime failed: {type(error).__name__}. Inspect the local runtime logs.', file=sys.stderr)
        raise
