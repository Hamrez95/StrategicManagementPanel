import { isSpace, type Space } from './model';

// A separate loopback-only design fixture. Never used by SessionBoundary or API clients.
export const TEST_EMAIL = 'hamrez95@stratino.test';
const SESSION_KEY = 'stratino-design-session-v1';
export const SPACES_KEY = 'stratino-design-spaces-v1';
export const DRAFT_KEY = 'stratino-design-draft-v1';
export function localExperienceEnabled() {
  return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(globalThis.location?.hostname ?? '');
}
export function hasLocalSession() {
  if (!localExperienceEnabled()) return false;
  try {
    return sessionStorage.getItem(SESSION_KEY) === TEST_EMAIL;
  } catch {
    return false;
  }
}
export function loginLocal(email: string, password: string) {
  if (
    !localExperienceEnabled() ||
    email.trim().toLowerCase() !== TEST_EMAIL ||
    password !== '123456'
  )
    return false;
  sessionStorage.setItem(SESSION_KEY, TEST_EMAIL);
  return true;
}
export function logoutLocal() {
  sessionStorage.removeItem(SESSION_KEY);
}
export function loadSpaces(): Space[] {
  const raw = localStorage.getItem(SPACES_KEY);
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(isSpace))
    throw new Error('اطلاعات ذخیره‌شده معتبر نیست. داده‌های قبلی پاک نشده‌اند.');
  return data;
}
