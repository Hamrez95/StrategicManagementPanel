import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const base = process.argv[2] || 'http://127.0.0.1:5180';
const output = 'test-results/guided-experience';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = [],
  requests = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (new URL(r.url()).pathname.startsWith('/api/')) requests.push(r.url());
});
const button = (name) => page.getByRole('button', { name, exact: true });
const fill = (name, value) => page.getByLabel(name).fill(value);
const go = async (suffix) => {
  await page.goto(base + '/preview/w/guided-one/' + suffix);
  await page.locator('h1').waitFor();
};
const next = () => button('ادامه').click();
async function capture(name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
  });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
try {
  await page.goto(base + '/account/login');
  await fill('نشانی ایمیل', 'hamrez95@stratino.test');
  await page.getByLabel('گذرواژه', { exact: true }).fill('123456');
  await button('ورود به فضای کار').click();
  await page.waitForURL('**/preview/**');
  await page.evaluate(() => {
    const create = (id, name) => ({
      id,
      name,
      kind: 'business',
      stage: 'operating',
      goal: 'growth',
      answer: '',
      color: 'blue',
      setupComplete: true,
      sample: false,
      notes: [],
      actions: [],
      toolNotes: {},
    });
    localStorage.setItem(
      'stratino-design-spaces-v1',
      JSON.stringify([create('guided-one', 'آزمایش مسیر تخصصی'), create('guided-two', 'فضای جدا')]),
    );
  });
  await go('tool/customer');
  await button('با هم شروع کنیم').click();
  await fill(/گروه مشتری/, 'فروشگاه‌های محلی با سفارش آنلاین');
  await next();
  await page.reload();
  await button('ادامهٔ تکمیل').click();
  await page.getByRole('heading', { name: 'چه کاری برای مشتری سخت است؟' }).waitFor();
  await button('بازگشت').click();
  assert.equal(
    await page.getByLabel(/گروه مشتری/).inputValue(),
    'فروشگاه‌های محلی با سفارش آنلاین',
  );
  await capture('customer-step-desktop');
  await go('tool/finance');
  await button('با هم شروع کنیم').click();
  await fill(/شروع دوره/, '2026-01-01');
  await fill(/پایان دوره و تاریخ/, '2026-01-31');
  await page.getByLabel('واحد پول', { exact: false }).selectOption('IRT');
  await page.getByLabel(/مقیاس مبالغ/).selectOption('1000000');
  await page.getByLabel(/مبنای گزارش/).selectOption('actual');
  await next();
  await fill(/درآمد خالص فروش/, '۲۰۰');
  await fill(/بهای تمام‌شدهٔ فروش/, '۱۲۰');
  await fill(/سود یا زیان خالص/, '-10');
  await next();
  await fill(/کل هزینهٔ متغیر/, '80');
  await fill(/هزینهٔ ثابت همین دوره/, '60');
  await fill(/چه هزینه‌هایی/, 'مواد و کارمزد متغیر؛ اجاره و حقوق ثابت.');
  await next();
  await fill(/دارایی‌های جاری/, '70');
  await fill(/بدهی‌های جاری/, '40');
  await fill(/کل دارایی ابتدای/, '300');
  await fill(/کل دارایی پایان/, '500');
  await fill(/حقوق صاحبان سهام پایان دوره/, '100');
  await next();
  await fill(/ماندهٔ نقد قابل/, '50');
  await fill(/خالص خروج نقد در یک ماه/, '10');
  await next();
  await fill(/هزینهٔ جذب در همین دوره/, '20');
  await fill(/تعداد مشتریان جدید/, '1.5');
  await next();
  await page.getByRole('alert').filter({ hasText: 'تعداد صحیح' }).waitFor();
  await fill(/تعداد مشتریان جدید/, '10');
  await next();
  await fill(/گزارش‌ها و منابع/, 'گزارش آموزشی؛ دادهٔ ساختگی برای آزمون.');
  await button('مرور و دیدن نتیجه').click();
  await page.getByRole('heading', { name: 'تصویر مالی این دوره' }).waitFor();
  assert.match(await page.locator('.gx-metrics').innerText(), /۸۰/);
  assert.match(await page.locator('.gx-metrics').innerText(), /۱۲۰/);
  await capture('finance-results-desktop');
  await button('نقدینگی').click();
  assert.match(await page.locator('.gx-metrics').innerText(), /۵/);
  await page.reload();
  await page.getByRole('heading', { name: 'تصویر مالی این دوره' }).waitFor();
  await go('tool/matrices');
  await button('با هم شروع کنیم').click();
  await fill('عنوان عامل', 'پشتیبانی سریع');
  await fill('شاهد، منبع و تاریخ', 'گزارش پشتیبانی دی؛ نمونه آموزشی');
  await next();
  await fill('وزن اهمیت این عامل، از ۱۰۰', '۶۰');
  await next();
  await page.getByRole('radio', { name: '۴ · قوت عمده' }).check();
  await button('ثبت این عامل').click();
  await button('مرور و محاسبه').click();
  assert.match(await page.locator('.gx-score').innerText(), /هنوز قابل محاسبه نیست/);
  await button('عامل تازه').click();
  await page.getByRole('radio', { name: 'ضعف داخلی' }).check();
  await fill('عنوان عامل', 'وابستگی به یک کانال');
  await fill('شاهد، منبع و تاریخ', 'گزارش فروش دی؛ نمونه آموزشی');
  await next();
  await fill('وزن اهمیت این عامل، از ۱۰۰', '۴۰');
  await next();
  await page.getByRole('radio', { name: '۲ · ضعف نسبی' }).check();
  await button('ثبت این عامل').click();
  await button('مرور و محاسبه').click();
  assert.match(await page.locator('.gx-score').innerText(), /۳٫۲ از ۴/);
  await capture('ife-results-desktop');
  await button('EFE · عوامل بیرونی').click();
  await button('با هم شروع کنیم').waitFor();
  assert.equal(await page.getByText('پشتیبانی سریع', { exact: true }).count(), 0);
  await button('IFE · عوامل داخلی').click();
  assert.match(await page.locator('.gx-score').innerText(), /۳٫۲ از ۴/);
  await go('library');
  await fill('جست‌وجوی مستند', 'خلاصه یک‌صفحه‌ای');
  await page.locator('.gx-doc-card').first().click();
  await button('نگارش با راهنما').click();
  await fill(/نام مسئول نگارش/, 'حمیدرضا');
  await fill(/نام بازبین/, 'بازبین نمونه');
  await next();
  await page
    .locator('.gx-card textarea')
    .fill('پیش‌نویس آزمایشی برای سرمایه‌گذار؛ اطلاعات واقعی شرکت نیست.');
  await button('فعلاً بستن').click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'evidence.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('workspace one attachment'),
  });
  await button('ذخیرهٔ فایل').click();
  await page.getByRole('status').filter({ hasText: 'فایل در همین مرورگر' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'دریافت evidence.txt', exact: true }).waitFor();
  const downloaded = page.waitForEvent('download');
  await button('دریافت evidence.txt').click();
  assert.equal(await readFile(await (await downloaded).path(), 'utf8'), 'workspace one attachment');
  await page.locator('input[type=file]').setInputFiles({
    name: 'rejected.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('rejected'),
  });
  await button('ذخیرهٔ فایل').click();
  await page.getByRole('alert').filter({ hasText: 'پشتیبانی نمی‌شود' }).waitFor();
  await capture('document-detail-desktop');
  const docPath = new URL(page.url()).pathname;
  await page.goto(base + docPath.replace('guided-one', 'guided-two'));
  await page.getByText('هنوز فایلی برای این مستند اضافه نشده است.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'دریافت evidence.txt' }).count(), 0);
  assert.equal(
    await page.getByText('پیش‌نویس آزمایشی برای سرمایه‌گذار؛ اطلاعات واقعی شرکت نیست.').count(),
    0,
  );
  await page.goto(base + docPath);
  await page.getByRole('button', { name: 'دریافت evidence.txt' }).waitFor();
  const audits = [];
  const routes = [
    'tool/customer',
    'tool/market',
    'tool/swot',
    'tool/decisions',
    'tool/retention',
    'tool/risks',
    'tool/finance',
    'tool/matrices',
    'library',
    'document/executive-onepage',
    'reports',
  ];
  for (const width of [360, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      await go(route);
      await page
        .locator('.gx-heading,.gx-library-tabs,.gx-document-detail,.ex-report')
        .first()
        .waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `${route} overflow at ${width}`,
      );
      if (width === 1440) {
        const audit = await new AxeBuilder({ page }).analyze();
        audits.push({ route, violations: audit.violations });
        assert.equal(
          audit.violations.length,
          0,
          `${route}: ${audit.violations.map((v) => v.id).join(',')}`,
        );
      }
      if (
        width === 360 &&
        ['tool/finance', 'tool/matrices', 'library', 'document/executive-onepage'].includes(route)
      )
        await capture(`mobile-${route.replaceAll('/', '-')}`);
    }
  }
  await go('tool/market');
  await button('با هم شروع کنیم').click();
  await page.getByRole('heading', { name: 'کدام بخش از بازار را بررسی می‌کنی؟' }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'H2');
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
  });
  const cardAudit = await new AxeBuilder({ page }).analyze();
  assert.equal(
    cardAudit.violations.length,
    0,
    JSON.stringify(cardAudit.violations.map((v) => v.id)),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page.locator('.gx-card').evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await capture('guided-card-dark');
  const darkAudit = await new AxeBuilder({ page }).analyze();
  assert.equal(
    darkAudit.violations.length,
    0,
    JSON.stringify(darkAudit.violations.map((v) => v.id)),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  await writeFile(`${output}/accessibility.json`, JSON.stringify(audits, null, 2));
  console.log(
    'PASS: guided/resume/financial calculation/invalid integer/IFE/independent EFE/document writing/files/download/isolation/rejection; 44 route/viewport checks; 13 axe audits; dark and reduced motion; zero real API calls.',
  );
} catch (error) {
  console.error('Failure at', page.url(), errors);
  await capture('failure');
  throw error;
} finally {
  await browser.close();
}
