import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const base =
  process.argv[2] ||
  process.env.STRATINO_WEB_URL ||
  process.env.STRATINO_UI_URL ||
  'http://127.0.0.1:5193';
const id = '00000000-0000-4000-8000-000000000001';
const folder = 'test-results/planning-tools';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'chrome' : undefined,
});
let checks = 0;
try {
  for (const language of ['fa', 'en'])
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const preferences = { language, theme, motion: 'reduced', show_tutorial: false };
      await context.addInitScript(
        (v) => localStorage.setItem('stratino-preferences-v1', JSON.stringify(v)),
        preferences,
      );
      const records = new Map();
      let conflict = false;
      const captures = [];
      await context.route(/\/api\/v1\//, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        let body;
        if (path === '/api/v1/session/')
          body = {
            authenticated: true,
            user: { id, name: 'مدیر آزمایشی', is_staff: false },
            workspaces: [{ id, name: 'ابزارهای آزمایشی', role: 'owner' }],
          };
        else if (path === '/api/v1/account/preferences/')
          body = { ...preferences, updated_at: '2026-10-26T00:00:00Z', device_sync_pending: false };
        else if (path === '/api/v1/csrf/')
          return route.fulfill({
            json: {},
            headers: { 'Set-Cookie': 'csrftoken=planning-fixture; Path=/; SameSite=Lax' },
          });
        else if (path.includes('/planning/')) {
          const [, tool, recordId] =
            path.split('/planning/')[1].match(/^([^/]+)\/(?:([^/]+)\/)?$/) || [];
          const rows = records.get(tool) || [];
          if (request.method() === 'GET')
            body = { workspace_id: id, tool, items: rows, next_offset: null };
          else {
            assert.ok(request.headers()['x-csrftoken']);
            if (conflict) {
              conflict = false;
              return route.fulfill({
                status: 409,
                json: {
                  code: 'revision_conflict',
                  message: 'نسخهٔ تازه‌ای ذخیره شده؛ نوشته‌ات حفظ شده.',
                  fields: {},
                },
              });
            }
            const draft = request.postDataJSON();
            body = {
              ...draft,
              id: recordId || draft.id,
              workspace_id: id,
              revision: recordId ? draft.revision + 1 : 1,
              updated_at: '2026-10-26T00:00:00Z',
            };
            records.set(tool, [body, ...rows.filter((r) => r.id !== body.id)]);
          }
        } else if (path.endsWith('/execution/scorecards/'))
          body = { workspace_id: id, can_edit: true, cards: [] };
        else if (path.endsWith('/execution/'))
          body = {
            workspace_id: id,
            role: 'owner',
            today: '2026-10-26',
            horizon_end: '2027-01-24',
            history_limit: 100,
            decisions: [],
            goals: [],
            actions: [],
            events: [],
            members: [{ id, name: 'مدیر آزمایشی', role: 'owner' }],
            sources: [],
          };
        else if (path.endsWith('/strategy/')) body = { workspace_id: id, factors: [], options: [] };
        else if (path.endsWith('/metrics/captures/')) {
          if (request.method() === 'GET')
            body = { workspace_id: id, items: captures, next_offset: null };
          else {
            const draft = request.postDataJSON();
            body = { id: draft.id, workspace_id: id, observations: draft.observations, run: null };
            captures.unshift(body);
          }
        } else if (path.endsWith('/calculate/')) {
          body = captures[0];
          body.run = {
            id: 'run-1',
            method_revision: 'MET-CONTRIBUTION-MARGIN-v1',
            results: [{ status: 'observed', value: '120.000000', currency: 'IRR', reason: '' }],
          };
        } else throw new Error('Unexpected planning fixture ' + path);
        return route.fulfill({ json: body });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      for (const tool of ['environment', 'industry', 'internal', 'scenarios', 'risks', 'journey']) {
        await page.goto(`${base}/app/workspaces/${id}/tools/${tool}`);
        await page.getByRole('heading', { level: 1 }).waitFor();
        await page
          .getByRole('button', {
            name: language === 'en' ? 'Add record' : 'افزودن مورد',
            exact: true,
          })
          .click();
        const form = page.locator('form.planning-editor');
        await form.waitFor();
        await form.locator('input:not([type=date]),textarea').evaluateAll((inputs) =>
          inputs.forEach((input) => {
            const setter = Object.getOwnPropertyDescriptor(
              input instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype,
              'value',
            ).set;
            setter.call(input, 'Synthetic example');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }),
        );
        // Native filling drives React state (the generic synthetic assignment above only primes DOM).
        for (const input of await form.locator('input:not([type=date]),textarea').all())
          await input.fill('Synthetic example');
        for (const width of [360, 768, 1280, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          );
          assert.equal(overflow, false, `${tool} ${language} ${theme} ${width} root overflow`);
          for (const box of await form.locator('input,textarea,select').evaluateAll((els) =>
            els.map((el) => ({
              x: el.getBoundingClientRect().x,
              right: el.getBoundingClientRect().right,
              height: el.getBoundingClientRect().height,
            })),
          )) {
            assert.ok(box.x >= -1 && box.right <= width + 1);
            assert.ok(box.height >= 44);
          }
          checks++;
        }
        if (tool === 'environment')
          await page.screenshot({
            path: `${folder}/environment-${language}-${theme}.png`,
            fullPage: true,
          });
        await form
          .getByRole('button', { name: language === 'en' ? 'Save' : 'ذخیره', exact: true })
          .click();
        await page.locator('.planning-success').waitFor();
        assert.equal(records.get(tool).length, 1);
        checks++;
        await page.reload();
        await page.locator('.planning-record').waitFor();
        await page
          .getByRole('button', { name: language === 'en' ? 'Edit' : 'ویرایش', exact: true })
          .click();
        await page
          .locator('form')
          .getByLabel(language === 'en' ? 'Title' : 'عنوان', { exact: true })
          .fill('Retained draft');
        conflict = true;
        await page
          .locator('form')
          .getByRole('button', { name: language === 'en' ? 'Save' : 'ذخیره', exact: true })
          .click();
        await page.locator('.planning-error').waitFor();
        assert.equal(
          await page
            .locator('form')
            .getByLabel(language === 'en' ? 'Title' : 'عنوان', { exact: true })
            .inputValue(),
          'Retained draft',
        );
        checks++;
        const audit = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        assert.deepEqual(
          audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
          [],
          tool + ' axe',
        );
      }
      for (const tool of ['journal', 'scorecard', 'qspm']) {
        await page.goto(`${base}/app/workspaces/${id}/tools/${tool}`);
        await page.locator(tool === 'scorecard' ? '#bsc-title' : '#execution-title').waitFor();
        assert.equal(
          await page.getByText('اتصال ابزار به داده‌های فضا در حال آماده‌سازی است').count(),
          0,
        );
        checks++;
      }
      await page.goto(`${base}/app/workspaces/${id}/tools/finance`);
      await page.locator('#finance-title').waitFor();
      await page
        .getByRole('button', {
          name: language === 'en' ? 'Add financial period' : 'ثبت دورهٔ مالی',
        })
        .click();
      await page
        .getByLabel(language === 'en' ? 'Period start' : 'شروع دوره', { exact: true })
        .fill('2026-01-01');
      await page
        .getByLabel(language === 'en' ? 'Period end' : 'پایان دوره', { exact: true })
        .fill('2026-02-01');
      await page
        .getByLabel(language === 'en' ? 'Amount' : 'مبلغ', { exact: true })
        .nth(0)
        .fill('۲۰۰');
      await page
        .getByLabel(language === 'en' ? 'Amount' : 'مبلغ', { exact: true })
        .nth(1)
        .fill('۸۰');
      for (const label of language === 'en'
        ? ['Variable-cost boundary', 'Source record or reference', 'Source version or date']
        : ['چه هزینه‌هایی رو متغیر حساب کردی؟', 'منبع یا شمارهٔ گزارش', 'نسخه یا تاریخ منبع'])
        await page.getByLabel(label, { exact: true }).fill('Synthetic source');
      await page.setViewportSize({ width: 360, height: 900 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      await page.screenshot({
        path: `${folder}/finance-mobile-${language}-${theme}.png`,
        fullPage: true,
      });
      await page
        .getByRole('button', {
          name: language === 'en' ? 'Save inputs' : 'ذخیرهٔ ورودی‌ها',
          exact: true,
        })
        .click();
      await page.locator('.planning-success').waitFor();
      assert.equal(captures[0].observations[0].value, '200');
      await page
        .getByRole('button', {
          name: language === 'en' ? 'Calculate contribution' : 'محاسبهٔ حاشیهٔ مشارکت',
          exact: true,
        })
        .click();
      await page.locator('.planning-calculation').waitFor();
      checks++;
      await page.reload();
      await page.locator('.planning-calculation').waitFor();
      checks++;
      captures[0].observations[0].value = '9007199254740993.123456';
      await page.reload();
      await page.locator('.planning-record').waitFor();
      await page
        .getByText(
          language === 'en'
            ? '9,007,199,254,740,993.123456 IRR'
            : '۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳٫۱۲۳۴۵۶ IRR',
          { exact: true },
        )
        .waitFor();
      checks++;
      assert.equal(await page.locator('.app-brand').getAttribute('href'), '/');
      assert.equal(await page.locator('.app-academy-link').getAttribute('href'), '/academy');
      await page.locator('.app-account-menu summary').click();
      for (const href of ['/', '/academy', '/app/workspaces'])
        assert.equal(await page.locator(`.app-account-menu__panel a[href="${href}"]`).count(), 1);
      await page.locator('.app-brand').click();
      await page.waitForURL(base + '/');
      checks++;
      assert.deepEqual(errors, []);
      await context.close();
    }
  console.log(
    `PASS: ${checks} planning layout/save/reload/conflict/finance checks, 24 axe audits, both languages/themes. Synthetic API fixtures only.`,
  );
} finally {
  await browser.close();
}
