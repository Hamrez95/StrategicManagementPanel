import { ApiError, requestApi } from '../../api/client';
import {
  decodeAnalysis,
  decodeAnalysisPage,
  type ApiAnalysis,
  type ApiAnalysisKind,
  type ApiAnalysisWrite,
} from '../../api/contracts';
import { patchAuth, postAuth, requestAuth } from '../auth/api';

export { ApiError as AnalysisApiError };
export type { ApiAnalysis, ApiAnalysisKind, ApiAnalysisWrite };

export function readAnalyses(workspaceId: string, signal?: AbortSignal) {
  return requestApi(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/analyses/`, {
    signal,
    decode: (value) => {
      const page = decodeAnalysisPage(value);
      if (page.items.some((item) => item.workspace_id !== workspaceId))
        throw new ApiError('پاسخ تحلیل به فضای کار دیگری تعلق دارد.', 502, {}, 'invalid_response');
      return page;
    },
  });
}

export function createAnalysis(workspaceId: string, body: ApiAnalysisWrite) {
  return postAuth<ApiAnalysis>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/analyses/`,
    body,
    (value) => {
      const analysis = decodeAnalysis(value);
      if (analysis.workspace_id !== workspaceId || analysis.kind !== body.kind)
        throw new ApiError(
          'پاسخ تحلیل با فضای کار یا نوع ماتریس سازگار نیست.',
          502,
          {},
          'invalid_response',
        );
      return analysis;
    },
  );
}

export function updateAnalysis(workspaceId: string, recordId: string, body: ApiAnalysisWrite) {
  return patchAuth<ApiAnalysis>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/analyses/${encodeURIComponent(recordId)}/`,
    body,
    (value) => {
      const analysis = decodeAnalysis(value);
      if (
        analysis.workspace_id !== workspaceId ||
        analysis.id !== recordId ||
        analysis.kind !== body.kind
      )
        throw new ApiError('پاسخ تحلیل با درخواست سازگار نیست.', 502, {}, 'invalid_response');
      return analysis;
    },
  );
}

export function deleteAnalysis(workspaceId: string, recordId: string) {
  return requestAuth(
    'DELETE',
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/analyses/${encodeURIComponent(recordId)}/`,
    {},
    (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new ApiError('پاسخ حذف ماتریس معتبر نیست.', 502, {}, 'invalid_response');
      const result = value as Record<string, unknown>;
      if (result.id !== recordId || result.deleted !== true)
        throw new ApiError('پاسخ حذف ماتریس معتبر نیست.', 502, {}, 'invalid_response');
      return { id: recordId, deleted: true as const };
    },
  );
}
