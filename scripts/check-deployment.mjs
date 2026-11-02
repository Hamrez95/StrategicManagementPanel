import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const text = (path) => readFile(new URL(path, root), 'utf8');
const compose = load(await text('infra/compose.production.yml'));
for (const [name, service] of Object.entries(compose.services)) {
  assert.equal(service.restart, 'unless-stopped', `${name}: restart policy`);
  assert.ok(service.mem_limit, `${name}: resource cap`);
  assert.equal(service.logging.options['max-file'], '3', `${name}: bounded logs`);
  if (name !== 'web') assert.equal(service.ports, undefined, `${name}: private service must not publish a port`);
}
assert.equal(compose.networks.private.internal, true);
assert.notEqual(compose.services.db.environment.POSTGRES_USER, compose.services.api.environment.POSTGRES_USER, 'API must not use cluster admin');
assert.equal(compose.services.api.environment.STRATINO_ENV, 'production');
assert.equal(compose.services.api.environment.STRATINO_TRUST_PROXY, '1');
assert.equal(compose.services.api.environment.DJANGO_DEBUG, '0');
assert.ok(compose.services.api.healthcheck.test.at(-1).includes('/health/ready'));
assert.deepEqual(compose.services.web.ports, ['80:80', '443:443']);
const caddy = await text('infra/Caddyfile');
assert.ok(caddy.indexOf('handle @backend') < caddy.indexOf('try_files'));
assert.ok(caddy.includes('header_up X-Forwarded-For {remote_host}'));
assert.ok(caddy.includes('header_up X-Forwarded-Proto {scheme}'));
assert.ok(caddy.includes('handle @private'));
const ignore = await text('.dockerignore');
for (const path of ['.git', '.env*', '**/.env*', '.local-dev', '.local-backups', '**/.private-files']) assert.ok(ignore.split(/\r?\n/).includes(path), `Build context excludes ${path}`);
const web = await text('infra/Dockerfile.web');
assert.ok(!web.includes('COPY docs/learning-design'), 'Private canonical academy data must not be copied to web runtime');
console.log(`PASS: offline deployment structure (${fileURLToPath(root)}). No Docker command was invoked; image build/proxy/TLS validation remains pending.`);
