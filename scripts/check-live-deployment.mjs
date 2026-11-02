import assert from 'node:assert/strict';

const origin = new URL(process.argv[2] ?? '');
assert.equal(origin.protocol, 'https:', 'Use the real HTTPS staging origin');
assert.equal(origin.pathname, '/', 'Pass an origin without a path');
assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash, 'Do not pass credentials or tokens');

async function get(path) {
  return fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(15000) });
}

for (const path of ['/', '/account/login', '/app/workspaces']) {
  const response = await get(path);
  assert.equal(response.status, 200, `${path}: document reachable without proxy redirect loop`);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/, `${path}: HTML document`);
}
const ready = await get('/api/v1/health/ready');
assert.equal(ready.status, 200, 'API/database/migration readiness');
assert.deepEqual(await ready.json(), { status: 'ok' });
const session = await get('/api/v1/session/');
assert.equal(session.status, 401, 'Anonymous session must not authenticate');
assert.match(session.headers.get('cache-control') ?? '', /no-store/, 'Private API responses must not be cached');
const csrf = await get('/api/v1/csrf/');
assert.equal(csrf.status, 200);
assert.match(csrf.headers.get('set-cookie') ?? '', /csrftoken=.*;.*Secure/i, 'CSRF cookie must be Secure');
for (const path of ['/api/v1/not-a-real-endpoint/', '/media/not-public', '/assets/not-a-real-file.js', '/static/not-a-real-file.css']) {
  const response = await get(path);
  assert.equal(response.status, 404, `${path}: no SPA success fallback`);
}
console.log('PASS: read-only HTTPS smoke checks. Account/email, workspace isolation, uploads and restore still require the release checklist.');
