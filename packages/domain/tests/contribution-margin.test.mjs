import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateContributionAmount } from '../dist/metric-calculations.js';

const fixtures = JSON.parse(
  readFileSync(new URL('../../../docs/fixtures/contribution-margin.json', import.meta.url), 'utf8'),
);

test('TypeScript preview matches shared contribution amount fixtures exactly', () => {
  for (const fixture of fixtures.cases) {
    const inputs = Object.fromEntries(
      Object.entries(fixture.inputs)
        .filter(([, value]) => value !== null)
        .map(([bindingId, value]) => [
          bindingId,
          { ...value, workspace_id: fixture.context.workspace_id },
        ]),
    );
    const output = calculateContributionAmount(inputs, fixture.context);
    assert.deepEqual(
      {
        status: output.status,
        value: output.value,
        currency: output.currency,
        cost_scope: output.cost_scope,
        missing_inputs: output.missing_inputs,
      },
      fixture.expected,
      fixture.id,
    );
  }
});

test('unrecognized numeric bindings never produce an amount', () => {
  const fixture = fixtures.cases[0];
  const inputs = {
    net_revenue: {
      ...fixture.inputs.net_revenue,
      workspace_id: fixture.context.workspace_id,
    },
    variable_costs: {
      ...fixture.inputs.variable_costs,
      workspace_id: fixture.context.workspace_id,
    },
    fixed_costs: {
      ...fixture.inputs.variable_costs,
      workspace_id: fixture.context.workspace_id,
    },
  };
  const output = calculateContributionAmount(inputs, fixture.context);
  assert.equal(output.status, 'invalid');
  assert.equal(output.value, null);
});
