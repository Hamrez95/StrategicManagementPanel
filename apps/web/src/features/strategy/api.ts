import { ApiError, requestApi } from '../../api/client';
import {
  decodeStrategyBoard,
  decodeStrategyFactor,
  decodeStrategyOption,
  type ApiStrategyBoard,
  type ApiStrategyCategory,
  type ApiStrategyFactor,
  type ApiStrategyFactorType,
  type ApiStrategyFactorDelete,
  type ApiStrategyFactorUpdate,
  type ApiStrategyOption,
  type ApiStrategyOptionDelete,
  type ApiStrategyOptionUpdate,
  type ApiStrategyFactorWrite,
  type ApiStrategyOptionWrite,
} from '../../api/contracts';
import { patchAuth, postAuth, requestAuth } from '../auth/api';

export type StrategyFactor = ApiStrategyFactor;
export type StrategyOption = ApiStrategyOption;
export type StrategyBoard = ApiStrategyBoard;
export type StrategyFactorCreate = ApiStrategyFactorWrite;
export type StrategyOptionCreate = ApiStrategyOptionWrite;
export type StrategyFactorUpdate = ApiStrategyFactorUpdate;
export type StrategyOptionUpdate = ApiStrategyOptionUpdate;
export type { ApiStrategyCategory, ApiStrategyFactorType };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Expected an object');
  return value as Record<string, unknown>;
}

function requiredString(value: unknown) {
  if (typeof value !== 'string' || !value) throw new TypeError('Expected a non-empty string');
  return value;
}

export function readStrategyBoard(workspaceId: string, signal?: AbortSignal) {
  return requestApi<StrategyBoard>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/strategy/`,
    {
      signal,
      decode: (value) => {
        const board = decodeStrategyBoard(value);
        if (board.workspace_id !== workspaceId)
          throw new ApiError(
            'پاسخ تحلیل به فضای کار دیگری تعلق دارد.',
            502,
            {},
            'invalid_response',
          );
        return board;
      },
    },
  );
}

export function createStrategyFactor(workspaceId: string, body: StrategyFactorCreate) {
  return postAuth<StrategyFactor>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/strategy/factors/`,
    body,
    decodeStrategyFactor,
  );
}

export function updateStrategyFactor(
  workspaceId: string,
  factorId: string,
  body: StrategyFactorUpdate,
) {
  return patchAuth<StrategyFactor>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/strategy/factors/${encodeURIComponent(factorId)}/`,
    body,
    decodeStrategyFactor,
  );
}

export function deleteStrategyFactor(
  workspaceId: string,
  factorId: string,
  confirmDependencies: boolean,
) {
  const query = confirmDependencies ? '?confirm_dependencies=true' : '';
  return requestAuth<ApiStrategyFactorDelete>(
    'DELETE',
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/strategy/factors/${encodeURIComponent(factorId)}/${query}`,
    {},
    (value) => {
      const item = record(value);
      if (item.deleted !== true || !Array.isArray(item.affected_options))
        throw new ApiError('پاسخ حذف عامل معتبر نیست.', 502, {}, 'invalid_response');
      return {
        id: requiredString(item.id),
        deleted: true,
        affected_options: item.affected_options.map((value) => {
          const entry = record(value);
          if (!['SO', 'WO', 'ST', 'WT'].includes(String(entry.category)))
            throw new ApiError('پاسخ وابستگی معتبر نیست.', 502, {}, 'invalid_response');
          return {
            id: requiredString(entry.id),
            title: requiredString(entry.title),
            category: entry.category as ApiStrategyCategory,
          };
        }),
      };
    },
  );
}

export function createStrategyOption(workspaceId: string, body: StrategyOptionCreate) {
  return postAuth<StrategyOption>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/strategy/options/`,
    body,
    decodeStrategyOption,
  );
}

export function updateStrategyOption(
  workspaceId: string,
  optionId: string,
  body: StrategyOptionUpdate,
) {
  return patchAuth<StrategyOption>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/strategy/options/${encodeURIComponent(optionId)}/`,
    body,
    decodeStrategyOption,
  );
}

export function deleteStrategyOption(workspaceId: string, optionId: string) {
  return requestAuth<ApiStrategyOptionDelete>(
    'DELETE',
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/strategy/options/${encodeURIComponent(optionId)}/`,
    {},
    (value) => {
      const item = record(value);
      if (item.deleted !== true)
        throw new ApiError('پاسخ حذف گزینه معتبر نیست.', 502, {}, 'invalid_response');
      return { id: requiredString(item.id), deleted: true };
    },
  );
}
