const KEY = 'royesh-preferences-v1';
const defaults = { theme: 'light', language: 'fa', motion: 'auto', showTutorial: true };
const allowed = { theme: ['light', 'dark', 'system'], language: ['fa', 'en'], motion: ['auto', 'reduced'], showTutorial: [true, false] };
export const preferences = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  for (const key of Object.keys(defaults)) if (allowed[key].includes(saved?.[key])) preferences[key] = saved[key];
} catch { /* Preferences work for this session when storage is unavailable. */ }
export const locale = () => preferences.language === 'en' ? 'en-US' : 'fa-IR';
export function setPreference(key, value) {
  if (!allowed[key]?.includes(value)) return;
  preferences[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(preferences)); } catch { /* Session-only preference. */ }
  applyPreferences();
}
export function applyPreferences() {
  const root = document.documentElement;
  document.querySelector('link[rel="manifest"]')?.setAttribute('href',preferences.language==='en'?'/manifest-en.webmanifest':'/manifest.webmanifest');
  root.lang = preferences.language;
  root.dir = preferences.language === 'en' ? 'ltr' : 'rtl';
  const systemDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = preferences.theme === 'system' ? (systemDark ? 'dark' : 'light') : preferences.theme;
  root.dataset.motion = preferences.motion;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', root.dataset.theme === 'dark' ? '#141d2f' : '#2459ed');
}
globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', applyPreferences);
globalThis.window?.addEventListener('storage', event => {
  if (event.key !== KEY) return;
  try {
    const saved = JSON.parse(event.newValue);
    for (const key of Object.keys(defaults)) preferences[key] = allowed[key].includes(saved?.[key]) ? saved[key] : defaults[key];
    window.dispatchEvent(new Event('preferenceschange'));
  } catch { /* Ignore invalid preference data. */ }
});
