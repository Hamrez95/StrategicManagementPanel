import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ executablePath: process.env.STRATEGY_BROWSER_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const base = process.env.STRATINO_UI_URL || 'http://localhost:5173';
const results = [];
const failures = [];
const luminance = (rgb) => rgb.slice(0, 3).map((n) => { const v = n / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
await mkdir('test-results/ui', { recursive: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto(base + '/__dev/ui');
  await page.getByRole('heading', { name: 'اجزای فضای کاری استراتینو' }).waitFor();
  for (const width of [360, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      if (await page.getAttribute('html', 'data-theme') !== theme) await page.getByRole('button', { name: 'تغییر تم' }).click();
      for (const language of ['fa', 'en']) {
        const english = language === 'en';
        if (await page.locator('.component-lab').getAttribute('lang') !== language) await page.locator('.component-lab').getByRole('button', { name: english ? 'English' : 'فارسی', exact: true }).click();
        assert.equal(await page.locator('.component-lab').evaluate((el) => getComputedStyle(el).direction), english ? 'ltr' : 'rtl');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `page overflow ${width}/${theme}/${language}`);
        assert.equal(await page.locator('.ui-table-scroll').evaluate((el) => el.scrollWidth > el.clientWidth), width === 360);
        assert.match(await page.locator('.ui-numeric').first().innerText(), english ? /60%/ : /۶۰٪/);
        await page.screenshot({ path: `test-results/ui/components-${width}-${theme}-${language}.png`, fullPage: true, animations: 'disabled' });
        const axe = await new AxeBuilder({ page }).include('.component-lab').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        assert.deepEqual(axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), [], `axe ${width}/${theme}/${language}`);
        results.push({ width, theme, language, overflow: false, axeViolations: axe.violations.length });
      }
      const colors = await page.evaluate(() => {
        const get = (name) => { const el = document.createElement('span'); el.style.color = `var(${name})`; document.body.append(el); const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const ctx = canvas.getContext('2d'); ctx.fillStyle = getComputedStyle(el).color; ctx.fillRect(0, 0, 1, 1); const value = Array.from(ctx.getImageData(0, 0, 1, 1).data); el.remove(); return value; };
        return Object.fromEntries(['--ink', '--muted', '--paper', '--canvas', '--action', '--control', '--danger', '--danger-wash', '--action-fill', '--on-action'].map((key) => [key, get(key)]));
      });
      for (const [foreground, background, minimum] of [['--ink', '--paper', 4.5], ['--muted', '--canvas', 4.5], ['--action', '--paper', 4.5], ['--control', '--paper', 3], ['--danger', '--danger-wash', 4.5], ['--on-action', '--action-fill', 4.5]])
        assert.ok(contrast(colors[foreground], colors[background]) >= minimum, `${theme} contrast ${foreground}/${background}`);
    }
  }
  // Both directions: keyboard tabs, modal focus containment and restoration, validation, toast.
  for (const english of [false, true]) {
    const language = english ? 'en' : 'fa';
    if (await page.locator('.component-lab').getAttribute('lang') !== language) await page.locator('.component-lab').getByRole('button', { name: english ? 'English' : 'فارسی', exact: true }).click();
    const trigger = page.getByRole('button', { name: english ? 'Edit sample project' : 'ویرایش پروژه نمونه', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    assert.equal(await dialog.getAttribute('dir'), english ? 'ltr' : 'rtl');
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); assert.equal(await dialog.evaluate((el) => el.contains(document.activeElement)), true); }
    await dialog.getByRole('textbox').fill('');
    await dialog.getByRole('button', { name: english ? 'Apply to preview' : 'اعمال در پیش‌نمایش' }).click();
    assert.equal(await dialog.getByRole('textbox').getAttribute('aria-invalid'), 'true');
    const errorId = await dialog.getByRole('textbox').getAttribute('aria-describedby');
    assert.ok(errorId.includes('-error'));
    await dialog.getByRole('textbox').fill(english ? 'Retained draft' : 'متن باقی‌مانده');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
    await trigger.click(); await dialog.waitFor();
    assert.equal(await dialog.getByRole('textbox').inputValue(), english ? 'Retained draft' : 'متن باقی‌مانده');
    await dialog.getByRole('button', { name: english ? 'Apply to preview' : 'اعمال در پیش‌نمایش' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.locator('.ui-toast').filter({ hasText: english ? 'Preview updated' : 'پیش‌نمایش تغییر کرد' }).waitFor();
    await page.locator('.ui-toast').getByRole('button').last().click();
    const first = page.getByRole('tab', { name: english ? 'Decisions' : 'تصمیم‌ها', exact: true });
    await first.click(); await first.focus(); await page.keyboard.press(english ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForFunction((name) => Array.from(document.querySelectorAll('[role=tab]')).find((el) => el.textContent === name)?.getAttribute('aria-selected') === 'true', english ? 'No data' : 'بدون داده');
    await page.getByRole('heading', { name: english ? 'No decisions yet' : 'هنوز تصمیمی ثبت نشده' }).waitFor();
    await page.getByRole('tab', { name: english ? 'Loading' : 'در حال دریافت', exact: true }).click();
    const reduced = page.getByRole('checkbox', { name: english ? 'Reduce motion' : 'کاهش حرکت' });
    await reduced.check();
    assert.equal(await page.locator('.ui-skeleton-line').first().evaluate((el) => getComputedStyle(el).animationName), 'none');
    assert.equal(await page.locator('.ui-spinner').evaluate((el) => getComputedStyle(el).animationName), 'none');
    await trigger.click(); await dialog.waitFor();
    assert.equal(await dialog.evaluate((el) => getComputedStyle(el).animationName), 'none');
    await page.keyboard.press('Escape'); await reduced.uncheck();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.ui-skeleton-line').first().evaluate((el) => getComputedStyle(el).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
  // 200% text enlargement at narrow and wide widths, plus full layout zoom on desktop.
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `text zoom overflow ${width}`);
    await page.screenshot({ path: `test-results/ui/zoom-text-${width}.png`, fullPage: true, animations: 'disabled' });
    await page.evaluate(() => document.documentElement.style.fontSize = '');
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.evaluate(() => document.body.style.zoom = '2');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'layout zoom overflow');
  await page.screenshot({ path: 'test-results/ui/zoom-layout-200.png', fullPage: true, animations: 'disabled' });
  await page.evaluate(() => document.body.style.zoom = '');
  if (process.env.STRATINO_PRODUCTION_URL) {
    await page.goto(process.env.STRATINO_PRODUCTION_URL + '/__dev/ui');
    await page.getByRole('heading', { name: 'صفحه پیدا نشد' }).waitFor();
    assert.equal(await page.locator('.component-lab').count(), 0);
  }
  assert.deepEqual(failures, []);
  await writeFile('test-results/ui/report.json', JSON.stringify({ results, keyboardAndStates: true, reducedMotion: true, textZoom: '200%', layoutZoom: '200%', productionBoundaryChecked: Boolean(process.env.STRATINO_PRODUCTION_URL), errors: failures }, null, 2));
  console.log(`PASS: ${results.length} viewport/theme/direction checks, axe/contrast, modal keyboard, retained input, tabs, notifications, reduced motion and 200% zoom.`);
} finally { await browser.close(); }
