import { requestApi } from './client';

export type ImportRecordCounts = {
  analysis_records: number;
  decision_records: number;
  execution_records: number;
  financial_periods: number;
  file_metadata: number;
};

export type ImportPreview = {
  workspace_id: string;
  workspace_name: string;
  schema_version: number;
  recognized: boolean;
  record_counts: ImportRecordCounts;
  record_count: number;
  missing_attachment_bytes: number;
  warnings: string[];
};

export type WorkspaceImportBatch = {
  id: string;
  workspace_id: string;
  created_by_id: string;
  source_schema: string;
  mapping_version: number;
  source_digest: string;
  record_counts: ImportRecordCounts;
  record_count: number;
  missing_attachment_bytes: number;
  created_at: string;
  undone_at: string | null;
  duplicate: boolean;
  data?: unknown;
  source_backup?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object');
  return value as Record<string, unknown>;
}

function nonNegativeInteger(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 0) throw new TypeError('Expected a non-negative count');
  return value as number;
}

function positiveInteger(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 1) throw new TypeError('Expected a positive integer');
  return value as number;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`Expected ${field}`);
  return value;
}

function decodeCounts(value: unknown): ImportRecordCounts {
  const counts = asRecord(value);
  return {
    analysis_records: nonNegativeInteger(counts.analysis_records),
    decision_records: nonNegativeInteger(counts.decision_records),
    execution_records: nonNegativeInteger(counts.execution_records),
    financial_periods: nonNegativeInteger(counts.financial_periods),
    file_metadata: nonNegativeInteger(counts.file_metadata),
  };
}

export function decodeImportPreview(value: unknown): ImportPreview {
  const item = asRecord(value);
  if (!Array.isArray(item.warnings) || item.warnings.some((warning) => typeof warning !== 'string')) throw new TypeError('Expected preview warnings');
  if (item.recognized !== true) throw new TypeError('Expected a recognized legacy backup');
  const schemaVersion = positiveInteger(item.schema_version);
  if (schemaVersion !== 1) throw new TypeError('Unsupported import preview version');
  return {
    workspace_id: requiredString(item.workspace_id, 'Workspace ID'),
    workspace_name: requiredString(item.workspace_name, 'Workspace name'),
    schema_version: schemaVersion,
    recognized: true,
    record_counts: decodeCounts(item.record_counts),
    record_count: nonNegativeInteger(item.record_count),
    missing_attachment_bytes: nonNegativeInteger(item.missing_attachment_bytes),
    warnings: item.warnings as string[],
  };
}

export function decodeWorkspaceImportBatch(value: unknown): WorkspaceImportBatch {
  const item = asRecord(value);
  const undoneAt = item.undone_at;
  if (undoneAt !== null && typeof undoneAt !== 'string') throw new TypeError('Expected undo date');
  if (typeof item.duplicate !== 'boolean') throw new TypeError('Expected duplicate flag');
  return {
    id: requiredString(item.id, 'batch ID'),
    workspace_id: requiredString(item.workspace_id, 'Workspace ID'),
    created_by_id: requiredString(item.created_by_id, 'creator ID'),
    source_schema: requiredString(item.source_schema, 'source schema'),
    mapping_version: positiveInteger(item.mapping_version),
    source_digest: requiredString(item.source_digest, 'source digest'),
    record_counts: decodeCounts(item.record_counts),
    record_count: nonNegativeInteger(item.record_count),
    missing_attachment_bytes: nonNegativeInteger(item.missing_attachment_bytes),
    created_at: requiredString(item.created_at, 'creation date'),
    undone_at: undoneAt,
    duplicate: item.duplicate,
    ...(Object.hasOwn(item, 'data') ? { data: item.data } : {}),
    ...(Object.hasOwn(item, 'source_backup') ? { source_backup: item.source_backup } : {}),
  };
}

function decodeWorkspaceImportDetail(value: unknown): WorkspaceImportBatch & { data: unknown; source_backup: unknown } {
  const item = asRecord(value);
  const batch = decodeWorkspaceImportBatch(item);
  asRecord(item.data);
  asRecord(item.source_backup);
  return { ...batch, data: item.data, source_backup: item.source_backup };
}

function decodeImportList(value: unknown) {
  const response = asRecord(value);
  if (!Array.isArray(response.items)) throw new TypeError('Expected import batch list');
  return response.items.map(decodeWorkspaceImportBatch);
}

function workspaceImportPath(workspaceId: string) {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/imports/`;
}

export function previewLegacyBackup(workspaceId: string, data: unknown) {
  return requestApi<ImportPreview>(`${workspaceImportPath(workspaceId)}preview/`, {
    method: 'POST',
    body: { schema_version: 1, data },
    decode: decodeImportPreview,
  });
}

export function importLegacyBackup(workspaceId: string, data: unknown, idempotencyKey: string) {
  return requestApi<WorkspaceImportBatch>(workspaceImportPath(workspaceId), {
    method: 'POST',
    body: { schema_version: 1, data },
    headers: { 'Idempotency-Key': idempotencyKey },
    decode: decodeWorkspaceImportBatch,
  });
}

export function listWorkspaceImports(workspaceId: string, signal?: AbortSignal) {
  return requestApi<WorkspaceImportBatch[]>(workspaceImportPath(workspaceId), {
    signal,
    decode: decodeImportList,
  });
}

export function readWorkspaceImport(workspaceId: string, batchId: string) {
  return requestApi<WorkspaceImportBatch & { data: unknown; source_backup: unknown }>(`${workspaceImportPath(workspaceId)}${encodeURIComponent(batchId)}/`, {
    decode: decodeWorkspaceImportDetail,
  });
}

export function undoWorkspaceImport(workspaceId: string, batchId: string) {
  return requestApi<void>(`${workspaceImportPath(workspaceId)}${encodeURIComponent(batchId)}/`, {
    method: 'DELETE',
  });
}
