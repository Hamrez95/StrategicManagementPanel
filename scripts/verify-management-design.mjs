import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import ts from 'typescript';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const base = process.argv[2] || 'http://127.0.0.1:5180';
const out = 'test-results/management-design';
await mkdir(out, { recursive: true });
const data = JSON.parse(
  await readFile('apps/web/src/features/experience/design-research.json', 'utf8'),
);
const js = ts.transpileModule(
  await readFile('apps/web/src/features/experience/planningDesigns.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { planningDesigns } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [],
  requests = [],
  audits = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (new URL(r.url()).pathname.startsWith('/api/')) requests.push(r.url());
});
const button = (name) => page.getByRole('button', { name, exact: true });
async function go(route) {
  await page.goto(`${base}/preview/w/design-one/${route}`);
  await page.locator('h1').waitFor();
}
async function settled() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
  });
}
async function capture(name) {
  await settled();
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
try {
  await page.goto(base + '/account/login');
  await page.evaluate(() => {
    sessionStorage.setItem('stratino-design-session-v1', 'hamrez95@stratino.test');
    const create = (id, name) => ({
      id,
      name,
      kind: 'business',
      stage: 'operating',
      goal: 'strategy',
      answer: '',
      color: 'blue',
      sample: false,
      actions: [],
      notes: [],
      toolNotes: {},
    });
    localStorage.setItem(
      'stratino-design-spaces-v1',
      JSON.stringify([
        create('design-one', 'برنامهٔ راهبردی'),
        create('design-two', 'کسب‌وکار جدا'),
      ]),
    );
  });
  await go('strategy');
  assert.equal(await page.locator('.mx-roadmap > li').count(), 6);
  await capture('roadmap-desktop');
  await button('همهٔ ابزارها و شاخص‌ها').click();
  await page.getByLabel('جست‌وجوی ابزار').fill('ویژن');
  assert.equal(await page.locator('.ex-tool-card').count(), 1);
  await page.getByLabel('جست‌وجوی ابزار').fill('');
  await button('ماتریس‌ها').click();
  assert.equal(await page.locator('.ex-tool-card').count(), 11);
  await go('tool/vision');
  await button('با هم شروع کنیم').click();
  for (const answer of [
    'افق پنج‌ساله، خدمات محلی',
    'کاهش اتلاف منابع مشتریان',
    'دامنهٔ بازار داخلی و تعهد به شفافیت',
    'آینده‌ای با تصمیم‌های روشن و خدمت قابل اتکا',
  ]) {
    await page.locator('.gx-card textarea').fill(answer);
    if (await button('مرور و دیدن نتیجه').count()) await button('مرور و دیدن نتیجه').click();
    else await button('ادامه').click();
  }
  await page
    .locator('.mx-statement')
    .getByText('آینده‌ای با تصمیم‌های روشن و خدمت قابل اتکا', { exact: true })
    .waitFor();
  await capture('vision-result');
  await page.reload();
  await page.locator('.mx-statement').waitFor();
  await page.goto(base + '/preview/w/design-two/tool/vision');
  await button('با هم شروع کنیم').click();
  assert.equal(await page.locator('.gx-card textarea').inputValue(), '');
  for (const record of data.entries) {
    await go(`research/${record.id}`);
    assert.equal(await page.locator('h1').innerText(), record.title);
    await button('با هم شروع کنیم').waitFor();
  }
  for (const design of planningDesigns) {
    await go(`tool/${design.id}`);
    assert.equal(await page.locator('h1').innerText(), design.title);
  }
  await go('research/FW-STARTUP-BUSINESS-MODEL-CANVAS');
  await button('با هم شروع کنیم').click();
  await page.getByLabel('محدوده و دوره').fill('محصول اصلی، سال ۱۴۰۵');
  await button('ادامه').click();
  await page.getByRole('heading', { name: 'بخش‌های مشتری', exact: true }).waitFor();
  await page.locator('.gx-card textarea').fill('فروشگاه‌های کوچک');
  await capture('business-model-step');
  await go('research/MET-CAC');
  await button('با هم شروع کنیم').click();
  await page.getByLabel('محدوده و دوره').fill('مشتری پرداخت‌کنندهٔ جدید در همین دوره');
  await button('ادامه').click();
  await page.locator('.gx-card input[inputmode=decimal]').fill('۱۰۰۰');
  await button('ادامه').click();
  await page.locator('.gx-card input[inputmode=decimal]').fill('۱۰');
  await button('مرور خروجی').click();
  await page.getByText(/نتیجهٔ محاسباتی یا تشخیص تأییدشده/).waitFor();
  await capture('metric-contract');
  const routes = [
    'strategy',
    'strategy?area=marketing',
    'business',
    'tool/vision',
    'tool/marketing-mix',
    'tool/marketing-plan',
    'tool/space',
    'research/STR-VRIO',
    'research/STR-BCG-GROWTH-SHARE',
    'research/FW-STARTUP-BUSINESS-MODEL-CANVAS',
    'research/MET-NPV',
  ];
  for (const width of [360, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      await go(route);
      await settled();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `${route} overflow ${width}`,
      );
      if (width === 1440) {
        const result = await new AxeBuilder({ page }).analyze();
        audits.push({ route, violations: result.violations });
        assert.equal(
          result.violations.length,
          0,
          JSON.stringify(
            result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
          ),
        );
      }
      if (width === 360 && ['strategy', 'tool/marketing-mix'].includes(route))
        await capture(`mobile-${route.replaceAll('/', '-')}`);
    }
  }
  await go('research/STR-GE-MCKINSEY');
  await button('با هم شروع کنیم').click();
  for (let i = 0; i < 6; i++) {
    if (await button('مرور خروجی').count()) {
      await button('مرور خروجی').click();
      break;
    }
    await button('ادامه').click();
  }
  await capture('portfolio-layout');
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.dataset.motion = 'reduced';
  });
  await go('strategy');
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await capture('roadmap-dark');
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  await writeFile(`${out}/accessibility.json`, JSON.stringify(audits, null, 2));
  console.log(
    `PASS: ${data.entries.length} research routes + ${planningDesigns.length} planning routes, vision persistence/isolation, matrix directory, BMC sections, no fake metric result, 44 responsive checks and ${audits.length} axe audits; no real API calls.`,
  );
} catch (e) {
  console.error('Failure at', page.url(), errors);
  await capture('failure');
  throw e;
} finally {
  await browser.close();
}
