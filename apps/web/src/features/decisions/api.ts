import { ApiError, requestApi } from '../../api/client';
import {
  decodeExecutionAction,
  decodeExecutionBoard,
  decodeExecutionDecision,
  decodeExecutionGoal,
  type ApiExecutionAction,
  type ApiExecutionActionUpdate,
  type ApiExecutionActionWrite,
  type ApiExecutionBoard,
  type ApiExecutionDecision,
  type ApiExecutionDecisionUpdate,
  type ApiExecutionDecisionWrite,
  type ApiExecutionGoal,
  type ApiExecutionGoalUpdate,
  type ApiExecutionGoalWrite,
} from '../../api/contracts';
import { patchAuth, postAuth } from '../auth/api';

export type {
  ApiExecutionAction,
  ApiExecutionActionUpdate,
  ApiExecutionActionWrite,
  ApiExecutionBoard,
  ApiExecutionDecision,
  ApiExecutionDecisionUpdate,
  ApiExecutionDecisionWrite,
  ApiExecutionGoal,
  ApiExecutionGoalUpdate,
  ApiExecutionGoalWrite,
};

const root = (workspaceId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/execution/`;

export function readExecutionBoard(workspaceId: string, signal?: AbortSignal) {
  return requestApi<ApiExecutionBoard>(root(workspaceId), {
    signal,
    decode: (value) => {
      const board = decodeExecutionBoard(value);
      if (board.workspace_id !== workspaceId)
        throw new ApiError('پاسخ برنامه به فضای کار دیگری تعلق دارد.', 502, {}, 'invalid_response');
      return board;
    },
  });
}

export function createExecutionDecision(workspaceId: string, body: ApiExecutionDecisionWrite) {
  return postAuth<ApiExecutionDecision>(
    `${root(workspaceId)}decisions/`,
    body,
    decodeExecutionDecision,
  );
}

export function updateExecutionDecision(
  workspaceId: string,
  recordId: string,
  body: ApiExecutionDecisionUpdate,
) {
  return patchAuth<ApiExecutionDecision>(
    `${root(workspaceId)}decisions/${encodeURIComponent(recordId)}/`,
    body,
    decodeExecutionDecision,
  );
}

export function createExecutionGoal(workspaceId: string, body: ApiExecutionGoalWrite) {
  return postAuth<ApiExecutionGoal>(`${root(workspaceId)}goals/`, body, decodeExecutionGoal);
}

export function updateExecutionGoal(
  workspaceId: string,
  recordId: string,
  body: ApiExecutionGoalUpdate,
) {
  return patchAuth<ApiExecutionGoal>(
    `${root(workspaceId)}goals/${encodeURIComponent(recordId)}/`,
    body,
    decodeExecutionGoal,
  );
}

export function createExecutionAction(workspaceId: string, body: ApiExecutionActionWrite) {
  return postAuth<ApiExecutionAction>(root(workspaceId), body, decodeExecutionAction);
}

export function updateExecutionAction(
  workspaceId: string,
  recordId: string,
  body: ApiExecutionActionUpdate,
) {
  return patchAuth<ApiExecutionAction>(
    `${root(workspaceId)}actions/${encodeURIComponent(recordId)}/`,
    body,
    decodeExecutionAction,
  );
}
