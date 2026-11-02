import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const [base, checkout, outputArg = 'test-results/native-browser', mailBase = 'http://127.0.0.1:8025'] = process.argv.slice(2);
assert.match(base ?? '', /^http:\/\/127\.0\.0\.1:\d+\/$/, 'Use this run\'s loopback web URL');
const { chromium } = createRequire(resolve(checkout, 'package.json'))('playwright');
const output = resolve(outputArg);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome', headless: true });

async function mutate(context, path, body, expected = 200, method = 'POST') {
  const csrf = (await context.cookies()).find((cookie) => cookie.name === 'csrftoken')?.value;
  const response = await context.request.fetch(`${base}${path}`, { method, data: body,
    headers: { 'X-CSRFToken': csrf ?? '', Origin: new URL(base).origin } });
  assert.equal(response.status(), expected, `${method} ${path}`);
  return expected === 204 ? null : response.json();
}

async function capturedVerification(email) {
  assert.match(mailBase ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
  for (let attempt = 0; attempt < 30; attempt++) {
    const list = await (await fetch(`${mailBase}/api/v1/messages`)).json();
    const row = list.messages.find((message) => message.To?.some((to) => to.Address === email));
    if (row) {
      const message = await (await fetch(`${mailBase}/api/v1/message/${row.ID}`)).json();
      const link = message.Text.match(/http:\/\/127\.0\.0\.1:\d+\/account\/verify[^\s]*/)?.[0];
      assert.ok(link, 'Actual signup mail must contain a local verification link');
      assert.equal(new URL(link).origin, new URL(base).origin);
      return new URLSearchParams(new URL(link).hash.slice(1)).get('token');
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Signup mail did not reach the local inbox');
}

async function verifyAccountAndPersistence() {
  const context = await browser.newContext();
  const email = `native-${randomUUID()}@stratino.invalid`;
  const password = `Native-${randomUUID()}-Z9!`;
  try {
    assert.equal((await context.request.get(`${base}api/v1/csrf/`)).status(), 200);
    await mutate(context, 'api/v1/accounts/signup/', { email, password }, 202);
    await mutate(context, 'api/v1/accounts/verify-email/', { token: await capturedVerification(email) });
    await mutate(context, 'api/v1/accounts/login/', { email, password });
    const session = await (await context.request.get(`${base}api/v1/session/`)).json();
    const userId = session.user.id;
    await mutate(context, 'api/v1/account/complete-profile/', { expected_user_id: userId,
      first_name: 'Native', last_name: 'Test', phone_number: '+12025550123', marketing_opt_in: false });
    const workspace = await mutate(context, 'api/v1/workspaces/', { name: 'Native local verification' }, 201);
    const listing = await context.request.get(`${base}api/v1/workspaces/${workspace.id}/`);
    assert.equal(listing.status(), 200);
    const catalog = await (await context.request.get(`${base}api/v1/academy/catalog/`)).json();
    const lesson = catalog.courses.flatMap((course) => course.stages.flatMap((stage) => stage.lessons))
      .find((item) => item.access?.hasAccess);
    assert.ok(lesson, 'A real free-sample lesson must be available');
    const unit = await (await context.request.get(`${base}api/v1/academy/content/${lesson.id}/`)).json();
    assert.ok(unit.learning_cards.length > 0);
    const note = 'Synthetic native persistence check';
    await mutate(context, `api/v1/academy/units/${lesson.id}/`, { expected_user_id: userId,
      revision: 0, content_revision: unit.revision, note, bookmarked: true }, 200, 'PATCH');
    const progress = await (await context.request.get(`${base}api/v1/academy/state/`)).json();
    assert.equal(progress.units[lesson.id].note, note);
    await mutate(context, 'api/v1/accounts/logout/', {}, 204);
    assert.equal((await context.request.get(`${base}api/v1/workspaces/${workspace.id}/`)).status(), 401);
    return { signup: 'verified through local SMTP', login: true, workspace: 'saved', learningNote: 'saved and reread', logoutBoundary: 401 };
  } finally {
    await context.close();
  }
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const catalogResponse = page.waitForResponse((response) => response.url().endsWith('/api/v1/academy/catalog/'));
  await page.goto(`${base}academy/guide`);
  const catalog = await catalogResponse;
  assert.equal(catalog.status(), 200);
  const payload = await catalog.json();
  assert.ok(payload.courses.length > 0);
  await page.getByRole('heading', { name: 'برای هر قدم، یک راه روشن', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'محتوا باز نشد', exact: true }).count(), 0);
  assert.equal(await page.getByText('پیشرفت حسابت باز نشد.', { exact: false }).count(), 0);
  assert.ok(await page.locator('.help-steps li').count() > 0);
  await page.screenshot({ path: resolve(output, 'academy-guide.png'), fullPage: true });
  await page.goto(`${base}internal/login`);
  await page.locator('input[type="email"]').waitFor();
  assert.ok(await page.locator('input[type="password"]').count() > 0);
  const api = await page.request.get(`${base}api/v1/not-a-real-endpoint/`);
  assert.equal(api.status(), 404);
  const staticFile = await page.request.get(`${base}static/admin/css/base.css`);
  assert.equal(staticFile.status(), 200, 'Django static assets must pass through the local proxy');
  assert.equal(errors.length, 0, errors.join('\n'));
  const flow = await verifyAccountAndPersistence();
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ mocked: false, catalogCourses: payload.courses.length, guide: 'visible', adminLogin: 'visible', djangoStatic: 200, flow, errors }, null, 2));
  console.log('PASS: real guide/admin rendering, signup/local email verification, login, Workspace/learning persistence, logout boundary and static routing. No mocks.');
} finally {
  await browser.close();
}
