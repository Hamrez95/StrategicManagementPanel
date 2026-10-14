export type ApiFields = Record<string, string[]>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: ApiFields = {},
    readonly code = '',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiRequestOptions<T> = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  decode?: (value: unknown) => T;
};

function readCsrfCookie() {
  if (typeof document === 'undefined') return '';
  const cookie = document.cookie
    .split('; ')
    .find((part) => part.startsWith('csrftoken='))
    ?.slice('csrftoken='.length);
  return cookie ? decodeURIComponent(cookie) : '';
}

async function ensureCsrfCookie() {
  if (readCsrfCookie()) return readCsrfCookie();
  try {
    const response = await fetch('/api/v1/csrf/', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok || !readCsrfCookie()) throw new Error('CSRF bootstrap failed');
    return readCsrfCookie();
  } catch {
    throw new ApiError('ارتباط امن با سرویس برقرار نشد. اتصال را بررسی و دوباره تلاش کنید.', 0);
  }
}

function errorFields(value: unknown): ApiFields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, messages]) => [
    key,
    Array.isArray(messages) ? messages.filter((message): message is string => typeof message === 'string') : [],
  ]));
}

function errorMessage(response: Response, body: unknown) {
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  if (response.status === 403 && record.code !== 'workspace_permission_denied') {
    return 'درخواست امنیتی تأیید نشد. صفحه را تازه کنید و دوباره تلاش کنید.';
  }
  return typeof record.message === 'string' ? record.message : 'درخواست کامل نشد. دوباره تلاش کنید.';
}

function reportSessionExpiry(path: string, status: number) {
  if (status !== 401 || typeof window === 'undefined') return;
  if (!path.startsWith('/api/v1/workspaces/') && !path.startsWith('/api/v1/account/')) return;
  window.dispatchEvent(new Event('stratino:session-expired'));
}

export async function requestApi<T>(path: string, options: ApiRequestOptions<T> = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (method !== 'GET' && method !== 'DELETE') {
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET') headers['X-CSRFToken'] = await ensureCsrfCookie();

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal,
      headers,
      body: method === 'GET' || method === 'DELETE' || options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('ارتباط با سرویس قطع شد. اتصال را بررسی و دوباره تلاش کنید.', 0);
  }

  const payload: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    reportSessionExpiry(path, response.status);
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    throw new ApiError(
      errorMessage(response, payload),
      response.status,
      errorFields(record.fields),
      typeof record.code === 'string' ? record.code : '',
    );
  }
  if (payload === undefined) return undefined as T;
  if (!options.decode) return payload as T;
  try {
    return options.decode(payload);
  } catch {
    throw new ApiError('پاسخ سرویس معتبر نیست. دوباره تلاش کنید.', 502, {}, 'invalid_response');
  }
}
