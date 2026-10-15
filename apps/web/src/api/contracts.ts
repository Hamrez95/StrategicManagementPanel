import { ApiError } from './client';

export type ApiWorkspace = {
  id: string;
  owner_id: string;
  billing_account_id: string;
  name: string;
  revision: number;
  archived_at: string | null;
};

export type ApiProfileProduct = {
  id: string;
  name: string;
  description: string;
  problem_solved: string;
  target_customer: string;
};
export type ApiProfileCustomerSegment = {
  id: string;
  name: string;
  description: string;
  needs: string;
  buying_roles: string;
};
export type ApiProfileGoal = {
  id: string;
  title: string;
  success_signal: string;
  timeframe: string;
};
export type ApiProfileEvidence = {
  id: string;
  source_type:
    'interview' | 'sales' | 'support' | 'usage' | 'survey' | 'document' | 'secondary' | 'other';
  reference: string;
  statement: string;
  date: string;
  confidence: 'low' | 'medium' | 'high';
};
export type ApiProfileAssumption = {
  id: string;
  statement: string;
  confidence: 'low' | 'medium' | 'high';
  test: string;
  status: 'untested' | 'supported' | 'rejected';
};
export type ApiWorkspaceICP = {
  id: string;
  name: string;
  segment: {
    industry: string;
    organization_size: string;
    geography: string;
    buying_context: string;
  };
  persona: { role: string; decision_role: string; goals: string; pains: string };
  problem: string;
  evidence: ApiProfileEvidence[];
  assumptions: ApiProfileAssumption[];
};
export type ApiWorkspaceProfile = {
  workspace_id: string;
  company_name: string;
  industry: string;
  stage: string;
  mission: string;
  problem_statement: string;
  products: ApiProfileProduct[];
  customer_segments: ApiProfileCustomerSegment[];
  goals: ApiProfileGoal[];
  icps: ApiWorkspaceICP[];
  revision: number;
  onboarding_completed_at: string | null;
};
export type ApiProfileWrite = { revision: number; complete?: true } & Partial<
  Omit<ApiWorkspaceProfile, 'workspace_id' | 'revision' | 'onboarding_completed_at'>
>;
export type ApiWorkspaceProfileRevision = {
  revision: number;
  snapshot: ApiWorkspaceProfile;
  changed_by_id: string;
  created_at: string;
};

export type ApiStrategyFactorType = 'strength' | 'weakness' | 'opportunity' | 'threat';
export type ApiStrategyCategory = 'SO' | 'WO' | 'ST' | 'WT';
export type ApiStrategyDependency = { id: string; title: string; category: ApiStrategyCategory };
export type ApiStrategyFactor = {
  id: string;
  factor_type: ApiStrategyFactorType;
  title: string;
  evidence: string;
  owner: string;
  priority: number;
  revision: number;
  updated_at: string;
  linked_options: ApiStrategyDependency[];
};
export type ApiStrategyOption = {
  id: string;
  category: ApiStrategyCategory;
  title: string;
  action: string;
  rationale: string;
  hypothesis: string;
  cost: string;
  factor_refs: { id: string; factor_type: ApiStrategyFactorType; title: string }[];
  needs_review: boolean;
  revision: number;
  updated_at: string;
};
export type ApiStrategyBoard = {
  workspace_id: string;
  factors: ApiStrategyFactor[];
  options: ApiStrategyOption[];
};
export type ApiStrategyFactorWrite = {
  factor_type: ApiStrategyFactorType;
  title: string;
  evidence: string;
  owner: string;
  priority: number;
};
export type ApiStrategyFactorUpdate = { revision: number } & Partial<ApiStrategyFactorWrite>;
export type ApiStrategyOptionWrite = {
  category: ApiStrategyCategory;
  title: string;
  action: string;
  rationale: string;
  hypothesis: string;
  cost: string;
  factor_ids: string[];
};
export type ApiStrategyOptionUpdate = { revision: number } & Partial<ApiStrategyOptionWrite>;
export type ApiStrategyFactorDelete = {
  id: string;
  deleted: true;
  affected_options: ApiStrategyDependency[];
};
export type ApiStrategyOptionDelete = { id: string; deleted: true };

export type ApiAnalysisKind = 'efe' | 'ife';
export type ApiAnalysisState = 'draft' | 'finalized';
export type ApiAnalysisRow = {
  id: string;
  title: string;
  factor_type: ApiStrategyFactorType;
  weight: number | null;
  rating: number | null;
  evidence: string;
};
export type ApiAnalysisOutput = {
  kind: ApiAnalysisKind;
  total_weight: number;
  score: number | null;
  rounded_score: number | null;
  ready: boolean;
  can_finalize: boolean;
  issues: { code: string; field: string }[];
  interpretation: 'below_midpoint' | 'at_midpoint' | 'above_midpoint' | 'unavailable';
  midpoint: 2.5;
  limitations: string[];
};
export type ApiAnalysis = {
  id: string;
  workspace_id: string;
  revision: number;
  created_at: string;
  updated_at: string;
  kind: ApiAnalysisKind;
  schema_version: 1;
  method_version: string;
  inputs: { rows: ApiAnalysisRow[] };
  output: ApiAnalysisOutput;
  state: ApiAnalysisState;
};
export type ApiAnalysisWrite = {
  revision: number;
  kind: ApiAnalysisKind;
  schema_version: 1;
  method_version: string;
  inputs: { rows: ApiAnalysisRow[] };
  state: ApiAnalysisState;
};
export type ApiAnalysisDelete = { id: string; deleted: true };

