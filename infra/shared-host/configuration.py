"""Private host configuration. No cloud calls, system changes, or printed secrets."""
import base64
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sys

SECRET_FILES = ('stratino-api.env', 'stratino-db.env', 'mazeduneh-api.env', 'mazeduneh-db.env', 'restic.env')


def read_env(path):
    values = {}
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator or not re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*', key):
            raise ValueError('Invalid environment file syntax; values are never executed.')
        if key in values:
            raise ValueError('Duplicate environment setting.')
        values[key] = value
    return values


def write_env(path, values):
    if any('\n' in str(value) or '\r' in str(value) for value in values.values()):
        raise ValueError('Environment values must not contain newlines.')
    with Path(path).open('x', encoding='utf-8') as stream:
        os.chmod(path, 0o600)
        stream.write(''.join(f'{key}={value}\n' for key, value in values.items()))


def database_environment(app, password, admin_password):
    return dict(POSTGRES_DB=app, POSTGRES_USER=f'{app}_admin', POSTGRES_PASSWORD=admin_password,
                STRATINO_DB_APP_USER=app, STRATINO_DB_APP_PASSWORD=password)


def stratino_environment(password, smtp):
    return dict(STRATINO_ENV='production', DJANGO_DEBUG='0', DJANGO_SECRET_KEY=secrets.token_hex(64),
                DJANGO_ALLOWED_HOSTS='stratino.ir', DJANGO_CSRF_TRUSTED_ORIGINS='https://stratino.ir',
                STRATINO_PUBLIC_URL='https://stratino.ir', STRATINO_TRUST_PROXY='1',
                STRATINO_TRUSTED_PROXY_IPS='172.30.11.2,127.0.0.1,::1',
                STRATINO_OPERATOR_MFA_KEYS=base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
                POSTGRES_HOST='stratino-db', POSTGRES_DB='stratino', POSTGRES_USER='stratino',
                POSTGRES_PASSWORD=password, POSTGRES_PORT='5432', POSTGRES_SSLMODE='verify-full',
                PGSSLROOTCERT='/db-tls/server.crt', STRATINO_PRIVATE_FILES='/private-files',
                CLAMAV_HOST='clamav', CLAMAV_PORT='3310',
                EMAIL_HOST=smtp['host'], EMAIL_PORT='587', EMAIL_HOST_USER=smtp['user'],
                EMAIL_HOST_PASSWORD=smtp['password'], DEFAULT_FROM_EMAIL=smtp['sender'],
                GOOGLE_OAUTH_CLIENT_ID='')


def mazeduneh_environment(password, owner_email, owner_password):
    return dict(ASPNETCORE_ENVIRONMENT='Production', AllowedHosts='api.mazeduneh.ir;mazeduneh-api',
                ConnectionStrings__Catalog=f'Host=mazeduneh-db;Port=5432;Database=mazeduneh;Username=mazeduneh;Password={password};SSL Mode=VerifyFull;Root Certificate=/db-tls/server.crt;Maximum Pool Size=20',
                Admin__Email=owner_email, Admin__PasswordHash=hashlib.sha256(owner_password.encode()).hexdigest(),
                Admin__TokenSigningKey=secrets.token_hex(64), Admin__Mfa__SensitiveActionsRequired='true',
                Admin__Mfa__Required='true', Admin__Mfa__TotpSecret=base64.b32encode(secrets.token_bytes(20)).decode(),
                ReverseProxy__KnownProxies__0='172.30.21.2',
                Cors__AllowedOrigins__0='https://mazeduneh.ir', Cors__AllowedOrigins__1='https://admin.mazeduneh.ir',
                Media__Provider='Local', Media__RootPath='/var/lib/mazeduneh/media',
                Media__PublicBaseUrl='https://api.mazeduneh.ir', Payments__SandboxEnabled='false',
                Payments__Zibal__Merchant='',
                Payments__Zibal__CallbackUrl='https://api.mazeduneh.ir/api/v1/payments/zibal/callback',
                Payments__Zibal__ReturnUrl='https://mazeduneh.ir/checkout')


