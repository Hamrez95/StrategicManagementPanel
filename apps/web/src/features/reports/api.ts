import { ApiError, requestApi } from '../../api/client';

export type ReportData = {
  scorecards?: Record<string, unknown>[];
  scorecard_objectives?: Record<string, unknown>[];
  scorecard_actions?: Record<string, unknown>[];
  scorecard_indicators?: Record<string, unknown>[];
  scorecard_observations?: Record<string, unknown>[];
  scorecard_relations?: Record<string, unknown>[];
  scorecard_reviews?: Record<string, unknown>[];
  scorecard_history?: Record<string, unknown>[];
  environment_signals?: Record<string, unknown>[];
  competitor_profiles?: Record<string, unknown>[];
  resource_assessments?: Record<string, unknown>[];
  scenario_plans?: Record<string, unknown>[];
  risk_records?: Record<string, unknown>[];
  journey_steps?: Record<string, unknown>[];
  planning_history?: Record<string, unknown>[];
  finance_captures?: Record<string, unknown>[];
  workspace: {
    id: string;
    name: string;
    revision: number;
    created_at: string;
    updated_at: string;
    archived_at: string | null;
  };
  workspace_profile: Record<string, unknown> | null;
  profile_history: Record<string, unknown>[];
  analyses: Record<string, unknown>[];
  strategy_factors: Record<string, unknown>[];
  strategy_options: Record<string, unknown>[];
  decisions: Record<string, unknown>[];
  goals: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  execution_history: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  document_templates: Record<string, unknown>[];
  ready_attachments: Record<string, unknown>[];
  document_history: Record<string, unknown>[];
  products?: Record<string, unknown>[];
  segments?: Record<string, unknown>[];
  icps?: Record<string, unknown>[];
  observations?: Record<string, unknown>[];
  evidence?: Record<string, unknown>[];
  claims?: Record<string, unknown>[];
  confidence_assessments?: Record<string, unknown>[];
  calculation_runs?: Record<string, unknown>[];
  metric_values?: Record<string, unknown>[];
  analysis_history?: Record<string, unknown>[];
  report_verification?: Record<string, unknown> | null;
};

export type ReportEnvelope = {
  schema: 'stratino-workspace-v1' | 'stratino-workspace-v2';
  schema_version: 1 | 2;
  exported_at: string;
  method_version: string;
  scope: string[];
  data: ReportData;
};

export type ExportSnapshot = {
  id: string;
  workspace_id: string;
  schema_version: number;
  method_version: string;
  scope: string[];
  state: 'ready';
  created_at: string;
  artifact: { format: 'zip'; size_bytes: number; sha256: string };
  snapshot?: ReportEnvelope;
};

export type ExportSnapshotList = { workspace_id: string; items: ExportSnapshot[] };

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Expected an object');
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value) throw new TypeError(`Expected ${field}`);
  return value;
}

function decodeSnapshotData(value: unknown): ReportEnvelope {
  const envelope = asRecord(value);
  const data = asRecord(envelope.data);
  const arrayFields = [
    'profile_history',
    'analyses',
    'strategy_factors',
    'strategy_options',
    'decisions',
    'goals',
    'actions',
    'execution_history',
    'documents',
    'document_templates',
    'ready_attachments',
    'document_history',
  ];
  if (envelope.schema_version === 2)
    arrayFields.push(
      'products',
      'segments',
      'icps',
      'context_identities',
      'claims',
      'evidence',
      'claim_evidence_links',
      'confidence_assessments',
      'observations',
      'observation_evidence_links',
      'calculation_runs',
      'metric_values',
      'analysis_history',
      'attachment_records',
    );
  for (const field of arrayFields) {
    if (
      !Array.isArray(data[field]) ||
      data[field].some((item) => !item || typeof item !== 'object' || Array.isArray(item))
    ) {
      throw new TypeError(`Expected ${field}`);
    }
  }
  for (const field of [
    'scorecards',
    'scorecard_objectives',
    'scorecard_actions',
    'scorecard_indicators',
    'scorecard_observations',
    'scorecard_relations',
    'scorecard_reviews',
    'scorecard_history',
    'environment_signals',
    'competitor_profiles',
    'resource_assessments',
    'scenario_plans',
    'risk_records',
    'journey_steps',
    'planning_history',
    'finance_captures',
  ]) {
    if (
      data[field] !== undefined &&
      (!Array.isArray(data[field]) ||
        data[field].some((item) => !item || typeof item !== 'object' || Array.isArray(item)))
    )
      throw new TypeError(`Expected ${field}`);
  }
  const workspace = asRecord(data.workspace);
  if (typeof workspace.id !== 'string' || typeof workspace.name !== 'string')
    throw new TypeError('Expected Workspace');
  if (data.workspace_profile !== null) asRecord(data.workspace_profile);
  if (envelope.schema_version === 2) {
    if (envelope.method_version === 'stratino-professional-report-v1') {
      const verification = asRecord(data.report_verification);
      if (
        verification.calculated_server_side !== true ||
        !['draft', 'verified'].includes(String(verification.state)) ||
        !Array.isArray(verification.analyses) ||
        !Array.isArray(verification.metrics)
      )
        throw new TypeError('Invalid report verification');
    } else if (data.report_verification !== null)
      throw new TypeError('Unexpected report verification');
  }
  if (
    !(
      (envelope.schema === 'stratino-workspace-v1' && envelope.schema_version === 1) ||
      (envelope.schema === 'stratino-workspace-v2' && envelope.schema_version === 2)
    ) ||
    !Array.isArray(envelope.scope)
  ) {
    throw new TypeError('Unsupported report schema');
  }
  return {
    schema: envelope.schema as ReportEnvelope['schema'],
    schema_version: envelope.schema_version as 1 | 2,
    exported_at: requiredString(envelope.exported_at, 'export date'),
    method_version: requiredString(envelope.method_version, 'method version'),
    scope: envelope.scope.map((item) => requiredString(item, 'scope item')),
    data: data as unknown as ReportData,
  };
}

