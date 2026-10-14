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