def initialize(root, private_directory):
    if sys.platform != 'linux':
        raise ValueError('Generate final production secrets only on the trusted Linux deployment host.')
    private = Path(private_directory).resolve()
    if private.exists():
        raise ValueError('Private directory already exists; keys are never replaced automatically.')
    owner = input('Mazeduneh owner email: ').strip()
    password = getpass.getpass('New strong Mazeduneh owner password: ')
    if len(password) < 16 or password != getpass.getpass('Repeat owner password: '):
        raise ValueError('Use matching passwords with at least 16 characters.')
    smtp = dict(host=input('Transactional SMTP host: ').strip(), user=input('SMTP username: ').strip(),
                password=getpass.getpass('SMTP password: '), sender=input('Verified sender (for example accounts@stratino.ir): ').strip())
    if not owner or not all(smtp.values()):
        raise ValueError('Owner and verified SMTP settings are required.')
    private.mkdir(parents=True, mode=0o700)
    os.chmod(private, 0o700)
    maz_password, strat_password = secrets.token_hex(32), secrets.token_hex(32)
    files = {
        'stratino-db.env': database_environment('stratino', strat_password, secrets.token_hex(32)),
        'mazeduneh-db.env': database_environment('mazeduneh', maz_password, secrets.token_hex(32)),
        'stratino-api.env': stratino_environment(strat_password, smtp),
        'mazeduneh-api.env': mazeduneh_environment(maz_password, owner, password),
        'restic.env': dict(RESTIC_REPOSITORY='', RESTIC_PASSWORD=secrets.token_hex(32), AWS_ACCESS_KEY_ID='', AWS_SECRET_ACCESS_KEY=''),
    }
    for name, values in files.items():
        write_env(private / name, values)
    (private / 'installation.json').write_text(json.dumps({'project': 'businesses'}))
    manifest = json.loads((root / 'release.json').read_text())
    write_env(root / 'release.env', dict(COMPOSE_PROJECT_NAME='businesses', HOST_SECRETS_DIR=str(private),
                                      STRATINO_RELEASE=manifest['stratino'], MAZEDUNEH_RELEASE=manifest['mazeduneh']))
    print('Private configuration created. Save owner credentials, TOTP seed and RESTIC_PASSWORD in your password manager.')
    print('Set the off-host RESTIC_REPOSITORY and its credentials in restic.env before the launch check.')


def adopt(root, private_directory):
    private = Path(private_directory).resolve()
    project = json.loads((private / 'installation.json').read_text())['project']
    manifest = json.loads((root / 'release.json').read_text())
    write_env(root / 'release.env', dict(COMPOSE_PROJECT_NAME=project, HOST_SECRETS_DIR=str(private),
                                      STRATINO_RELEASE=manifest['stratino'], MAZEDUNEH_RELEASE=manifest['mazeduneh']))
    print('Existing private installation attached to this new release. No keys, databases or volumes were replaced.')


def validation_errors(root, launch=False):
    public = read_env(root / 'release.env')
    errors = []
    manifest = json.loads((root / 'release.json').read_text())
    for key, app in [('STRATINO_RELEASE', 'stratino'), ('MAZEDUNEH_RELEASE', 'mazeduneh')]:
        if public.get(key) != manifest.get(app) or not re.fullmatch(r'[a-f0-9]{40}', public.get(key, '')):
            errors.append(f'{key}: must match the bundled full commit SHA')
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', public.get('COMPOSE_PROJECT_NAME', '')):
        errors.append('COMPOSE_PROJECT_NAME: invalid project name')
    private = Path(public.get('HOST_SECRETS_DIR', ''))
    if not private.is_absolute():
        return errors + ['HOST_SECRETS_DIR: absolute private directory required']
    environments = {name: read_env(private / name) for name in SECRET_FILES}
    passwords = []
    for app in ('stratino', 'mazeduneh'):
        db, api = environments[f'{app}-db.env'], environments[f'{app}-api.env']
        if db.get('POSTGRES_USER') != f'{app}_admin' or db.get('STRATINO_DB_APP_USER') != app:
            errors.append(f'{app}: isolated app/admin database identities required')
        passwords.extend([db.get('POSTGRES_PASSWORD', ''), db.get('STRATINO_DB_APP_PASSWORD', '')])
        if app == 'stratino' and api.get('POSTGRES_PASSWORD') != db.get('STRATINO_DB_APP_PASSWORD'):
            errors.append('stratino: application database password mismatch')
    if any(len(value) < 32 for value in passwords) or len(set(passwords)) != 4:
        errors.append('Database passwords must be strong and independent')
    strat, maz = environments['stratino-api.env'], environments['mazeduneh-api.env']
    if strat.get('POSTGRES_SSLMODE') != 'verify-full' or strat.get('PGSSLROOTCERT') != '/db-tls/server.crt':
        errors.append('Stratino database certificate validation is required')
    if strat.get('STRATINO_PUBLIC_URL') != 'https://stratino.ir' or strat.get('DJANGO_DEBUG') != '0':
        errors.append('Stratino production origin/debug settings are invalid')
    if strat.get('CLAMAV_HOST') != 'clamav' or not strat.get('EMAIL_HOST') or not strat.get('EMAIL_HOST_PASSWORD'):
        errors.append('Stratino scanner and transactional email must be configured')
    if maz.get('Payments__SandboxEnabled') != 'false' or maz.get('Admin__Mfa__Required') != 'true':
        errors.append('Mazeduneh requires MFA and disabled sandbox payment')
    expected_connection = f"Host=mazeduneh-db;Port=5432;Database=mazeduneh;Username=mazeduneh;Password={environments['mazeduneh-db.env'].get('STRATINO_DB_APP_PASSWORD')};SSL Mode=VerifyFull;Root Certificate=/db-tls/server.crt;Maximum Pool Size=20"
    if maz.get('ConnectionStrings__Catalog') != expected_connection:
        errors.append('Mazeduneh database identity, password or certificate validation is invalid')
    errors.extend(security_errors(strat, maz))
    backup = environments['restic.env']
    if len(backup.get('RESTIC_PASSWORD', '')) < 32:
        errors.append('A strong independent backup encryption password is required')
    repository = backup.get('RESTIC_REPOSITORY', '')
    if launch and (':' not in repository or repository.startswith(('/', '.', 'file:'))):
        errors.append('Configure an off-host encrypted backup repository before launch')
    if launch and (not maz.get('Payments__Zibal__Merchant') or maz.get('Payments__Zibal__Merchant') == 'zibal'):
        errors.append('Configure the real payment merchant before commerce launch')
    if sys.platform == 'linux':
        for name in SECRET_FILES:
            if (private / name).stat().st_mode & 0o077:
                errors.append(f'{name}: restrict permissions to 0600')
    return errors