export function decodeExportSnapshot(value: unknown): ExportSnapshot {
  const item = asRecord(value);
  const artifact = asRecord(item.artifact);
  if (
    (item.schema_version !== 1 && item.schema_version !== 2) ||
    item.state !== 'ready' ||
    artifact.format !== 'zip' ||
    !Number.isInteger(artifact.size_bytes) ||
    (artifact.size_bytes as number) < 0 ||
    typeof artifact.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256)
  ) {
    throw new TypeError('Invalid export artifact');
  }
  if (!Array.isArray(item.scope) || item.scope.some((scope) => typeof scope !== 'string'))
    throw new TypeError('Invalid export scope');
  if (item.snapshot) {
    const envelope = asRecord(item.snapshot);
    const data = asRecord(envelope.data);
    if (
      envelope.schema_version !== item.schema_version ||
      envelope.method_version !== item.method_version ||
      asRecord(data.workspace).id !== item.workspace_id
    )
      throw new TypeError('Mismatched report snapshot');
  }
  return {
    id: requiredString(item.id, 'export ID'),
    workspace_id: requiredString(item.workspace_id, 'Workspace ID'),
    schema_version: Number(item.schema_version),
    method_version: requiredString(item.method_version, 'method version'),
    scope: item.scope as string[],
    state: 'ready',
    created_at: requiredString(item.created_at, 'creation date'),
    artifact: {
      format: 'zip',
      size_bytes: artifact.size_bytes as number,
      sha256: requiredString(artifact.sha256, 'artifact digest'),
    },
    ...(Object.hasOwn(item, 'snapshot') ? { snapshot: decodeSnapshotData(item.snapshot) } : {}),
  };
}

function exportPath(workspaceId: string) {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/exports/`;
}

function decodeList(value: unknown): ExportSnapshotList {
  const response = asRecord(value);
  if (!Array.isArray(response.items)) throw new TypeError('Expected export list');
  return {
    workspace_id: requiredString(response.workspace_id, 'Workspace ID'),
    items: response.items.map(decodeExportSnapshot),
  };
}

export function listWorkspaceExports(workspaceId: string, signal?: AbortSignal) {
  return requestApi<ExportSnapshotList>(exportPath(workspaceId), {
    signal,
    decode: (value) => {
      const result = decodeList(value);
      if (result.workspace_id !== workspaceId)
        throw new TypeError('Export list belongs to another Workspace');
      return result;
    },
  });
}

export function createWorkspaceExport(
  workspaceId: string,
  idempotencyKey: string,
  purpose: 'raw' | 'professional' = 'raw',
) {
  return requestApi<ExportSnapshot>(exportPath(workspaceId), {
    method: 'POST',
    body: { schema_version: 2, purpose },
    headers: { 'Idempotency-Key': idempotencyKey },
    decode: (value) => {
      const result = decodeExportSnapshot(value);
      if (result.workspace_id !== workspaceId)
        throw new TypeError('Export belongs to another Workspace');
      return result;
    },
  });
}

export function readWorkspaceExport(workspaceId: string, exportId: string, signal?: AbortSignal) {
  return requestApi<ExportSnapshot>(`${exportPath(workspaceId)}${encodeURIComponent(exportId)}/`, {
    signal,
    decode: (value) => {
      const result = decodeExportSnapshot(value);
      if (result.workspace_id !== workspaceId || result.id !== exportId || !result.snapshot) {
        throw new TypeError('Export detail belongs to another Workspace');
      }
      return result;
    },
  });
}

export async function downloadWorkspaceExport(
  workspaceId: string,
  exportId: string,
  format: 'json' | 'csv' | 'zip' | 'xlsx' | 'ai',
  language: 'fa' | 'en' = 'fa',
) {
  let response: Response;
  try {
    response = await fetch(
      `${exportPath(workspaceId)}${encodeURIComponent(exportId)}/download/?format=${format}&language=${language}`,
      { credentials: 'same-origin', cache: 'no-store', headers: { Accept: '*/*' } },
    );
  } catch {
    throw new ApiError('ارتباط قطع شد. اتصال را بررسی کنید و دوباره تلاش کنید.', 0);
  }
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('stratino:session-expired'));
    const payload = (await response.json().catch(() => undefined)) as
      Record<string, unknown> | undefined;
    throw new ApiError(
      typeof payload?.message === 'string'
        ? payload.message
        : 'دریافت فایل کامل نشد. دوباره تلاش کنید.',
      response.status,
      {},
      typeof payload?.code === 'string' ? payload.code : '',
    );
  }
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.hidden = true;
  anchor.href = href;
  anchor.download = `stratino-${exportId}${format === 'ai' ? '-ai' : ''}.${format === 'ai' ? 'zip' : format}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
}
