import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:5180';
const output = 'test-results/product-experience';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const apiRequests = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
});
async function visit(route, heading) {
  await page.goto(base + route);
  await page.getByRole('heading', { name: heading, exact: true }).waitFor();
}
async function capture(name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => {})),
    );
  });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
function link(name) {
  return page.getByRole('link', { name, exact: true });
}
function button(name) {
  return page.getByRole('button', { name, exact: true });
}
try {
  await visit('/', /مسیر کسب‌وکارت/);
  await capture('site-desktop');
  await link('رفتن به محتوای اصلی').focus();
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(new URL(page.url()).hash, '#content');
  await link('چطور کار می‌کند؟').click();
  assert.equal(new URL(page.url()).pathname, '/');
  await visit('/management-preview', 'ورود به حساب');
  await capture('login-desktop');
  await page.getByLabel('نشانی ایمیل').fill('hamrez95@stratino.test');
  await page.getByLabel('گذرواژه', { exact: true }).fill('wrong');
  await button('ورود به فضای کار').click();
  await page.getByText('ایمیل یا گذرواژهٔ حساب تست درست نیست.').waitFor();
  await page.getByLabel('گذرواژه', { exact: true }).fill('123456');
  await button('ورود به فضای کار').click();
  await page.getByRole('heading', { name: 'حمیدرضا، به استراتینو خوش آمدی.' }).waitFor();
  await capture('welcome-desktop');
  await link('اول یک معرفی کوتاه می‌بینم').click();
  await button('ادامهٔ معرفی').click();
  await button('ادامهٔ معرفی').click();
  await link('ساخت فضای کار من').click();
  await page.getByLabel('نام کسب‌وکار', { exact: true }).fill('استودیو آبان');
  await button('ادامه').click();
  await page.getByRole('radio', { name: /کسب‌وکار فعال/ }).check();
  await button('ادامه').click();
  await page.getByRole('radio', { name: 'دارای محصول و مشتری' }).check();
  await button('ادامه').click();
  await page.getByRole('radio', { name: 'رشد کسب‌وکار' }).check();
  await capture('question-desktop');
  await button('ادامه').click();
  await page.getByRole('radio', { name: 'حفظ مشتری فعلی' }).check();
  await button('ادامه').click();
  await capture('review-desktop');
  await button('ساخت فضای کار').click();
  await page.getByRole('heading', { name: 'فضای کار استودیو آبان', exact: true }).waitFor();
  const workspaceUrl = new URL(page.url()).pathname.replace('/overview', '');
  await capture('overview-desktop');
  assert.equal(await page.locator('.ex-shortcut').count(), 3);
  assert.match(await page.locator('.ex-shortcuts').innerText(), /اقتصاد کسب‌وکار/);
  await visit(workspaceUrl + '/tool/customer', 'شناخت مشتری');
  await page.getByRole('textbox', { name: /مشتری هدف/ }).fill('مدیران کسب‌وکارهای کوچک');
  await page.reload();
  await page.getByRole('textbox', { name: /مشتری هدف/ }).waitFor();
  assert.equal(
    await page.getByRole('textbox', { name: /مشتری هدف/ }).inputValue(),
    'مدیران کسب‌وکارهای کوچک',
  );
  await visit(workspaceUrl + '/actions', 'اقدامات');
  await page.getByLabel('عنوان اقدام جدید').fill('مرور بازخورد مشتریان');
  await button('ثبت اقدام').click();
  await page.getByRole('combobox', { name: 'وضعیت' }).selectOption('doing');
  assert.equal(await page.locator('.ex-kanban-column--doing .ex-task').count(), 1);
  await page
    .locator('.ex-kanban-column--doing .ex-task')
    .dragTo(page.locator('.ex-kanban-column--done'));
  assert.equal(await page.locator('.ex-kanban-column--done .ex-task').count(), 1);
  await capture('actions-desktop');
  await visit(workspaceUrl + '/library', 'کتابخانه');
  await button('یادداشت تازه').click();
  await page.keyboard.press('Escape');
  await button('یادداشت تازه').click();
  await page.getByLabel('عنوان', { exact: true }).fill('گفت‌وگوی مشتری');
  await page
    .getByLabel('متن و منبع', { exact: true })
    .fill('نمونهٔ ثبت منبع در فضای همین کسب‌وکار');
  await button('ذخیرهٔ یادداشت').click();
  await page.getByRole('heading', { name: 'گفت‌وگوی مشتری' }).waitFor();
  await visit('/preview/workspaces', 'فضاهای کاری من');
  await link('ساخت فضای کار').click();
  await page.getByLabel('نام کسب‌وکار', { exact: true }).fill('کسب‌وکار دوم');
  await button('با همین نام، یک فضای خالی می‌سازم').click();
  await page.getByRole('heading', { name: 'فضای کار کسب‌وکار دوم' }).waitFor();
  const secondUrl = new URL(page.url()).pathname.replace('/overview', '');
  await visit(secondUrl + '/business', 'شناخت کسب‌وکار');
  await page.getByText('نوع کسب‌وکار هنوز مشخص نشده', { exact: true }).waitFor();
  await page.getByText('هنوز انتخاب نشده', { exact: true }).waitFor();
  await visit(secondUrl + '/tool/customer', 'شناخت مشتری');
  assert.equal(await page.getByRole('textbox', { name: /مشتری هدف/ }).inputValue(), '');
  await visit(secondUrl + '/actions', 'اقدامات');
  assert.equal(await page.locator('.ex-task').count(), 0);
  await visit('/preview/workspaces', 'فضاهای کاری من');
  await button('افزودن دو فضای نمونه').click();
  assert.equal(await page.locator('.ex-space-card').count(), 4);
  await capture('workspaces-desktop');
  const routes = [
    ['/', /مسیر کسب‌وکارت/],
    ['/account/login', 'ورود به حساب'],
    ['/preview/workspaces', 'فضاهای کاری من'],
    ['/preview/new', 'اسم کسب‌وکارت چیست؟'],
    [workspaceUrl + '/overview', 'فضای کار استودیو آبان'],
    [workspaceUrl + '/business', 'شناخت کسب‌وکار'],
    [workspaceUrl + '/strategy', 'تحلیل‌ها'],
    [workspaceUrl + '/tool/swot', 'تحلیل SWOT'],
    [workspaceUrl + '/actions', 'اقدامات'],
    [workspaceUrl + '/library', 'کتابخانه'],
    [workspaceUrl + '/settings', 'تنظیمات فضای کار'],
    [workspaceUrl + '/reports', 'گزارش کسب‌وکار'],
    ['/preview/account', 'حساب و ظاهر برنامه'],
    ['/preview/plans', 'دسترسی‌ها و اشتراک'],
  ];
  const audits = [];
  for (const width of [360, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [route, heading] of routes) {
      await visit(route, heading);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `Overflow at ${width}: ${route}`,
      );
    }
    await visit(workspaceUrl + '/overview', 'فضای کار استودیو آبان');
    await capture(`overview-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [route, heading] of routes) {
    await visit(route, heading);
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    audits.push({
      route,
      violations: audit.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    });
  }
  await writeFile(`${output}/accessibility.json`, JSON.stringify(audits, null, 2));
  assert.deepEqual(
    audits.filter((a) => a.violations.length),
    [],
    'Accessibility violations',
  );
  await visit('/preview/account', 'حساب و ظاهر برنامه');
  await page.getByRole('radio', { name: 'تیره', exact: true }).check();
  await page.getByRole('checkbox', { name: 'کاهش حرکت و انیمیشن' }).check();
  await visit(workspaceUrl + '/overview', 'فضای کار استودیو آبان');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await capture('overview-dark');
  await visit('/preview/new', 'اسم کسب‌وکارت چیست؟');
  assert.equal(
    await page.locator('.ex-question').evaluate((e) => getComputedStyle(e).animationName),
    'none',
  );
  await visit('/preview/w/missing/overview', 'این فضای کار پیدا نشد');
  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, [], 'The design fixture must never call real APIs');
  console.log(
    'PASS: local login, welcome/tour, guided/blank workspace creation, tailoring, persistence, Workspace isolation, actions, notes, 56 responsive route checks, 14 accessibility audits, dark mode and reduced motion.',
  );
} catch (error) {
  console.error('Failed URL:', page.url(), 'Browser errors:', errors);
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
