import { ApiError, requestApi } from '../../api/client';

export const perspectives = ['financial', 'customer', 'process', 'learning'] as const;
export type Perspective = (typeof perspectives)[number];
export type Observation = {
  id: string;
  observed_on: string;
  value: string | null;
  evidence: string;
  definition_snapshot: Record<string, unknown>;
  created_at: string;
};
export type Indicator = {
  id: string;
  name: string;
  definition: string;
  unit: string;
  formula: string;
  direction: 'increase' | 'decrease' | 'range';
  baseline: string | null;
  baseline_on: string | null;
  target: string | null;
  target_high: string | null;
  warning_margin: string | null;
  due_on: string | null;
  cadence_days: number | null;
  source: string;
  owner_id: string | null;
  kind: 'leading' | 'lagging';
  guardrail: string;
  observations?: Observation[];
  assessment?: {
    actual_unit: string;
    definition_changed: boolean;
    status: 'unknown' | 'on_target' | 'near_target' | 'off_target';
    actual: string | null;
    observed_on: string | null;
    difference: string | null;
    baseline_progress_percent: string | null;
    trend_delta: string | null;
    next_due: string | null;
    needs_review: boolean;
    missing: string[];
  };
};
export type Objective = {
  id: string;
  title: string;
  perspective: Perspective;
  goal_id: string | null;
  action_ids: string[];
  indicators: Indicator[];
};
export type Relation = {
  id: string;
  source_id: string;
  destination_id: string;
  rationale: string;
  test_method: string;
};
export type Review = {
  id: string;
  reviewed_on: string;
  decision: string;
  action_id: string | null;
};
export type Card = {
  id: string;
  revision: number;
  title: string;
  scope: string;
  strategy: string;
  decision_id: string | null;
  period_start: string | null;
  period_end: string | null;
  objectives: Objective[];
  relations: Relation[];
  reviews?: Review[];
};
export type Board = { workspace_id: string; can_edit: boolean; cards: Card[] };
export function blankCard(): Card {
  return {
    id: crypto.randomUUID(),
    revision: 0,
    title: '',
    scope: '',
    strategy: '',
    decision_id: null,
    period_start: null,
    period_end: null,
    objectives: [],
    relations: [],
  };
}
export function blankIndicator(): Indicator {
  return {
    id: crypto.randomUUID(),
    name: '',
    definition: '',
    unit: '',
    formula: '',
    direction: 'increase',
    baseline: null,
    baseline_on: null,
    target: null,
    target_high: null,
    warning_margin: null,
    due_on: null,
    cadence_days: null,
    source: '',
    owner_id: null,
    kind: 'lagging',
    guardrail: '',
  };
}
export function writable(card: Card): Omit<Card, 'reviews'> {
  return {
    id: card.id,
    revision: card.revision,
    title: card.title,
    scope: card.scope,
    strategy: card.strategy,
    decision_id: card.decision_id,
    period_start: card.period_start,
    period_end: card.period_end,
    relations: card.relations,
    objectives: card.objectives.map((o) => ({
      ...o,
      indicators: o.indicators.map((i) => {
        const { observations: _observations, assessment: _assessment, ...fields } = i;
        void _observations;
        void _assessment;
        return fields;
      }),
    })),
  };
}
function decodeCard(value: unknown): Card {
  if (!value || typeof value !== 'object') throw new TypeError('BSC response');
  const c = value as Card;
  if (
    typeof c.id !== 'string' ||
    !Number.isInteger(c.revision) ||
    typeof c.title !== 'string' ||
    !Array.isArray(c.objectives) ||
    !Array.isArray(c.relations) ||
    c.objectives.some(
      (o) =>
        typeof o.id !== 'string' ||
        !perspectives.includes(o.perspective) ||
        !Array.isArray(o.indicators) ||
        !Array.isArray(o.action_ids),
    )
  )
    throw new TypeError('BSC response');
  return c;
}
const root = (id: string) => `/api/v1/workspaces/${encodeURIComponent(id)}/execution/scorecards/`;
export function readCards(id: string, signal?: AbortSignal) {
  return requestApi<Board>(root(id), {
    signal,
    decode(value) {
      const b = value as Board;
      if (!b || b.workspace_id !== id || typeof b.can_edit !== 'boolean' || !Array.isArray(b.cards))
        throw new ApiError('Invalid BSC response', 502);
      return { ...b, cards: b.cards.map(decodeCard) };
    },
  });
}
export function saveCard(workspaceId: string, card: Card) {
  return requestApi<Card>(`${root(workspaceId)}${card.revision ? `${card.id}/` : ''}`, {
    method: card.revision ? 'PATCH' : 'POST',
    body: writable(card),
    decode: decodeCard,
  });
}
export function appendCard(
  workspaceId: string,
  cardId: string,
  kind: 'observations' | 'reviews',
  body: unknown,
) {
  return requestApi<Card>(`${root(workspaceId)}${cardId}/${kind}/`, {
    method: 'POST',
    body,
    decode: decodeCard,
  });
}
export function addCardAction(
  workspaceId: string,
  card: Card,
  objectiveId: string,
  action: unknown,
  requestId: string,
) {
  return requestApi<Card>(`${root(workspaceId)}${card.id}/objectives/${objectiveId}/actions/`, {
    method: 'POST',
    body: { revision: card.revision, request_id: requestId, action },
    decode: decodeCard,
  });
}
