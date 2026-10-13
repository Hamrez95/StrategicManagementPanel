import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.STRATEGY_BROWSER_EXECUTABLE || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const url = process.env.STRATINO_WEB_URL || 'http://localhost:4173';
const results = [];
const errors = [];
await mkdir('test-results/web', { recursive: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  for (const width of [360, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(url);
    await page.getByRole('heading', { name: /تحلیل‌هایتان/ }).waitFor();
    for (const theme of ['light', 'dark']) {
      if ((await page.getAttribute('html', 'data-theme')) !== theme)
        await page.getByRole('button', { name: 'تغییر تم' }).click();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `overflow ${width}/${theme}`,
      );
      await page.screenshot({
        path: `test-results/web/site-${width}-${theme}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
    results.push({ width, themes: ['light', 'dark'], overflow: false });
  }
  await page.locator('.strategy-path button').nth(3).click();
  assert.match(await page.locator('.scene-detail').innerText(), /مدارک ارائه/);
  await page.goto(url + '/demo');
  await page.frameLocator('iframe').locator('.brand strong').waitFor();
  assert.equal(await page.frameLocator('iframe').locator('.brand strong').innerText(), 'استراتینو');
  await page.goto(url + '/account/reset-password');
  await page.getByRole('heading', { name: /حساب استراتینو/ }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: /حساب استراتینو/ }).waitFor();
  let session = {
    authenticated: true,
    user: { id: 'u1', name: 'مدیر نمونه', is_staff: false },
    workspaces: [{ id: 'w1', name: 'پروژه مجاز' }],
  };
  await page.route('**/api/v1/session/', (route) =>
    route.fulfill({ status: 401, json: { detail: 'unauthenticated' } }),
  );
  await page.goto(url + '/app/workspaces/w1/overview');
  await page.waitForURL(/account\/login/);
  await page.unroute('**/api/v1/session/');
  await page.route('**/api/v1/session/', (route) => route.fulfill({ json: session }));
  await page.goto(url + '/app/workspaces/w1/overview');
  await page.getByRole('heading', { name: 'پروژه مجاز' }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'پروژه مجاز' }).waitFor();
  await page.goto(url + '/app/workspaces/other/overview');
  await page.getByRole('heading', { name: 'فضای کار در دسترس نیست' }).waitFor();
  await page.goto(url + '/internal');
  await page.getByRole('heading', { name: 'دسترسی ندارید' }).waitFor();
  session = { ...session, user: { ...session.user, is_staff: true } };
  await page.reload();
  await page.getByRole('heading', { name: 'مدیریت سرویس' }).waitFor();
  await page.unroute('**/api/v1/session/');
  await page.route('**/api/v1/session/', (route) =>
    route.fulfill({
      json: { authenticated: true, user: { id: 'u1', is_staff: 'true' }, workspaces: [] },
    }),
  );
  await page.goto(url + '/internal');
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /معتبر نیست/);
  await page.unroute('**/api/v1/session/');
  await page.goto(url + '/app/workspaces/w1/overview');
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /در دسترس نیست/);
  const response = await page.request.get(url + '/api/v1/session/');
  assert.equal(response.status(), 404, 'API missing route must not return SPA HTML');
  await page.goto(url + '/missing-page');
  await page.getByRole('heading', { name: 'صفحه پیدا نشد' }).waitFor();
  await page.goto(url + '/#matrices/efe');
  await page.waitForURL(/prototype\/.*#matrices\/efe/);
  await page.locator('#main h1').waitFor();
  assert.deepEqual(errors, []);
  await writeFile(
    'test-results/web/checks.json',
    JSON.stringify(
      {
        results,
        sessionBoundary: 'mocked contract only; not real authentication',
        malformedSessionRejected: true,
        operatorDenied: true,
        prototypePreserved: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: 8 responsive/theme screenshots, deep links, session failure/401/malformed data, membership/operator boundaries, prototype and API fallback',
  );
} finally {
  await browser.close();
}
