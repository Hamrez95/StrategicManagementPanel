import test from 'node:test';
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) || null,
  setItem: (key, value) => store.set(key, value),
};
globalThis.document = { documentElement: { dataset: {} }, querySelector: () => null };
globalThis.matchMedia = () => ({ matches: true, addEventListener() {} });
const { preferences, setPreference, applyPreferences, locale } =
  await import('../src/preferences.js');
const { translate } = await import('../src/i18n.js');
test('preferences validate, persist and select the appropriate language direction', () => {
  setPreference('language', 'en');
  assert.equal(locale(), 'en-US');
  assert.equal(document.documentElement.dir, 'ltr');
  setPreference('theme', 'system');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  setPreference('motion', 'reduced');
  assert.equal(document.documentElement.dataset.motion, 'reduced');
  setPreference('language', 'invalid');
  assert.equal(preferences.language, 'en');
  assert.equal(preferences.showTutorial, true);
  setPreference('showTutorial', false);
  setPreference('showTutorial', 'false');
  assert.equal(preferences.showTutorial, false);
  assert.deepEqual(JSON.parse(store.get('royesh-preferences-v1')), {
    theme: 'system',
    language: 'en',
    motion: 'reduced',
    showTutorial: false,
  });
});
test('English covers finance definitions, dynamic scores and date labels', () => {
  assert.equal(translate('ROA · بازده دارایی‌ها'), 'ROA · Return on assets');
  assert.equal(
    translate('سود خالص دوره ÷ متوسط دارایی‌های ابتدا و انتهای دوره × ۱۰۰'),
    'Period net income ÷ Average opening and closing assets × 100',
  );
  assert.equal(translate('موعد: ۱۴۰۵/۰۸/۳۰'), 'Due (Jalali): 1405/08/30');
  assert.equal(translate('وزن ۲٫۵'), 'Weight 2.5');
  assert.equal(translate('User-provided company name'), 'User-provided company name');
});
test('Persian preserves original text and restores right-to-left layout', () => {
  setPreference('language', 'fa');
  applyPreferences();
  assert.equal(document.documentElement.dir, 'rtl');
  assert.equal(translate('سود خالص ۴۰۰'), 'سود خالص ۴۰۰');
});
