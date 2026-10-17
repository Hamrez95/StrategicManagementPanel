import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const source = read('assets/management-knowledge/catalog.json');
const projection = read('apps/web/src/features/experience/design-research.json');
const js = ts.transpileModule(
  readFileSync('apps/web/src/features/experience/planningDesigns.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { planningDesigns, planningDefinitions } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);
test('every indexed framework and metric has one exact, scoped design route', () => {
  const expected = source.records.filter((r) => ['frameworks', 'metrics'].includes(r.kind));
  assert.equal(expected.length, 64);
  assert.equal(projection.entries.length, expected.length);
  assert.equal(new Set(projection.entries.map((r) => r.id)).size, expected.length);
  for (const r of expected) {
    const actual = projection.entries.find((x) => x.id === r.id);
    assert.ok(actual, r.id);
    assert.equal(actual.sourcePath, r.path);
    assert.equal(actual.researchStatus, 'requires_expert_and_runtime_review');
    assert.ok(actual.inputs.length);
    if (r.kind === 'frameworks') assert.ok(actual.steps.length);
  }
});
test('all research records and all taxonomy domains have an explicit coverage disposition', () => {
  assert.equal(projection.inventory.length, source.records.length);
  for (const r of source.records)
    assert.ok(projection.inventory.some((x) => x.id === r.id && x.kind === r.kind && x.uiRole));
  assert.equal(projection.domains.length, 21);
});
test('vision, mission, marketing and all legacy matrix designs have stable nonempty question contracts', () => {
  for (const id of [
    'vision',
    'mission',
    'purpose',
    'values',
    'strategic-goals',
    'stp',
    'marketing-mix',
    'marketing-plan',
    'brand',
    'channels',
    'sales-pipeline',
    'qspm',
    'space',
    'cpm',
    'ie',
    'ansoff',
    'grand-strategy',
    'tows',
    'strategy-review',
  ]) {
    const d = planningDefinitions[id];
    assert.ok(d, id);
    assert.ok(d.steps.length >= 3);
    assert.equal(new Set(d.steps.map((s) => s.id)).size, d.steps.length);
    assert.ok(d.steps.every((s) => s.learn && s.fields.length));
  }
  assert.equal(new Set(planningDesigns.map((d) => d.id)).size, planningDesigns.length);
});
test('business model has nine separate canvas blocks and an evidence-review card', () => {
  const r = projection.entries.find((r) => r.id === 'FW-STARTUP-BUSINESS-MODEL-CANVAS');
  assert.equal(r.steps.length, 10);
  assert.ok(r.steps.some((s) => s.id === 'evidence'));
});
test('projection reproduces without changing canonical research or enabling formulas', () => {
  assert.match(
    execFileSync(process.execPath, ['scripts/build-design-research.mjs', '--check'], {
      encoding: 'utf8',
    }),
    /64 method pages/,
  );
  assert.match(projection.scope, /not runtime knowledge promotion/);
});
test('every visible domain has an authored or researched entry and source aliases resolve', () => {
  for (const domain of projection.domains)
    assert.ok(
      projection.entries.some((r) => r.domain === domain.id) ||
        planningDesigns.some((d) => d.area === domain.id),
      domain.id,
    );
  for (const r of projection.entries)
    for (const id of r.sources)
      assert.ok(
        projection.sources.some((s) => s.id === id),
        `${r.id}: ${id}`,
      );
});
