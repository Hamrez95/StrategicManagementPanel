export type Session = {
  authenticated: true;
  user: {
    id: string;
    name: string;
    is_staff: boolean;
    profile_required?: boolean;
    avatar?: { id: string; title: string; sprite_index: number; sprite_sheet?: string } | null;
  };
  workspaces: Array<{ id: string; name: string; role: 'owner' | 'editor' | 'viewer' }>;
};
export async function readSession(signal?: AbortSignal): Promise<Session | null> {
  const response = await fetch('/api/v1/session/', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok)
    throw new Error(
      'سرویس حساب هنوز در دسترس نیست. از نسخه نمونه استفاده کنید یا دوباره تلاش کنید.',
    );
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object') throw new Error('پاسخ حساب معتبر نیست.');
  const s = data as Partial<Session>;
  if (
    s.authenticated !== true ||
    !s.user ||
    typeof s.user.id !== 'string' ||
    typeof s.user.name !== 'string' ||
    typeof s.user.is_staff !== 'boolean' ||
    !Array.isArray(s.workspaces) ||
    s.workspaces.some(
      (w) =>
        !w ||
        typeof w.id !== 'string' ||
        typeof w.name !== 'string' ||
        !['owner', 'editor', 'viewer'].includes(w.role),
    )
  )
    throw new Error('پاسخ حساب معتبر نیست.');
  return s as Session;
}