export type ApiExecutionDecisionStatus = 'proposed' | 'approved' | 'rejected' | 'superseded';
export type ApiExecutionGoalStatus = 'active' | 'complete';
export type ApiExecutionActionStatus = 'planned' | 'in_progress' | 'blocked' | 'done';
export type ApiExecutionSourceKind = 'analysis' | 'strategy_option';
export type ApiExecutionSource = { kind: ApiExecutionSourceKind; id: string; title: string };
export type ApiExecutionDecision = {
  id: string;
  title: string;
  rationale: string;
  assumptions: string;
  review_trigger: string;
  source: ApiExecutionSource | null;
  status: ApiExecutionDecisionStatus;
  revision: number;
  action_count: number;
  created_at: string;
  updated_at: string;
};
export type ApiExecutionGoal = {
  id: string;
  title: string;
  description: string;
  due_on: string | null;
  status: ApiExecutionGoalStatus;
  revision: number;
  action_count: number;
  created_at: string;
  updated_at: string;
};
export type ApiExecutionAction = {
  id: string;
  decision_id: string;
  decision_title: string;
  goal_id: string | null;
  goal_title: string | null;
  owner_id: string;
  owner_name: string;
  title: string;
  description: string;
  due_on: string;
  overdue: boolean;
  status: ApiExecutionActionStatus;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type ApiExecutionEvent = {
  id: string;
  entity_type: 'decision' | 'goal' | 'action';
  entity_id: string;
  entity_label: string;
  event_type: 'created' | 'updated' | 'status_changed';
  changes: Record<string, unknown>;
  actor_name: string;
  created_at: string;
};
export type ApiExecutionBoard = {
  workspace_id: string;
  role: 'owner' | 'editor' | 'viewer';
  today: string;
  horizon_end: string;
  history_limit: number;
  decisions: ApiExecutionDecision[];
  goals: ApiExecutionGoal[];
  actions: ApiExecutionAction[];
  events: ApiExecutionEvent[];
  members: { id: string; name: string; role: 'owner' | 'member' }[];
  sources: ApiExecutionSource[];
};
export type ApiExecutionDecisionWrite = {
  title: string;
  rationale: string;
  assumptions: string;
  review_trigger: string;
  status: ApiExecutionDecisionStatus;
  source_kind: ApiExecutionSourceKind;
  source_id: string;
};
export type ApiExecutionGoalWrite = {
  title: string;
  description: string;
  due_on: string | null;
  status: ApiExecutionGoalStatus;
};
export type ApiExecutionActionWrite = {
  decision_id: string;
  goal_id: string | null;
  owner_id: string;
  title: string;
  description: string;
  due_on: string;
  status: ApiExecutionActionStatus;
};
export type ApiExecutionDecisionUpdate = { revision: number } & Partial<ApiExecutionDecisionWrite>;
export type ApiExecutionGoalUpdate = { revision: number } & Partial<ApiExecutionGoalWrite>;
export type ApiExecutionActionUpdate = { revision: number } & Partial<ApiExecutionActionWrite>;

export type ApiDocumentStatus = 'draft' | 'review' | 'ready';
export type ApiDocumentCatalogState = 'mvp' | 'catalog_only';
export type ApiDocumentText = { fa: string; en: string };
export type ApiDocumentExample = ApiDocumentText & { note: ApiDocumentText };
export type ApiDocumentRecord = {
  id: string;
  template_id: string;
  stage: string;
  industry: string;
  owner_id: string;
  owner_name: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  status: ApiDocumentStatus;
  content: string;
  content_version: number;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type ApiDocumentTemplate = {
  id: string;
  section: string;
  priority: 'P0' | 'P1' | 'P2';
  title: ApiDocumentText;
  topic: ApiDocumentText;
  kind: ApiDocumentText;
  use: ApiDocumentText;
  timing: ApiDocumentText;
  audience: ApiDocumentText;
  recommended_owner: ApiDocumentText;
  recommended_reviewer: ApiDocumentText;
  access: ApiDocumentText;
  catalog_state: ApiDocumentCatalogState;
  stages: string[];
  industries: string[];
  structure: ApiDocumentText;
  writing_guide: ApiDocumentText;
  example: ApiDocumentExample | null;
  advisory_note: ApiDocumentText | null;
  status: ApiDocumentText;
  keywords: string;
  record: ApiDocumentRecord | null;
};
export type ApiDocumentEvent = {
  id: string;
  template_id: string;
  event_type: 'created' | 'updated' | 'status_changed';
  changes: Record<string, unknown>;
  actor_name: string;
  created_at: string;
};
export type ApiDocumentBoard = {
  workspace_id: string;
  role: 'owner' | 'editor' | 'viewer';
  history_limit: number;
  stages: { id: string; title: ApiDocumentText }[];
  industries: { id: string; title: ApiDocumentText }[];
  sections: { id: string; title: ApiDocumentText; description: ApiDocumentText; access: string }[];
  priorities: Record<string, ApiDocumentText>;
  items: ApiDocumentTemplate[];
  members: { id: string; name: string; role: 'owner' | 'editor' | 'viewer' }[];
  events: ApiDocumentEvent[];
};
export type ApiDocumentWrite = {
  template_id: string;
  stage: string;
  industry: string;
  owner_id: string;
  reviewer_id: string | null;
  status: ApiDocumentStatus;
  content: string;
};
export type ApiDocumentUpdate = { revision: number } & Partial<ApiDocumentWrite>;
export type ApiDocumentAttachmentStatus =
  'reserved' | 'uploading' | 'cancel_requested' | 'quarantined' | 'ready' | 'rejected';
export type ApiDocumentAttachment = {
  id: string;
  document_id: string;
  name: string;
  extension: string;
  media_type: string;
  version: number;
  size_bytes: number;
  sha256: string;
  status: ApiDocumentAttachmentStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};
export type ApiDocumentAttachmentList = {
  document_id: string;
  limits: { max_file_bytes: number; document_attachment_limit: number };
  items: ApiDocumentAttachment[];
};

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
  '/api/v1/workspaces/{workspace_id}/profile/revisions/': {
    get: {
      parameters: { path: { workspace_id: string } };
      response: { items: ApiWorkspaceProfileRevision[] };
    };
  };
  '/api/v1/workspaces/{workspace_id}/strategy/': {
    get: { parameters: { path: { workspace_id: string } }; response: ApiStrategyBoard };
  };
  '/api/v1/workspaces/{workspace_id}/strategy/factors/': {
    post: {
      parameters: { path: { workspace_id: string } };
      requestBody: ApiStrategyFactorWrite;
      response: ApiStrategyFactor;
    };
  };
  '/api/v1/workspaces/{workspace_id}/strategy/factors/{factor_id}/': {
    patch: {
      parameters: { path: { workspace_id: string; factor_id: string } };
      requestBody: ApiStrategyFactorUpdate;
      response: ApiStrategyFactor;
    };
    delete: {
      parameters: {
        path: { workspace_id: string; factor_id: string };
        query: { confirm_dependencies?: boolean };
      };
      response: ApiStrategyFactorDelete;
    };
  };
  '/api/v1/workspaces/{workspace_id}/strategy/options/': {
    post: {
      parameters: { path: { workspace_id: string } };
      requestBody: ApiStrategyOptionWrite;
      response: ApiStrategyOption;
    };
  };
  '/api/v1/workspaces/{workspace_id}/strategy/options/{option_id}/': {
    patch: {
      parameters: { path: { workspace_id: string; option_id: string } };
      requestBody: ApiStrategyOptionUpdate;
      response: ApiStrategyOption;
    };
    delete: {
      parameters: { path: { workspace_id: string; option_id: string } };
      response: ApiStrategyOptionDelete;
    };
  };
  '/api/v1/workspaces/{workspace_id}/analyses/': {
    get: {
      parameters: { path: { workspace_id: string } };
      response: { items: ApiAnalysis[]; next_cursor: string | null };
    };
    post: {
      parameters: { path: { workspace_id: string } };
      requestBody: ApiAnalysisWrite;
      response: ApiAnalysis;
    };
  };
  '/api/v1/workspaces/{workspace_id}/analyses/{record_id}/': {
    get: {
      parameters: { path: { workspace_id: string; record_id: string } };
      response: ApiAnalysis;
    };
    patch: {
      parameters: { path: { workspace_id: string; record_id: string } };
      requestBody: ApiAnalysisWrite;
      response: ApiAnalysis;
    };
    delete: {
      parameters: { path: { workspace_id: string; record_id: string } };
      response: ApiAnalysisDelete;
    };
  };
  '/api/v1/workspaces/{workspace_id}/execution/': {
    get: { parameters: { path: { workspace_id: string } }; response: ApiExecutionBoard };
    post: {
      parameters: { path: { workspace_id: string } };
      requestBody: ApiExecutionActionWrite;
      response: ApiExecutionAction;
    };
  };
  '/api/v1/workspaces/{workspace_id}/execution/actions/{record_id}/': {
    patch: {
      parameters: { path: { workspace_id: string; record_id: string } };
      requestBody: ApiExecutionActionUpdate;
      response: ApiExecutionAction;
    };
  };
  '/api/v1/workspaces/{workspace_id}/execution/decisions/': {
    post: {
      parameters: { path: { workspace_id: string } };
      requestBody: ApiExecutionDecisionWrite;
      response: ApiExecutionDecision;
    };
  };
  '/api/v1/workspaces/{workspace_id}/execution/decisions/{record_id}/': {
    patch: {
      parameters: { path: { workspace_id: string; record_id: string } };
      requestBody: ApiExecutionDecisionUpdate;
      response: ApiExecutionDecision;
    };
  };
  '/api/v1/workspaces/{workspace_id}/execution/goals/': {
    post: {
      parameters: { path: { workspace_id: string } };
      requestBody: ApiExecutionGoalWrite;
      response: ApiExecutionGoal;
    };
  };
  '/api/v1/workspaces/{workspace_id}/execution/goals/{record_id}/': {
    patch: {
      parameters: { path: { workspace_id: string; record_id: string } };
      requestBody: ApiExecutionGoalUpdate;
      response: ApiExecutionGoal;
    };
  };
  '/api/v1/workspaces/{workspace_id}/documents/': {
    get: {
      parameters: { path: { workspace_id: string }; query?: { stage?: string; industry?: string } };
      response: ApiDocumentBoard;
    };
    post: {
      parameters: { path: { workspace_id: string } };
      requestBody: ApiDocumentWrite;
      response: ApiDocumentRecord;
    };
  };
  '/api/v1/workspaces/{workspace_id}/documents/{record_id}/': {
    patch: {
      parameters: { path: { workspace_id: string; record_id: string } };
      requestBody: ApiDocumentUpdate;
      response: ApiDocumentRecord;
    };
  };
  '/api/v1/workspaces/{workspace_id}/documents/{record_id}/attachments/': {
    get: {
      parameters: { path: { workspace_id: string; record_id: string } };
      response: ApiDocumentAttachmentList;
    };
    post: {
      parameters: { path: { workspace_id: string; record_id: string } };
      requestBody: { name: string; size_bytes: number; request_id: string };
      response: ApiDocumentAttachment;
    };
  };
  '/api/v1/workspaces/{workspace_id}/documents/{record_id}/attachments/{attachment_id}/content/': {
    put: {
      parameters: { path: { workspace_id: string; record_id: string; attachment_id: string } };
      requestBody: FormData;
      response: ApiDocumentAttachment;
    };
  };
  '/api/v1/workspaces/{workspace_id}/documents/{record_id}/attachments/{attachment_id}/scan/': {
    post: {
      parameters: { path: { workspace_id: string; record_id: string; attachment_id: string } };
      response: ApiDocumentAttachment;
    };
  };
  '/api/v1/workspaces/{workspace_id}/documents/{record_id}/attachments/{attachment_id}/download/': {
    get: {
      parameters: { path: { workspace_id: string; record_id: string; attachment_id: string } };
      response: Blob;
    };
  };
  '/api/v1/workspaces/{workspace_id}/documents/{record_id}/attachments/{attachment_id}/': {
    delete: {
      parameters: { path: { workspace_id: string; record_id: string; attachment_id: string } };
      response: void;
    };
  };
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Expected object');
  return value as Record<string, unknown>;
}

function requiredString(value: unknown) {
  if (typeof value !== 'string') throw new TypeError('Expected string');
  return value;
}

function positiveRevision(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 1)
    throw new TypeError('Expected positive revision');
  return value as number;
}

