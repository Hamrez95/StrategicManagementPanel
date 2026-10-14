import { AuthApiError, patchAuth, postAuth } from '../auth/api';

export type UserPreferences = {
  theme: 'system' | 'light' | 'dark';
  language: 'fa' | 'en';
  motion: 'auto' | 'reduced';
  show_tutorial: boolean;
  device_sync_pending: boolean;
  updated_at: string;
};

export type DevicePreferences = Omit<UserPreferences, 'device_sync_pending' | 'updated_at'>;

export type AccountProfile = {
  email: string;
  display_name: string;
  role_title: string;
  pending_email: string;
};

const DEVICE_KEY = 'stratino-preferences-v1';
const LEGACY_KEY = 'royesh-preferences-v1';
const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  theme: 'system',
  language: 'fa',
  motion: 'auto',
  show_tutorial: true,
};

function parsePreferences(value: string | null): Partial<DevicePreferences> | null {
  if (!value) return null;
  try {
    const saved: unknown = JSON.parse(value);
    if (!saved || typeof saved !== 'object') return null;
    const candidate = saved as Record<string, unknown>;
    const result: Partial<DevicePreferences> = {};
    if (candidate.theme === 'light' || candidate.theme === 'dark' || candidate.theme === 'system') {
      result.theme = candidate.theme;
    }
    if (candidate.language === 'en' || candidate.language === 'fa') result.language = candidate.language;
    if (candidate.motion === 'reduced' || candidate.motion === 'auto') result.motion = candidate.motion;
    if (typeof candidate.show_tutorial === 'boolean') result.show_tutorial = candidate.show_tutorial;
    else if (typeof candidate.showTutorial === 'boolean') result.show_tutorial = candidate.showTutorial;
    return result;
  } catch {
    return null;
  }
}

export function readDevicePreferences(): DevicePreferences {
  try {
    const current = parsePreferences(localStorage.getItem(DEVICE_KEY));
    const saved = current && Object.keys(current).length > 0 ? current : parsePreferences(localStorage.getItem(LEGACY_KEY));
    return { ...DEFAULT_DEVICE_PREFERENCES, ...saved };
  } catch {
    return { ...DEFAULT_DEVICE_PREFERENCES };
  }
}

export function applyAccountPreferences(preferences: UserPreferences | DevicePreferences) {
  const device: DevicePreferences = {
    theme: preferences.theme,
    language: preferences.language,
    motion: preferences.motion,
    show_tutorial: preferences.show_tutorial,
  };
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
    const existing = parsePreferences(localStorage.getItem(LEGACY_KEY)) ?? {};
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({
        ...existing,
        theme: device.theme,
        language: device.language,
        motion: device.motion,
        showTutorial: device.show_tutorial,
      }),
    );
  } catch {
    /* Preferences remain active in this page when storage is unavailable. */
  }
  window.dispatchEvent(new CustomEvent<DevicePreferences>('stratino:preferences', { detail: device }));
}

async function getAccount<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new AuthApiError('اتصال سرویس حساب قطع شد. دوباره تلاش کنید.', 0);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AuthApiError(
      typeof body?.message === 'string' ? body.message : 'اطلاعات حساب بارگذاری نشد.',
      response.status,
      body?.fields && typeof body.fields === 'object' ? body.fields : {},
      typeof body?.code === 'string' ? body.code : '',
    );
  }
  return body as T;
}

export async function readAccountProfile(signal?: AbortSignal) {
  return getAccount<AccountProfile>('/api/v1/account/profile/', signal);
}

export async function saveAccountProfile(profile: Pick<AccountProfile, 'display_name' | 'role_title'>) {
  return patchAuth<AccountProfile>('/api/v1/account/profile/', profile);
}

export async function readAccountPreferences(signal?: AbortSignal) {
  return getAccount<UserPreferences>('/api/v1/account/preferences/', signal);
}

export async function loadAndSyncAccountPreferences(signal?: AbortSignal) {
  let preferences = await readAccountPreferences(signal);
  if (preferences.device_sync_pending) {
    const devicePreferences = readDevicePreferences();
    preferences = await patchAuth<UserPreferences>('/api/v1/account/preferences/', devicePreferences);
  }
  applyAccountPreferences(preferences);
  return preferences;
}

export async function saveAccountPreferences(preferences: DevicePreferences) {
  const saved = await patchAuth<UserPreferences>('/api/v1/account/preferences/', preferences);
  applyAccountPreferences(saved);
  return saved;
}

export async function requestEmailChange(email: string) {
  return postAuth<{ message: string }>('/api/v1/account/email-change/', { email });
}
