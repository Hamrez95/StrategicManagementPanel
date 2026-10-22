import type { Session } from '../../session';
export function isSafeInternalDestination(next: string | null): next is string {
  if (
    !next?.startsWith('/') ||
    next.startsWith('//') ||
    next.includes('\\') ||
    Array.from(next).some((c) => c.charCodeAt(0) <= 32)
  )
    return false;
  try {
    return new URL(next, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}
export function authReturnQuery(search: string) {
  const next = new URLSearchParams(search).get('next');
  return isSafeInternalDestination(next) ? `?next=${encodeURIComponent(next)}` : '';
}
export function destinationAfterLogin(session: Session, requested: string | null) {
  const next =
    isSafeInternalDestination(requested) && !requested.startsWith('/account/')
      ? requested
      : session.workspaces.length
        ? '/app/workspaces'
        : '/app/start';
  return session.user.profile_required
    ? `/account/complete-profile?next=${encodeURIComponent(next)}`
    : next;
}