export function decodeWorkspace(value: unknown): ApiWorkspace {
  const item = record(value);
  const archivedAt = item.archived_at;
  if (archivedAt !== null && typeof archivedAt !== 'string')
    throw new TypeError('Expected archive date');
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
  if (completedAt !== null && typeof completedAt !== 'string')
    throw new TypeError('Expected completion date');
  const profile: ApiWorkspaceProfile = {
    workspace_id: requiredString(item.workspace_id),
    company_name: requiredString(item.company_name),
    industry: requiredString(item.industry),
    stage: requiredString(item.stage),
    mission: requiredString(item.mission),
    problem_statement: requiredString(item.problem_statement),
    products: decodeRows(item.products, decodeProduct),
    customer_segments: decodeRows(item.customer_segments, decodeCustomerSegment),
    goals: decodeRows(item.goals, decodeGoal),
    icps: decodeRows(item.icps, decodeICP),
    revision: positiveRevision(item.revision),
    onboarding_completed_at: completedAt,
  };
  if (
    profile.company_name.length > 120 ||
    profile.industry.length > 200 ||
    profile.stage.length > 100 ||
    profile.mission.length > 2000 ||
    profile.problem_statement.length > 2000
  ) {
    throw new TypeError('Profile field exceeds its OpenAPI limit');
  }
  return profile;
}

