import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.STRATEGY_BROWSER_EXECUTABLE || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const url = process.env.STRATINO_WEB_URL || 'http://localhost:4173';
const results = [];
const errors = [];
await mkdir('test-results/web', { recursive: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  for (const width of [360, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /تحلیل‌هایتان/ }).waitFor();
    for (const theme of ['light', 'dark']) {
      if ((await page.getAttribute('html', 'data-theme')) !== theme)
        await page.getByRole('button', { name: 'تغییر تم' }).click();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `overflow ${width}/${theme}`,
      );
      await page.screenshot({
        path: `test-results/web/site-${width}-${theme}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
    results.push({ width, themes: ['light', 'dark'], overflow: false });
  }
  await page.locator('.strategy-path button').nth(3).click();
  assert.match(await page.locator('.scene-detail').innerText(), /مدارک ارائه/);
  await page.goto(url + '/demo');
  await page.frameLocator('iframe').locator('.brand strong').waitFor();
  assert.equal(await page.frameLocator('iframe').locator('.brand strong').innerText(), 'استراتینو');
  await page.goto(url + '/account/reset-password');
  await page.getByRole('heading', { name: /حساب استراتینو/ }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: /حساب استراتینو/ }).waitFor();
  let session = {
    authenticated: true,
    user: { id: 'u1', name: 'مدیر نمونه', is_staff: false },
    workspaces: [{ id: 'w1', name: 'پروژه مجاز', role: 'owner' }],
  };
  await page.route('**/api/v1/session/', (route) =>
    route.fulfill({ status: 401, json: { detail: 'unauthenticated' } }),
  );
  await page.goto(url + '/app/workspaces/w1/overview');
  await page.waitForURL(/account\/login/);
  await page.unroute('**/api/v1/session/');
  await page.route('**/api/v1/session/', (route) => route.fulfill({ json: session }));
  await page.route('**/api/v1/csrf/', (route) => route.fulfill({
    json: {},
    headers: { 'Set-Cookie': 'csrftoken=workspace-test; Path=/; SameSite=Lax' },
  }));
  const workspace = {
    id: 'w1',
    owner_id: 'u1',
    billing_account_id: 'billing-1',
    name: 'پروژه مجاز',
    revision: 1,
    archived_at: null,
  };
  let workspaceRows = [workspace];
  let createdWorkspaceCount = 0;
  let accountProfile = { email: 'owner@example.test', display_name: 'مدیر نمونه', role_title: '', pending_email: '' };
  const projectProfiles = new Map([['w1', { workspace_id: 'w1', industry: '', stage: '', mission: '', revision: 1, onboarding_completed_at: null }]]);
  const invitations = [];
  await page.route('**/api/v1/account/profile/', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: accountProfile });
    accountProfile = { ...accountProfile, ...route.request().postDataJSON() };
    if (session.user.id === 'u2') session = { ...session, user: { ...session.user, name: accountProfile.display_name } };
    return route.fulfill({ json: accountProfile });
  });
  await page.route('**/api/v1/workspaces/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET' && pathname === '/api/v1/workspaces/') {
      return route.fulfill({ json: { items: workspaceRows, next_cursor: null } });
    }
    if (request.method() === 'POST' && pathname === '/api/v1/workspaces/') {
      const body = request.postDataJSON();
      const created = { id: 'w2', owner_id: session.user.id, billing_account_id: 'billing-2', name: body.name, revision: 1, archived_at: null };
      workspaceRows.push(created);
      projectProfiles.set('w2', { workspace_id: 'w2', industry: '', stage: '', mission: '', revision: 1, onboarding_completed_at: null });
      session = { ...session, workspaces: [...session.workspaces, { id: 'w2', name: created.name, role: 'owner' }] };
      createdWorkspaceCount++;
      return route.fulfill({ status: 201, json: created });
    }
    const detailMatch = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/$/);
    if (request.method() === 'GET' && detailMatch) {
      const record = workspaceRows.find((item) => item.id === detailMatch[1]);
      return record ? route.fulfill({ json: record }) : route.fulfill({ status: 404, json: { code: 'workspace_not_found' } });
    }
    if (request.method() === 'PATCH' && pathname === '/api/v1/workspaces/w1/') {
      const body = request.postDataJSON();
      if (body.revision !== workspace.revision) {
        return route.fulfill({
          status: 409,
          json: { code: 'revision_conflict', message: 'این فضا هم‌زمان تغییر کرده است.', fields: { revision: ['نسخه فعلی تغییر کرده است.'] } },
        });
      }
      if (typeof body.name === 'string') workspace.name = body.name.trim();
      if (typeof body.archived === 'boolean') workspace.archived_at = body.archived ? new Date().toISOString() : null;
      workspace.revision++;
      return route.fulfill({ json: workspace });
    }
    const profileMatch = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/profile\/$/);
    if (profileMatch && request.method() === 'GET') {
      const profile = projectProfiles.get(profileMatch[1]);
      return profile ? route.fulfill({ json: profile }) : route.fulfill({ status: 404, json: { code: 'workspace_not_found' } });
    }
    if (profileMatch && request.method() === 'PATCH') {
      const profile = projectProfiles.get(profileMatch[1]);
      if (!profile) return route.fulfill({ status: 404, json: { code: 'workspace_not_found' } });
      const body = request.postDataJSON();
      if (body.revision !== profile.revision) return route.fulfill({ status: 409, json: { code: 'revision_conflict', message: 'اطلاعات پروژه هم‌زمان تغییر کرده است.', fields: { revision: ['نسخه فعلی تغییر کرده است.'] } } });
      for (const key of ['industry', 'stage', 'mission']) if (typeof body[key] === 'string') profile[key] = body[key].trim();
      if (body.complete === true) profile.onboarding_completed_at = new Date().toISOString();
      profile.revision++;
      return route.fulfill({ json: profile });
    }
    const memberMatch = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/members\/$/);
    if (request.method() === 'GET' && memberMatch) {
      const record = workspaceRows.find((item) => item.id === memberMatch[1]);
      return route.fulfill({ json: { items: record ? [{ user_id: record.owner_id, email: accountProfile.email, name: accountProfile.display_name || 'مدیر نمونه', role: 'owner' }] : [] } });
    }
    const invitationMatch = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/invitations\/$/);
    if (request.method() === 'GET' && invitationMatch) {
      return route.fulfill({ json: { items: invitationMatch[1] === 'w1' ? invitations : [] } });
    }
    if (request.method() === 'POST' && pathname === '/api/v1/workspaces/w1/invitations/') {
      const body = request.postDataJSON();
      invitations.push({ id: 'invite-1', email: body.email, role: body.role, expires_at: new Date(Date.now() + 86400000).toISOString() });
      return route.fulfill({ status: 202, json: { message: 'اگر نشانی قابل افزودن باشد، دعوت به همان ایمیل فرستاده می‌شود.' } });
    }
    if (request.method() === 'DELETE' && pathname === '/api/v1/workspaces/w1/invitations/invite-1/') {
      invitations.splice(0, invitations.length);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ status: 404, json: { code: 'workspace_not_found', message: 'فضای کار در دسترس نیست.' } });
  });
  await page.goto(url + '/app/workspaces/w1/overview');
  await page.getByRole('heading', { name: 'پروژه مجاز' }).waitFor();
  await page.getByRole('heading', { name: 'اعضا و دعوت‌ها' }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'پروژه مجاز' }).waitFor();
  const nameInput = page.getByLabel('نام فضای کار');
  workspace.revision = 2;
  await nameInput.fill('تغییر هم‌زمان');
  await page.getByRole('button', { name: 'ذخیره نام' }).click();
  await page.getByRole('alert').filter({ hasText: 'هم‌زمان تغییر کرده است' }).waitFor();
  await page.getByRole('button', { name: 'بارگیری نسخه تازه' }).click();
  await page.waitForFunction(() => document.querySelector('.workspace-form--inline input')?.value === 'پروژه مجاز');
  await nameInput.fill('نام ذخیره‌نشده');
  const cancelDialogPromise = page.waitForEvent('dialog');
  const cancelSelection = page.getByRole('combobox', { name: 'انتخاب فضای کار' }).selectOption('');
  const cancelDialog = await cancelDialogPromise;
  assert.match(cancelDialog.message(), /پروژه مجاز/);
  await cancelDialog.dismiss();
  await cancelSelection;
  assert.match(page.url(), /\/app\/workspaces\/w1\/overview$/);
  const switchDialogPromise = page.waitForEvent('dialog');
  const switchSelection = page.getByRole('combobox', { name: 'انتخاب فضای کار' }).selectOption('');
  const switchDialog = await switchDialogPromise;
  assert.match(switchDialog.message(), /پروژه مجاز/);
  await switchDialog.accept();
  await switchSelection;
  await page.getByRole('heading', { name: 'فضاهای من' }).waitFor();
  await page.getByRole('link', { name: 'پروژه مجاز' }).waitFor();
  await page.getByRole('link', { name: 'پروژه مجاز' }).click();
  await page.getByRole('heading', { name: 'اعضا و دعوت‌ها' }).waitFor();
  await page.getByLabel('دعوت با ایمیل').fill('member@example.test');
  await page.getByLabel('سطح دسترسی').selectOption('viewer');
  await page.getByRole('button', { name: 'فرستادن دعوت' }).click();
  await page.getByText('member@example.test').waitFor();
  await page.getByRole('button', { name: 'لغو دعوت' }).click();
  const invitationDialog = page.getByRole('dialog');
  await invitationDialog.getByRole('button', { name: 'لغو دعوت' }).click();
  await page.getByText('member@example.test').waitFor({ state: 'detached' });
  await page.goto(url + '/app/workspaces/other/overview');
  await page.getByRole('heading', { name: 'فضای کار در دسترس نیست' }).waitFor();
  await page.goto(url + '/internal');
  await page.getByRole('heading', { name: 'دسترسی ندارید' }).waitFor();
  session = { ...session, user: { ...session.user, is_staff: true } };
  await page.reload();
  await page.getByRole('heading', { name: 'مدیریت سرویس' }).waitFor();
  await page.unroute('**/api/v1/session/');
  await page.route('**/api/v1/session/', (route) =>
    route.fulfill({
      json: { authenticated: true, user: { id: 'u1', is_staff: 'true' }, workspaces: [] },
    }),
  );
  await page.goto(url + '/internal');
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /معتبر نیست/);
  await page.unroute('**/api/v1/session/');
  await page.goto(url + '/app/workspaces/w1/overview');
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /در دسترس نیست/);

  session = { authenticated: true, user: { id: 'u2', name: 'مدیر تازه', is_staff: false }, workspaces: [] };
  workspaceRows = [];
  accountProfile = { email: 'new-owner@example.test', display_name: '', role_title: '', pending_email: '' };
  await page.route('**/api/v1/session/', (route) => route.fulfill({ json: session }));
  await page.goto(url + '/app/start');
  await page.getByRole('heading', { name: 'کمی درباره شما' }).waitFor();
  await page.getByLabel('نام شما').fill('مدیر تازه');
  await page.getByLabel('نقش یا عنوان شغلی (اختیاری)').fill('بنیان‌گذار');
  await page.getByRole('button', { name: 'ادامه' }).click();
  await page.getByRole('heading', { name: 'برای پروژه نام بگذارید' }).waitFor();
  await page.getByLabel('نام کسب‌وکار یا پروژه').fill('پروژه‌ی تازه');
  await page.getByRole('button', { name: 'ساخت پروژه' }).click();
  await page.getByRole('heading', { name: 'برای شروع، جهت پروژه را مشخص کنید' }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'برای شروع، جهت پروژه را مشخص کنید' }).waitFor();
  await page.getByRole('button', { name: 'بازگشت' }).click();
  await page.getByRole('heading', { name: 'برای پروژه نام بگذارید' }).waitFor();
  assert.equal(await page.getByLabel('نام کسب‌وکار یا پروژه').inputValue(), 'پروژه‌ی تازه');
  await page.getByRole('button', { name: 'بازگشت' }).click();
  await page.getByRole('heading', { name: 'کمی درباره شما' }).waitFor();
  assert.equal(await page.getByLabel('نام شما').inputValue(), 'مدیر تازه');
  await page.getByRole('button', { name: 'ادامه' }).click();
  await page.getByRole('heading', { name: 'برای پروژه نام بگذارید' }).waitFor();
  await page.getByRole('button', { name: 'ساخت پروژه' }).click();
  await page.getByRole('heading', { name: 'برای شروع، جهت پروژه را مشخص کنید' }).waitFor();
  await page.getByLabel('حوزه فعالیت (اختیاری)').fill('نرم‌افزار');
  await page.getByLabel('مرحله فعلی (اختیاری)').fill('آغاز');
  await page.getByLabel('هدف یا مسئله اصلی (اختیاری)').fill('رسیدن به نخستین مشتریان');
  for (const width of [360, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `onboarding overflow ${width}`);
    await page.screenshot({ path: `test-results/web/onboarding-project-${width}.png`, fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'ذخیره و ورود به فضا' }).click();
  await page.getByRole('heading', { name: 'پروژه‌ی تازه' }).waitFor();
  assert.equal(projectProfiles.get('w2').industry, 'نرم‌افزار');
  assert.equal(projectProfiles.get('w2').mission, 'رسیدن به نخستین مشتریان');
  assert.equal(createdWorkspaceCount, 1);

  await page.goto(url + '/app/start');
  await page.waitForURL(/\/app\/workspaces\/w2$/);
  session = { authenticated: true, user: { id: 'u3', name: 'عضو دعوت‌شده', is_staff: false }, workspaces: [{ id: 'w1', name: workspace.name, role: 'editor' }] };
  workspaceRows = [workspace];
  accountProfile = { email: 'member@example.test', display_name: '', role_title: '', pending_email: '' };
  await page.goto(url + '/app/start');
  await page.waitForURL(/\/app\/workspaces$/);
  await page.getByRole('link', { name: 'پروژه مجاز' }).waitFor();
  assert.equal(createdWorkspaceCount, 1, 'invited members must not be pushed into creating another Workspace');

  const response = await page.request.get(url + '/api/v1/session/');
  assert.equal(response.status(), 404, 'API missing route must not return SPA HTML');
  await page.goto(url + '/missing-page');
  await page.getByRole('heading', { name: 'صفحه پیدا نشد' }).waitFor();
  await page.goto(url + '/#matrices/efe');
  await page.waitForURL(/prototype\/.*#matrices\/efe/);
  await page.locator('#main h1').waitFor();
  assert.deepEqual(errors, []);
  await writeFile(
    'test-results/web/checks.json',
    JSON.stringify(
      {
        results,
        sessionBoundary: 'mocked contract only; not real authentication',
        malformedSessionRejected: true,
        operatorDenied: true,
        prototypePreserved: true,
        onboardingRefreshAndBack: true,
        inviteeNotForcedToCreateWorkspace: true,
        responsiveScreenshots: 12,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: 12 responsive/theme/onboarding screenshots, onboarding refresh/back, deep links, session failure/401/malformed data, membership/operator boundaries, prototype and API fallback',
  );
} finally {
  await browser.close();
}
