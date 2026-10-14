import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('local same-origin proxy preserves API errors/body/cookies and never substitutes HTML', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'stratino-proxy-'));
  await writeFile(path.join(folder, 'index.html'), '<html>synthetic public page</html>');
  const reserve = createServer();
  reserve.listen(0, '127.0.0.1');
  await once(reserve, 'listening');
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  let received;
  const api = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received = { body, method: request.method, path: request.url, csrf: request.headers['x-csrftoken'] };
    response.writeHead(403, { 'Content-Type': 'application/json', 'Set-Cookie': 'synthetic=1; HttpOnly; SameSite=Lax' });
    response.end('{"code":"permission_denied"}');
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const child = spawn(process.execPath, ['scripts/serve.mjs', String(port), folder, String(api.address().port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Proxy exited before ready'); })]);
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/test?revision=3`, { method: 'POST', body: 'synthetic-data', headers: { 'X-CSRFToken': 'synthetic-csrf' } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('cache-control'), 'no-store, private');
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    assert.deepEqual(await response.json(), { code: 'permission_denied' });
    assert.deepEqual(received, { body: 'synthetic-data', method: 'POST', path: '/api/v1/test?revision=3', csrf: 'synthetic-csrf' });
    await new Promise((resolve) => api.close(resolve));
    const unavailable = await fetch(`http://127.0.0.1:${port}/api/v1/test`);
    assert.equal(unavailable.status, 502);
    assert.equal(await unavailable.text(), 'Local API unavailable');
  } finally {
    child.kill();
    await once(child, 'exit');
    api.close();
    await rm(folder, { recursive: true });
  }
});