function decodeRows<T>(value: unknown, decode: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new TypeError('Expected profile list');
  return value.map(decode);
}

function boundedString(value: unknown, max: number, field: string, required = false) {
  if (typeof value !== 'string' || (required && !value.trim()))
    throw new TypeError(`Expected ${field}`);
  const text = value;
  if (text.length > max) throw new TypeError(`${field} exceeds its OpenAPI limit`);
  return text;
}

function decodeProduct(value: unknown): ApiProfileProduct {
  const item = record(value);
  return {
    id: boundedString(item.id, 80, 'product.id', true),
    name: boundedString(item.name, 120, 'product.name', true),
    description: boundedString(item.description, 1000, 'product.description'),
    problem_solved: boundedString(item.problem_solved, 600, 'product.problem_solved'),
    target_customer: boundedString(item.target_customer, 400, 'product.target_customer'),
  };
}

function decodeCustomerSegment(value: unknown): ApiProfileCustomerSegment {
  const item = record(value);
  return {
    id: boundedString(item.id, 80, 'customer.id', true),
    name: boundedString(item.name, 120, 'customer.name', true),
    description: boundedString(item.description, 1000, 'customer.description'),
    needs: boundedString(item.needs, 600, 'customer.needs'),
    buying_roles: boundedString(item.buying_roles, 400, 'customer.buying_roles'),
  };
}

function decodeGoal(value: unknown): ApiProfileGoal {
  const item = record(value);
  return {
    id: boundedString(item.id, 80, 'goal.id', true),
    title: boundedString(item.title, 160, 'goal.title', true),
    success_signal: boundedString(item.success_signal, 500, 'goal.success_signal'),
    timeframe: boundedString(item.timeframe, 120, 'goal.timeframe'),
  };
}

function decodeEvidence(value: unknown): ApiProfileEvidence {
  const item = record(value);
  if (
    ![
      'interview',
      'sales',
      'support',
      'usage',
      'survey',
      'document',
      'secondary',
      'other',
    ].includes(String(item.source_type))
  )
    throw new TypeError('Invalid evidence source');
  if (!['low', 'medium', 'high'].includes(String(item.confidence)))
    throw new TypeError('Invalid evidence confidence');
  return {
    id: boundedString(item.id, 80, 'evidence.id', true),
    source_type: item.source_type as ApiProfileEvidence['source_type'],
    reference: boundedString(item.reference, 400, 'evidence.reference'),
    statement: boundedString(item.statement, 1000, 'evidence.statement', true),
    date: boundedString(item.date, 32, 'evidence.date'),
    confidence: item.confidence as ApiProfileEvidence['confidence'],
  };
}

function decodeAssumption(value: unknown): ApiProfileAssumption {
  const item = record(value);
  if (!['low', 'medium', 'high'].includes(String(item.confidence)))
    throw new TypeError('Invalid assumption confidence');
  if (!['untested', 'supported', 'rejected'].includes(String(item.status)))
    throw new TypeError('Invalid assumption status');
  return {
    id: boundedString(item.id, 80, 'assumption.id', true),
    statement: boundedString(item.statement, 1000, 'assumption.statement', true),
    confidence: item.confidence as ApiProfileAssumption['confidence'],
    test: boundedString(item.test, 600, 'assumption.test'),
    status: item.status as ApiProfileAssumption['status'],
  };
}

function decodeICP(value: unknown): ApiWorkspaceICP {
  const item = record(value);
  const segment = record(item.segment);
  const persona = record(item.persona);
  return {
    id: boundedString(item.id, 80, 'icp.id', true),
    name: boundedString(item.name, 120, 'icp.name', true),
    segment: {
      industry: boundedString(segment.industry, 160, 'segment.industry'),
      organization_size: boundedString(segment.organization_size, 120, 'segment.organization_size'),
      geography: boundedString(segment.geography, 120, 'segment.geography'),
      buying_context: boundedString(segment.buying_context, 500, 'segment.buying_context'),
    },
    persona: {
      role: boundedString(persona.role, 120, 'persona.role'),
      decision_role: boundedString(persona.decision_role, 120, 'persona.decision_role'),
      goals: boundedString(persona.goals, 500, 'persona.goals'),
      pains: boundedString(persona.pains, 500, 'persona.pains'),
    },
    problem: boundedString(item.problem, 1000, 'icp.problem'),
    evidence: decodeRows(item.evidence, decodeEvidence),
    assumptions: decodeRows(item.assumptions, decodeAssumption),
  };
}

export function decodeWorkspaceProfileRevisions(value: unknown): ApiWorkspaceProfileRevision[] {
  const response = record(value);
  return decodeRows(response.items, (entry) => {
    const item = record(entry);
    return {
      revision: positiveRevision(item.revision),
      snapshot: decodeWorkspaceProfile(item.snapshot),
      changed_by_id: requiredString(item.changed_by_id),
      created_at: requiredString(item.created_at),
    };
  });
}

const strategyFactorTypes: ApiStrategyFactorType[] = [
  'strength',
  'weakness',
  'opportunity',
  'threat',
];
const strategyCategories: ApiStrategyCategory[] = ['SO', 'WO', 'ST', 'WT'];

function decodeStrategyDependency(value: unknown): ApiStrategyDependency {
  const item = record(value);
  if (!strategyCategories.includes(item.category as ApiStrategyCategory))
    throw new TypeError('Invalid strategy category');
  return {
    id: requiredString(item.id),
    title: requiredString(item.title),
    category: item.category as ApiStrategyCategory,
  };
}

export function decodeStrategyFactor(value: unknown): ApiStrategyFactor {
  const item = record(value);
  if (!strategyFactorTypes.includes(item.factor_type as ApiStrategyFactorType))
    throw new TypeError('Invalid factor type');
  if (
    !Number.isInteger(item.priority) ||
    (item.priority as number) < 1 ||
    (item.priority as number) > 5
  )
    throw new TypeError('Invalid factor priority');
  if (typeof item.updated_at !== 'string' || typeof item.linked_options === 'undefined')
    throw new TypeError('Invalid factor metadata');
  return {
    id: requiredString(item.id),
    factor_type: item.factor_type as ApiStrategyFactorType,
    title: boundedString(item.title, 160, 'factor.title', true),
    evidence: boundedString(item.evidence, 2000, 'factor.evidence', true),
    owner: boundedString(item.owner, 120, 'factor.owner'),
    priority: item.priority as number,
    revision: positiveRevision(item.revision),
    updated_at: item.updated_at,
    linked_options: decodeRows(item.linked_options, decodeStrategyDependency),
  };
}

