import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const base = process.argv[2] || 'http://127.0.0.1:5197';
const sections = ['accounts', 'workspaces', 'plans', 'subscriptions', 'access', 'audit'];
const browser = await chromium.launch({ channel: 'chrome' });
await mkdir('test-results/operator', { recursive: true });
let checks = 0;
let audits = 0;
try {
  const context = await browser.newContext({ reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let mfa = false;
  let mode = 'empty';
  let collectionRequests = 0;
  let lastQuery;
  await page.route(/\/api\/v1\//, async (route) => {
    const url = new URL(route.request().url());
    let payload;
    let status = 200;
    if (url.pathname === '/api/v1/session/') {
      payload = {
        authenticated: true,
        user: { id: 'synthetic-browser-only', name: 'آزمون رابط', is_staff: true },
        workspaces: [],
      };
    } else if (url.pathname === '/api/v1/account/preferences/') {
      payload = {
        theme: 'light',
        language: 'fa',
        motion: 'reduced',
        show_tutorial: false,
        device_sync_pending: false,
        updated_at: '2026-10-24T00:00:00Z',
      };
    } else if (url.pathname === '/api/v1/operator/status/') {
      payload = { sections, mfa_ready: mfa };
    } else if (url.pathname.startsWith('/api/v1/operator/')) {
      collectionRequests++;
      lastQuery = url.searchParams;
      assert.equal(route.request().method(), 'GET');
      if (mode === 'error') {
        status = 503;
        payload = { code: 'operator_mfa_unavailable', message: 'نمایش اطلاعات مشتری بسته است.' };
      } else {
        // Empty responses only. No synthetic customer record is rendered.
        payload = {
          results: [],
          count: 0,
          page: Number(url.searchParams.get('page')),
          has_next: false,
          has_previous: false,
        };
      }
    } else {
      throw new Error(`Unexpected API request: ${url.pathname}`);
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  for (const width of [360, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto(base + '/internal/accounts');
    await page.getByRole('heading', { name: 'نمایش اطلاعات مشتری بسته است' }).waitFor();
    assert.equal(collectionRequests, 0, 'MFA block must not fetch collections');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.screenshot({ path: `test-results/operator/locked-${width}.png`, fullPage: true });
    const result = await new AxeBuilder({ page }).include('.operator-console').analyze();
    assert.deepEqual(result.violations, []);
    audits++;
    checks++;
  }
  mfa = true; // A browser mock, never a real server setting or account.
  for (const section of sections) {
    await page.goto(base + '/internal/' + section);
    await page.getByText('رکوردی پیدا نشد.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'بعدی', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'قبلی', exact: true }).isDisabled(), true);
    checks++;
  }
  await page.goto(base + '/internal/accounts');
  await page.getByRole('searchbox').fill('00000000-0000-0000-0000-000000000001');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByText('رکوردی پیدا نشد.', { exact: false }).waitFor();
  assert.equal(lastQuery.get('q'), '00000000-0000-0000-0000-000000000001');
  await page.locator('.operator-console').getByRole('combobox').selectOption('inactive');
  await page.getByText('رکوردی پیدا نشد.', { exact: false }).waitFor();
  assert.equal(lastQuery.get('state'), 'inactive');
  checks++;
  mode = 'error';
  await page.getByRole('button', { name: 'تازه‌کردن', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('.operator-table').count(), 0);
  mode = 'empty';
  await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
  await page.getByText('رکوردی پیدا نشد.', { exact: false }).waitFor();
  checks++;
  await page.getByRole('switch', { name: 'تم تیره' }).click();
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  await page.screenshot({ path: 'test-results/operator/empty-dark.png', fullPage: true });
  assert.deepEqual(
    (await new AxeBuilder({ page }).include('.operator-console').analyze()).violations,
    [],
  );
  audits++;
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await page.getByRole('heading', { name: 'Internal operator console' }).waitFor();
  assert.equal(await page.locator('.operator-console').getAttribute('dir'), 'ltr');
  await page.getByText('No records found.', { exact: false }).waitFor();
  await page.screenshot({ path: 'test-results/operator/empty-english.png', fullPage: true });
  assert.deepEqual(
    (await new AxeBuilder({ page }).include('.operator-console').analyze()).violations,
    [],
  );
  audits++;
  checks++;
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement !== document.body), true);
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${checks} operator browser checks, ${audits} focused axe audits; empty/error/MFA states, 4 widths, dark/LTR, keyboard. Mocked APIs only; no real operator or customer data.`,
  );
  await context.close();
} finally {
  await browser.close();
}
