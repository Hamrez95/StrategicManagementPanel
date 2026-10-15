import { ApiError, requestApi } from '../../api/client';
import {
  decodeDocumentBoard,
  decodeDocumentRecord,
  type ApiDocumentBoard,
  type ApiDocumentRecord,
  type ApiDocumentUpdate,
  type ApiDocumentWrite,
} from '../../api/contracts';
import { patchAuth, postAuth } from '../auth/api';

export type { ApiDocumentBoard, ApiDocumentRecord, ApiDocumentUpdate, ApiDocumentWrite };

const root = (workspaceId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/documents/`;

export function readDocumentBoard(
  workspaceId: string,
  filters: { stage: string; industry: string },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams();
  if (filters.stage) query.set('stage', filters.stage);
  if (filters.industry) query.set('industry', filters.industry);
  const suffix = query.size ? `?${query.toString()}` : '';
  return requestApi<ApiDocumentBoard>(`${root(workspaceId)}${suffix}`, {
    signal,
    decode: (value) => {
      const board = decodeDocumentBoard(value);
      if (board.workspace_id !== workspaceId)
        throw new ApiError(
          'پاسخ راهنمای مدارک به فضای کار دیگری تعلق دارد.',
          502,
          {},
          'invalid_response',
        );
      return board;
    },
  });
}

export function createDocumentRecord(workspaceId: string, body: ApiDocumentWrite) {
  return postAuth<ApiDocumentRecord>(root(workspaceId), body, decodeDocumentRecord);
}

export function updateDocumentRecord(
  workspaceId: string,
  recordId: string,
  body: ApiDocumentUpdate,
) {
  return patchAuth<ApiDocumentRecord>(
    `${root(workspaceId)}${encodeURIComponent(recordId)}/`,
    body,
    decodeDocumentRecord,
  );
}