export function decodeStrategyOption(value: unknown): ApiStrategyOption {
  const item = record(value);
  if (!strategyCategories.includes(item.category as ApiStrategyCategory))
    throw new TypeError('Invalid strategy category');
  if (typeof item.needs_review !== 'boolean' || typeof item.updated_at !== 'string')
    throw new TypeError('Invalid option metadata');
  const factorRefs = decodeRows(item.factor_refs, (entry) => {
    const factor = record(entry);
    if (!strategyFactorTypes.includes(factor.factor_type as ApiStrategyFactorType))
      throw new TypeError('Invalid factor type');
    return {
      id: requiredString(factor.id),
      factor_type: factor.factor_type as ApiStrategyFactorType,
      title: requiredString(factor.title),
    };
  });
  return {
    id: requiredString(item.id),
    category: item.category as ApiStrategyCategory,
    title: boundedString(item.title, 160, 'option.title', true),
    action: boundedString(item.action, 1000, 'option.action', true),
    rationale: boundedString(item.rationale, 1000, 'option.rationale', true),
    hypothesis: boundedString(item.hypothesis, 600, 'option.hypothesis', true),
    cost: boundedString(item.cost, 300, 'option.cost'),
    factor_refs: factorRefs,
    needs_review: item.needs_review,
    revision: positiveRevision(item.revision),
    updated_at: item.updated_at,
  };
}

export function decodeStrategyBoard(value: unknown): ApiStrategyBoard {
  const item = record(value);
  const factors = decodeRows(item.factors, decodeStrategyFactor);
  const options = decodeRows(item.options, decodeStrategyOption);
  const factorIds = new Set(factors.map((factor) => factor.id));
  const optionIds = new Set(options.map((option) => option.id));
  if (factorIds.size !== factors.length || optionIds.size !== options.length)
    throw new TypeError('Duplicate strategy record id');
  const optionById = new Map(options.map((option) => [option.id, option]));
  for (const option of options) {
    const refs = new Set(option.factor_refs.map((factor) => factor.id));
    if (refs.size !== option.factor_refs.length)
      throw new TypeError('Duplicate strategy factor reference');
    for (const factor of option.factor_refs) {
      if (!factorIds.has(factor.id))
        throw new TypeError('Strategy reference is outside this Workspace');
      const current = factors.find((candidate) => candidate.id === factor.id);
      if (!current || current.factor_type !== factor.factor_type || current.title !== factor.title)
        throw new TypeError('Stale strategy factor reference');
    }
    if (!option.needs_review) {
      const expected =
        option.category === 'SO'
          ? ['strength', 'opportunity']
          : option.category === 'WO'
            ? ['weakness', 'opportunity']
            : option.category === 'ST'
              ? ['strength', 'threat']
              : ['weakness', 'threat'];
      const actual = new Set(option.factor_refs.map((factor) => factor.factor_type));
      if (
        expected.some((type) => !actual.has(type)) ||
        [...actual].some((type) => !expected.includes(type))
      ) {
        throw new TypeError('Strategy option is missing a compatible factor pairing');
      }
    }
  }
  for (const factor of factors) {
    const linkedIds = new Set(factor.linked_options.map((option) => option.id));
    if (linkedIds.size !== factor.linked_options.length)
      throw new TypeError('Duplicate strategy option dependency');
    for (const dependency of factor.linked_options) {
      const option = optionById.get(dependency.id);
      if (
        !option ||
        option.title !== dependency.title ||
        option.category !== dependency.category ||
        !option.factor_refs.some((reference) => reference.id === factor.id)
      ) {
        throw new TypeError('Strategy dependency is outside this Workspace');
      }
    }
    for (const option of options.filter((candidate) =>
      candidate.factor_refs.some((reference) => reference.id === factor.id),
    )) {
      if (!linkedIds.has(option.id)) throw new TypeError('Strategy dependency list is incomplete');
    }
  }
  return {
    workspace_id: requiredString(item.workspace_id),
    factors,
    options,
  };
}

export function decodeAnalysis(value: unknown): ApiAnalysis {
  const item = record(value);
  if (item.kind !== 'efe' && item.kind !== 'ife') throw new TypeError('Invalid matrix kind');
  if (item.state !== 'draft' && item.state !== 'finalized')
    throw new TypeError('Invalid matrix state');
  const inputs = record(item.inputs);
  const rows = decodeRows(inputs.rows, (value) => {
    const row = record(value);
    if (!strategyFactorTypes.includes(row.factor_type as ApiStrategyFactorType))
      throw new TypeError('Invalid matrix factor type');
    if (row.weight !== null && (typeof row.weight !== 'number' || !Number.isFinite(row.weight)))
      throw new TypeError('Invalid matrix weight');
    if (row.rating !== null && (!Number.isInteger(row.rating) || typeof row.rating !== 'number'))
      throw new TypeError('Invalid matrix rating');
    return {
      id: requiredString(row.id),
      title: boundedString(row.title, 500, 'analysis.title'),
      factor_type: row.factor_type as ApiStrategyFactorType,
      weight: row.weight as number | null,
      rating: row.rating as number | null,
      evidence: boundedString(row.evidence, 2000, 'analysis.evidence'),
    };
  });
  const output = record(item.output);
  const interpretation = ['below_midpoint', 'at_midpoint', 'above_midpoint', 'unavailable'];
  if (
    output.kind !== item.kind ||
    typeof output.total_weight !== 'number' ||
    !Number.isFinite(output.total_weight) ||
    (output.score !== null &&
      (typeof output.score !== 'number' || !Number.isFinite(output.score))) ||
    (output.rounded_score !== null &&
      (typeof output.rounded_score !== 'number' || !Number.isFinite(output.rounded_score))) ||
    typeof output.ready !== 'boolean' ||
    typeof output.can_finalize !== 'boolean' ||
    output.midpoint !== 2.5 ||
    !interpretation.includes(String(output.interpretation))
  )
    throw new TypeError('Invalid matrix calculation output');
  const issues = decodeRows(output.issues, (value) => {
    const issue = record(value);
    return { code: requiredString(issue.code), field: requiredString(issue.field) };
  });
  const limitations = decodeRows(output.limitations, (value) => requiredString(value));
  if (
    item.schema_version !== 1 ||
    typeof item.created_at !== 'string' ||
    typeof item.updated_at !== 'string'
  )
    throw new TypeError('Invalid matrix metadata');
  return {
    id: requiredString(item.id),
    workspace_id: requiredString(item.workspace_id),
    revision: positiveRevision(item.revision),
    created_at: item.created_at,
    updated_at: item.updated_at,
    kind: item.kind,
    schema_version: 1,
    method_version: requiredString(item.method_version),
    inputs: { rows },
    output: {
      kind: item.kind,
      total_weight: output.total_weight,
      score: output.score as number | null,
      rounded_score: output.rounded_score as number | null,
      ready: output.ready,
      can_finalize: output.can_finalize,
      issues,
      interpretation: output.interpretation as ApiAnalysisOutput['interpretation'],
      midpoint: 2.5,
      limitations,
    },
    state: item.state,
  };
}

