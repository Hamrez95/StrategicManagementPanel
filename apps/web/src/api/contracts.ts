import { ApiError } from './client';

export type ApiWorkspace = {
  id: string;
  owner_id: string;
  billing_account_id: string;
  name: string;
  revision: number;
  archived_at: string | null;
};

export type ApiWorkspaceProfile = {
  workspace_id: string;
  industry: string;
  stage: string;
  mission: string;
  revision: number;
  onboarding_completed_at: string | null;
};

export type ApiProfileWrite = { revision: number } & (
  | { industry: string; stage?: string; mission?: string; complete?: true }
  | { industry?: string; stage: string; mission?: string; complete?: true }
  | { industry?: string; stage?: string; mission: string; complete?: true }
  | { complete: true; industry?: string; stage?: string; mission?: string }
);

export type ApiWorkspaceMember = {
  user_id: string;
  email: string;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
};

export type ApiWorkspaceInvitation = {
  id: string;
  email: string;
  role: 'editor' | 'viewer';
  expires_at: string;
};

/** Typed operations for the live OpenAPI endpoints used by the Workspace client. */
export type OpenApiPaths = {
  '/api/v1/workspaces/{workspace_id}/profile/': {
    get: {
      parameters: { path: { workspace_id: string } };
      response: ApiWorkspaceProfile;
    };
    patch: {
      parameters: { path: { workspace_id: string } };
      requestBody: ApiProfileWrite;
      response: ApiWorkspaceProfile;
    };
  };
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected object');
  return value as Record<string, unknown>;
}

function requiredString(value: unknown) {
  if (typeof value !== 'string') throw new TypeError('Expected string');
  return value;
}

function positiveRevision(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 1) throw new TypeError('Expected positive revision');
  return value as number;
}

export function decodeWorkspace(value: unknown): ApiWorkspace {
  const item = record(value);
  const archivedAt = item.archived_at;
  if (archivedAt !== null && typeof archivedAt !== 'string') throw new TypeError('Expected archive date');
  return {
    id: requiredString(item.id),
    owner_id: requiredString(item.owner_id),
    billing_account_id: requiredString(item.billing_account_id),
    name: requiredString(item.name),
    revision: positiveRevision(item.revision),
    archived_at: archivedAt,
  };
}

export function decodeWorkspaceProfile(value: unknown): ApiWorkspaceProfile {
  const item = record(value);
  const completedAt = item.onboarding_completed_at;
  if (completedAt !== null && typeof completedAt !== 'string') throw new TypeError('Expected completion date');
  const profile = {
    workspace_id: requiredString(item.workspace_id),
    industry: requiredString(item.industry),
    stage: requiredString(item.stage),
    mission: requiredString(item.mission),
    revision: positiveRevision(item.revision),
    onboarding_completed_at: completedAt,
  };
  if (profile.industry.length > 200 || profile.stage.length > 100 || profile.mission.length > 2000) {
    throw new TypeError('Profile field exceeds its OpenAPI limit');
  }
  return profile;
}

export function decodeWorkspaceMember(value: unknown): ApiWorkspaceMember {
  const item = record(value);
  if (!['owner', 'editor', 'viewer'].includes(String(item.role))) throw new TypeError('Expected Workspace role');
  return {
    user_id: requiredString(item.user_id),
    email: requiredString(item.email),
    name: requiredString(item.name),
    role: item.role as ApiWorkspaceMember['role'],
  };
}

export function decodeWorkspaceInvitation(value: unknown): ApiWorkspaceInvitation {
  const item = record(value);
  if (item.role !== 'editor' && item.role !== 'viewer') throw new TypeError('Expected invitation role');
  return {
    id: requiredString(item.id),
    email: requiredString(item.email),
    role: item.role,
    expires_at: requiredString(item.expires_at),
  };
}

export function decodeWorkspacePage(value: unknown) {
  const page = record(value);
  if (!Array.isArray(page.items) || (page.next_cursor !== null && typeof page.next_cursor !== 'string')) {
    throw new ApiError('فهرست فضای کار معتبر نیست.', 502, {}, 'invalid_response');
  }
  return { items: page.items.map(decodeWorkspace), next_cursor: page.next_cursor as string | null };
}
