import {
  AuthApiError,
  deleteAuth,
  patchAuth,
  postAuth,
} from '../auth/api';

export type WorkspaceRole = 'owner' | 'editor' | 'viewer';
export type MemberRole = Exclude<WorkspaceRole, 'owner'>;

export type WorkspaceRecord = {
  id: string;
  owner_id: string;
  billing_account_id: string;
  name: string;
  revision: number;
  archived_at: string | null;
};

export type WorkspaceMember = {
  user_id: string;
  email: string;
  name: string;
  role: WorkspaceRole;
};

export type WorkspaceInvitation = {
  id: string;
  email: string;
  role: MemberRole;
  expires_at: string;
};

export type WorkspaceUpdate = {
  revision: number;
  name?: string;
  archived?: boolean;
};

async function getWorkspaceData<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new AuthApiError('اتصال به فضای کار قطع شد. دوباره تلاش کنید.', 0);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AuthApiError(
      typeof body?.message === 'string' ? body.message : 'فضای کار بارگذاری نشد.',
      response.status,
      body?.fields && typeof body.fields === 'object' ? body.fields : {},
      typeof body?.code === 'string' ? body.code : '',
    );
  }
  return body as T;
}

export async function listWorkspaces(signal?: AbortSignal): Promise<WorkspaceRecord[]> {
  const records: WorkspaceRecord[] = [];
  const seenCursors = new Set<string>();
  let cursor = '';
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const page = await getWorkspaceData<{ items: WorkspaceRecord[]; next_cursor: string | null }>(
      `/api/v1/workspaces/?${query.toString()}`,
      signal,
    );
    if (!Array.isArray(page.items) || (page.next_cursor !== null && typeof page.next_cursor !== 'string')) {
      throw new AuthApiError('فهرست فضای کار معتبر نیست.', 502);
    }
    records.push(...page.items);
    cursor = page.next_cursor ?? '';
    if (cursor && seenCursors.has(cursor)) throw new AuthApiError('صفحه‌بندی فهرست کامل نشد.', 502);
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return records;
}

export function readWorkspace(workspaceId: string, signal?: AbortSignal) {
  return getWorkspaceData<WorkspaceRecord>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/`,
    signal,
  );
}

export function createWorkspace(name: string) {
  return postAuth<WorkspaceRecord>('/api/v1/workspaces/', { name });
}

export function saveWorkspace(workspaceId: string, update: WorkspaceUpdate) {
  return patchAuth<WorkspaceRecord>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/`,
    update,
  );
}

export async function listWorkspaceMembers(workspaceId: string, signal?: AbortSignal) {
  const response = await getWorkspaceData<{ items: WorkspaceMember[] }>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/members/`,
    signal,
  );
  return response.items;
}

export async function listWorkspaceInvitations(workspaceId: string, signal?: AbortSignal) {
  const response = await getWorkspaceData<{ items: WorkspaceInvitation[] }>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/invitations/`,
    signal,
  );
  return response.items;
}

export function inviteWorkspaceMember(workspaceId: string, email: string, role: MemberRole) {
  return postAuth<{ message: string }>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/invitations/`,
    { email, role },
  );
}

export function revokeWorkspaceInvitation(workspaceId: string, invitationId: string) {
  return deleteAuth(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/invitations/${encodeURIComponent(invitationId)}/`,
  );
}

export function updateWorkspaceMemberRole(workspaceId: string, userId: string, role: MemberRole) {
  return patchAuth<WorkspaceMember>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}/`,
    { role },
  );
}

export function removeWorkspaceMember(workspaceId: string, userId: string) {
  return deleteAuth(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}/`,
  );
}

export function acceptWorkspaceInvitation(token: string) {
  return postAuth<{ workspace: WorkspaceRecord; membership: WorkspaceMember }>(
    '/api/v1/workspace-invitations/accept/',
    { token },
  );
}
