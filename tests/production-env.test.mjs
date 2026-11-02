import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { validateProductionEnvironment } from '../scripts/prepare-production.mjs';

function validEnvironment() {
  return {
    COMPOSE_PROJECT_NAME: 'stratino-test', RELEASE_ID: 'a'.repeat(40),
    STRATINO_DOMAIN: 'stratino.test', STRATINO_PUBLIC_URL: 'https://stratino.test',
    DJANGO_ALLOWED_HOSTS: 'stratino.test', DJANGO_CSRF_TRUSTED_ORIGINS: 'https://stratino.test',
    DJANGO_SECRET_KEY: randomBytes(64).toString('hex'), POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
    STRATINO_OPERATOR_MFA_KEYS: `${randomBytes(32).toString('base64url')}=`,
    POSTGRES_HOST: 'db', POSTGRES_SSLMODE: 'require', EMAIL_HOST: 'smtp.stratino.test', EMAIL_PORT: '587',
    POSTGRES_USER: 'stratino', POSTGRES_ADMIN_USER: 'stratino_admin', POSTGRES_ADMIN_PASSWORD: randomBytes(32).toString('hex'),
    EMAIL_HOST_USER: 'synthetic-user', EMAIL_HOST_PASSWORD: 'synthetic-password',
    DEFAULT_FROM_EMAIL: 'Stratino <accounts@stratino.test>', VITE_ACADEMY_PREVIEW: 'false',
  };
}

test('complete offline configuration passes without contacting a provider', () => {
  assert.deepEqual(validateProductionEnvironment(validEnvironment()), []);
});

test('reject insecure origins, spoofable hosts, plaintext DB and local email', () => {
  const env = { ...validEnvironment(), STRATINO_PUBLIC_URL: 'http://stratino.test',
    DJANGO_ALLOWED_HOSTS: '*', POSTGRES_SSLMODE: 'disable', EMAIL_HOST: 'mailpit' };
  for (const key of ['STRATINO_PUBLIC_URL', 'DJANGO_ALLOWED_HOSTS', 'POSTGRES_SSLMODE', 'EMAIL_HOST']) {
    assert.ok(validateProductionEnvironment(env).some((failure) => failure.startsWith(key)));
  }
});

test('reject weak/reused secrets, placeholders and malformed key rings without disclosing values', () => {
  const env = { ...validEnvironment(), DJANGO_SECRET_KEY: 'sensitive-short-password',
    POSTGRES_PASSWORD: 'sensitive-short-password', EMAIL_HOST: 'smtp.example.com',
    STRATINO_OPERATOR_MFA_KEYS: 'sensitive-invalid-key' };
  const failures = validateProductionEnvironment(env);
  for (const key of ['DJANGO_SECRET_KEY', 'EMAIL_HOST', 'STRATINO_OPERATOR_MFA_KEYS', 'Secrets']) {
    assert.ok(failures.some((failure) => failure.startsWith(key)));
  }
  assert.ok(!failures.join('\n').includes('sensitive'));
});

test('self-hosted database requires separate admin identity and credentials', () => {
  const env = validEnvironment();
  env.POSTGRES_ADMIN_PASSWORD = env.POSTGRES_PASSWORD;
  env.POSTGRES_ADMIN_USER = env.POSTGRES_USER;
  const failures = validateProductionEnvironment(env);
  assert.ok(failures.some((failure) => failure.startsWith('POSTGRES_ADMIN_USER')));
  assert.ok(failures.some((failure) => failure.startsWith('Database administrator')));
});
