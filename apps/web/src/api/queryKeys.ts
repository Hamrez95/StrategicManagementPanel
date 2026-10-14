export const queryKeys = {
  session: ['session'] as const,
  account: {
    profile: ['account-profile'] as const,
    preferences: ['account-preferences'] as const,
  },
  workspaces: {
    all: ['workspaces'] as const,
  },
  workspace: {
    root: (workspaceId: string) => ['workspace', workspaceId] as const,
    detail: (workspaceId: string) => ['workspace', workspaceId, 'detail'] as const,
    profile: (workspaceId: string) => ['workspace', workspaceId, 'profile'] as const,
    members: (workspaceId: string) => ['workspace', workspaceId, 'members'] as const,
    invitations: (workspaceId: string) => ['workspace', workspaceId, 'invitations'] as const,
  },
};
