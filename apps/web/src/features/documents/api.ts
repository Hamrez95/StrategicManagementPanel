import { ApiError, requestApi, uploadFileApi } from '../../api/client';
import {
  decodeDocumentAttachment,
  decodeDocumentAttachmentList,
  decodeDocumentBoard,
  decodeDocumentRecord,
  type ApiDocumentBoard,
  type ApiDocumentAttachment,
  type ApiDocumentAttachmentList,
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

const attachments = (workspaceId: string, recordId: string) =>
  `${root(workspaceId)}${encodeURIComponent(recordId)}/attachments/`;

function decodeAttachmentFor(recordId: string, value: unknown): ApiDocumentAttachment {
  const attachment = decodeDocumentAttachment(value);
  if (attachment.document_id !== recordId)
    throw new ApiError('پاسخ فایل به مدرک دیگری تعلق دارد.', 502, {}, 'invalid_response');
  return attachment;
}

export function readDocumentAttachments(
  workspaceId: string,
  recordId: string,
  signal?: AbortSignal,
) {
  return requestApi<ApiDocumentAttachmentList>(attachments(workspaceId, recordId), {
    signal,
    decode: (value) => {
      const result = decodeDocumentAttachmentList(value);
      if (result.document_id !== recordId)
        throw new ApiError('پاسخ فایل‌ها به مدرک دیگری تعلق دارد.', 502, {}, 'invalid_response');
      return result;
    },
  });
}

export function reserveDocumentAttachment(
  workspaceId: string,
  recordId: string,
  file: File,
  requestId: string,
  signal?: AbortSignal,
) {
  return requestApi<ApiDocumentAttachment>(attachments(workspaceId, recordId), {
    method: 'POST',
    body: { name: file.name, size_bytes: file.size, request_id: requestId },
    signal,
    decode: (value) => decodeAttachmentFor(recordId, value),
  });
}

export function uploadDocumentAttachment(
  workspaceId: string,
  recordId: string,
  attachmentId: string,
  file: File,
  options: { signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void } = {},
) {
  const form = new FormData();
  form.append('file', file, file.name);
  return uploadFileApi<ApiDocumentAttachment>(
    `${attachments(workspaceId, recordId)}${encodeURIComponent(attachmentId)}/content/`,
    form,
    { ...options, decode: (value) => decodeAttachmentFor(recordId, value) },
  );
}

export function retryDocumentAttachmentScan(
  workspaceId: string,
  recordId: string,
  attachmentId: string,
) {
  return requestApi<ApiDocumentAttachment>(
    `${attachments(workspaceId, recordId)}${encodeURIComponent(attachmentId)}/scan/`,
    { method: 'POST', body: {}, decode: (value) => decodeAttachmentFor(recordId, value) },
  );
}

export function deleteDocumentAttachment(
  workspaceId: string,
  recordId: string,
  attachmentId: string,
) {
  return requestApi<void>(
    `${attachments(workspaceId, recordId)}${encodeURIComponent(attachmentId)}/`,
    { method: 'DELETE' },
  );
}

export function documentAttachmentDownloadUrl(
  workspaceId: string,
  recordId: string,
  attachmentId: string,
) {
  return `${attachments(workspaceId, recordId)}${encodeURIComponent(attachmentId)}/download/`;
}
