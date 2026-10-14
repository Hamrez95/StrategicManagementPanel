import { requestApi } from '../../api/client';

export type AuthFields = Record<string, string[]>;
export { ApiError as AuthApiError } from '../../api/client';

export function requestAuth<T = Record<string, unknown>>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload: Record<string, unknown> = {},
  decode?: (value: unknown) => T,
): Promise<T> {
  return requestApi<T>(path, {
    method,
    body: method === 'DELETE' ? undefined : payload,
    decode,
  });
}

export function postAuth<T = Record<string, unknown>>(
  path: string,
  payload: Record<string, unknown> = {},
  decode?: (value: unknown) => T,
) {
  return requestAuth<T>('POST', path, payload, decode);
}

export function patchAuth<T = Record<string, unknown>>(
  path: string,
  payload: Record<string, unknown>,
  decode?: (value: unknown) => T,
) {
  return requestAuth<T>('PATCH', path, payload, decode);
}

export function deleteAuth(path: string) {
  return requestAuth<{}>('DELETE', path);
}

export function firstFieldError(fields: AuthFields, name: string) {
  return fields[name]?.[0];
}
