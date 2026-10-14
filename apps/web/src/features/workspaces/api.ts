import { requestApi, ApiError as AuthApiError } from '../../api/client';
import {
  decodeWorkspace,
  decodeWorkspaceInvitation,
  decodeWorkspaceMember,
  decodeWorkspacePage,
  decodeWorkspaceProfile,
  type ApiWorkspace,
  type ApiWorkspaceInvitation,
  type ApiWorkspaceMember,
  type ApiWorkspaceProfile,
  type OpenApiPaths,
} from '../../api/contracts';
import { deleteAuth, patchAuth, postAuth } from '../auth/api';

export type WorkspaceRole = 'owner' | 'editor' | 'viewer';
export type MemberRole = Exclude<WorkspaceRole, 'owner'>;

export type WorkspaceRecord = ApiWorkspace;
export type WorkspaceMember = ApiWorkspaceMember;
export type WorkspaceInvitation = ApiWorkspaceInvitation;

export type WorkspaceUpdate = {
  revision: number;
  name?: string;
  archived?: boolean;
};

export type ProjectProfile = ApiWorkspaceProfile;
type WorkspaceProfileEndpoint = OpenApiPaths['/api/v1/workspaces/{workspace_id}/profile/'];
export type ProjectProfileUpdate = WorkspaceProfileEndpoint['patch']['requestBody'];

function decodeMessage(value: unknown) {
  if (!value || typeof value !== 'object' || typeof (value as { message?: unknown }).message !== 'string') {
    throw new TypeError('Invalid message response');
  }
  return { message: (value as { message: string }).message };
}

function getWorkspaceData<T>(path: string, signal?: AbortSignal, decode?: (value: unknown) => T): Promise<T> {
  return requestApi<T>(path, { signal, decode });
}

export async function listWorkspaces(signal?: AbortSignal): Promise<WorkspaceRecord[]> {
  const records: WorkspaceRecord[] = [];
  const seenCursors = new Set<string>();
  let cursor = '';
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const page = await getWorkspaceData(
      `/api/v1/workspaces/?${query.toString()}`,
      signal,
      decodeWorkspacePage,
    );
    records.push(...page.items);
    cursor = page.next_cursor ?? '';
    if (cursor && seenCursors.has(cursor)) throw new AuthApiError('صفحه‌بندی فهرست کامل نشد.', 502);
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return records;
}

export function readWorkspace(workspaceId: string, signal?: AbortSignal) {
  return getWorkspaceData(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/`,
    signal,
    decodeWorkspace,
  );
}

export function createWorkspace(name: string) {
  return postAuth<WorkspaceRecord>('/api/v1/workspaces/', { name }, decodeWorkspace);
}

export function saveWorkspace(workspaceId: string, update: WorkspaceUpdate) {
  return patchAuth<WorkspaceRecord>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/`,
    update,
    decodeWorkspace,
  );
}

export function readWorkspaceProfile(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceProfileEndpoint['get']['response']> {
  return getWorkspaceData<WorkspaceProfileEndpoint['get']['response']>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/profile/`,
    signal,
    decodeWorkspaceProfile,
  );
}

export function saveWorkspaceProfile(workspaceId: string, update: ProjectProfileUpdate): Promise<WorkspaceProfileEndpoint['patch']['response']> {
  return requestApi<WorkspaceProfileEndpoint['patch']['response']>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/profile/`, {
    method: 'PATCH',
    body: update,
    decode: decodeWorkspaceProfile,
  });
}

export class WorkspaceProfileConflictError extends Error {
  constructor(readonly latest: ProjectProfile) {
    super('این اطلاعات در فضای کار دیگری به‌روز شده است. نسخه را انتخاب کنید.');
    this.name = 'WorkspaceProfileConflictError';
  }
}

function matchesProfile(profile: ProjectProfile, update: ProjectProfileUpdate) {
  return (update.industry === undefined || profile.industry === update.industry.trim())
    && (update.stage === undefined || profile.stage === update.stage.trim())
    && (update.mission === undefined || profile.mission === update.mission.trim());
}

async function currentProfileOrConflict(workspaceId: string, update: ProjectProfileUpdate) {
  const latest = await readWorkspaceProfile(workspaceId);
  if (matchesProfile(latest, update)) return latest;
  if (latest.revision !== update.revision) throw new WorkspaceProfileConflictError(latest);
  return null;
}

/** Reconcile uncertain PATCH responses before retrying the same revisioned write. */
export async function saveWorkspaceProfileSafely(workspaceId: string, update: ProjectProfileUpdate) {
  try {
    return await saveWorkspaceProfile(workspaceId, update);
  } catch (error) {
    if (!(error instanceof AuthApiError)) throw error;
    if (error.code === 'revision_conflict') {
      const latest = await readWorkspaceProfile(workspaceId);
      if (matchesProfile(latest, update)) return latest;
      throw new WorkspaceProfileConflictError(latest);
    }
    if (error.status !== 0 && error.status < 500) throw error;

    const current = await currentProfileOrConflict(workspaceId, update);
    if (current) return current;
    try {
      return await saveWorkspaceProfile(workspaceId, update);
    } catch (retryError) {
      if (retryError instanceof AuthApiError && retryError.code === 'revision_conflict') {
        const latest = await readWorkspaceProfile(workspaceId);
        if (matchesProfile(latest, update)) return latest;
        throw new WorkspaceProfileConflictError(latest);
      }
      throw retryError;
    }
  }
}

export async function listWorkspaceMembers(workspaceId: string, signal?: AbortSignal) {
  const response = await getWorkspaceData<{ items: WorkspaceMember[] }>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/members/`,
    signal,
    (value) => {
      if (!value || typeof value !== 'object' || !Array.isArray((value as { items?: unknown }).items)) throw new TypeError('Invalid member list');
      return { items: (value as { items: unknown[] }).items.map(decodeWorkspaceMember) };
    },
  );
  return response.items;
}

export async function listWorkspaceInvitations(workspaceId: string, signal?: AbortSignal) {
  const response = await getWorkspaceData<{ items: WorkspaceInvitation[] }>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/invitations/`,
    signal,
    (value) => {
      if (!value || typeof value !== 'object' || !Array.isArray((value as { items?: unknown }).items)) throw new TypeError('Invalid invitation list');
      return { items: (value as { items: unknown[] }).items.map(decodeWorkspaceInvitation) };
    },
  );
  return response.items;
}

export function inviteWorkspaceMember(workspaceId: string, email: string, role: MemberRole) {
  return postAuth<{ message: string }>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/invitations/`,
    { email, role },
    decodeMessage,
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
    decodeWorkspaceMember,
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
    (value) => {
      if (!value || typeof value !== 'object') throw new TypeError('Invalid invitation response');
      const result = value as { workspace?: unknown; membership?: unknown };
      return { workspace: decodeWorkspace(result.workspace), membership: decodeWorkspaceMember(result.membership) };
    },
  );
}
