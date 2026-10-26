import { spawn } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';

const root = process.cwd();
const children = [];
const requireFreePort = (port) =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () =>
      reject(new Error(`Port ${port} is already in use. Stop its owner before the browser suite.`)),
    );
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
const start = (args, cwd = root) => {
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', env: process.env });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    child.spawnError = error;
  });
  return child;
};
const ready = async (url, child, marker) => {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.spawnError || child.exitCode !== null)
      throw new Error(`Local server failed before readiness: ${url}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.text()).includes(marker)) return;
    } catch {
      /* Retry a server that is still starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Local server readiness timed out: ${url}`);
};
const run = async (script, env) => {
  const child = spawn(process.execPath, [script], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  children.push(child);
  const code = await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  assert.equal(code, 0, `${script} failed with exit ${code}`);
};
const stop = () =>
  children
    .filter((child) => child.exitCode === null && !child.killed)
    .forEach((child) => child.kill('SIGTERM'));
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stop();
  process.exit(143);
});
try {
  await Promise.all([requireFreePort(4173), requireFreePort(5173)]);
  const production = start(['scripts/serve.mjs', '4173']);
  const development = start(
    [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5173',
      '--strictPort',
    ],
    path.join(root, 'apps/web'),
  );
  await Promise.all([
    ready('http://127.0.0.1:4173', production, '<div id="root"'),
    ready('http://127.0.0.1:5173', development, '/src/main.tsx'),
  ]);
  const env = {
    STRATINO_UI_URL: 'http://127.0.0.1:5173',
    STRATINO_PRODUCTION_URL: 'http://127.0.0.1:4173',
    STRATINO_WEB_URL: 'http://127.0.0.1:4173',
    STRATEGY_URL: 'http://127.0.0.1:4173/prototype/',
  };
  for (const script of [
    'scripts/verify-ui.mjs',
    'scripts/verify-web.mjs',
    'scripts/verify-experience.mjs',
    'scripts/verify-brand.mjs',
    'scripts/verify-global-admin.mjs',
    'scripts/verify-motion.mjs',
    'scripts/verify-management-studio.mjs',
    'scripts/verify-mobile-onboarding.mjs',
    'scripts/verify-matrix-layout.mjs',
    'scripts/verify-planning-tools.mjs',
    'scripts/verify-account-navigation.mjs',
  ])
    await run(script, env);
  console.log('PASS: complete browser suite; owned local servers shutting down.');
} finally {
  stop();
}
