import assert from 'node:assert/strict';
import test from 'node:test';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv';

// Synthetic fixtures only. These tests validate the design contract, not authorization.
const spec = await SwaggerParser.dereference('docs/api/openapi.json');
const ajv = new Ajv({ strict: false, validateFormats: false });
const check = (name, value) => ajv.compile(spec.components.schemas[name])(value);
const workspace = {
  id: 'project-a',
  owner_id: 'user-a',
  billing_account_id: 'bill-a',
  name: 'پروژه آزمایش',
  revision: 1,
  archived_at: null,
};

test('Workspace ownership, billing and revision are mandatory', () => {
  assert.equal(check('Workspace', workspace), true);
  for (const field of ['owner_id', 'billing_account_id', 'revision']) {
    const incomplete = { ...workspace };
    delete incomplete[field];
    assert.equal(check('Workspace', incomplete), false);
  }
  assert.equal(check('Workspace', { ...workspace, revision: 0 }), false);
});
test('write payload cannot choose its owner or another Workspace', () => {
  assert.equal(check('WorkspaceCreate', { name: 'آزمایش' }), true);
  assert.equal(check('WorkspaceCreate', { name: 'آزمایش', owner_id: 'other' }), false);
  const analysis = {
    revision: 1,
    kind: 'efe',
    schema_version: 1,
    method_version: 'efe-v1',
    inputs: { rows: [] },
    state: 'draft',
  };
  assert.equal(check('AnalysisWrite', analysis), true);
  assert.equal(check('AnalysisWrite', { ...analysis, workspace_id: 'other' }), false);
  assert.equal(check('AnalysisWrite', { ...analysis, kind: 'unregistered' }), false);
  // Kind-specific totals/evidence and cross-record permissions belong to server validation.
});
test('EFE/IFE drafts have bounded, typed factor snapshots', () => {
  const row = {
    id: 'r1',
    title: '',
    factor_type: 'opportunity',
    weight: null,
    rating: null,
    evidence: '',
  };
  assert.equal(check('EvaluationMatrixInputs', { rows: [row] }), true);
  assert.equal(check('EvaluationMatrixInputs', { rows: [] }), true);
  for (const invalid of [
    { ...row, weight: -1 },
    { ...row, weight: 101 },
    { ...row, rating: 2.5 },
    { ...row, factor_type: 'other' },
    { ...row, workspace_id: 'other' },
  ])
    assert.equal(check('EvaluationMatrixInputs', { rows: [invalid] }), false);
  assert.equal(check('EvaluationMatrixInputs', { rows: Array(101).fill(row) }), false);
});
test('weighted matrix row rejects invalid ratings, weights and extra fields', () => {
  const row = { id: 'r1', title: 'عامل نمونه', weight: 50, rating: 3 };
  assert.equal(check('WeightedInputs', { rows: [row] }), true);
  for (const invalid of [
    { ...row, rating: 5 },
    { ...row, rating: 2.5 },
    { ...row, weight: -1 },
    { ...row, weight: 101 },
    { ...row, workspace_id: 'other' },
  ])
    assert.equal(check('WeightedInputs', { rows: [invalid] }), false);
  assert.equal(check('WeightedInputs', { rows: [] }), false);
});
test('payment amounts are nonnegative integer rial and states are explicit', () => {
  const payment = {
    id: 'pay-a',
    billing_account_id: 'bill-a',
    amount_rial: 10000,
    state: 'pending',
  };
  assert.equal(check('PaymentAttempt', payment), true);
  for (const value of [-1, 1.5, '10000'])
    assert.equal(check('PaymentAttempt', { ...payment, amount_rial: value }), false);
  assert.equal(check('PaymentAttempt', { ...payment, state: 'success-ish' }), false);
});
test('session contract rejects fake authentication and private object keys', () => {
  const session = {
    authenticated: true,
    user: { id: 'user-a', name: 'مدیر', is_staff: false },
    workspaces: [{ id: 'project-a', name: 'آزمایش', role: 'owner' }],
  };
  assert.equal(check('Session', session), true);
  assert.equal(check('Session', { ...session, authenticated: false }), false);
  assert.equal(check('Session', { ...session, token: 'secret' }), false);
  const file = {
    id: 'file-a',
    workspace_id: 'project-a',
    document_id: 'doc-a',
    revision: 1,
    created_at: '2026-10-14T00:00:00Z',
    updated_at: '2026-10-14T00:00:00Z',
    name: 'sample.pdf',
    size_bytes: 123,
    scan_state: 'pending',
  };
  assert.equal(check('Attachment', file), true);
  assert.equal(check('Attachment', { ...file, object_key: 'private/path' }), false);
});