export function decodeAnalysisPage(value: unknown) {
  const page = record(value);
  if (
    !Array.isArray(page.items) ||
    (page.next_cursor !== null && typeof page.next_cursor !== 'string')
  )
    throw new ApiError('فهرست تحلیل معتبر نیست.', 502, {}, 'invalid_response');
  const items = page.items.map(decodeAnalysis);
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    new Set(items.map((item) => item.kind)).size !== items.length
  )
    throw new ApiError('ماتریس تکراری در پاسخ سرور دریافت شد.', 502, {}, 'invalid_response');
  return { items, next_cursor: page.next_cursor as string | null };
}

const decisionStatuses: ApiExecutionDecisionStatus[] = [
  'proposed',
  'approved',
  'rejected',
  'superseded',
];
const goalStatuses: ApiExecutionGoalStatus[] = ['active', 'complete'];
const actionStatuses: ApiExecutionActionStatus[] = ['planned', 'in_progress', 'blocked', 'done'];

function dateString(value: unknown, field: string, optional = false): string | null {
  if (optional && value === null) return null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new TypeError(`Invalid date: ${field}`);
  return value;
}

function decodeExecutionSource(value: unknown): ApiExecutionSource {
  const item = record(value);
  if (item.kind !== 'analysis' && item.kind !== 'strategy_option')
    throw new TypeError('Invalid execution source kind');
  return {
    kind: item.kind,
    id: requiredString(item.id),
    title: boundedString(item.title, 160, 'execution.source.title', true),
  };
}

export function decodeExecutionDecision(value: unknown): ApiExecutionDecision {
  const item = record(value);
  if (!decisionStatuses.includes(item.status as ApiExecutionDecisionStatus))
    throw new TypeError('Invalid decision status');
  if (item.source !== null && item.source !== undefined) decodeExecutionSource(item.source);
  if (!Number.isInteger(item.action_count) || (item.action_count as number) < 0)
    throw new TypeError('Invalid decision action count');
  return {
    id: requiredString(item.id),
    title: boundedString(item.title, 160, 'decision.title', true),
    rationale: boundedString(item.rationale, 2000, 'decision.rationale', true),
    assumptions: boundedString(item.assumptions, 2000, 'decision.assumptions', true),
    review_trigger: boundedString(item.review_trigger, 500, 'decision.review_trigger', true),
    source:
      item.source === null || item.source === undefined ? null : decodeExecutionSource(item.source),
    status: item.status as ApiExecutionDecisionStatus,
    revision: positiveRevision(item.revision),
    action_count: item.action_count as number,
    created_at: requiredString(item.created_at),
    updated_at: requiredString(item.updated_at),
  };
}

export function decodeExecutionGoal(value: unknown): ApiExecutionGoal {
  const item = record(value);
  if (!goalStatuses.includes(item.status as ApiExecutionGoalStatus))
    throw new TypeError('Invalid goal status');
  if (!Number.isInteger(item.action_count) || (item.action_count as number) < 0)
    throw new TypeError('Invalid goal action count');
  return {
    id: requiredString(item.id),
    title: boundedString(item.title, 160, 'goal.title', true),
    description: boundedString(item.description, 1000, 'goal.description'),
    due_on: dateString(item.due_on, 'goal.due_on', true),
    status: item.status as ApiExecutionGoalStatus,
    revision: positiveRevision(item.revision),
    action_count: item.action_count as number,
    created_at: requiredString(item.created_at),
    updated_at: requiredString(item.updated_at),
  };
}

export function decodeExecutionAction(value: unknown): ApiExecutionAction {
  const item = record(value);
  if (!actionStatuses.includes(item.status as ApiExecutionActionStatus))
    throw new TypeError('Invalid action status');
  if (typeof item.overdue !== 'boolean') throw new TypeError('Invalid overdue state');
  return {
    id: requiredString(item.id),
    decision_id: requiredString(item.decision_id),
    decision_title: boundedString(item.decision_title, 160, 'action.decision_title', true),
    goal_id: item.goal_id === null ? null : requiredString(item.goal_id),
    goal_title:
      item.goal_title === null
        ? null
        : boundedString(item.goal_title, 160, 'action.goal_title', true),
    owner_id: requiredString(item.owner_id),
    owner_name: boundedString(item.owner_name, 254, 'action.owner_name', true),
    title: boundedString(item.title, 160, 'action.title', true),
    description: boundedString(item.description, 1000, 'action.description'),
    due_on: dateString(item.due_on, 'action.due_on') as string,
    overdue: item.overdue,
    status: item.status as ApiExecutionActionStatus,
    revision: positiveRevision(item.revision),
    created_at: requiredString(item.created_at),
    updated_at: requiredString(item.updated_at),
  };
}

function decodeExecutionEvent(value: unknown): ApiExecutionEvent {
  const item = record(value);
  if (!['decision', 'goal', 'action'].includes(String(item.entity_type)))
    throw new TypeError('Invalid execution event type');
  if (!['created', 'updated', 'status_changed'].includes(String(item.event_type)))
    throw new TypeError('Invalid execution event action');
  return {
    id: requiredString(item.id),
    entity_type: item.entity_type as ApiExecutionEvent['entity_type'],
    entity_id: requiredString(item.entity_id),
    entity_label: boundedString(item.entity_label, 160, 'event.entity_label', true),
    event_type: item.event_type as ApiExecutionEvent['event_type'],
    changes: record(item.changes),
    actor_name: boundedString(item.actor_name, 254, 'event.actor_name', true),
    created_at: requiredString(item.created_at),
  };
}

