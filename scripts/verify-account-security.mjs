import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const base = process.argv[2] || process.env.STRATINO_UI_URL || 'http://127.0.0.1:5193';
const folder = 'test-results/account-security';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'chrome' : undefined,
});
const userId = '00000000-0000-4000-8000-000000000001';
let checks = 0,
  audits = 0;
try {
  for (const language of ['fa', 'en'])
    for (const theme of ['light', 'dark'])
      for (const width of [360, 1280]) {
        const english = language === 'en';
        const context = await browser.newContext({
          viewport: { width, height: 940 },
          reducedMotion: 'reduce',
        });
        const preferences = { language, theme, motion: 'reduced', show_tutorial: false };
        await context.addInitScript(
          (value) => localStorage.setItem('stratino-preferences-v1', JSON.stringify(value)),
          preferences,
        );
        let state = { enabled: true, enrolled: true, can_disable: true, revision: 1 };
        let writes = 0,
          conflict = false;
        await context.route(/\/api\/v1\//, async (route) => {
          const request = route.request(),
            path = new URL(request.url()).pathname;
          let body;
          if (path === '/api/v1/csrf/')
            return route.fulfill({
              json: {},
              headers: { 'Set-Cookie': 'csrftoken=synthetic-security; Path=/; SameSite=Lax' },
            });
          if (path === '/api/v1/session/')
            body = {
              authenticated: true,
              user: {
                id: userId,
                name: 'Synthetic Owner',
                is_staff: true,
                profile_required: false,
              },
              workspaces: [],
            };
          else if (path === '/api/v1/account/profile/')
            body = {
              user_id: userId,
              first_name: 'Synthetic',
              last_name: 'Owner',
              display_name: 'Synthetic Owner',
              role_title: '',
              phone_number: '+989120000000',
              phone_verified: false,
              avatar_id: null,
              avatar: null,
              email: 'synthetic@example.test',
              pending_email: '',
            };
          else if (path === '/api/v1/account/preferences/')
            body = {
              ...preferences,
              updated_at: '2026-10-27T00:00:00Z',
              device_sync_pending: false,
            };
          else if (path === '/api/v1/account/avatars/') body = { avatars: [] };
          else if (path === '/api/v1/account/subscriptions/')
            body = {
              user_id: userId,
              academy: {
                plans: [
                  {
                    id: 1,
                    code: 'full',
                    kind: 'full',
                    title: 'آکادمی کامل',
                    currency: 'IRR',
                    price: 1000000,
                    sale_price: 800000,
                    duration_days: 365,
                  },
                ],
                areas: [],
                subscriptions: [],
                orders: [],
                order_history_limit: 50,
                payment_enabled: false,
                access_summary: { full: false, general: false, area_ids: [], free_sample: true },
              },
              management: {
                billing_status: 'active',
                owned_workspaces: 1,
                archived_workspaces: 0,
                joined_workspaces: 0,
                plans_configured: true,
                access: {
                  accessLevel: 'free',
                  subscriptions: [],
                  owned_workspace_limit: 1,
                  features: {
                    can_finalize_analysis: false,
                    can_calculate_metrics: false,
                    can_generate_reports: false,
                  },
                },
                subscriptions: [],
              },
            };
          else if (path === '/api/v1/workspaces/') body = { items: [], next_cursor: null };
          else if (path === '/api/v1/operator/mfa-settings/') {
            if (request.method() === 'PATCH') {
              const data = request.postDataJSON();
              assert.deepEqual(Object.keys(data).sort(), [
                'code',
                'confirm',
                'enabled',
                'password',
                'revision',
              ]);
              assert.equal(data.confirm, true);
              assert.equal(data.password, 'synthetic-password');
              if (conflict) {
                conflict = false;
                return route.fulfill({
                  status: 409,
                  json: {
                    code: 'revision_conflict',
                    message: 'تنظیمات تغییر کرده؛ اطلاعات تازه رو بگیر.',
                  },
                });
              }
              assert.equal(data.revision, state.revision);
              assert.equal(data.enabled, !state.enabled);
              // Localization changes presentation, not the ASCII code typed into the field.
              if (state.enabled) assert.equal(data.code, '123456');
              state = { ...state, enabled: data.enabled, revision: state.revision + 1 };
              writes++;
            }
            body = state;
          } else throw new Error('Unexpected security fixture: ' + request.method() + ' ' + path);
          await route.fulfill({ json: body });
        });
        const page = await context.newPage();
        page.on('pageerror', (error) => console.log('Synthetic page error:', error.message));
        await page.goto(base + '/app/account');
        await page
          .getByRole('heading', {
            name: english ? 'Profile and settings' : 'پروفایل و تنظیمات',
            exact: true,
          })
          .waitFor();
        const card = page.locator('section[aria-labelledby="account-security-heading"]');
        try {
          await card.getByRole('heading').waitFor();
        } catch (error) {
          console.log(
            'Synthetic account snapshot:',
            (await page.locator('body').innerText()).slice(-2200),
          );
          throw error;
        }
        const action = card.getByRole('button', {
          name: english ? 'Turn off for local testing' : 'خاموش‌کردن برای تست محلی',
          exact: true,
        });
        assert.equal(await action.isDisabled(), true);
        checks++;
        await card
          .getByLabel(english ? 'Current password' : 'گذرواژهٔ فعلی', { exact: true })
          .fill('synthetic-password');
        await card
          .getByLabel(english ? 'Authenticator code' : 'کد Authenticator', { exact: true })
          .fill('123456');
        assert.equal(
          await card
            .getByLabel(english ? 'Authenticator code' : 'کد Authenticator', { exact: true })
            .inputValue(),
          english ? '123456' : '۱۲۳۴۵۶',
        );
        checks++;
        await card.getByRole('checkbox').check();
        conflict = true;
        await action.click();
        await card.getByRole('alert').waitFor();
        assert.equal(await action.isDisabled(), true);
        assert.equal(writes, 0);
        checks += 2;
        await card
          .getByRole('button', { name: english ? 'Reload latest settings' : 'دریافت اطلاعات تازه' })
          .click();
        await action.click();
        await card
          .getByText(
            english
              ? 'Two-factor authentication is off for local testing.'
              : 'ورود دومرحله‌ای برای تست محلی خاموشه.',
            { exact: true },
          )
          .waitFor();
        assert.equal(writes, 1);
        checks++;
        assert.equal(
          await card
            .getByLabel(english ? 'Current password' : 'گذرواژهٔ فعلی', { exact: true })
            .inputValue(),
          '',
        );
        checks++;
        await card
          .getByLabel(english ? 'Current password' : 'گذرواژهٔ فعلی', { exact: true })
          .fill('synthetic-password');
        await card.getByRole('checkbox').check();
        await card
          .getByRole('button', {
            name: english ? 'Turn on two-factor authentication' : 'روشن‌کردن ورود دومرحله‌ای',
            exact: true,
          })
          .click();
        await card
          .getByText(english ? 'Two-factor authentication is on.' : 'ورود دومرحله‌ای روشنه.', {
            exact: true,
          })
          .waitFor();
        assert.equal(writes, 2);
        checks++;
        const prices = await page.locator('.account-plan-price').innerText();
        assert.ok(prices.includes(english ? '365' : '۳۶۵'));
        assert.equal(/[۰-۹]/.test(prices), !english);
        checks += 2;
        if (english) {
          const untranslated = (await page.locator('body').innerText())
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => /[\u0600-\u06ff]/.test(line) && line !== 'فارسی');
          assert.deepEqual(untranslated, [], 'English account UI must not retain Persian labels');
          checks++;
        }
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          true,
        );
        checks++;
        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        assert.deepEqual(
          axe.violations.map((item) => item.id),
          [],
        );
        audits++;
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({
          path: `${folder}/security-card-${language}-${theme}-${width}.png`,
        });
        await page.screenshot({
          path: `${folder}/security-${language}-${theme}-${width}.png`,
          fullPage: true,
        });
        state = { ...state, can_disable: false };
        await page.reload();
        await page
          .getByRole('heading', {
            name: english ? 'Profile and settings' : 'پروفایل و تنظیمات',
            exact: true,
          })
          .waitFor();
        await card
          .getByText(
            english
              ? 'Admin two-factor authentication is required in this environment to protect user information.'
              : 'برای حفاظت از اطلاعات کاربران، ورود دومرحله‌ای مدیریت کل در این محیط الزامیه.',
            { exact: true },
          )
          .waitFor();
        assert.equal(await card.getByRole('checkbox').count(), 0);
        checks++;
        await context.close();
      }
  console.log(
    `PASS: ${checks} account security/locale checks and ${audits} axe audits. Synthetic API only; no real MFA or customer data changed.`,
  );
} finally {
  await browser.close();
}
