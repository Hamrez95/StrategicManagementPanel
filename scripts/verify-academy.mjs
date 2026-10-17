import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const url = process.env.STRATINO_ACADEMY_URL || 'http://127.0.0.1:5187';
const server = process.env.STRATINO_ACADEMY_URL
  ? null
  : spawn(
      process.execPath,
      [
        '../../node_modules/vite/bin/vite.js',
        '--host',
        '127.0.0.1',
        '--port',
        '5187',
        '--strictPort',
      ],
      {
        cwd: 'apps/web',
        env: { ...process.env, VITE_ACADEMY_PREVIEW: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
let logs = '';
server?.stdout.on('data', (data) => {
  logs += data;
});
server?.stderr.on('data', (data) => {
  logs += data;
});
const results = [];
const errors = [],
  apiRequests = [];
let browser;
await mkdir('test-results/academy', { recursive: true });
try {
  for (let i = 0; i < 100; i++) {
    if (server?.exitCode !== null && server) throw new Error(logs);
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* startup */
    }
    if (i === 99) throw new Error('Vite did not start: ' + logs);
    await setTimeout(100);
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.STRATEGY_BROWSER_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  await page.goto(url + '/academy');
  await page.getByRole('heading', { name: 'کسب‌وکار چگونه کار می‌کند؟', exact: true }).waitFor();
  assert.equal(await page.locator('.academy-node--locked').count(), 5);
  await page.screenshot({
    path: 'test-results/academy/path-start.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.goto(url + '/academy/lesson/cash');
  await page.getByRole('heading', { name: 'اول پیش‌نیاز را تمرین کن' }).waitFor();
  assert.equal(await page.getByRole('radio').count(), 0);
  await page.goto(url + '/academy/lesson/unknown');
  await page.getByRole('heading', { name: 'این درس پیدا نشد' }).waitFor();
  await page.goto(url + '/academy/lesson/customer');
  const submit = page.getByRole('button', { name: 'بررسی پاسخ‌ها' });
  assert.equal(await submit.isDisabled(), true);
  await page.getByRole('textbox').fill('مشتری نمونه؛ فرضیه نیاز هنوز بررسی نشده است.');
  await page.locator('fieldset').nth(0).getByRole('radio').nth(0).check();
  await page.locator('fieldset').nth(1).getByRole('radio').nth(0).check();
  await submit.click();
  await page.getByRole('heading', { name: 'یک بار دیگر، با دلیل روشن‌تر' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'درس بعدی', exact: true }).count(), 0);
  assert.equal(
    await page.getByRole('textbox').inputValue(),
    'مشتری نمونه؛ فرضیه نیاز هنوز بررسی نشده است.',
  );
  await page.getByRole('button', { name: 'دوباره تمرین می‌کنم' }).click();
  // Keyboard can select native radios and submit without pointer.
  const firstRadio = page.locator('fieldset').nth(0).getByRole('radio').nth(0);
  await firstRadio.focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('fieldset').nth(0).getByRole('radio').nth(1).isChecked(), true);
  await page.locator('fieldset').nth(1).getByRole('radio').nth(2).check();
  await submit.click();
  await page.getByRole('heading', { name: 'این تمرین را کامل کردی' }).waitFor();
  assert.equal(
    await page
      .locator('.academy-feedback')
      .evaluate((element) => document.activeElement === element),
    true,
  );
  await page.screenshot({
    path: 'test-results/academy/lesson-feedback.png',
    fullPage: true,
    animations: 'disabled',
  });
  const feedbackAxe = await new AxeBuilder({ page }).include('.academy').analyze();
  assert.deepEqual(
    feedbackAxe.violations.map(({ id }) => id),
    [],
  );
  await page.reload();
  await page.getByRole('link', { name: 'بازگشت به مسیر', exact: true }).click();
  await page.locator('.academy-node--completed').first().waitFor();
  assert.equal(await page.locator('.academy-node--completed').count(), 1);
  const answers = [
    ['evidence', 1, 0],
    ['profit', 2, 1],
    ['cash', 0, 1],
    ['competition', 2, 1],
    ['checkpoint', 1, 2],
  ];
  for (const [id, a, b] of answers) {
    await page.goto(url + '/academy/lesson/' + id);
    await page.locator('fieldset').nth(0).getByRole('radio').nth(a).check();
    await page.locator('fieldset').nth(1).getByRole('radio').nth(b).check();
    await page.getByRole('button', { name: 'بررسی پاسخ‌ها' }).click();
    await page.getByRole('heading', { name: 'این تمرین را کامل کردی' }).waitFor();
  }
  await page.goto(url + '/academy');
  await page.getByRole('heading', { name: 'کسب‌وکار چگونه کار می‌کند؟', exact: true }).waitFor();
  assert.equal(await page.locator('.academy-node--completed').count(), 6);
  assert.equal(await page.locator('#academy-progress').getAttribute('value'), '6');
  results.push(
    'full six-lesson story, failure/retry, keyboard, focus, reload and prerequisite gate',
  );
  await page.getByRole('button', { name: /مدیریت استراتژیک/ }).click();
  assert.equal(await page.locator('.academy-roadmap > li').count(), 5);
  await page.getByRole('heading', { name: 'دفاع از استراتژی' }).waitFor();
  results.push('advanced roadmap visibly planned, not published');
  for (const language of ['fa', 'en'])
    for (const theme of ['light', 'dark'])
      for (const width of [360, 768, 1280, 1440]) {
        await page.evaluate(
          ({ language, theme }) =>
            localStorage.setItem(
              'stratino-preferences-v1',
              JSON.stringify({ language, theme, motion: 'reduced', show_tutorial: true }),
            ),
          { language, theme },
        );
        await page.setViewportSize({ width, height: 1100 });
        await page.goto(url + '/academy');
        await page
          .getByRole('heading', { name: 'کسب‌وکار چگونه کار می‌کند؟', exact: true })
          .waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          `overflow ${language}/${theme}/${width}`,
        );
        assert.equal(await page.getAttribute('html', 'dir'), language === 'fa' ? 'rtl' : 'ltr');
        await page.screenshot({
          path: `test-results/academy/path-${language}-${theme}-${width}.png`,
          fullPage: true,
          animations: 'disabled',
        });
        if (width === 1440) {
          const axe = await new AxeBuilder({ page }).include('.academy').analyze();
          assert.deepEqual(
            axe.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) })),
            [],
            `axe ${language}/${theme}`,
          );
        }
        results.push(`path ${language}/${theme}/${width}`);
      }
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(url + '/academy/lesson/customer');
  await page.getByRole('heading', { name: 'از مشتری شروع کن', exact: true }).waitFor();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    '200% font zoom overflow',
  );
  await page.screenshot({
    path: 'test-results/academy/lesson-zoom.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.academy-node-disc').count(), 0);
  await page.goto(url + '/academy');
  assert.equal(
    await page
      .locator('.academy-node-disc')
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration),
    '0s',
  );
  results.push('200% font enlargement and system/personal reduced motion');
  assert.deepEqual(apiRequests, [], 'preview must not read company/account APIs');
  const broken = await context.newPage();
  await broken.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('blocked', 'QuotaExceededError');
    };
  });
  await broken.goto(url + '/academy/lesson/customer');
  await broken.locator('fieldset').nth(0).getByRole('radio').nth(1).check();
  await broken.locator('fieldset').nth(1).getByRole('radio').nth(2).check();
  await broken.getByRole('button', { name: 'بررسی پاسخ‌ها' }).click();
  await broken.getByRole('alert').filter({ hasText: 'در مرورگر ذخیره نشد' }).waitFor();
  await broken.close();
  results.push('blocked browser storage reports unsaved progress');
  assert.deepEqual(errors, []);
  await writeFile(
    'test-results/academy/report.json',
    JSON.stringify({ results, axeAudits: 5, apiRequests, errors, serverLogs: logs }, null, 2),
  );
  console.log(
    `Academy browser: ${results.length} checks, 5 scoped axe audits, 0 company/account API requests, 0 page errors.`,
  );
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
