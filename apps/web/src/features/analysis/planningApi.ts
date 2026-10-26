import { ApiError, requestApi } from '../../api/client';
import { patchAuth, postAuth } from '../auth/api';
import { planningDefinitions } from './planningDefinitions';
export type PlanningRecord = {
  id: string;
  workspace_id: string;
  revision: number;
  updated_at: string;
} & Record<string, string | number | null>;
type PlanningPage = {
  workspace_id: string;
  tool: string;
  items: PlanningRecord[];
  next_offset: number | null;
};
const root = (workspaceId: string, tool: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/planning/${encodeURIComponent(tool)}/`;
function invalid(): never {
  throw new ApiError('پاسخ ابزار معتبر نیست.', 502, {}, 'invalid_response');
}
function decodeRecord(value: unknown, workspaceId: string, tool: string): PlanningRecord {
  if (!value || typeof value !== 'object') return invalid();
  const r = value as PlanningRecord;
  if (
    typeof r.id !== 'string' ||
    r.workspace_id !== workspaceId ||
    !Number.isInteger(r.revision) ||
    r.revision < 1 ||
    typeof r.updated_at !== 'string' ||
    typeof r.title !== 'string'
  )
    return invalid();
  for (const field of planningDefinitions[tool].fields) {
    const v = r[field.id];
    if (
      field.type === 'date'
        ? v !== null && (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v))
        : typeof v !== 'string'
    )
      return invalid();
    if (field.options && !field.options.some((o) => o.value === v)) return invalid();
  }
  return r;
}
export async function readPlanning(
  workspaceId: string,
  tool: string,
  signal?: AbortSignal,
): Promise<PlanningRecord[]> {
  const items: PlanningRecord[] = [];
  let offset: number | null = 0;
  do {
    const page: PlanningPage = await requestApi(`${root(workspaceId, tool)}?offset=${offset}`, {
      signal,
      decode(value) {
        if (!value || typeof value !== 'object') return invalid();
        const p = value as PlanningPage;
        if (
          p.workspace_id !== workspaceId ||
          p.tool !== tool ||
          !Array.isArray(p.items) ||
          p.items.length > 50 ||
          (p.next_offset !== null &&
            (!Number.isInteger(p.next_offset) || p.next_offset !== Number(offset) + 50))
        )
          return invalid();
        return { ...p, items: p.items.map((item) => decodeRecord(item, workspaceId, tool)) };
      },
    });
    items.push(...page.items);
    offset = page.next_offset;
    if (items.length > 200) return invalid();
  } while (offset !== null);
  return items;
}
export function savePlanning(
  workspaceId: string,
  tool: string,
  body: Record<string, unknown>,
  recordId?: string,
) {
  const decode = (value: unknown) => decodeRecord(value, workspaceId, tool);
  return recordId
    ? patchAuth(`${root(workspaceId, tool)}${encodeURIComponent(recordId)}/`, body, decode)
    : postAuth(root(workspaceId, tool), body, decode);
}
