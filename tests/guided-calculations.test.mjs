import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = await readFile('apps/web/src/features/experience/guidedCalculations.ts', 'utf8');
const code = ts
  .transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  .outputText.replace(
    "from '@stratino/domain'",
    `from '${pathToFileURL(process.cwd() + '/packages/domain/dist/index.js').href}'`,
  );
const { readNumber, financeResults, retentionRate } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);
const context = {
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  currency: 'IRT',
  scale: '1000000',
  basis: 'actual',
};
const fixture = {
  ...context,
  revenue: '200',
  cogs: '120',
  variable: '80',
  fixed: '60',
  costScope: 'all variable and fixed operating costs',
  netIncome: '-10',
  cash: '50',
  monthlyBurn: '10',
  currentAssets: '70',
  currentLiabilities: '40',
  acquisitionCost: '20',
  newCustomers: '10',
  assetsStart: '300',
  assetsEnd: '500',
  equity: '100',
};
const result = (values, id) => financeResults(values).find((r) => r.id === id).value;
test('Persian/Arabic numbers parse, blanks and unsafe inputs remain unknown', () => {
  assert.equal(readNumber(' ۱٬۲۳۴٫۵ '), 1234.5);
  assert.equal(readNumber('١٢٣'), 123);
  assert.equal(readNumber('−۱۰'), -10);
  for (const value of ['', ' ', 'Infinity', '1e3', '1.1234567', '1000000000001', 'no'])
    assert.equal(readNumber(value), null);
  assert.equal(readNumber('۰'), 0);
});
test('financial outputs preserve sign, reporting scale and actual formulas', () => {
  assert.equal(result(fixture, 'gross'), 80);
  assert.equal(result(fixture, 'grossMargin'), 0.4);
  assert.equal(result(fixture, 'contribution'), 120);
  assert.equal(result(fixture, 'operating'), 60);
  assert.equal(result(fixture, 'breakEven'), 100);
  assert.equal(result(fixture, 'netMargin'), -0.05);
  assert.equal(result(fixture, 'workingCapital'), 30);
  assert.equal(result(fixture, 'currentRatio'), 1.75);
  assert.equal(result(fixture, 'runway'), 5);
  assert.equal(result(fixture, 'cac'), 2);
  assert.equal(result(fixture, 'roa'), -0.025);
  assert.equal(result(fixture, 'roe'), -0.1);
});
test('missing values never become zero, invalid context withholds outputs', () => {
  assert.equal(result({ ...fixture, cogs: '' }, 'gross'), null);
  assert.equal(result({ ...fixture, cogs: '0' }, 'gross'), 200);
  assert.equal(result({ ...fixture, costScope: '' }, 'contribution'), null);
  assert.ok(financeResults({ ...fixture, periodEnd: '2025-01-01' }).every((r) => r.value === null));
  assert.ok(financeResults({ ...fixture, currency: '' }).every((r) => r.value === null));
  assert.ok(financeResults({ ...fixture, scale: '' }).every((r) => r.value === null));
});
test('impossible calendar dates withhold financial outputs', () => {
  assert.ok(financeResults({ ...fixture, periodEnd: '2026-02-31' }).every((r) => r.value === null));
});
test('invalid denominators, negative participation and fractional customers do not yield misleading outputs', () => {
  assert.equal(result({ ...fixture, revenue: '0' }, 'grossMargin'), null);
  assert.equal(result({ ...fixture, variable: '300' }, 'breakEven'), null);
  assert.equal(result({ ...fixture, monthlyBurn: '-1' }, 'runway'), null);
  assert.equal(result({ ...fixture, monthlyBurn: '0' }, 'runway'), null);
  assert.equal(result({ ...fixture, newCustomers: '2.5' }, 'cac'), null);
  assert.equal(result({ ...fixture, equity: '-20' }, 'roe'), null);
  assert.equal(result({ ...fixture, cogs: '-5' }, 'gross'), null);
});
test('retention is a defined cohort subset, never inferred from missing or incompatible counts', () => {
  const cohort = {
    cohort: 'first January purchasers',
    window: 'second purchase by 90 days',
    initial: '۱۰۰',
    returned: '۲۵',
  };
  assert.equal(retentionRate(cohort), 0.25);
  for (const patch of [
    { window: '' },
    { cohort: '' },
    { initial: '' },
    { initial: '0' },
    { returned: '101' },
    { returned: '1.2' },
    { returned: '-1' },
  ])
    assert.equal(retentionRate({ ...cohort, ...patch }), null);
  assert.equal(retentionRate({ ...cohort, returned: '0' }), 0);
});
