import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const draftPath = resolve(root, '.local-dev/production.env');
const templatePath = resolve(root, 'infra/.env.production.example');
const isPlaceholder = (value = '') => !value || /example\.(com|invalid)|replace-with|^CHANGE/i.test(value);

/** Return key names/reasons only; never include credentials in diagnostics. */
export function validateProductionEnvironment(env) {
  const failures = [];
  for (const key of ['COMPOSE_PROJECT_NAME', 'RELEASE_ID', 'STRATINO_DOMAIN', 'STRATINO_PUBLIC_URL',
    'DJANGO_ALLOWED_HOSTS', 'DJANGO_CSRF_TRUSTED_ORIGINS', 'DJANGO_SECRET_KEY',
    'STRATINO_OPERATOR_MFA_KEYS', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'EMAIL_HOST',
    'EMAIL_HOST_USER', 'EMAIL_HOST_PASSWORD', 'DEFAULT_FROM_EMAIL']) {
    if (isPlaceholder(env[key])) failures.push(`${key}: missing or placeholder`);
  }
  if (!/^[a-f\d]{7,40}$/.test(env.RELEASE_ID ?? '')) failures.push('RELEASE_ID: use a Git commit SHA');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(env.COMPOSE_PROJECT_NAME ?? '')) failures.push('COMPOSE_PROJECT_NAME: invalid name');
  if (!/^(?=.{1,253}$)([a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}$/i.test(env.STRATINO_DOMAIN ?? '')) {
    failures.push('STRATINO_DOMAIN: use one DNS hostname, without scheme or path');
  }
  const origin = `https://${env.STRATINO_DOMAIN}`;
  if (env.STRATINO_PUBLIC_URL !== origin) failures.push('STRATINO_PUBLIC_URL: must equal HTTPS domain origin');
  if (env.DJANGO_ALLOWED_HOSTS !== env.STRATINO_DOMAIN) failures.push('DJANGO_ALLOWED_HOSTS: must equal domain');
  if (env.DJANGO_CSRF_TRUSTED_ORIGINS !== origin) failures.push('DJANGO_CSRF_TRUSTED_ORIGINS: must equal HTTPS origin');
  if ((env.DJANGO_SECRET_KEY ?? '').length < 50 || new Set(env.DJANGO_SECRET_KEY).size < 5) failures.push('DJANGO_SECRET_KEY: weak key');
  if ((env.POSTGRES_PASSWORD ?? '').length < 24) failures.push('POSTGRES_PASSWORD: use at least 24 characters');
  if (env.POSTGRES_HOST === 'db') {
    if ((env.POSTGRES_ADMIN_PASSWORD ?? '').length < 24) failures.push('POSTGRES_ADMIN_PASSWORD: use at least 24 characters');
    if (!env.POSTGRES_ADMIN_USER || env.POSTGRES_ADMIN_USER === env.POSTGRES_USER) failures.push('POSTGRES_ADMIN_USER: use a separate cluster administrator');
    if (env.POSTGRES_ADMIN_PASSWORD === env.POSTGRES_PASSWORD) failures.push('Database administrator and app passwords must differ');
  }
  const keys = (env.STRATINO_OPERATOR_MFA_KEYS ?? '').split(',');
  if (keys.some((key) => !/^[A-Za-z\d_-]{43}=$/.test(key))) failures.push('STRATINO_OPERATOR_MFA_KEYS: invalid Fernet key ring');
  if (!['require', 'verify-ca', 'verify-full'].includes(env.POSTGRES_SSLMODE)) failures.push('POSTGRES_SSLMODE: TLS required');
  if (['localhost', '127.0.0.1', 'mailpit'].includes(env.EMAIL_HOST)) failures.push('EMAIL_HOST: production SMTP required');
  if (env.EMAIL_PORT !== '587') failures.push('EMAIL_PORT: this profile uses SMTP STARTTLS on 587');
  if (!['true', 'false'].includes(env.VITE_ACADEMY_PREVIEW)) failures.push('VITE_ACADEMY_PREVIEW: choose true or false');
  if (env.DJANGO_SECRET_KEY === env.POSTGRES_PASSWORD) failures.push('Secrets must be independent');
  return failures;
}

async function initializeDraft() {
  let content = await readFile(templatePath, 'utf8');
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (git.status !== 0) throw new Error('Cannot identify release Git SHA');
  const generated = {
    RELEASE_ID: git.stdout.trim(),
    DJANGO_SECRET_KEY: randomBytes(64).toString('hex'),
    POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
    POSTGRES_ADMIN_PASSWORD: randomBytes(32).toString('hex'),
    STRATINO_OPERATOR_MFA_KEYS: `${randomBytes(32).toString('base64url')}=`,
  };
  for (const [key, value] of Object.entries(generated)) content = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
  await mkdir(resolve(root, '.local-dev'), { recursive: true });
  await writeFile(draftPath, content, { flag: 'wx', mode: 0o600 });
  console.log('Created ignored .local-dev/production.env; existing files are never overwritten.');
  console.log('Keep this draft private. On Windows, verify its NTFS permissions; use new keys on the eventual host.');
}

async function main() {
  if (process.argv[2] === '--init') return initializeDraft();
  if (process.argv[2] !== '--check') throw new Error('Usage: node scripts/prepare-production.mjs --init | --check [env-file]');
  const env = parseEnv(await readFile(resolve(root, process.argv[3] ?? draftPath), 'utf8'));
  const failures = validateProductionEnvironment(env);
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log('PASS: offline configuration checks. DNS, SMTP, database, runtime and release gates still need staging evidence.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Filesystem errors may contain a path, but never print file contents or process env.
    console.error(error.code ? `Preparation failed (${error.code}). Check file path/permissions; existing drafts are retained.` : error.message);
    process.exitCode = 1;
  });
}
