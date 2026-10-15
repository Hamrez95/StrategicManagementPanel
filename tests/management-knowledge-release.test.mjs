import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildKnowledgeRelease, canonicalJson } from '../scripts/build-knowledge-release.mjs';

test('builds the exact reviewed first-slice allowlist from its pinned KB commit', () => {
  const release = buildKnowledgeRelease();
  assert.equal(release.release_id, 'stratino-first-slice-v1');
  assert.equal(release.schema_version, 1);
  assert.equal(release.source_kb_commit, '19bb2d40b9cb45a569c00b53a35aab3f4ea76002');
  assert.deepEqual(release.approved_ids, [
    'ACT-DISCOVERY',
    'ACT-RETENTION-BEFORE-SCALE',
    'FW-STARTUP-BUSINESS-MODEL-CANVAS',
    'FW-STARTUP-LEAN-STARTUP',
    'MET-CONTRIBUTION-MARGIN',
    'REC-DISCOVERY',
    'REC-RETENTION-BEFORE-SCALE',
    'RULE-DISCOVERY',
    'RULE-RETENTION-BEFORE-SCALE',
  ]);
  assert.deepEqual(release.source_ids, [
    'SRC-CORE-AMPLITUDE-RETENTION',
    'SRC-FINANCE-contribution',
    'SRC-STARTUP-BLANK-2010',
    'SRC-STARTUP-RIES-PRINCIPLES',
    'SRC-STARTUP-STRATEGYZER-BMC',
  ]);
  assert.equal(
    release.records['RULE-DISCOVERY'].definition.runtime_gate.status,
    'blocked_until_typed_mapping',
  );
  assert.equal(
    release.records['ACT-DISCOVERY'].definition.runtime_gate.inherited_from,
    'RULE-DISCOVERY',
  );
  assert.equal(
    release.records['RULE-RETENTION-BEFORE-SCALE'].definition.runtime_gate.status,
    'gated_by_STR-061-A',
  );
  assert.equal(
    release.records['MET-CONTRIBUTION-MARGIN'].definition.runtime_gate.status,
    'definition_only_until_STR-058-A_B',
  );
  assert.deepEqual(
    release.rejected_records.map(({ record_id }) => record_id),
    ['MET-ACTIVATION-RATE', 'PLAN-MARKET-SIZING'],
  );
  for (const record of Object.values(release.records)) {
    assert.equal(record.source_support.status, 'product_heuristic');
    assert.ok(record.source_support.refs.length > 0);
    assert.ok(!Object.hasOwn(record.definition, 'business_types'));
    assert.ok(!Object.hasOwn(record.definition, 'stages'));
  }
});

test('canonical release hash omits only the digest and sorts nested object keys', () => {
  const release = buildKnowledgeRelease();
  const { content_sha256: digest, ...unsigned } = release;
  assert.equal(digest, createHash('sha256').update(canonicalJson(unsigned)).digest('hex'));
  assert.equal(canonicalJson({ z: 1, a: { y: 2, b: 3 } }), '{"a":{"b":3,"y":2},"z":1}');
});
