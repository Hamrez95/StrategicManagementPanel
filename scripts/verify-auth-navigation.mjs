import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:5180';
const browser = await chromium.launch({ channel: 'chrome' });

async function verifyLogin({ workspaces, next, expected }) {
  const context = await browser.newContext();
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
  await page.route('**/api/v1/session/', async (route) => {
    await route.fulfill(
      authenticated
        ? {
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              authenticated: true,
              user: { id: 'test-user', name: 'Test user', is_staff: false },
              workspaces,
            }),
          }
        : { status: 401, contentType: 'application/json', body: '{}' },
    );
  });

  try {
    const search = next ? `?next=${encodeURIComponent(next)}` : '';
    await page.goto(`${base}/account/login${search}`);
    await page.locator('input[type="email"]').fill('owner@example.test');
    await page.locator('input[type="password"]').fill('not-the-local-fixture-password');
    await page.getByRole('button', { name: 'ورود به فضای کار' }).click();
    await page.waitForURL((url) => url.pathname === expected);
    assert.equal(new URL(page.url()).pathname, expected);
  } finally {
    await context.close();
  }
}

try {
  const ownedWorkspace = [{ id: 'space-1', name: 'Strategy', role: 'owner' }];
  await verifyLogin({ workspaces: ownedWorkspace, expected: '/app/workspaces' });
  await verifyLogin({ workspaces: [], expected: '/app/start' });
  await verifyLogin({
    workspaces: ownedWorkspace,
    next: '/app/invitations/accept',
    expected: '/app/invitations/accept',
  });
  await verifyLogin({
    workspaces: ownedWorkspace,
    next: 'https://evil.example',
    expected: '/app/workspaces',
  });
  console.log('PASS: returning, new, invitation and external-next login routing');
} finally {
  await browser.close();
}