export function decodeExecutionBoard(value: unknown): ApiExecutionBoard {
  const item = record(value);
  if (!['owner', 'editor', 'viewer'].includes(String(item.role)))
    throw new TypeError('Invalid execution board role');
  const today = dateString(item.today, 'execution.today') as string;
  const horizonEnd = dateString(item.horizon_end, 'execution.horizon_end') as string;
  if (
    !Number.isInteger(item.history_limit) ||
    (item.history_limit as number) < 1 ||
    (item.history_limit as number) > 500
  )
    throw new TypeError('Invalid execution history limit');
  const decisions = decodeRows(item.decisions, decodeExecutionDecision);
  const goals = decodeRows(item.goals, decodeExecutionGoal);
  const actions = decodeRows(item.actions, decodeExecutionAction);
  const events = decodeRows(item.events, decodeExecutionEvent);
  const members = decodeRows(item.members, (value) => {
    const member = record(value);
    if (member.role !== 'owner' && member.role !== 'member')
      throw new TypeError('Invalid execution member role');
    return {
      id: requiredString(member.id),
      name: boundedString(member.name, 254, 'member.name', true),
      role: member.role as 'owner' | 'member',
    };
  });
  const sources = decodeRows(item.sources, decodeExecutionSource);
  const idsUnique = (values: { id: string }[]) =>
    new Set(values.map((entry) => entry.id)).size === values.length;
  if (
    !idsUnique(decisions) ||
    !idsUnique(goals) ||
    !idsUnique(actions) ||
    !idsUnique(events) ||
    !idsUnique(members) ||
    !idsUnique(sources)
  )
    throw new TypeError('Duplicate execution record id');
  if (
    decisions.length > 100 ||
    goals.length > 100 ||
    actions.length > 500 ||
    events.length > (item.history_limit as number)
  )
    throw new TypeError('Execution board exceeds a supported limit');
  const decisionById = new Map(decisions.map((entry) => [entry.id, entry]));
  const goalById = new Map(goals.map((entry) => [entry.id, entry]));
  for (const action of actions) {
    if (!decisionById.has(action.decision_id))
      throw new TypeError('Execution action is outside this Workspace');
    if (action.goal_id !== null && !goalById.has(action.goal_id))
      throw new TypeError('Execution goal is outside this Workspace');
    if (action.decision_title !== decisionById.get(action.decision_id)?.title)
      throw new TypeError('Stale decision reference');
    if (action.goal_id !== null && action.goal_title !== goalById.get(action.goal_id)?.title)
      throw new TypeError('Stale goal reference');
  }
  if (horizonEnd < today) throw new TypeError('Invalid execution horizon');
  return {
    workspace_id: requiredString(item.workspace_id),
    role: item.role as ApiExecutionBoard['role'],
    today,
    horizon_end: horizonEnd,
    history_limit: item.history_limit as number,
    decisions,
    goals,
    actions,
    events,
    members,
    sources,
  };
}

const documentStatuses: ApiDocumentStatus[] = ['draft', 'review', 'ready'];

function decodeDocumentText(value: unknown): ApiDocumentText {
  const item = record(value);
  return {
    fa: boundedString(item.fa, 6000, 'document.fa', true),
    en: boundedString(item.en, 6000, 'document.en', true),
  };
}

export function decodeDocumentRecord(value: unknown): ApiDocumentRecord {
  const item = record(value);
  if (!documentStatuses.includes(item.status as ApiDocumentStatus))
    throw new TypeError('Invalid document status');
  if (!Number.isInteger(item.content_version) || (item.content_version as number) < 1)
    throw new TypeError('Invalid document content version');
  return {
    id: requiredString(item.id),
    template_id: requiredString(item.template_id),
    stage: requiredString(item.stage),
    industry: requiredString(item.industry),
    owner_id: requiredString(item.owner_id),
    owner_name: boundedString(item.owner_name, 254, 'document.owner_name', true),
    reviewer_id: item.reviewer_id === null ? null : requiredString(item.reviewer_id),
    reviewer_name:
      item.reviewer_name === null
        ? null
        : boundedString(item.reviewer_name, 254, 'document.reviewer_name', true),
    status: item.status as ApiDocumentStatus,
    content: boundedString(item.content, 16000, 'document.content'),
    content_version: item.content_version as number,
    revision: positiveRevision(item.revision),
    created_at: requiredString(item.created_at),
    updated_at: requiredString(item.updated_at),
  };
}

function decodeDocumentTemplate(value: unknown): ApiDocumentTemplate {
  const item = record(value);
  if (item.priority !== 'P0' && item.priority !== 'P1' && item.priority !== 'P2')
    throw new TypeError('Invalid document priority');
  if (item.catalog_state !== 'mvp' && item.catalog_state !== 'catalog_only')
    throw new TypeError('Invalid document catalog state');
  if (!Array.isArray(item.stages) || !Array.isArray(item.industries))
    throw new TypeError('Invalid document filters');
  const example = item.example === null ? null : record(item.example);
  const recordValue = item.record === null ? null : decodeDocumentRecord(item.record);
  if (recordValue && recordValue.template_id !== item.id)
    throw new TypeError('Document record is linked to another template');
  if (item.catalog_state === 'catalog_only' && example !== null)
    throw new TypeError('Catalog-only entries cannot expose a completed example');
  return {
    id: requiredString(item.id),
    section: requiredString(item.section),
    priority: item.priority,
    title: decodeDocumentText(item.title),
    topic: decodeDocumentText(item.topic),
    kind: decodeDocumentText(item.kind),
    use: decodeDocumentText(item.use),
    timing: decodeDocumentText(item.timing),
    audience: decodeDocumentText(item.audience),
    recommended_owner: decodeDocumentText(item.recommended_owner),
    recommended_reviewer: decodeDocumentText(item.recommended_reviewer),
    access: decodeDocumentText(item.access),
    catalog_state: item.catalog_state,
    stages: item.stages.map(requiredString),
    industries: item.industries.map(requiredString),
    structure: decodeDocumentText(item.structure),
    writing_guide: decodeDocumentText(item.writing_guide),
    example: example
      ? {
          fa: boundedString(example.fa, 4000, 'document.example.fa', true),
          en: boundedString(example.en, 4000, 'document.example.en', true),
          note: decodeDocumentText(example.note),
        }
      : null,
    advisory_note: item.advisory_note === null ? null : decodeDocumentText(item.advisory_note),
    status: decodeDocumentText(item.status),
    keywords: boundedString(item.keywords, 20000, 'document.keywords'),
    record: recordValue,
  };
}

