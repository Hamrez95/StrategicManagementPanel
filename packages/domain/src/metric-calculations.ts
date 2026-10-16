export type ContributionState = 'observed' | 'unknown' | 'not_applicable' | 'invalid';

export interface ContributionContext {
  workspace_id: string;
  scope_kind: string;
  segment_id: string | null;
  period_start: string;
  period_end: string;
  currency: string;
  accounting_basis: string;
}

export interface ContributionInput extends ContributionContext {
  state: ContributionState;
  value: string | null;
  unit: string;
  cost_scope?: string;
}

export interface ContributionResult {
  status: ContributionState;
  value: string | null;
  currency: string;
  cost_scope: string;
  missing_inputs: string[];
}

const REQUIRED_BINDINGS = ['net_revenue', 'variable_costs'] as const;
type BindingId = (typeof REQUIRED_BINDINGS)[number];
const SCALE = 1_000_000n;
const MAX_WHOLE_DIGITS = 18;

function invalid(context: ContributionContext): ContributionResult {
  return {
    status: 'invalid',
    value: null,
    currency: context.currency,
    cost_scope: '',
    missing_inputs: [],
  };
}

function parseScaledDecimal(value: string | null): bigint | null {
  if (typeof value !== 'string') return null;
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match || match[2].length > MAX_WHOLE_DIGITS) return null;
  const fraction = (match[3] ?? '').padEnd(6, '0');
  const scaled = BigInt(match[2]) * SCALE + BigInt(fraction || '0');
  return match[1] === '-' ? -scaled : scaled;
}

function formatScaledDecimal(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(6, '0');
  return `${sign}${whole}.${fraction}`;
}

function contextMatches(input: ContributionInput, context: ContributionContext) {
  return (
    input.workspace_id === context.workspace_id &&
    input.scope_kind === context.scope_kind &&
    input.segment_id === context.segment_id &&
    input.period_start === context.period_start &&
    input.period_end === context.period_end &&
    input.currency === context.currency &&
    input.accounting_basis === context.accounting_basis
  );
}

export function calculateContributionAmount(
  inputs: Partial<Record<BindingId, ContributionInput>>,
  context: ContributionContext,
): ContributionResult {
  for (const [bindingId, input] of Object.entries(inputs)) {
    if (!REQUIRED_BINDINGS.includes(bindingId as BindingId) || !input) return invalid(context);
    if (!contextMatches(input, context) || input.unit !== 'currency') return invalid(context);
    if (bindingId === 'variable_costs' && !input.cost_scope?.trim()) return invalid(context);
    if (bindingId === 'net_revenue' && input.cost_scope) return invalid(context);
    if ((input.state === 'observed') !== (input.value !== null)) return invalid(context);
  }

  const ordered = REQUIRED_BINDINGS.map((bindingId) => inputs[bindingId]);
  if (ordered.some((input) => input?.state === 'invalid')) return invalid(context);
  if (ordered.some((input) => input?.state === 'not_applicable')) {
    return {
      status: 'not_applicable',
      value: null,
      currency: context.currency,
      cost_scope: '',
      missing_inputs: [],
    };
  }
  const missingInputs = REQUIRED_BINDINGS.filter(
    (bindingId) => !inputs[bindingId] || inputs[bindingId]?.state === 'unknown',
  );
  if (missingInputs.length) {
    return {
      status: 'unknown',
      value: null,
      currency: context.currency,
      cost_scope: inputs.variable_costs?.cost_scope ?? '',
      missing_inputs: [...missingInputs],
    };
  }

  const revenue = inputs.net_revenue?.value;
  const costs = inputs.variable_costs?.value;
  const scaledRevenue = parseScaledDecimal(revenue ?? null);
  const scaledCosts = parseScaledDecimal(costs ?? null);
  if (scaledRevenue === null || scaledCosts === null) return invalid(context);
  const amount = scaledRevenue - scaledCosts;
  if ((amount < 0n ? -amount : amount) / SCALE >= 10n ** BigInt(MAX_WHOLE_DIGITS)) {
    return invalid(context);
  }

  return {
    status: 'observed',
    value: formatScaledDecimal(amount),
    currency: context.currency,
    cost_scope: inputs.variable_costs?.cost_scope ?? '',
    missing_inputs: [],
  };
}
