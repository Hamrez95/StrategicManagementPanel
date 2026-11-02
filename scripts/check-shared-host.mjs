import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load, CORE_SCHEMA, mergeTag } from 'js-yaml';

const directory = new URL('../infra/shared-host/', import.meta.url);
const text = (name) => readFile(new URL(name, directory), 'utf8');
const { services, networks } = load(await text('compose.yaml'), { schema: CORE_SCHEMA.withTags([mergeTag]) });
const networkNames = (service) => Array.isArray(service.networks) ? service.networks : Object.keys(service.networks);
for (const [name, service] of Object.entries(services)) {
  assert.equal(service.restart, 'unless-stopped', `${name}: restart policy`);
  assert.ok(service.mem_limit, `${name}: bounded memory`);
  assert.equal(service.logging.options['max-file'], '3');
  if (name !== 'edge') assert.equal(service.ports, undefined, `${name}: no public bypass`);
}
assert.deepEqual(services.edge.ports, ['80:80', '443:443']);
assert.ok(networks['stratino-data'].internal && networks['mazeduneh-data'].internal);
assert.equal(networkNames(services['stratino-db']).some(name => networkNames(services['mazeduneh-api']).includes(name)), false);
assert.equal(networkNames(services['mazeduneh-db']).some(name => networkNames(services['stratino-api']).includes(name)), false);
assert.deepEqual(networkNames(services['stratino-db']), ['stratino-data']);
assert.deepEqual(networkNames(services['mazeduneh-db']), ['mazeduneh-data']);
assert.ok(!services.edge.volumes.some(mount => /stratino-files|mazeduneh-media/.test(mount)), 'Private data is never exposed as a web root');
assert.notEqual(services['stratino-db'].env_file[0].path, services['mazeduneh-db'].env_file[0].path);
assert.notEqual(services['stratino-api'].env_file[0].path, services['mazeduneh-api'].env_file[0].path);
assert.equal(services['mazeduneh-web'].build.args.NEXT_PUBLIC_MAZEDUNEH_DEMO_MODE, 'false');
assert.equal(services['mazeduneh-web'].build.args.MAZEDUNEH_RELEASE_BUILD, 'true');
assert.ok(!('MAZEDUNEH_STATIC_EXPORT' in services['mazeduneh-web'].build.args));
assert.equal(services['mazeduneh-admin'].build.args.MAZEDUNEH_API_BASE_URL, 'https://api.mazeduneh.ir');
const caddy = await text('Caddyfile');
for (const domain of ['stratino.ir', 'mazeduneh.ir', 'www.stratino.ir', 'www.mazeduneh.ir', 'api.mazeduneh.ir', 'admin.mazeduneh.ir']) assert.ok(caddy.includes(domain));
assert.ok(caddy.includes('header_up X-Forwarded-For {client_ip}'));
assert.ok(caddy.includes('header_up X-Forwarded-Proto {scheme}'));
const trust = await text('cloudflare-trust.caddy');
assert.ok(trust.includes('trusted_proxies_strict') && trust.includes('client_ip_headers CF-Connecting-IP'));
assert.ok(!trust.includes('private_ranges'), 'Public clients must not be able to choose forwarded identity');
assert.ok((await text('businesses-backup.service')).includes('OnFailure=businesses-backup-alert.service'));
console.log('PASS: shared ingress, cross-business isolation, production build flags, persistent data and backup failure routing. No Docker commands were invoked.');
