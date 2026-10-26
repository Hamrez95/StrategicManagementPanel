import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const base = process.argv[2] || process.env.STRATINO_WEB_URL || 'http://127.0.0.1:5193';
const catalog = JSON.parse(await readFile('apps/api/academy-projections/catalog.json', 'utf8'));
const id = '00000000-0000-4000-8000-000000000001';
const plans = [
  ['free', 11, 'نمونه‌های رایگان'],
  ['general', 12, 'آموزش عمومی'],
  ['specialty', 13, 'گرایش‌های انتخابی'],
  ['full', 14, 'آکادمی کامل'],
].map(([kind, id, title]) => ({
  id,
  kind,
  title,
  code: kind,
  price: kind === 'free' ? 0 : 1000000,
  sale_price: null,
  currency: 'IRR',
  duration_days: 30,
}));
const areas = [
  { id: 'S01', title: 'استراتژی' },
  { id: 'S02', title: 'مالی' },
];
const folder = 'test-results/account-navigation';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'chrome' : undefined,
});
let checks = 0;
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 360, height: 900 } });
    const preferences = { language: 'fa', theme, motion: 'reduced', show_tutorial: false };
    await context.addInitScript(
      (v) => localStorage.setItem('stratino-preferences-v1', JSON.stringify(v)),
      preferences,
    );
    let quotes = 0;
    await context.route(/\/api\/v1\//, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let body;
      if (path === '/api/v1/session/')
        body = {
          authenticated: true,
          user: { id, name: 'مدیر آزمایشی', is_staff: false, profile_required: false },
          workspaces: [],
        };
      else if (path === '/api/v1/account/profile/')
        body = {
          id,
          first_name: 'مدیر',
          last_name: 'آزمایشی',
          display_name: 'مدیر آزمایشی',
          role_title: '',
          phone_number: '+989120000000',
          phone_verified: false,
          avatar_id: null,
          avatar: null,
          email: 'synthetic@example.test',
          pending_email: '',
        };
      else if (path === '/api/v1/account/preferences/')
        body = { ...preferences, updated_at: '2026-10-26T00:00:00Z', device_sync_pending: false };
      else if (path === '/api/v1/account/avatars/') body = { avatars: [] };
      else if (path === '/api/v1/account/subscriptions/')
        body = {
          user_id: id,
          academy: {
            plans,
            areas,
            subscriptions: [],
            orders: [],
            order_history_limit: 30,
            payment_enabled: false,
            access_summary: { full: false, general: false, area_ids: [], free_sample: true },
          },
          management: {
            billing_status: 'active',
            owned_workspaces: 0,
            archived_workspaces: 0,
            joined_workspaces: 0,
            plans_configured: false,
          },
        };
      else if (path === '/api/v1/csrf/')
        return route.fulfill({
          json: {},
          headers: { 'Set-Cookie': 'csrftoken=account-nav-fixture; Path=/; SameSite=Lax' },
        });
      else if (path === '/api/v1/academy/state/') body = { user_id: id, units: {} };
      else if (path === '/api/v1/academy/catalog/') body = catalog;
      else if (path === '/api/v1/academy/plans/') body = { plans, areas, subscriptions: [] };
      else if (path === '/api/v1/academy/price-quote/') {
        assert.equal(request.method(), 'POST');
        const data = request.postDataJSON();
        assert.ok([12, 13, 14].includes(data.plan_id));
        quotes++;
        body = {
          subtotal: 1000000,
          sale_discount: 0,
          coupon_discount: 0,
          total: 1000000,
          coupon_code: data.coupon_code,
          currency: 'IRR',
        };
      } else if (path === '/api/v1/workspaces/') body = { items: [], next_cursor: null };
      else
        throw new Error('Unexpected account-navigation fixture: ' + request.method() + ' ' + path);
      if (path !== '/api/v1/academy/price-quote/')
        assert.equal(request.method(), 'GET', 'Navigation must not mutate user data');
      await route.fulfill({ json: body });
    });
    let releaseModule;
    const moduleGate = new Promise((resolve) => {
      releaseModule = resolve;
    });
    await context.route(
      /(?:\/src\/features\/academy\/Academy\.tsx|\/assets\/Academy-[^/]+\.js)(?:\?|$)/,
      async (route) => {
        await moduleGate;
        await route.continue();
      },
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const account = async () => {
      await page.goto(base + '/app/account');
      await page.getByRole('heading', { name: 'دسترسی آکادمی', exact: true }).waitFor();
    };
    await account();
    await page.getByRole('link', { name: 'مقایسه و انتخاب اشتراک', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'در حال بازکردن آکادمی' }).waitFor();
    assert.equal(
      await page.locator('.account-settings').count(),
      0,
      'Old account screen must not remain while Academy loads',
    );
    checks++;
    releaseModule();
    await page.getByRole('heading', { name: 'مقایسهٔ اشتراک‌های آکادمی', exact: true }).waitFor();
    assert.equal(await page.locator('.academy-plan[aria-pressed=true]').count(), 0);
    assert.equal(quotes, 0);
    checks++;
    for (const plan of plans.filter((p) => p.kind !== 'free')) {
      await account();
      await page
        .locator('.account-plan-option')
        .filter({ has: page.getByRole('heading', { name: plan.title, exact: true }) })
        .getByRole('link')
        .click();
      await page.waitForURL(base + '/academy/subscriptions?plan=' + plan.id);
      const button = page
        .locator('.academy-plan')
        .filter({ has: page.getByRole('heading', { name: plan.title, exact: true }) });
      await page.waitForFunction(() => document.querySelector('.academy-plan[aria-pressed=true]'));
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
      checks++;
    }
    // Same-page query changes and browser history must update the selection too.
    await page.goto(base + '/academy/subscriptions?plan=12');
    await page.locator('.academy-plan[aria-pressed=true]').waitFor();
    await page.getByRole('link', { name: 'اشتراک‌های من', exact: true }).click();
    await page.waitForURL(base + '/academy/subscriptions');
    await page.waitForFunction(()=>document.querySelectorAll('.academy-plan[aria-pressed=true]').length===0);
    assert.equal(await page.locator('.academy-plan[aria-pressed=true]').count(), 0);
    await page.goBack();
    await page.getByRole('heading', { name: 'مقایسهٔ اشتراک‌های آکادمی' }).waitFor();
    assert.ok(
      (await page.locator('.academy-plan[aria-pressed=true]').innerText()).includes('آموزش عمومی'),
    );
    checks++;
    await page
      .locator('.academy-plan')
      .filter({ has: page.getByRole('heading', { name: 'گرایش‌های انتخابی', exact: true }) })
      .click();
    assert.equal(new URL(page.url()).searchParams.get('plan'), '13');
    const strategyChoice = page.getByRole('checkbox', { name: /استراتژی/ });
    await page.locator('label.subscription-area').filter({ has: strategyChoice }).click();
    await page.waitForURL((url) => url.searchParams.get('areas') === 'S01');
    await page.waitForFunction(
      () => document.querySelector('.subscription-area input')?.checked === true,
    );
    assert.equal(new URL(page.url()).searchParams.get('areas'), 'S01');
    checks++;
    await page.reload();
    await page.getByRole('checkbox', { name: /استراتژی/ }).waitFor();
    assert.equal(await page.getByRole('checkbox', { name: /استراتژی/ }).isChecked(), true);
    checks++;
    await page.getByRole('checkbox', { name: /استراتژی/ }).focus();
    await page.getByRole('checkbox', { name: /استراتژی/ }).press('Space');
    await page.waitForURL((url) => !url.searchParams.has('areas'));
    checks++;
    await page.goto(base + '/academy/subscriptions?plan=9999');
    await page
      .getByText('این اشتراک در دسترس نیست؛ یکی از گزینه‌های فعال رو انتخاب کن.', { exact: true })
      .waitFor();
    assert.equal(await page.locator('.academy-plan[aria-pressed=true]').count(), 0);
    checks++;
    await account();
    await page.getByRole('link', { name: 'ادامهٔ یادگیری', exact: true }).click();
    await page.waitForURL(base + '/academy');
    await page.locator('.learning-layout').waitFor();
    checks++;
    await account();
    await page.getByRole('link', { name: 'دیدن نمونه‌ها', exact: true }).click();
    await page.waitForURL(base + '/academy/catalog');
    await page.locator('.academy-catalog-visual').waitFor();
    checks++;
    await account();
    for (const hash of [
      'profile-heading',
      'academy-plans',
      'account-preferences',
      'email-heading',
    ]) {
      await page.locator(`.account-section-nav a[href="#${hash}"]`).click();
      assert.equal(new URL(page.url()).hash, '#' + hash);
      assert.ok(await page.locator('#' + hash).isVisible());
      checks++;
    }
    await page.screenshot({ path: `${folder}/account-${theme}.png`, fullPage: true });
    await page.getByRole('link', { name: 'بازگشت به فضاهای من', exact: true }).click();
    await page.waitForURL(base + '/app/workspaces');
    await page.getByRole('heading', { name: 'فضاهای من', exact: true, level: 1 }).waitFor();
    checks++;
    assert.deepEqual(errors, []);
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    assert.deepEqual(
      audit.violations.map((v) => v.id),
      [],
    );
    checks++;
    await context.close();
  }
  console.log(
    `PASS: ${checks} account/Academy destination, pending-screen, deep-link, history and selection checks; two themes; no real user data or purchases changed.`,
  );
} finally {
  await browser.close();
}
