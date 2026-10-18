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
let axeAudits = 5;
const mascotMoods = new Set();
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
  async function expectMascot(target, mood) {
    const mascot = target.locator(`.academy-mascot[data-mood="${mood}"]`).first();
    await mascot.waitFor();
    assert.equal(
      await mascot.evaluate(async (image) => {
        await image.decode();
        return image.naturalWidth === 320 && image.naturalHeight === 480;
      }),
      true,
      `mascot asset loads: ${mood}`,
    );
    mascotMoods.add(mood);
  }
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  await page.goto(url + '/academy');
  await page.getByRole('heading', { name: 'کسب‌وکار چگونه کار می‌کند؟', exact: true }).waitFor();
  await expectMascot(page, 'welcome');
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
  async function startLesson(target) {
    await expectMascot(target, 'welcome');
    await target.getByRole('button', { name: 'بریم سراغش', exact: true }).click();
    await expectMascot(target, 'thinking');
    await target.getByRole('radio').first().check();
    await target.getByRole('button', { name: 'ادامه', exact: true }).click();
    await expectMascot(target, 'guidance');
    await target.getByRole('button', { name: 'ادامه', exact: true }).click();
    for (let i = 0; i < 3; i++) {
      assert.equal(await target.locator('.academy-concept').count(), 1);
      assert.equal(await target.locator('.academy-player').getAttribute('data-stage'), 'learn');
      await target.getByRole('button', { name: 'ادامه', exact: true }).click();
    }
    assert.equal(await target.locator('.academy-player').getAttribute('data-stage'), 'quiz');
  }
  async function answer(target, index) {
    const submit = target.getByRole('button', { name: 'بررسی پاسخ', exact: true });
    assert.equal(await submit.isDisabled(), true);
    await target.getByRole('radio').nth(index).check();
    await submit.click();
    await expectMascot(
      target,
      (await target.locator('.academy-feedback--passed').count()) ? 'correct' : 'retry',
    );
    assert.equal(await target.getByRole('radio').first().isDisabled(), true);
    assert.equal(
      await target.locator('.academy-feedback').evaluate((el) => document.activeElement === el),
      true,
    );
    await target.getByRole('button', { name: 'ادامه', exact: true }).click();
  }
  await page.goto(url + '/academy/lesson/customer');
  await startLesson(page);
  assert.equal(await page.locator('fieldset').count(), 1, 'one decision per screen');
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem('stratino-academy-preview-v1')),
    null,
    'prediction does not award completion',
  );
  await page.screenshot({
    path: 'test-results/academy/lesson-question.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('radio').first().check();
  await page.reload();
  assert.equal(await page.getByRole('radio').first().isChecked(), true);
  await page.getByRole('button', { name: 'بررسی پاسخ', exact: true }).click();
  await page.getByText('بیاییم دلیلش را ببینیم', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'ادامه', exact: true }).click();
  await answer(page, 0);
  await page.getByRole('heading', { name: 'یک بار دیگر، با دلیل روشن‌تر' }).waitFor();
  assert.equal(await page.locator('#academy-progress').count(), 0);
  await page.getByRole('textbox').fill('مشتری نمونه؛ فرضیه نیاز هنوز بررسی نشده است.');
  await page.reload();
  assert.equal(
    await page.getByRole('textbox').inputValue(),
    'مشتری نمونه؛ فرضیه نیاز هنوز بررسی نشده است.',
  );
  await page.getByRole('button', { name: 'دوباره تمرین می‌کنم' }).click();
  // Native radios remain usable with the keyboard in the staged exercise.
  await page.getByRole('radio').first().focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.getByRole('radio').nth(1).isChecked(), true);
  await page.getByRole('button', { name: 'بررسی پاسخ', exact: true }).click();
  await page.getByRole('button', { name: 'ادامه', exact: true }).click();
  await answer(page, 2);
  await page.getByRole('heading', { name: 'این تمرین را کامل کردی' }).waitFor();
  await expectMascot(page, 'celebration');
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
  await page.getByRole('button', { name: 'بازگشت به مسیر', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'فعلاً برمی‌گردم' }).click();
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
    await startLesson(page);
    await answer(page, a);
    await answer(page, b);
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
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 1280]) {
      await page.evaluate(
        (theme) =>
          localStorage.setItem(
            'stratino-preferences-v1',
            JSON.stringify({ language: 'fa', theme, motion: 'reduced', show_tutorial: true }),
          ),
        theme,
      );
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['catalog', 'review', 'guide']) {
        await page.goto(`${url}/academy/${route}`);
        await page.locator('.academy-page h1').waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          `${route}/${theme}/${width}`,
        );
        const audit = await new AxeBuilder({ page }).include('.academy').analyze();
        assert.deepEqual(
          audit.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
          [],
          `${route} accessibility`,
        );
        axeAudits++;
        await page.screenshot({
          path: `test-results/academy/${route}-${theme}-${width}.png`,
          fullPage: true,
          animations: 'disabled',
        });
        if (route === 'catalog') {
          assert.equal(await page.locator('.academy-course').count(), 12);
          await page.getByRole('searchbox').fill('مدیریت استراتژیک');
          assert.equal(await page.locator('.academy-course').count(), 1);
          await page.getByRole('searchbox').fill('موضوع ناموجود');
          await page.getByRole('heading', { name: 'این حوزه را پیدا نکردیم' }).waitFor();
          await page.getByRole('button', { name: 'پاک‌کردن جست‌وجو' }).click();
          assert.equal(await page.locator('.academy-course').count(), 12);
        }
        if (route === 'review')
          assert.equal(
            await page.getByRole('link', { name: 'مرور این بخش', exact: true }).count(),
            6,
          );
        results.push(`${route}/${theme}/${width}: real navigation, content, layout and axe`);
      }
    }
  }
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
  await startLesson(broken);
  await answer(broken, 1);
  await answer(broken, 2);
  await broken
    .getByRole('alert')
    .filter({ hasText: 'تمرین انجام شد، اما در مرورگر ذخیره نشد' })
    .waitFor();
  await broken.close();
  results.push('blocked browser storage reports unsaved progress');
  const corrupt = await context.newPage();
  await corrupt.goto(url + '/academy/lesson/customer');
  for (const draft of [
    '{bad json',
    JSON.stringify({
      step: 6,
      answers: {},
      checked: false,
      note: '',
      prediction: '',
      learned: false,
    }),
  ]) {
    await corrupt.evaluate(
      (value) => sessionStorage.setItem('stratino-academy-draft-v2:customer:1', value),
      draft,
    );
    await corrupt.reload();
    await corrupt.getByRole('heading', { name: 'تو در تیم آوند هستی' }).waitFor();
    assert.equal(await corrupt.getByRole('radio').count(), 0);
  }
  await corrupt.close();
  results.push('corrupt and incomplete lesson drafts recover without skipping exercises');
  const mobile = await context.newPage();
  mobile.on('pageerror', (error) => errors.push(error.message));
  mobile.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.emulateMedia({ reducedMotion: 'no-preference' });
  await mobile.goto(url + '/academy');
  await mobile.evaluate(() =>
    localStorage.setItem(
      'stratino-preferences-v1',
      JSON.stringify({ language: 'fa', theme: 'dark', motion: 'auto', show_tutorial: true }),
    ),
  );
  await mobile.goto(url + '/academy/lesson/customer');
  await mobile.getByRole('button', { name: 'بازگشت به مسیر', exact: true }).click();
  const dialog = mobile.getByRole('dialog');
  await dialog.getByRole('heading', { name: 'برای امروز کافی است؟' }).waitFor();
  const dialogAudit = await new AxeBuilder({ page: mobile }).include('.ui-dialog').analyze();
  assert.deepEqual(
    dialogAudit.violations.map((v) => v.id),
    [],
  );
  axeAudits++;
  await mobile.keyboard.press('Tab');
  assert.equal(await dialog.evaluate((el) => el.contains(document.activeElement)), true);
  await mobile.keyboard.press('Escape');
  assert.equal(
    await mobile
      .getByRole('button', { name: 'بازگشت به مسیر', exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await startLesson(mobile);
  await mobile.getByRole('radio').nth(1).check();
  await mobile.getByRole('button', { name: 'بازگشت به مسیر', exact: true }).click();
  await mobile.getByRole('dialog').getByRole('button', { name: 'فعلاً برمی‌گردم' }).click();
  await mobile.goto(url + '/academy/lesson/customer');
  assert.equal(await mobile.getByRole('radio').nth(1).isChecked(), true);
  await mobile.getByRole('button', { name: 'بررسی پاسخ', exact: true }).click();
  const particles = mobile.locator('.academy-burst i');
  assert.equal(await particles.count(), 12);
  assert.equal(
    await particles
      .first()
      .evaluate((el) => el.getAnimations().some((a) => a.effect.getTiming().iterations === 1)),
    true,
  );
  await mobile.screenshot({
    path: 'test-results/academy/mobile-correct-motion.png',
    fullPage: true,
  });
  await mobile.getByRole('button', { name: 'ادامه', exact: true }).click();
  await answer(mobile, 2);
  assert.equal(await mobile.locator('.academy-burst i').count(), 28);
  await mobile.getByRole('link', { name: 'درس بعدی', exact: true }).waitFor();
  await mobile.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await mobile.locator('.academy-burst').evaluate((el) => getComputedStyle(el).display),
    'none',
  );
  assert.equal(
    await mobile
      .locator('.academy-mascot')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  await mobile.screenshot({
    path: 'test-results/academy/mobile-result-dark.png',
    fullPage: true,
    animations: 'disabled',
  });
  await mobile.close();
  results.push(
    'mobile lesson: exit dialog focus trap/Escape, saved return, finite response and celebration animations, reduced motion',
  );
  await page.goto(url + '/academy/lesson/profit');
  assert.equal(await page.locator('h1 bdi[lang="en"][dir="ltr"]').textContent(), 'Profit');
  results.push(
    'technical term uses original English with Persian translation and isolated direction',
  );
  const legacy = await context.newPage();
  await legacy.goto(url + '/academy/lesson/customer');
  await legacy.evaluate(() => {
    sessionStorage.removeItem('stratino-academy-draft-v2:customer:1');
    sessionStorage.setItem(
      'stratino-academy-draft-v1:customer:1',
      JSON.stringify({ note: 'یادداشت نسخه قبلی من' }),
    );
  });
  await legacy.reload();
  await legacy.waitForFunction(
    () =>
      JSON.parse(sessionStorage.getItem('stratino-academy-draft-v2:customer:1') || '{}').note ===
      'یادداشت نسخه قبلی من',
  );
  await legacy.getByRole('heading', { name: 'تو در تیم آوند هستی' }).waitFor();
  await legacy.close();
  results.push('older lesson notes survive the learning-card flow upgrade');
  assert.deepEqual(errors, []);
  assert.deepEqual([...mascotMoods].sort(), [
    'celebration',
    'correct',
    'guidance',
    'retry',
    'thinking',
    'welcome',
  ]);
  results.push('all six mascot states render decoded local image assets');
  await writeFile(
    'test-results/academy/report.json',
    JSON.stringify({ results, axeAudits, apiRequests, errors, serverLogs: logs }, null, 2),
  );
  console.log(
    `Academy browser: ${results.length} checks, ${axeAudits} scoped axe audits, 0 company/account API requests, 0 page errors.`,
  );
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
