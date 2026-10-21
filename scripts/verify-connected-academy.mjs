import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const base = process.env.ACADEMY_URL ?? process.env.STRATINO_ACADEMY_URL ?? 'http://127.0.0.1:5193';
const container = process.env.ACADEMY_API_CONTAINER;
const read = async (p) => JSON.parse(await readFile(p, 'utf8'));
const manifest = await read('docs/learning-design/handoff/manifest.json');
const courses = await Promise.all(manifest.courses.map((c) => read(c.path)));
const units = courses.flatMap((c) =>
  [
    ...c.stages.flatMap((s) => [...s.lessons, s.checkpoint].filter(Boolean)),
    c.final_assessment,
  ].filter((u) => u?.questions?.length),
);
const samples = [
  'P00-ST01-L01',
  'C08-ST01-L02',
  'C03-ST02-L02',
  'S01-C1-ST03-L01',
  'S01-C3-ST01-L02',
];
const evidence = 'docs/qa/academy/connected';
await mkdir(evidence, { recursive: true });
function noKeys(value, path = '') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert(
      !['correct_option_id', 'answer', 'solution', 'feedback', 'rubric'].includes(key),
      `Premature assessment key ${path}/${key}`,
    );
    noKeys(child, `${path}/${key}`);
  }
}
let fixture;
const docker = (code) =>
  execFileSync(
    'docker',
    ['exec', container, 'python', 'manage.py', 'shell', '--no-imports', '-c', code],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .at(-1);
if (container) {
  const email = `academy-ui-${randomUUID()}@stratino.invalid`;
  fixture = JSON.parse(
    docker(
      `import json; from django.contrib.auth import get_user_model; from django.test import Client; u=get_user_model().objects.create_user('${email}'); c=Client(); c.force_login(u); print(json.dumps({'email':u.email,'session':c.cookies['sessionid'].value}))`,
    ),
  );
}
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (fixture)
    await context.addCookies([
      { name: 'sessionid', value: fixture.session, url: base, httpOnly: true, sameSite: 'Lax' },
    ]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const overflow = async () =>
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Page overflow',
    );
  await page.goto(`${base}/academy`);
  await page.locator('.learning-stage').first().waitFor();
  await page.screenshot({ path: `${evidence}/path-mobile.png` });
  for (const id of samples) {
    const unit = units.find((u) => u.id === id);
    const publicData = await (
      await context.request.get(`${base}/academy-content/${id}.json`)
    ).json();
    noKeys(publicData);
    assert.deepEqual(
      publicData.learning_cards,
      unit.learning_cards,
      `Altered teaching cards: ${id}`,
    );
    assert.deepEqual(
      publicData.questions.map((q) => [q.id, q.options.map((o) => [o.id, o.text])]),
      unit.questions.map((q) => [q.id, q.options.map((o) => [o.id, o.text])]),
    );
    await page.goto(`${base}/academy/lesson/${id}`);
    await page.locator('.learning-card').waitFor();
    for (const card of unit.learning_cards) {
      await page.locator(`article[id="${card.id}"]`).waitFor();
      assert.equal(await page.locator('.learning-prose').first().innerText(), card.text);
      await overflow();
      if (publicData.media_plan?.display_on_card_id === card.id) {
        await page.locator('.learning-media img').first().waitFor();
        assert(
          await page
            .locator('.learning-media img')
            .evaluateAll((images) =>
              images.every((image) => image.complete && image.naturalWidth > 0),
            ),
        );
        await page.screenshot({ path: `${evidence}/${id}-media-mobile.png`, fullPage: true });
      }
      await page
        .locator('.learning-actions')
        .last()
        .getByRole('button', { name: 'ادامه', exact: true })
        .click();
    }
    for (const [index, question] of unit.questions.entries()) {
      await page.locator(`.learning-assessment[data-question-id="${question.id}"]`).waitFor();
      const options = page.locator('.learning-option');
      await options.first().waitFor();
      if (!index) {
        const wrong = question.options.find((o) => o.id !== question.correct_option_id);
        await page.locator(`input[value="${wrong.id}"]`).check();
        await page.getByRole('button', { name: 'بررسی جواب', exact: true }).click();
        await page.locator('.learning-feedback').waitFor();
        assert(
          (await page.locator('.learning-feedback').innerText()).includes('این جواب درست نیست'),
        );
        await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
      }
      await page.locator(`input[value="${question.correct_option_id}"]`).check();
      await page.getByRole('button', { name: 'بررسی جواب', exact: true }).click();
      await page.locator('.learning-feedback--correct').waitFor();
      await page
        .locator('.learning-actions')
        .last()
        .getByRole('button', { name: 'ادامه', exact: true })
        .click();
    }
    if (unit.practice_activity?.type === 'numeric') {
      await page.locator('.learning-number').fill('1,5');
      await page.getByRole('button', { name: 'بررسی جواب', exact: true }).click();
      await page.locator('.learning-assessment [role="alert"]').waitFor();
      await page
        .locator('.learning-number')
        .fill(String(unit.practice_activity.answer).replaceAll(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]));
      await page.getByRole('button', { name: 'بررسی جواب', exact: true }).click();
      await page.locator('.learning-feedback--correct').waitFor();
    } else if (unit.practice_activity) {
      await page
        .locator('.learning-worksheet > label textarea')
        .fill('پاسخ نمونه برای بررسی ذخیره و مرور معیارهای همین فعالیت.');
      if (id === 'S01-C3-ST01-L02') {
        assert.equal(await page.locator('.learning-bmc textarea').count(), 9);
        await page
          .locator('.learning-bmc textarea')
          .first()
          .fill('فرض: شریک فنی با شاهد قابل بررسی');
      }
      await page.getByRole('button', { name: 'ثبت پاسخ و دیدن معیارها' }).click();
      await page.locator('.learning-feedback').waitFor();
      assert((await page.locator('.learning-feedback').innerText()).includes('نمرهٔ خودکار نداره'));
    }
    if (unit.practice_activity)
      await page
        .locator('.learning-actions')
        .last()
        .getByRole('button', { name: 'ادامه', exact: true })
        .click();
    await page.locator('.learning-finish').waitFor();
    if (fixture) {
      await page.locator('.learning-notes summary').click();
      await page.locator('.learning-notes textarea').fill(`یادداشت محفوظ ${id}`);
      await page.getByRole('button', { name: 'ذخیرهٔ یادداشت' }).click();
      await page.getByText('در حسابت ذخیره شد.', { exact: true }).waitFor();
      await page.reload();
      await page.locator('.learning-finish').waitFor();
      await page.locator('.learning-notes summary').click();
      assert.equal(
        await page.locator('.learning-notes textarea').inputValue(),
        `یادداشت محفوظ ${id}`,
      );
    }
  }
  await page.goto(`${base}/academy/review/E01-FINAL`);
  await page.locator('.learning-assessment').waitFor();
  assert(await page.locator('.learning-reuse').count());
  for (const width of [360, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/academy/catalog`);
    await page.locator('.learning-course-card').first().waitFor();
    await overflow();
    if (width === 1280) {
      await page.locator('.academy-page-intro .academy-mascot').evaluate((image) => image.decode());
      await page.screenshot({ path: `${evidence}/catalog-desktop.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    `Representative UI checks passed: ${samples.length} complete lessons; choice correction, numeric validation, open-response rubric, repeated final review, 4 widths${fixture ? ', account persistence after reload' : ''}.`,
  );
} finally {
  await browser.close();
  if (fixture)
    docker(
      `from django.contrib.auth import get_user_model; from django.contrib.sessions.models import Session; get_user_model().objects.filter(email='${fixture.email}').delete(); Session.objects.filter(session_key='${fixture.session}').delete()`,
    );
}
