import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.STRATEGY_BROWSER_EXECUTABLE || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const baseUrl = process.env.STRATINO_WEB_URL || 'http://127.0.0.1:5180';
const errors = [];

try {
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
  console.log('015-D focused app-shell checks passed: authenticated direct route, 360px fit, mobile dialog Escape/focus return, route search, legacy alias redirect, no page errors.');
  await context.close();
} finally {
  await browser.close();
}
