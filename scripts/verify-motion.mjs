import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const base = process.argv[2] || process.env.STRATINO_UI_URL || 'http://127.0.0.1:5217';
const folder = 'test-results/motion';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'chrome' : undefined,
});
const uuid = '00000000-0000-4000-8000-000000000001';
const workspace = {
  id: uuid,
  owner_id: uuid,
  billing_account_id: uuid,
  name: 'فضای بررسی موشن',
  revision: 1,
  archived_at: null,
};
const sections = ['accounts', 'plans', 'subscriptions', 'academy', 'feedback'];
let checks = 0;
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'no-preference',
    recordVideo: { dir: folder, size: { width: 1280, height: 900 } },
  });
  await context.route(/\/api\/v1\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path === '/api/v1/session/')
      body = {
        authenticated: true,
        user: { id: uuid, name: 'اپراتور بررسی موشن', is_staff: true, profile_required: false },
        workspaces: [{ id: uuid, name: workspace.name, role: 'owner' }],
      };
    else if (path === '/api/v1/account/preferences/')
      body = {
        theme: 'light',
        language: 'fa',
        motion: 'auto',
        show_tutorial: false,
        device_sync_pending: false,
        updated_at: '2026-10-25T00:00:00Z',
      };
    else if (path === '/api/v1/operator/status/')
      body = {
        sections,
        mfa_ready: true,
        mfa_configured: true,
        mfa_enrolled: true,
        must_change_password: false,
        can_manage_operators: true,
        expires_at: new Date(Date.now() + 900_000).toISOString(),
        actor: { name: 'اپراتور بررسی موشن' },
        capabilities: {},
      };
    else if (path === '/api/v1/operator/overview/')
      body = { counts: { accounts: 1, subscriptions: 1, academy: 44, lessons: 783 } };
    else if (path === '/api/v1/operator/accounts/')
      body = {
        results: [
          { id: uuid, is_active: true, verified: true, date_joined: '2026-10-25T00:00:00Z' },
        ],
        count: 1,
        page: 1,
        has_next: false,
        has_previous: false,
      };
    else if (path === '/api/v1/workspaces/') body = { items: [workspace], next_cursor: null };
    else if (path.endsWith('/summary/'))
      body = {
        workspace_id: uuid,
        role: 'owner',
        objective: null,
        profile: { state: 'empty', provided_fields: [] },
        analyses: { draft_count: 0, finalized_count: 0 },
        next_action: null,
        shortcuts: [],
        open_actions: [],
        attention_items: [],
        unknowns: [],
        as_of: '2026-10-25',
      };
    else if (path === '/api/v1/accounts/google/config/') body = { enabled: false, client_id: '' };
    else throw new Error('Unexpected motion-fixture API: ' + path);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  async function fit() {
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    checks++;
  }
  async function settle() {
    await page
      .locator('.op-page-body, .app-route-content')
      .first()
      .evaluate(async (node) => {
        await Promise.allSettled(node.getAnimations().map((animation) => animation.finished));
      });
  }
  await page.goto(base + '/internal');
  await page.locator('.op-stat').first().waitFor();
  assert.match(
    await page.locator('.op-page-body').evaluate((node) => getComputedStyle(node).animationName),
    /stratino-scene/,
  );
  checks++;
  await settle();
  await page.locator('.op-stat').first().hover();
  await page.waitForFunction(
    () => !!document.querySelector('.op-stat')?.style.getPropertyValue('--spot-x'),
  );
  checks++;
  await page.screenshot({ path: `${folder}/admin-desktop.png`, fullPage: true });
  await page.getByRole('link', { name: 'حساب‌ها', exact: true }).click();
  await page.getByRole('table').waitFor();
  await settle();
  await fit();
  assert.equal(await page.getByRole('table').count(), 1);
  checks++;
  await page.setViewportSize({ width: 360, height: 860 });
  await page.getByRole('button', { name: 'بیشتر', exact: true }).click();
  await page.getByRole('dialog', { name: 'بخش‌های مدیریت' }).waitFor();
  await fit();
  await page.screenshot({ path: `${folder}/admin-menu-mobile.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  checks++;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(base + '/app/workspaces');
  await page.locator('.workspace-row').waitFor();
  await settle();
  await fit();
  await page.locator('.workspace-row').hover();
  await page.waitForFunction(
    () => !!document.querySelector('.workspace-row')?.style.getPropertyValue('--spot-x'),
  );
  await page.screenshot({ path: `${folder}/workspace-desktop.png`, fullPage: true });
  checks++;
  // A motion must never replace the translate used to center a portaled dialog.
  for (const direction of ['rtl', 'ltr']) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      await page.emulateMedia({ reducedMotion });
      for (const width of [360, 725, 768, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.locator('.management-welcome button').click();
        const dialog = page.getByRole('dialog', { name: 'ساخت فضای کار' });
        await dialog.waitFor();
        await dialog.evaluate((node, dir) => {
          node.dir = dir;
        }, direction);
        await dialog.evaluate(async (node) => {
          await Promise.allSettled(node.getAnimations().map((animation) => animation.finished));
        });
        const bounds = await dialog.boundingBox();
        assert.ok(bounds && bounds.x >= 15 && bounds.y >= 15);
        assert.ok(bounds.x + bounds.width <= width - 15);
        assert.ok(bounds.y + bounds.height <= 885);
        assert.ok(Math.abs(bounds.x + bounds.width / 2 - width / 2) < 2);
        await page.getByRole('textbox', { name: 'نام فضای کار' }).fill('بررسی پنجره');
        await page.keyboard.press('Tab');
        assert.ok(await dialog.evaluate((node) => node.contains(document.activeElement)));
        if (width === 725 && direction === 'rtl' && reducedMotion === 'no-preference') {
          await page.screenshot({ path: `${folder}/workspace-dialog-fixed.png`, fullPage: true });
        }
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.ok(
          await page
            .locator('.management-welcome button')
            .evaluate((node) => node === document.activeElement),
        );
        checks++;
      }
    }
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(base + '/');
  await page.locator('.home-world').first().waitFor();
  await page.locator('.home-world').first().hover();
  await fit();
  await page.screenshot({ path: `${folder}/home-desktop.png`, fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/internal');
  await page.locator('.op-stat').first().waitFor();
  assert.equal(
    await page.locator('.op-page-body').evaluate((node) => getComputedStyle(node).animationName),
    'none',
  );
  checks++;
  await page.locator('.op-stat').first().hover();
  assert.equal(
    await page
      .locator('.op-stat')
      .first()
      .evaluate((node) => node.style.getPropertyValue('--spot-x')),
    '',
  );
  checks++;
  const axe = await new AxeBuilder({ page }).include('.operator-console').analyze();
  await writeFile(`${folder}/axe.json`, JSON.stringify(axe.violations, null, 2));
  assert.deepEqual(axe.violations, []);
  checks++;
  assert.deepEqual(errors, []);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${folder}/stratino-motion-preview.webm`);
  console.log(
    `PASS: ${checks} motion/interaction checks, including normal and reduced motion, pointer feedback, mobile menu, preserved navigation and axe. Synthetic API fixtures only.`,
  );
} finally {
  await browser.close();
}
