import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.STRATEGY_BROWSER_EXECUTABLE || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const baseUrl = process.env.STRATINO_WEB_URL || 'http://127.0.0.1:5180';
const errors = [];

try {
  await mkdir('test-results', { recursive: true });
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const session = {
    authenticated: true,
    user: { id: 'shell-user', name: 'مدیر نمونه', is_staff: false },
    workspaces: [
      { id: 'w1', name: 'فضای آلفا', role: 'owner' },
      { id: 'w2', name: 'فضای بتا', role: 'editor' },
    ],
  };
  await page.route('**/api/v1/session/', (route) => route.fulfill({ json: session }));
  await page.route('**/api/v1/account/preferences/', (route) =>
    route.fulfill({ json: { theme: 'light', language: 'fa', motion: 'auto' } }),
  );
  await page.route('**/api/v1/csrf/', (route) =>
    route.fulfill({
      json: {},
      headers: { 'Set-Cookie': 'csrftoken=shell-test; Path=/; SameSite=Lax' },
    }),
  );
  await page.route('**/api/v1/workspaces/*/profile/', (route) =>
    route.fulfill({
      json: {
        workspace_id: new URL(route.request().url()).pathname.split('/')[4],
        company_name: 'نمونهٔ شرکت',
        industry: '',
        stage: '',
        mission: 'آماده‌سازی برنامه اجرایی',
        problem_statement: '',
        products: [],
        customer_segments: [],
        goals: [],
        icps: [],
        revision: 1,
        onboarding_completed_at: null,
      },
    }),
  );
  await page.route('**/api/v1/workspaces/*/summary/', (route) => {
    const workspaceId = new URL(route.request().url()).pathname.split('/')[4];
    return route.fulfill({
      json: {
        workspace_id: workspaceId,
        role: 'owner',
        objective: 'strategy',
        profile: { state: 'started', provided_fields: ['company_name', 'mission'] },
        analyses: { draft_count: 1, finalized_count: 2 },
        next_action: {
          kind: 'overdue_action',
          id: 'action-1',
          label: 'گفت‌وگو با مشتریان',
          destination: 'execution',
        },
        shortcuts: ['swot', 'matrices', 'execution'],
        open_actions: [
          {
            id: 'action-1',
            title: 'گفت‌وگو با مشتریان',
            due_on: '2026-10-16',
            status: 'planned',
            is_overdue: true,
          },
          {
            id: 'action-2',
            title: 'بازبینی اهداف',
            due_on: '2026-10-24',
            status: 'in_progress',
            is_overdue: false,
          },
        ],
        attention_items: [
          {
            kind: 'overdue_action',
            id: 'action-1',
            label: 'گفت‌وگو با مشتریان',
            destination: 'execution',
          },
        ],
        unknowns: [],
        as_of: '2026-10-17',
      },
    });
  });
  await page.route(/\/api\/v1\/workspaces\/\?limit=100(?:&|$)/, (route) =>
    route.fulfill({
      json: {
        items: ['w1', 'w2'].map((id, index) => ({
          id,
          owner_id: 'shell-user',
          billing_account_id: `billing-${index}`,
          name: `فضای ${index ? 'بتا' : 'آلفا'}`,
          revision: 1,
          archived_at: null,
        })),
        next_cursor: null,
      },
    }),
  );

  await page.goto(`${baseUrl}/app/workspaces/w1/overview`);
  await page.getByRole('heading', { name: 'گام بعدی' }).waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.workspace-home__steps li').count(), 3);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.match(
    await page.locator('.workspace-home__summary-meta').innerText(),
    /۲ تحلیل نهایی و ۱ پیش‌نویس/,
  );
  await page.locator('.workspace-home__open-actions summary').click();
  assert.equal(await page.locator('.workspace-home__open-actions li').count(), 2);
  await page.screenshot({
    path: 'test-results/management-os-dashboard-360.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.goto(`${baseUrl}/app/workspaces`);
  await page.locator('.workspace-row__summary').nth(1).waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.workspace-row__summary').count(), 2);
  assert.equal(
    await page.locator('.workspace-row__summary').first().getAttribute('href'),
    '/app/workspaces/w1/tools/execution',
  );
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({
    path: 'test-results/management-os-workspaces-360.png',
    fullPage: true,
    animations: 'disabled',
  });

  await page.goto(`${baseUrl}/app/workspaces/w1/tools/journey`);
  await page.getByRole('heading', { name: 'مسیر استراتژی' }).waitFor({ timeout: 15000 });
  assert.match(await page.locator('body').innerText(), /فضای آلفا/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  const menuTrigger = page.getByRole('button', { name: 'بازکردن منوی فضای کار' });
  await menuTrigger.click();
  const mobileDialog = page.getByRole('dialog');
  await mobileDialog.waitFor();
  await page.keyboard.press('Escape');
  await mobileDialog.waitFor({ state: 'detached' });
  assert.equal(await menuTrigger.evaluate((element) => element === document.activeElement), true);

  await page.keyboard.press('Control+k');
  const searchDialog = page.getByRole('dialog');
  await searchDialog.waitFor();
  const searchInput = searchDialog.getByRole('textbox');
  await searchInput.fill('ریسک');
  await searchDialog.getByRole('link', { name: /ریسک/ }).click();
  await page.waitForURL('**/app/workspaces/w1/tools/risks');

  await page.goto(`${baseUrl}/app/workspaces/w1/profile`);
  await page.waitForURL('**/app/account');
  assert.deepEqual(errors, []);
  console.log(
    '027-D and 015-D browser checks passed: overview summaries and three shortcuts, two-Workspace account summaries, 360px fit, mobile dialog Escape/focus return, route search, legacy alias redirect, no page errors.',
  );
  await context.close();
} finally {
  await browser.close();
}