export function decodeDocumentBoard(value: unknown): ApiDocumentBoard {
  const item = record(value);
  if (!['owner', 'editor', 'viewer'].includes(String(item.role)))
    throw new TypeError('Invalid document board role');
  if (
    !Number.isInteger(item.history_limit) ||
    (item.history_limit as number) < 1 ||
    (item.history_limit as number) > 500
  )
    throw new TypeError('Invalid document history limit');
  const items = decodeRows(item.items, decodeDocumentTemplate);
  const stages = decodeRows(item.stages, (value) => {
    const stage = record(value);
    return { id: requiredString(stage.id), title: decodeDocumentText(stage.title) };
  });
  const industries = decodeRows(item.industries, (value) => {
    const industry = record(value);
    return { id: requiredString(industry.id), title: decodeDocumentText(industry.title) };
  });
  const sections = decodeRows(item.sections, (value) => {
    const section = record(value);
    return {
      id: requiredString(section.id),
      title: decodeDocumentText(section.title),
      description: decodeDocumentText(section.description),
      access: requiredString(section.access),
    };
  });
  const prioritiesValue = record(item.priorities);
  const priorities = Object.fromEntries(
    Object.entries(prioritiesValue).map(([key, label]) => [key, decodeDocumentText(label)]),
  );
  const members = decodeRows(item.members, (value) => {
    const member = record(value);
    if (!['owner', 'editor', 'viewer'].includes(String(member.role)))
      throw new TypeError('Invalid document member role');
    return {
      id: requiredString(member.id),
      name: boundedString(member.name, 254, 'document.member.name', true),
      role: member.role as 'owner' | 'editor' | 'viewer',
    };
  });
  const events = decodeRows(item.events, (value) => {
    const event = record(value);
    if (!['created', 'updated', 'status_changed'].includes(String(event.event_type)))
      throw new TypeError('Invalid document event type');
    return {
      id: requiredString(event.id),
      template_id: requiredString(event.template_id),
      event_type: event.event_type as ApiDocumentEvent['event_type'],
      changes: record(event.changes),
      actor_name: boundedString(event.actor_name, 254, 'document.event.actor_name', true),
      created_at: requiredString(event.created_at),
    };
  });
  if (items.length > 60 || events.length > (item.history_limit as number))
    throw new TypeError('Document board exceeds a supported limit');
  if (
    new Set(items.map((entry) => entry.id)).size !== items.length ||
    new Set(members.map((entry) => entry.id)).size !== members.length
  )
    throw new TypeError('Duplicate document board record');
  return {
    workspace_id: requiredString(item.workspace_id),
    role: item.role as ApiDocumentBoard['role'],
    history_limit: item.history_limit as number,
    stages,
    industries,
    sections,
    priorities,
    items,
    members,
    events,
  };
}

export function decodeDocumentAttachment(value: unknown): ApiDocumentAttachment {
  const item = record(value);
  const statuses: ApiDocumentAttachmentStatus[] = [
    'reserved',
    'uploading',
    'cancel_requested',
    'quarantined',
    'ready',
    'rejected',
  ];
  if (!statuses.includes(item.status as ApiDocumentAttachmentStatus))
    throw new TypeError('Invalid attachment status');
  if (!Number.isInteger(item.version) || (item.version as number) < 1)
    throw new TypeError('Invalid attachment version');
  if (!Number.isInteger(item.size_bytes) || (item.size_bytes as number) < 1)
    throw new TypeError('Invalid attachment size');
  if (
    typeof item.sha256 !== 'string' ||
    (item.sha256 !== '' && !/^[a-f0-9]{64}$/.test(item.sha256))
  )
    throw new TypeError('Invalid attachment checksum');
  return {
    id: requiredString(item.id),
    document_id: requiredString(item.document_id),
    name: boundedString(item.name, 180, 'attachment.name'),
    extension: boundedString(item.extension, 12, 'attachment.extension'),
    media_type: boundedString(item.media_type, 128, 'attachment.media_type'),
    version: item.version as number,
    size_bytes: item.size_bytes as number,
    sha256: item.sha256,
    status: item.status as ApiDocumentAttachmentStatus,
    created_by: boundedString(item.created_by, 254, 'attachment.created_by', true),
    created_at: requiredString(item.created_at),
    updated_at: requiredString(item.updated_at),
  };
}

export function decodeDocumentAttachmentList(value: unknown): ApiDocumentAttachmentList {
  const item = record(value);
  const items = decodeRows(item.items, decodeDocumentAttachment);
  const documentId = requiredString(item.document_id);
  const limits = record(item.limits);
  if (
    !Number.isInteger(limits.max_file_bytes) ||
    (limits.max_file_bytes as number) < 1 ||
    !Number.isInteger(limits.document_attachment_limit) ||
    (limits.document_attachment_limit as number) < 1
  )
    throw new TypeError('Invalid attachment upload limits');
  if (items.some((attachment) => attachment.document_id !== documentId))
    throw new TypeError('Attachment belongs to a different document');
  if (items.length > 100 || new Set(items.map((attachment) => attachment.id)).size !== items.length)
    throw new TypeError('Attachment list exceeds a supported limit');
  return {
    document_id: documentId,
    limits: {
      max_file_bytes: limits.max_file_bytes as number,
      document_attachment_limit: limits.document_attachment_limit as number,
    },
    items,
  };
}

export function decodeWorkspaceMember(value: unknown): ApiWorkspaceMember {
  const item = record(value);
  if (!['owner', 'editor', 'viewer'].includes(String(item.role)))
    throw new TypeError('Expected Workspace role');
  return {
    user_id: requiredString(item.user_id),
    email: requiredString(item.email),
    name: requiredString(item.name),
    role: item.role as ApiWorkspaceMember['role'],
  };
}

export function decodeWorkspaceInvitation(value: unknown): ApiWorkspaceInvitation {
  const item = record(value);
  if (item.role !== 'editor' && item.role !== 'viewer')
    throw new TypeError('Expected invitation role');
  return {
    id: requiredString(item.id),
    email: requiredString(item.email),
    role: item.role,
    expires_at: requiredString(item.expires_at),
  };
}

export function decodeWorkspacePage(value: unknown) {
  const page = record(value);
  if (
    !Array.isArray(page.items) ||
    (page.next_cursor !== null && typeof page.next_cursor !== 'string')
  ) {
    throw new ApiError('فهرست فضای کار معتبر نیست.', 502, {}, 'invalid_response');
  }
  return { items: page.items.map(decodeWorkspace), next_cursor: page.next_cursor as string | null };
}
