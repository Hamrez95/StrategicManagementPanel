import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateMatrix } from '../dist/evaluation-matrices.js';

const fixtures = JSON.parse(
  readFileSync(new URL('../../../docs/fixtures/efe-ife.json', import.meta.url), 'utf8'),
);

test('EFE and IFE previews match the shared golden fixtures', () => {
  for (const kind of ['efe', 'ife']) {
    const fixture = fixtures[kind];
    const output = evaluateMatrix(kind, fixture.rows);
    assert.equal(output.total_weight, fixture.expected.total_weight, kind);
    assert.ok(Math.abs(output.score - fixture.expected.score) < 1e-10, kind);
    assert.equal(output.rounded_score, fixture.expected.rounded_score, kind);
    assert.equal(output.can_finalize, fixture.expected.can_finalize, kind);
  }
});

test('incomplete evidence keeps a useful preview but blocks finalization', () => {
  const rows = structuredClone(fixtures.efe.rows);
  rows[0].evidence = '';
  const output = evaluateMatrix('efe', rows);
  assert.equal(output.ready, true);
  assert.equal(output.rounded_score, 2.82);
  assert.equal(output.can_finalize, false);
  assert.ok(output.issues.some((issue) => issue.code === 'evidence_required'));
});

test('weight totals and IFE factor ratings fail closed', () => {
  const efe = structuredClone(fixtures.efe.rows);
  efe[0].weight = 14;
  assert.equal(evaluateMatrix('efe', efe).score, null);

  const ife = structuredClone(fixtures.ife.rows);
  ife[0].rating = 2;
  const output = evaluateMatrix('ife', ife);
  assert.equal(output.score, null);
  assert.ok(output.issues.some((issue) => issue.code === 'ife_rating_mismatch'));
});

test('the documented strict weight tolerance accepts below-boundary drift only', () => {
  const accepted = structuredClone(fixtures.efe.rows);
  accepted[0].weight += 0.0005;
  assert.equal(evaluateMatrix('efe', accepted).ready, true);
  const rejected = structuredClone(fixtures.efe.rows);
  rejected[0].weight += 0.001;
  assert.equal(evaluateMatrix('efe', rejected).ready, false);
  assert.equal(evaluateMatrix('efe', rejected).score, null);
});

test('the midpoint is interpreted as the scale center, not success', () => {
  const rows = [
    {
      id: 'mid',
      title: 'Balanced factor',
      factor_type: 'opportunity',
      weight: 50,
      rating: 2,
      evidence: 'source',
    },
    {
      id: 'mid-2',
      title: 'Second factor',
      factor_type: 'threat',
      weight: 50,
      rating: 3,
      evidence: 'source',
    },
  ];
  // Ratings are integers, so the score itself may land exactly on 2.5 through weighted inputs.
  const output = evaluateMatrix('efe', rows);
  assert.equal(output.interpretation, 'at_midpoint');
  assert.ok(output.limitations.includes('midpoint_is_not_success_threshold'));
});
