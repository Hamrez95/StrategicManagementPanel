import assert from 'node:assert/strict';
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { chromium } from 'playwright';
const files = await readdir('dist/assets');
assert.equal(
  files.some((file) => /^Academy-/.test(file)),
  false,
  'preview chunk must not exist in the default build',
);
const child = spawn(
  process.execPath,
  [
    '../../node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '5188',
    '--strictPort',
  ],
  { cwd: 'apps/web', stdio: ['ignore', 'pipe', 'pipe'] },
);
let logs = '';
child.stdout.on('data', (data) => {
  logs += data;
});
child.stderr.on('data', (data) => {
  logs += data;
});
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch('http://127.0.0.1:5188')).ok) break;
    } catch {
      /* startup */
    }
    if (i === 99) throw new Error(logs);
    await setTimeout(100);
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.STRATEGY_BROWSER_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of ['/academy', '/academy/lesson/customer']) {
    await page.goto('http://127.0.0.1:5188' + path);
    await page.getByRole('heading', { name: 'صفحه پیدا نشد', exact: true }).waitFor();
    assert.equal(await page.locator('.academy').count(), 0);
  }
  await page.goto('http://127.0.0.1:5188/');
  await page.locator('h1').waitFor();
  assert.notEqual(await page.locator('h1').innerText(), 'صفحه پیدا نشد');
  assert.deepEqual(errors, []);
  await mkdir('test-results/academy', { recursive: true });
  await writeFile(
    'test-results/academy/default-off.json',
    JSON.stringify(
      { previewChunks: 0, disabledRoutes: 2, publicHome: true, pageErrors: errors },
      null,
      2,
    ),
  );
  console.log(
    'Default production build: no Academy chunks, both Academy routes absent, public home renders, zero page errors.',
  );
} finally {
  await browser?.close();
  child.kill('SIGTERM');
}
