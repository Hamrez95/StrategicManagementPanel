import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

// Entirely synthetic HTTP fixtures; no real login, customer or payment is used.
const base = process.env.STRATINO_UI_URL || 'http://127.0.0.1:5217';
const folder = 'test-results/management-studio';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'chrome' : undefined,
});
const id = '00000000-0000-4000-8000-000000000001';
const now = '2026-10-25T12:00:00Z';
const workspace = {
  id,
  name: 'راهکار — بررسی آزمایشی',
  owner_id: id,
  billing_account_id: id,
  revision: 1,
  archived_at: null,
  created_at: now,
  updated_at: now,
};
const emptyArrays = Object.fromEntries(
  [
    'profile_history',
    'analyses',
    'strategy_factors',
    'strategy_options',
    'decisions',
    'goals',
    'actions',
    'execution_history',
    'documents',
    'document_templates',
    'ready_attachments',
    'document_history',
    'products',
    'segments',
    'icps',
    'context_identities',
    'claims',
    'evidence',
    'claim_evidence_links',
    'confidence_assessments',
    'observations',
    'observation_evidence_links',
    'calculation_runs',
    'metric_values',
    'analysis_history',
    'attachment_records',
  ].map((key) => [key, []]),
);
const data = {
  ...emptyArrays,
  workspace,
  workspace_profile: null,
  report_verification: null,
  actions: [
    {
      id: 'action-planned',
      title: 'پیگیری سفارش',
      status: 'planned',
      due_on: '2026-10-31',
      description: '',
      owner_id: id,
    },
    {
      id: 'action-done',
      title: 'مصاحبه انجام‌شده',
      status: 'done',
      due_on: '2026-10-24',
      description: '',
      owner_id: id,
    },
  ],
  strategy_factors: [
    {
      id: 'factor-s',
      title: 'توان تحویل تیم',
      factor_type: 'strength',
      evidence: 'شاهد آزمایشی: زمان تحویل سه پروژه ثبت شده.',
    },
    {
      id: 'factor-o',
      title: 'تقاضای تازه',
      factor_type: 'opportunity',
      evidence: 'شاهد آزمایشی: دو درخواست قیمت ثبت شده.',
    },
  ],
  documents: [
    { id: 'doc-ready', template_id: 'brief', status: 'ready', content: '', revision: 1 },
    { id: 'doc-draft', template_id: 'plan', status: 'draft', content: '', revision: 1 },
  ],
  document_templates: [
    { id: 'brief', title: { fa: 'خلاصهٔ مدیریتی آزمایشی', en: 'Synthetic executive brief' } },
    { id: 'plan', title: { fa: 'برنامهٔ آزمایشی', en: 'Synthetic plan' } },
  ],
};
const envelope = {
  schema: 'stratino-workspace-v2',
  schema_version: 2,
  method_version: 'synthetic-transfer-v2',
  exported_at: now,
  scope: ['actions', 'documents'],
  data,
};
const snapshot = {
  id: 'snapshot-a',
  workspace_id: id,
  schema_version: 2,
  method_version: envelope.method_version,
  scope: envelope.scope,
  state: 'ready',
  created_at: now,
  artifact: { format: 'zip', size_bytes: 100, sha256: 'a'.repeat(64) },
  snapshot: envelope,
};
const second = {
  ...snapshot,
  id: 'snapshot-b',
  created_at: '2026-10-24T12:00:00Z',
  snapshot: {
    ...envelope,
    exported_at: '2026-10-24T12:00:00Z',
    data: { ...emptyArrays, workspace, workspace_profile: null, report_verification: null },
  },
};
let created = false,
  authenticated = true,
  checks = 0;
