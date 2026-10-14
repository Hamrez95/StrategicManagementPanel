export type AuthFields = Record<string, string[]>;

export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: AuthFields = {},
    readonly code = '',
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

function readCsrfCookie() {
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
    throw new AuthApiError('ارتباط امن با سرویس حساب برقرار نشد. اتصال را بررسی و دوباره تلاش کنید.', 0);
  }
}

export async function requestAuth<T = Record<string, unknown>>(
  method: 'POST' | 'PATCH',
  path: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const csrfToken = await ensureCsrfCookie();
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AuthApiError('ارتباط با سرویس حساب قطع شد. اتصال را بررسی و دوباره تلاش کنید.', 0);
  }

  const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const fields =
      body && typeof body.fields === 'object' && body.fields !== null
        ? (body.fields as AuthFields)
        : {};
    const message =
      response.status === 403
        ? 'درخواست امنیتی تأیید نشد. صفحه را تازه کنید و دوباره تلاش کنید.'
        : typeof body?.message === 'string'
          ? body.message
          : 'درخواست کامل نشد. دوباره تلاش کنید.';
    throw new AuthApiError(message, response.status, fields, typeof body?.code === 'string' ? body.code : '');
  }
  return body as T;
}

export function postAuth<T = Record<string, unknown>>(
  path: string,
  payload: Record<string, unknown> = {},
) {
  return requestAuth<T>('POST', path, payload);
}

export function patchAuth<T = Record<string, unknown>>(
  path: string,
  payload: Record<string, unknown>,
) {
  return requestAuth<T>('PATCH', path, payload);
}

export function firstFieldError(fields: AuthFields, name: string) {
  return fields[name]?.[0];
}
