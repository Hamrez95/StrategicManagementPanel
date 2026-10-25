import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const base = process.argv[2] || 'http://127.0.0.1:5217';
const folder = 'test-results/global-admin';
const sections = [
  'accounts',
  'workspaces',
  'plans',
  'subscriptions',
  'access',
  'audit',
  'academy',
  'feedback',
];
const uuid = '00000000-0000-4000-8000-000000000001';
const features = {
  can_finalize_analysis: true,
  can_calculate_metrics: true,
  can_generate_reports: false,
};
const rows = {
  accounts: [
    {
      id: uuid,
      first_name: 'کاربر',
      last_name: 'آزمایشی',
      email: 'synthetic@example.test',
      phone_number: '',
      is_active: true,
      verified: true,
      date_joined: '2026-10-24T12:00:00Z',
    },
  ],
  workspaces: [{ id: uuid, owner_id: uuid, created_at: '2026-10-24T12:00:00Z', archived_at: null }],
  plans: [
    {
      id: uuid,
      code: 'synthetic-plan',
      title: 'پلن آزمایشی مرورگر',
      revision: 1,
      is_active: true,
      is_default: false,
      owned_workspace_limit: 3,
      price: null,
      currency: 'IRR',
      duration_days: null,
      ...features,
    },
  ],
  subscriptions: [
    {
      id: uuid,
      owner_id: uuid,
      plan_title: 'پلن آزمایشی مرورگر',
      plan_revision: 1,
      status: 'active',
      starts_at: '2026-10-24T12:00:00Z',
      ends_at: null,
      owned_workspace_limit: 3,
      ...features,
    },
  ],
  access: [
    {
      id: uuid,
      accessLevel: 'special',
      owned_workspace_limit: 3,
      owned_workspaces: 1,
      can_create_workspace: true,
      features,
    },
  ],
  audit: [
    {
      source: 'operator',
      event_id: uuid,
      actor_id: uuid,
      event_type: 'account_status_changed',
      target: uuid,
      created_at: '2026-10-24T12:00:00Z',
    },
  ],
  academy: [
    { id: 'synthetic-course', title: 'مجموعهٔ آزمایشی مرورگر', area_id: 'strategy', order: 1 },
  ],
};
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
let checks = 0;
let audits = 0;
try {
  const context = await browser.newContext({ reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addCookies([{ name: 'csrftoken', value: 'a'.repeat(64), url: base }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let mfa = false;
  let configured = false;
  let enrolled = false;
  let protectedReads = 0;
  let failCollection = false;
  let lastQuery;
  const actions = [];
  await page.route(/\/api\/v1\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let payload,
      status = 200;
    if (url.pathname === '/api/v1/session/')
      payload = {
        authenticated: true,
        user: { id: uuid, name: 'اپراتور آزمایشی', is_staff: true },
        workspaces: [],
      };
    else if (url.pathname === '/api/v1/account/preferences/')
      payload = {
        theme: 'light',
        language: 'fa',
        motion: 'reduced',
        show_tutorial: false,
        device_sync_pending: false,
        updated_at: '2026-10-24T00:00:00Z',
      };
    else if (url.pathname === '/api/v1/operator/status/')
      payload = {
        sections,
        mfa_ready: mfa,
        mfa_configured: configured,
        mfa_enrolled: enrolled,
        expires_at: mfa ? new Date(Date.now() + 900_000).toISOString() : null,
        actor: { name: 'اپراتور آزمایشی' },
        capabilities: {
          identity: true,
          manage_accounts: true,
          triage_feedback: false,
          grant: true,
          revoke: true,
        },
      };
    else if (url.pathname.includes('/operator/mfa/')) {
      assert.equal(request.method(), 'POST');
      assert.ok(request.headers()['x-csrftoken']);
      if (url.pathname.endsWith('/enroll/')) {
        status = 201;
        payload = {
          secret: 'SYNTHETICBROWSERKEYONLY',
          qr_svg:
            '<svg xmlns="http://www.w3.org/2000/svg" width="188" height="188"><rect x="20" y="20" width="148" height="148" fill="black"/></svg>',
          expires_at: new Date(Date.now() + 600_000).toISOString(),
        };
      } else if (url.pathname.endsWith('/verify/')) {
        mfa = true;
        enrolled = true;
        payload = { mfa_ready: true };
      } else {
        mfa = false;
        payload = { mfa_ready: false };
      }
    } else if (request.method() === 'POST' && url.pathname.startsWith('/api/v1/operator/')) {
      assert.ok(mfa, 'The UI may not submit a mutation without a verified session');
      assert.ok(request.headers()['x-csrftoken']);
      actions.push({ path: url.pathname, body: request.postDataJSON() });
      payload = { id: uuid, status: 'active' };
      status = url.pathname.endsWith('/grant/') ? 201 : 200;
    } else if (url.pathname.startsWith('/api/v1/operator/')) {
      protectedReads++;
      assert.ok(mfa, 'Locked UI must not fetch protected information');
      lastQuery = url.searchParams;
      if (failCollection) {
        status = 503;
        payload = { code: 'temporary_failure', message: 'خطای آزمایشی اتصال' };
      } else if (url.pathname.endsWith('/overview/'))
        payload = {
          counts: { accounts: 1, workspaces: 1, subscriptions: 1, academy: 1, lessons: 2 },
        };
      else {
        const section = url.pathname.split('/')[4];
        const results = url.searchParams.get('q') ? [] : (rows[section] ?? []);
        payload = {
          results,
          count: results.length,
          page: Number(url.searchParams.get('page') || 1),
          page_size: 25,
          has_next: false,
          has_previous: false,
        };
      }
    } else if (url.pathname === '/api/v1/academy/feedback/inbox/') {
      assert.ok(mfa);
      payload = { count: 0, page: 1, results: [] };
    } else throw new Error(`Unexpected API request: ${request.method()} ${url.pathname}`);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  async function fit() {
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      'Page must not overflow horizontally',
    );
    checks++;
  }
  async function axe(label) {
    const result = await new AxeBuilder({ page }).include('.operator-console').analyze();
    await writeFile(`${folder}/axe-${label}.json`, JSON.stringify(result.violations, null, 2));
    assert.deepEqual(
      result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
    );
    audits++;
  }
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(base + '/internal');
  await page.getByRole('heading', { name: 'راه‌اندازی سرور لازمه' }).waitFor();
  assert.equal(protectedReads, 0);
  await fit();
  await axe('locked-mobile');
  await page.screenshot({ path: `${folder}/security-mobile.png`, fullPage: true });
  configured = true;
  await page.reload();
  await page.getByLabel('گذرواژه', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'ساخت QR اتصال' }).click();
  await page.getByAltText('QR اتصال حساب استراتینو به Authenticator').waitFor();
  await page.getByLabel('کد شش‌رقمی').fill('123456');
  await page.getByRole('button', { name: 'تأیید و ادامه' }).click();
  await page.getByRole('heading', { name: 'از یک نگاه، به کار بعدی' }).waitFor();
  checks++;
  for (const width of [360, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto(base + '/internal');
    await page.getByRole('heading', { name: 'از یک نگاه، به کار بعدی' }).waitFor();
    await fit();
    await axe('overview-' + width);
    await page.screenshot({ path: `${folder}/overview-${width}.png`, fullPage: true });
  }
  for (const section of Object.keys(rows)) {
    await page.goto(base + '/internal/' + section);
    await page.getByRole('table').waitFor();
    await fit();
    checks++;
  }
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 960 });
    for (const section of ['accounts', 'plans', 'subscriptions']) {
      await page.goto(base + '/internal/' + section);
      await page.getByRole('table').waitFor();
      await fit();
      if (width === 360 && section === 'accounts') await axe('accounts-mobile');
    }
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(base + '/internal/feedback');
  await page.getByText('نظری با این وضعیت نداریم.').waitFor();
  checks++;
  await page.goto(base + '/internal/accounts');
  await page.getByRole('table').waitFor();
  await page.getByRole('button', { name: 'غیرفعال‌کردن', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'غیرفعال‌کردن حساب' });
  await dialog.waitFor();
  assert.ok(await dialog.locator('code').textContent());
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(actions.length, 0);
  checks++;
  await page.getByRole('searchbox').fill(uuid);
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await page.getByText('رکوردی پیدا نشد.', { exact: false }).waitFor();
  assert.equal(lastQuery.get('q'), uuid);
  checks++;
  await page.goto(base + '/internal/subscriptions');
  await page.getByRole('button', { name: 'اعطای اشتراک', exact: true }).click();
  const grant = page.getByRole('dialog', { name: 'اعطای اشتراک مدیریت' });
  await grant.getByLabel('شناسهٔ مالک حساب').fill(uuid);
  await grant.getByLabel('پلن مدیریت').selectOption(uuid);
  await grant.getByLabel('دلیل تغییر').fill('Synthetic browser check only');
  assert.equal(
    await grant.getByRole('button', { name: 'اعطای اشتراک مدیریت', exact: true }).isDisabled(),
    true,
  );
  await grant.getByRole('checkbox').check();
  await grant.getByRole('button', { name: 'اعطای اشتراک مدیریت', exact: true }).click();
  await page.getByText('تغییر با موفقیت ثبت شد.').waitFor();
  assert.equal(actions.length, 1);
  assert.equal(actions[0].body.owner_id, uuid);
  assert.equal(actions[0].body.confirm, true);
  checks++;
  failCollection = true;
  await page.getByRole('button', { name: 'تازه‌کردن', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('.operator-table').count(), 0);
  checks++;
  failCollection = false;
  await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
  await page.getByRole('table').waitFor();
  await page.goto(base + '/internal');
  await page.getByRole('heading', { name: 'از یک نگاه، به کار بعدی' }).waitFor();
  await page.getByRole('switch', { name: 'تم تیره' }).click();
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  await axe('overview-dark');
  await page.screenshot({ path: `${folder}/overview-dark.png`, fullPage: true });
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  assert.equal(await page.locator('.operator-console').getAttribute('dir'), 'ltr');
  await fit();
  await axe('overview-english');
  checks++;
  await page.setViewportSize({ width: 360, height: 900 });
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'Administration sections' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  checks++;
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${checks} global-admin checks and ${audits} focused axe audits. Browser API mocks only; no real account, factor, grant or payment modified.`,
  );
  await context.close();
} finally {
  await browser.close();
}