let preferences = {
  theme: 'light',
  language: 'fa',
  motion: 'auto',
  show_tutorial: false,
  device_sync_pending: false,
  updated_at: now,
};
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: folder, size: { width: 1280, height: 900 } },
    serviceWorkers: 'block',
  });
  const requests = [];
  await context.route(/\/api\/v1\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(`${route.request().method()} ${path}`);
    let body;
    if (path === '/api/v1/session/') {
      if (!authenticated) return route.fulfill({ status: 401, json: { code: 'unauthenticated' } });
      body = {
        authenticated: true,
        user: { id, name: 'مدیر آزمایشی', is_staff: false, profile_required: false },
        workspaces: [{ id, name: workspace.name, role: 'owner' }],
      };
    } else if (path === '/api/v1/csrf/')
      return route.fulfill({
        json: {},
        headers: { 'Set-Cookie': 'csrftoken=synthetic-studio; Path=/; SameSite=Lax' },
      });
    else if (path === '/api/v1/account/preferences/') {
      if (route.request().method() !== 'GET')
        preferences = { ...preferences, ...route.request().postDataJSON() };
      body = preferences;
    } else if (path.endsWith('/summary/'))
      body = {
        workspace_id: id,
        role: 'owner',
        objective: null,
        profile: { state: 'empty', provided_fields: [] },
        analyses: { draft_count: 1, finalized_count: 2 },
        next_action: null,
        shortcuts: [],
        open_actions: [],
        attention_items: [],
        unknowns: [],
        as_of: '2026-10-25',
      };
    else if (path.endsWith('/profile/'))
      body = {
        workspace_id: id,
        company_name: '',
        industry: '',
        stage: '',
        mission: '',
        problem_statement: '',
        products: [],
        customer_segments: [],
        goals: [],
        icps: [],
        revision: 1,
        onboarding_completed_at: null,
      };
    else if (path.endsWith('/exports/snapshot-a/')) body = snapshot;
    else if (path.endsWith('/exports/snapshot-b/')) body = second;
    else if (path.endsWith('/exports/')) {
      if (route.request().method() === 'POST') {
        assert.deepEqual(route.request().postDataJSON(), { schema_version: 2, purpose: 'raw' });
        assert.ok(route.request().headers()['idempotency-key']);
        created = true;
        return route.fulfill({ status: 201, json: snapshot });
      }
      body = { workspace_id: id, items: created ? [snapshot, second] : [] };
    } else if (path === '/api/v1/accounts/google/config/') body = { enabled: false, client_id: '' };
    else throw new Error('Unexpected studio fixture API: ' + path);
    await route.fulfill({ json: body });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const audits = [];
  await page.goto(`${base}/app/workspaces/${id}/overview`);
  await page.getByRole('heading', { name: 'تصویر امروز کسب‌وکارت' }).waitFor();
  const sidebar = page.locator('.app-sidebar');
  for (const height of [520, 900]) {
    await page.setViewportSize({ width: 1280, height });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForFunction(
      () =>
        document.querySelector('.app-sidebar').getBoundingClientRect().bottom <= innerHeight - 11,
    );
    const sidebarBox = await sidebar.boundingBox();
    assert.ok(
      sidebarBox.height <= height - 24,
      'Sidebar must fit the viewport, including its margins',
    );
    const pageScroll = await page.evaluate(() => scrollY);
    await sidebar.hover();
    await page.mouse.wheel(0, 5000);
    await page.waitForFunction(() => {
      const nav = document.querySelector('.app-sidebar');
      return nav.scrollTop + nav.clientHeight >= nav.scrollHeight - 2;
    });
    assert.equal(
      await page.evaluate(() => scrollY),
      pageScroll,
      'Sidebar wheel must not unexpectedly scroll the page',
    );
    const settingsBox = await sidebar.locator('.app-nav-link--settings').boundingBox();
    assert.ok(
      settingsBox.y >= 0 && settingsBox.y + settingsBox.height <= height,
      'Last navigation item remains reachable',
    );
    await page.mouse.wheel(0, -5000);
    await page.waitForFunction(() => document.querySelector('.app-sidebar').scrollTop === 0);
    checks += 3;
  }
  assert.equal(await page.locator('.management-stat').nth(0).locator('strong').innerText(), '۲');
  assert.equal(await page.locator('.management-stat').nth(1).locator('strong').innerText(), '۱');
  checks += 2;
  await page.screenshot({
    path: `${folder}/overview-desktop.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('link', { name: 'رفتن به استودیوی گزارش' }).click();
  await page.getByRole('heading', { name: 'استودیوی گزارش' }).waitFor();
  assert.equal(await page.locator('.report-view-picker button').count(), 4);
  assert.equal(await page.locator('.report-studio .management-donut').count(), 0);
  checks += 2;
  await page.getByRole('button', { name: 'ثبت نسخهٔ داده‌های شخصی', exact: true }).click();
  await page.locator('.report-studio__content').waitFor();
  assert.equal(await page.locator('.report-studio .management-donut strong').innerText(), '۲');
  checks++;
  await page.locator('.report-view-picker button').filter({ hasText: 'پیگیری اجرا' }).click();
  await page
    .locator('.management-chart__rows button')
    .filter({ hasText: 'برنامه‌ریزی‌شده' })
    .click();
  assert.equal(await page.locator('.report-drilldown li').count(), 1);
  assert.match(await page.locator('.report-drilldown').innerText(), /پیگیری سفارش/);
  assert.doesNotMatch(await page.locator('.report-drilldown').innerText(), /مصاحبه انجام‌شده/);
  await page.getByRole('button', { name: 'نمایش همه', exact: true }).click();
  assert.equal(await page.locator('.report-drilldown li').count(), 2);
  checks += 4;
  await page.locator('.report-view-picker button').filter({ hasText: 'تصویر راهبرد' }).click();
  await page.locator('.management-chart__rows button').filter({ hasText: 'قوت‌ها' }).click();
  assert.match(await page.locator('.report-drilldown').innerText(), /زمان تحویل سه پروژه/);
  assert.equal(await page.locator('.report-drilldown li').count(), 1);
  checks += 2;
  await page.locator('.report-view-picker button').filter({ hasText: 'آمادگی مدارک' }).click();
  await page.locator('.management-chart__rows button').filter({ hasText: 'آماده' }).click();
  assert.match(await page.locator('.report-drilldown').innerText(), /خلاصهٔ مدیریتی آزمایشی/);
  assert.equal(await page.locator('.report-drilldown li').count(), 1);
  checks += 2;
  for (const language of ['fa', 'en']) {
    if (language === 'en')
      await page.getByRole('button', { name: 'تغییر زبان به انگلیسی' }).click();
    for (const theme of ['light', 'dark']) {
      if ((await page.getAttribute('html', 'data-theme')) !== theme)
        await page
          .getByRole('switch', { name: language === 'en' ? 'Dark theme' : 'تم تیره', exact: true })
          .click();
      for (const width of [360, 768, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const layout = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          width: innerWidth,
          overflow: [...document.querySelectorAll('body *')]
            .filter((element) => {
              const box = element.getBoundingClientRect();
              return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
            })
            .slice(0, 10)
            .map((element) => ({
              tag: element.tagName,
              class: element.className,
              left: element.getBoundingClientRect().left,
              right: element.getBoundingClientRect().right,
            })),
        }));
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          `${language}/${theme}/${width} overflow ${JSON.stringify(layout)}`,
        );
        await page.screenshot({
          path: `${folder}/reports-${width}-${theme}-${language}.png`,
          fullPage: true,
          animations: 'disabled',
        });
        if (width === 1280 && language === 'fa' && theme === 'light')
          await page.screenshot({ path: `${folder}/studio-desktop.png`, animations: 'disabled' });
        checks++;
      }
      const audit = await new AxeBuilder({ page })
        .include('.application-shell')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      assert.deepEqual(
        audit.violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map((node) => node.target),
        })),
        [],
      );
      audits.push({ language, theme, violations: audit.violations.length });
    }
  }
  await page.setViewportSize({ width: 360, height: 900 });
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    '200% enlarged text overflow',
  );
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));
  checks++;
  await page.getByRole('combobox', { name: 'Saved snapshot' }).selectOption('snapshot-b');
  await page.waitForFunction(
    () => document.querySelector('.report-studio .management-donut strong')?.textContent === '0',
  );
  assert.equal(await page.locator('.report-drilldown li').count(), 0);
  checks++;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page
      .locator('.management-orbit__sheet')
      .evaluate((node) => getComputedStyle(node).animationName),
    'none',
  );
  checks++;
  authenticated = false;
  await page.reload();
  await page.waitForURL(/account\/login/);
  assert.equal(await page.locator('.report-studio').count(), 0);
  assert.deepEqual(errors, []);
  checks += 2;
  await writeFile(
    `${folder}/report.json`,
    JSON.stringify({ checks, audits, requests, syntheticOnly: true, errors }, null, 2),
  );
  await context.close();
  console.log(
    `PASS: ${checks} management overview/report interactions, 4 axe audits, four widths, both themes/languages, snapshot switching and expired-session cleanup. Synthetic API only.`,
  );
} finally {
  await browser.close();
}
