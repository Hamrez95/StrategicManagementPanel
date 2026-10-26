import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const base = process.argv[2] || process.env.STRATINO_UI_URL || 'http://127.0.0.1:5193';
const folder = 'test-results/academy-operator-actions';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'chrome' : undefined,
});
const account = '00000000-0000-4000-8000-000000000001';
let checks = 0,
  audits = 0;
let debugPage;
try {
  for (const [width, language, theme] of [
    [360, 'fa', 'dark'],
    [1280, 'fa', 'light'],
    [360, 'en', 'light'],
    [1280, 'en', 'dark'],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    await context.addCookies([{ name: 'csrftoken', value: 'a'.repeat(64), url: base }]);
    const page = await context.newPage();
    debugPage = page;
    const errors = [],
      grants = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const t = (fa, en) => (language === 'en' ? en : fa);
    let readOnly = false,
      failGrant = true,
      conflict = false;
    let sample = {
      unit_id: 'L1',
      title: 'درس‌نامهٔ آزمایشی',
      area_kind: 'specialty',
      version: 'sample-v1',
      cards: [0, 1, 2].map((n) => ({ id: 'CARD' + n, title: 'کارت ' + n })),
      active_card_ids: ['CARD0', 'CARD1'],
      other_specialty_cards: 0,
    };
    const subscriptions = [];
    await page.route(/\/api\/v1\//, async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      let payload,
        status = 200;
      if (url.pathname === '/api/v1/session/')
        payload = {
          authenticated: true,
          user: { id: account, name: 'Synthetic operator', is_staff: true },
          workspaces: [],
        };
      else if (url.pathname === '/api/v1/account/preferences/')
        payload = {
          theme,
          language,
          motion: 'reduced',
          show_tutorial: false,
          device_sync_pending: false,
          updated_at: '2026-10-26T00:00:00Z',
        };
      else if (url.pathname === '/api/v1/operator/status/')
        payload = {
          sections: ['academy_samples', 'academy_subscriptions'],
          mfa_ready: true,
          mfa_configured: true,
          mfa_enrolled: true,
          expires_at: new Date(Date.now() + 900000).toISOString(),
          actor: { name: 'Synthetic operator' },
          capabilities: {
            edit_academy_samples: !readOnly,
            grant_academy: !readOnly,
            revoke_academy: !readOnly,
          },
        };
      else if (url.pathname === '/api/v1/operator/academy_samples/configure/') {
        if (request.method() === 'POST') {
          assert.ok(request.headers()['x-csrftoken']);
          if (conflict) {
            status = 409;
            payload = { code: 'revision_conflict', message: 'Synthetic revision conflict' };
            conflict = false;
          } else {
            const body = request.postDataJSON();
            assert.equal(body.version, sample.version);
            sample = {
              ...sample,
              active_card_ids: sample.cards.slice(0, body.count).map((c) => c.id),
              version: 'sample-v2',
            };
            payload = sample;
          }
        } else
          payload = url.searchParams.get('unit_id')
            ? sample
            : { units: [{ id: 'L1', title: sample.title }] };
      } else if (url.pathname === '/api/v1/operator/academy_subscriptions/grant/') {
        if (request.method() === 'GET')
          payload = {
            plans: [{ id: 17, title: 'Specialty plan', kind: 'specialty' }],
            areas: [
              { id: 'strategy', title: 'Strategy' },
              { id: 'finance', title: 'Finance' },
            ],
          };
        else {
          assert.ok(request.headers()['x-csrftoken']);
          const body = request.postDataJSON();
          grants.push(body);
          if (failGrant) {
            failGrant = false;
            status = 503;
            payload = { code: 'temporary_failure', message: 'Synthetic retry required' };
          } else {
            subscriptions.push({
              id: body.request_id,
              user_id: account,
              coverage: 'specialty',
              areas: body.areas,
              status: 'active',
              plan_code: 'specialty',
              is_effective: true,
              starts_at: body.starts_at,
              ends_at: null,
              order_item_id: null,
              version: 'sub-v1',
            });
            payload = subscriptions[0];
            status = 201;
          }
        }
      } else if (/\/operator\/academy_subscriptions\/[\da-f-]+\/$/.test(url.pathname)) {
        if (request.method() === 'POST') {
          assert.ok(request.headers()['x-csrftoken']);
          assert.equal(request.postDataJSON().version, subscriptions[0].version);
          subscriptions[0] = {
            ...subscriptions[0],
            status: 'revoked',
            is_effective: false,
            version: 'sub-v2',
          };
        }
        payload = subscriptions[0];
      } else if (
        ['/api/v1/operator/academy_samples/', '/api/v1/operator/academy_subscriptions/'].includes(
          url.pathname,
        )
      ) {
        const results = url.pathname.includes('academy_samples')
          ? [
              {
                id: 'CARD0',
                title: sample.cards[0].title,
                unit_id: 'L1',
                course_id: 'C1',
                is_active: sample.active_card_ids.includes('CARD0'),
                updated_at: '2026-10-26T00:00:00Z',
              },
            ]
          : subscriptions;
        payload = { results, count: results.length, page: 1, has_next: false, has_previous: false };
      } else if (url.pathname === '/api/v1/csrf/') payload = { csrfToken: 'a'.repeat(64) };
      else throw Error('Unexpected request: ' + request.method() + ' ' + url.pathname);
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    });
    async function fitAndAudit(label) {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const box = await page.locator('dialog[open]').boundingBox();
      assert.ok(
        box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 900,
      );
      const result = await new AxeBuilder({ page }).include('dialog[open]').analyze();
      await writeFile(
        `${folder}/axe-${width}-${language}-${label}.json`,
        JSON.stringify(result.violations, null, 2),
      );
      assert.deepEqual(
        result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
        [],
      );
      checks += 2;
      audits++;
    }
    const dialog = page.locator('dialog[open]');
    async function confirm(reason) {
      await dialog.getByLabel(t('دلیل تغییر', 'Reason for change'), { exact: true }).fill(reason);
      await dialog
        .getByLabel(
          t(
            'دامنهٔ تغییر رو بررسی کردم و تأیید می‌کنم.',
            'I reviewed and confirm the scope of this change.',
          ),
        )
        .check();
    }
    await page.goto(base + '/internal/academy_samples');
    await page.getByRole('button', { name: t('ویرایش نمونه', 'Edit sample'), exact: true }).click();
    await dialog.getByRole('heading', { name: sample.title }).waitFor();
    await dialog
      .getByRole('combobox', {
        name: t('تعداد کارت‌های اول', 'Number of first cards'),
        exact: true,
      })
      .selectOption('1');
    await confirm('Synthetic sample edit');
    await fitAndAudit('sample');
    await page.screenshot({
      path: `${folder}/sample-${width}-${language}-${theme}.png`,
      fullPage: false,
    });
    conflict = true;
    const saveSample = dialog.getByRole('button', {
      name: t('تنظیم نمونهٔ رایگان', 'Configure free sample'),
      exact: true,
    });
    await saveSample.click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await saveSample.isDisabled(), true);
    checks++;
    await dialog
      .getByRole('button', {
        name: t('گرفتن اطلاعات تازه و جایگزینی فرم', 'Reload latest data and replace form'),
      })
      .click();
    await dialog
      .getByRole('combobox', {
        name: t('تعداد کارت‌های اول', 'Number of first cards'),
        exact: true,
      })
      .selectOption('1');
    await confirm('Synthetic sample edit');
    await saveSample.click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(sample.active_card_ids, ['CARD0']);
    checks++;
    await page.goto(base + '/internal/academy_subscriptions');
    await page
      .getByRole('button', { name: t('اعطای دسترسی آکادمی', 'Grant Academy access'), exact: true })
      .click();
    await dialog
      .getByLabel(t('شناسهٔ حساب کاربر', 'User account ID'), { exact: true })
      .fill(account);
    await dialog
      .getByRole('combobox', { name: t('پلن آکادمی', 'Academy plan'), exact: true })
      .selectOption('17');
    await dialog.getByLabel('Strategy', { exact: true }).check();
    await dialog.getByLabel('Finance', { exact: true }).check();
    await dialog.getByLabel(t('بدون تاریخ پایان اعطا کن', 'Grant without an expiry date')).check();
    await confirm('Synthetic manual grant');
    await fitAndAudit('grant');
    await page.screenshot({
      path: `${folder}/grant-${width}-${language}-${theme}.png`,
      fullPage: false,
    });
    const grant = dialog.getByRole('button', {
      name: t('اعطای دسترسی آکادمی', 'Grant Academy access'),
      exact: true,
    });
    await grant.click();
    await dialog.getByRole('alert').waitFor();
    await grant.click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(grants.length, 2);
    assert.equal(grants[0].request_id, grants[1].request_id);
    assert.equal(grants[1].ends_at, null);
    assert.deepEqual(grants[1].areas, ['strategy', 'finance']);
    checks += 4;
    await page
      .getByRole('button', { name: t('لغو دسترسی آکادمی', 'Revoke Academy access'), exact: true })
      .click();
    await dialog.getByText(account, { exact: true }).waitFor();
    await confirm('Synthetic explicit revocation');
    await fitAndAudit('revoke');
    await dialog
      .getByRole('button', { name: t('لغو دسترسی آکادمی', 'Revoke Academy access'), exact: true })
      .click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(subscriptions[0].status, 'revoked');
    checks++;
    readOnly = true;
    await page.reload();
    await page.locator('.op-collection #operator-section-title').waitFor();
    assert.equal(
      await page
        .getByRole('button', {
          name: t('اعطای دسترسی آکادمی', 'Grant Academy access'),
          exact: true,
        })
        .count(),
      0,
    );
    checks++;
    assert.deepEqual(errors, []);
    checks++;
    await context.close();
  }
  console.log(
    `PASS: ${checks} Academy operator workflow checks and ${audits} modal accessibility audits; synthetic browser data only.`,
  );
} catch (error) {
  console.error(error);
  if (debugPage && !debugPage.isClosed()) {
    await debugPage.screenshot({ path: `${folder}/failure.png`, fullPage: false });
    if (await debugPage.locator('dialog[open]').count()) console.error(await debugPage.locator('dialog[open]').ariaSnapshot());
  }
  throw error;
} finally {
  await browser.close();
}
