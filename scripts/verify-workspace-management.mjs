import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const base = process.argv[2] || 'http://127.0.0.1:5180';
const browser = await chromium.launch({ channel: 'chrome' });

function workspace(id, name, owner = 'test-user', archived_at = null) {
  return {
    id,
    owner_id: owner,
    billing_account_id: `billing-${owner}`,
    name,
    revision: 1,
    archived_at,
  };
}

async function authenticatedPage(workspaceHandler) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let authenticated = false;
  await page.route('**/api/v1/csrf/', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'set-cookie': 'csrftoken=fixture; Path=/; SameSite=Lax' },
      contentType: 'application/json',
      body: '{}',
    }),
  );
  await page.route('**/api/v1/accounts/login/', async (route) => {
    authenticated = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/v1/session/', async (route) =>
    route.fulfill(
      authenticated
        ? {
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              authenticated: true,
              user: { id: 'test-user', name: 'Hamidreza', is_staff: false },
              workspaces: [{ id: 'ws-a', name: 'Alpha', role: 'owner' }],
            }),
          }
        : { status: 401, contentType: 'application/json', body: '{}' },
    ),
  );
  if (workspaceHandler) await page.route('**/api/v1/workspaces/**', workspaceHandler);
  await page.goto(`${base}/account/login`);
  await page.locator('input[type="email"]').fill('owner@example.test');
  await page.locator('input[type="password"]').fill('not-a-real-password');
  await page.getByRole('button', { name: 'ورود به فضای کار' }).click();
  await page.waitForURL((url) => url.pathname === '/app/workspaces');
  return { context, page };
}

try {
  let pageTwo = false;
  const { context, page } = await authenticatedPage(async (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get('cursor');
    if (!cursor) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [workspace('ws-a', 'Alpha'), workspace('ws-b', 'Beta')],
          next_cursor: 'cursor-two',
        }),
      });
    } else {
      pageTwo = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [workspace('ws-c', 'Shared', 'other-user')],
          next_cursor: null,
        }),
      });
    }
  });
  try {
    await page.getByRole('heading', { name: 'فضاهای دعوتی' }).waitFor();
    assert.equal(pageTwo, true, 'all list cursor pages should be fetched');
    assert.equal(await page.locator('.workspace-row').count(), 3);

    const search = page.getByRole('searchbox', { name: 'جست‌وجو در فضاهای کار' });
    await search.fill('ALPHA');
    assert.equal(await page.locator('.workspace-row').count(), 1);
    assert.equal(await page.getByRole('link', { name: 'Alpha', exact: true }).count(), 1);
    await search.fill('no matching record');
    await page.getByRole('heading', { name: 'فضایی با این نام پیدا نشد' }).waitFor();
    await page.getByRole('button', { name: 'پاک‌کردن جست‌وجو' }).click();
    assert.equal(await page.locator('.workspace-row').count(), 3);

    await page.setViewportSize({ width: 360, height: 800 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    assert.equal(overflow, false, 'workspace list should fit mobile width');
    const axe = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(axe.violations, []);
  } finally {
    await context.close();
  }

  const repeated = await authenticatedPage(async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [workspace(cursor ? 'ws-b' : 'ws-a', cursor ? 'Beta' : 'Alpha')],
        next_cursor: 'cursor-loop',
      }),
    });
  });
  try {
    await repeated.page.getByRole('alert').waitFor();
    assert.match(await repeated.page.getByRole('alert').innerText(), /صفحه‌بندی/);
  } finally {
    await repeated.context.close();
  }

  console.log(
    'PASS: paginated Workspace listing, search/empty state, repeated cursor and 360px layout.',
  );
} finally {
  await browser.close();
}
