import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

// Isolated API fixtures: no real account or Workspace is changed.
const base = process.argv[2] || process.env.STRATINO_UI_URL || 'http://127.0.0.1:5193';
const folder = 'test-results/mobile-onboarding';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'chrome' : undefined,
});
const id = '00000000-0000-4000-8000-000000000001';
let checks = 0;
const errors = [];
try {
  for (const language of ['fa', 'en']) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const preferences = { language, theme, motion: 'auto', show_tutorial: false };
      await context.addInitScript((value) => {
        localStorage.setItem('stratino-preferences-v1', JSON.stringify(value));
      }, preferences);
      let step = 'person';
      await context.route(/\/api\/v1\//, async (route) => {
        const path = new URL(route.request().url()).pathname;
        assert.equal(route.request().method(), 'GET', `Unexpected mutation: ${path}`);
        const workspace = {
          id,
          owner_id: id,
          billing_account_id: id,
          name: 'پروژه آزمایشی',
          revision: 1,
          archived_at: null,
        };
        let body;
        if (path === '/api/v1/session/')
          body = {
            authenticated: true,
            user: { id, name: 'مدیر آزمایشی', is_staff: false, profile_required: false },
            workspaces: step === 'project' ? [{ id, name: workspace.name, role: 'owner' }] : [],
          };
        else if (path === '/api/v1/account/preferences/')
          body = { ...preferences, device_sync_pending: false, updated_at: '2026-10-26T00:00:00Z' };
        else if (path === '/api/v1/account/profile/')
          body = {
            user_id: id,
            email: 'test@example.test',
            display_name: step === 'person' ? '' : 'مدیر آزمایشی',
            role_title: '',
            pending_email: '',
          };
        else if (path === '/api/v1/workspaces/')
          body = { items: step === 'project' ? [workspace] : [], next_cursor: null };
        else if (path.endsWith('/profile/'))
          body = {
            workspace_id: id,
            company_name: '',
            industry: '',
            stage: '',
            mission: '',
            problem_statement: '',
            products: [],
            customer_segments: [],
            goals: [],
            icps: [],
            revision: 1,
            onboarding_completed_at: null,
          };
        else throw new Error(`Unexpected fixture API: ${path}`);
        await route.fulfill({ json: body });
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      for (step of ['person', 'workspace', 'project']) {
        await page.goto(base + '/app/start');
        await page.locator('.onboarding-form').waitFor();
        for (const width of [320, 360, 390, 480, 560, 725, 768, 1280]) {
          await page.setViewportSize({ width, height: 844 });
          await page.evaluate(() => scrollTo(0, 0));
          await page.locator('.app-route-content').evaluate(async (node) => {
            await Promise.allSettled(node.getAnimations().map((animation) => animation.finished));
          });
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `${language}/${theme}/${step}/${width}: page overflow`,
          );
          const controls = await page.locator('.app-topbar').evaluate((node) => {
            const selectors = [
              '.app-brand',
              '.header-theme-switch',
              '.header-language-switch',
              '.app-search-trigger',
              '.app-account-menu summary',
            ];
            return selectors.map((selector) => {
              const rect = node.querySelector(selector).getBoundingClientRect();
              return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
            });
          });
          for (const [index, control] of controls.entries()) {
            assert.ok(control.x >= 0 && control.right <= width, `header clipped ${width}`);
            for (const other of controls.slice(index + 1)) {
              assert.ok(
                control.right <= other.x ||
                  other.right <= control.x ||
                  control.bottom <= other.y ||
                  other.bottom <= control.y,
                `header controls overlap ${width}`,
              );
            }
          }
          const field = page.locator('.onboarding-form input').first();
          const bounds = await field.boundingBox();
          assert.ok(
            bounds.x >= 15 && bounds.x + bounds.width <= width - 15,
            `field clipped ${width}`,
          );
          assert.ok(bounds.y < 590, `first field too far below fold: ${bounds.y}`);
          await field.fill('بررسی موبایل');
          await page.setViewportSize({ width: width + 1, height: 844 });
          assert.equal(await field.inputValue(), 'بررسی موبایل');
          if ([360, 725, 1280].includes(width))
            await page.screenshot({
              path: `${folder}/${step}-${width}-${language}-${theme}.png`,
              fullPage: true,
              animations: 'disabled',
            });
          checks++;
        }
      }
      if (language === 'fa' && theme === 'dark') {
        step = 'person';
        await page.setViewportSize({ width: 360, height: 740 });
        await page.goto(base + '/app/start');
        await page.locator('.onboarding-form').waitFor();
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          '200% text overflow',
        );
        await page.screenshot({
          path: `${folder}/person-360-text-200.png`,
          fullPage: true,
          animations: 'disabled',
        });
        checks++;
      }
      const axe = await new AxeBuilder({ page }).include('.application-shell').analyze();
      await writeFile(
        `${folder}/axe-${language}-${theme}.json`,
        JSON.stringify(axe.violations, null, 2),
      );
      assert.equal(axe.violations.length, 0);
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${checks} onboarding responsive checks; three steps, two languages/themes, 320–1280px, text zoom and four axe audits. Synthetic fixtures only.`,
  );
} finally {
  await browser.close();
}
