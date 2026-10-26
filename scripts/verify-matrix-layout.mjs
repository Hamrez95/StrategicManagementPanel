import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { evaluateMatrix } from '../packages/domain/dist/evaluation-matrices.js';

const base = process.argv[2] || process.env.STRATINO_UI_URL || 'http://127.0.0.1:5193';
const folder = 'test-results/matrix-layout';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'chrome' : undefined,
});
const id = '00000000-0000-4000-8000-000000000001';
let checks = 0;
try {
  for (const language of ['fa', 'en'])
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const preferences = { language, theme, motion: 'reduced', show_tutorial: false };
      await context.addInitScript(
        (value) => localStorage.setItem('stratino-preferences-v1', JSON.stringify(value)),
        preferences,
      );
      const records = ['efe', 'ife'].map((kind) => {
        const rows = [
          {
            id: kind + '-row',
            title: 'عامل آزمایشی',
            factor_type: kind === 'efe' ? 'opportunity' : 'strength',
            weight: 100,
            rating: kind === 'efe' ? 3 : 4,
            evidence: 'منبع آزمایشی برای بررسی رابط',
          },
        ];
        return {
          id: kind + '-analysis',
          workspace_id: id,
          kind,
          state: 'draft',
          revision: 1,
          schema_version: 1,
          method_version: kind + '-v1',
          inputs: { rows },
          output: evaluateMatrix(kind, rows),
          created_at: '2026-10-26T00:00:00Z',
          updated_at: '2026-10-26T00:00:00Z',
        };
      });
      let saved = 0;
      await context.route(/\/api\/v1\//, async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        let body;
        if (path === '/api/v1/session/')
          body = {
            authenticated: true,
            user: { id, name: 'مدیر آزمایشی', is_staff: false },
            workspaces: [{ id, name: 'بررسی چیدمان', role: 'owner' }],
          };
        else if (path === '/api/v1/account/preferences/')
          body = { ...preferences, updated_at: '2026-10-26T00:00:00Z', device_sync_pending: false };
        else if (path === '/api/v1/csrf/')
          return route.fulfill({
            json: {},
            headers: { 'Set-Cookie': 'csrftoken=matrix-layout-fixture; Path=/; SameSite=Lax' },
          });
        else if (path.endsWith('/strategy/')) body = { workspace_id: id, factors: [], options: [] };
        else if (path.endsWith('/analyses/')) body = { items: records, next_cursor: null };
        else if (path.includes('/analyses/') && request.method() === 'PATCH') {
          assert.ok(request.headers()['x-csrftoken']);
          const data = request.postDataJSON();
          const record = records.find((row) => row.kind === data.kind);
          assert.equal(data.inputs.rows[0].id, record.inputs.rows[0].id);
          Object.assign(record, data, {
            revision: record.revision + 1,
            output: evaluateMatrix(data.kind, data.inputs.rows),
          });
          saved++;
          body = record;
        } else throw new Error('Unexpected matrix fixture request: ' + path);
        await route.fulfill({ json: body });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}/app/workspaces/${id}/tools/matrices`);
      await page.locator('.evaluation-table input[type="text"]').waitFor();
      for (const width of [360, 480, 768, 1024, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => scrollTo(0, 0));
        const overflow = await page.evaluate(() => ({
          page: document.documentElement.scrollWidth > innerWidth,
          editor:
            document.querySelector('.evaluation-table-scroll').scrollWidth >
            document.querySelector('.evaluation-table-scroll').clientWidth,
        }));
        assert.deepEqual(
          overflow,
          { page: false, editor: false },
          `Unexpected horizontal scrolling ${language}/${theme}/${width}`,
        );
        for (const field of await page
          .locator('.evaluation-cell-field :is(input, select, textarea)')
          .all()) {
          const box = await field.boundingBox();
          assert.ok(
            box.x >= 0 && box.x + box.width <= width && box.height >= 44,
            `Clipped or tiny field at ${width}`,
          );
        }
        await page.locator('.evaluation-table input[type="text"]').fill('دادهٔ حفظ‌شده');
        if (width >= 1280) {
          await page.evaluate(() => scrollTo(0, 0));
          const saveBox = await page
            .getByRole('button', {
              name: language === 'en' ? 'Save draft' : 'ذخیره پیش‌نویس',
              exact: true,
            })
            .boundingBox();
          assert.ok(
            saveBox.y + saveBox.height <= 900,
            `Single-row save actions must fit the desktop viewport ${language}/${theme}/${width}: ${saveBox.y + saveBox.height}`,
          );
        }
        assert.equal(
          await page.locator('.evaluation-table input[type="text"]').inputValue(),
          'دادهٔ حفظ‌شده',
        );
        if (width === 1280 || width === 360) {
          await page.screenshot({
            path: `${folder}/matrix-${width}-${language}-${theme}.png`,
            fullPage: true,
            animations: 'disabled',
          });
          if (width === 1280 && language === 'fa' && theme === 'light')
            await page.screenshot({
              path: `${folder}/matrix-desktop-viewport.png`,
              animations: 'disabled',
            });
        }
        checks++;
      }
      const notes = page.locator('.evaluation-method-notes');
      await notes.locator('summary').click();
      assert.ok(await notes.locator('.evaluation-result__limitation').isVisible());
      await page
        .getByRole('button', {
          name: language === 'en' ? 'Save draft' : 'ذخیره پیش‌نویس',
          exact: true,
        })
        .click();
      await page
        .getByRole('status')
        .filter({ hasText: language === 'en' ? 'Draft saved.' : 'پیش‌نویس ذخیره شد.' })
        .waitFor();
      assert.equal(saved, 1);
      await page.reload();
      await page.locator('.evaluation-table input[type="text"]').waitFor();
      assert.equal(
        await page.locator('.evaluation-table input[type="text"]').inputValue(),
        'دادهٔ حفظ‌شده',
      );
      assert.match(await page.locator('.evaluation-result h2').innerText(), /[3۳]/);
      await page.getByRole('button', { name: /IFE/ }).click();
      assert.match(await page.locator('.evaluation-result h2').innerText(), /[4۴]/);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await page.screenshot({ path: `${folder}/zoom-${language}-${theme}.png`, fullPage: true });
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            document.querySelector('.evaluation-table-scroll').scrollWidth <=
              document.querySelector('.evaluation-table-scroll').clientWidth,
        ),
        JSON.stringify({
          sizes: await page.evaluate(() => ({
            page: document.documentElement.scrollWidth,
            viewport: innerWidth,
            editor: document.querySelector('.evaluation-table-scroll').scrollWidth,
            editorWidth: document.querySelector('.evaluation-table-scroll').clientWidth,
            overflow: [...document.querySelectorAll('.evaluation-table-scroll *')]
              .filter((node) => {
                const rect = node.getBoundingClientRect(),
                  parent = document
                    .querySelector('.evaluation-table-scroll')
                    .getBoundingClientRect();
                return (
                  rect.width > 2 && (rect.left < parent.left - 1 || rect.right > parent.right + 1)
                );
              })
              .slice(0, 8)
              .map((node) => ({
                tag: node.tagName,
                class: node.className,
                width: node.getBoundingClientRect().width,
                left: node.getBoundingClientRect().left,
                right: node.getBoundingClientRect().right,
              })),
          })),
          nodes: await page.evaluate(() =>
            [...document.querySelectorAll('.evaluation-page *')]
              .filter(
                (node) =>
                  node.getBoundingClientRect().right > innerWidth + 1 ||
                  node.getBoundingClientRect().left < -1,
              )
              .slice(0, 10)
              .map((node) => ({
                tag: node.tagName,
                class: node.className,
                width: node.getBoundingClientRect().width,
              })),
          ),
        }),
      );
      const axe = await new AxeBuilder({ page }).include('.evaluation-page').analyze();
      assert.deepEqual(
        axe.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })),
        [],
      );
      assert.deepEqual(errors, []);
      checks += 5;
      await context.close();
    }
  console.log(
    `PASS: ${checks} matrix layout/interaction checks: no horizontal editor scrolling, two languages/themes, seven widths, 200% text, saved input retention and EFE/IFE scores. Synthetic API fixtures only.`,
  );
} finally {
  await browser.close();
}