def security_errors(strat, maz):
    errors = []
    if len(strat.get('DJANGO_SECRET_KEY', '')) < 50 or not re.fullmatch(r'[A-Za-z0-9_-]{43}=', strat.get('STRATINO_OPERATOR_MFA_KEYS', '')):
        errors.append('Stratino requires strong Django and MFA keys')
    if strat.get('STRATINO_TRUSTED_PROXY_IPS') != '172.30.11.2,127.0.0.1,::1' or strat.get('STRATINO_TRUST_PROXY') != '1':
        errors.append('Stratino ingress trust must match the isolated edge')
    if strat.get('STRATINO_ENV') != 'production' or strat.get('POSTGRES_HOST') != 'stratino-db' or strat.get('POSTGRES_USER') != 'stratino':
        errors.append('Stratino must use its own production database')
    if strat.get('DJANGO_ALLOWED_HOSTS') != 'stratino.ir' or strat.get('DJANGO_CSRF_TRUSTED_ORIGINS') != 'https://stratino.ir':
        errors.append('Stratino host and CSRF origins must be explicit')
    if strat.get('EMAIL_PORT') != '587' or strat.get('EMAIL_HOST') in ('localhost', '127.0.0.1', 'mailpit'):
        errors.append('Production transactional SMTP with STARTTLS on 587 is required')
    if len(maz.get('Admin__TokenSigningKey', '')) < 32 or not re.fullmatch(r'[a-fA-F0-9]{64}', maz.get('Admin__PasswordHash', '')):
        errors.append('Mazeduneh requires strong owner authentication keys')
    if not re.fullmatch(r'[A-Z2-7]{32}', maz.get('Admin__Mfa__TotpSecret', '')) or maz.get('Admin__Mfa__SensitiveActionsRequired') != 'true':
        errors.append('Mazeduneh requires owner TOTP for login and sensitive actions')
    if maz.get('ASPNETCORE_ENVIRONMENT') != 'Production' or maz.get('ReverseProxy__KnownProxies__0') != '172.30.21.2':
        errors.append('Mazeduneh production/ingress configuration is invalid')
    if maz.get('Cors__AllowedOrigins__0') != 'https://mazeduneh.ir' or maz.get('Cors__AllowedOrigins__1') != 'https://admin.mazeduneh.ir':
        errors.append('Mazeduneh CORS must match the exact site and admin origins')
    if maz.get('Media__Provider') != 'Local' or maz.get('Media__RootPath') != '/var/lib/mazeduneh/media':
        errors.append('The base profile requires the backed-up persistent media volume')
    if maz.get('Media__PublicBaseUrl') != 'https://api.mazeduneh.ir':
        errors.append('Mazeduneh media origin is invalid')
    return errors
