import assert from 'node:assert/strict';
import test from 'node:test';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv';

// Synthetic fixtures only. These tests validate the design contract, not authorization.
const spec = await SwaggerParser.dereference('docs/api/openapi.json');
const ajv = new Ajv({ strict: false, validateFormats: false });
const check = (name, value) => ajv.compile(spec.components.schemas[name])(value);

test('document outline contract preserves bilingual arrays', async () => {
  const { default: catalog } = await import('../src/document-catalog.json', {
    with: { type: 'json' },
  });
  const validate = ajv.compile(spec.components.schemas.DocumentTemplate.properties.structure);
  for (const document of catalog.documents) {
    assert.equal(validate(document.structure), true, document.id);
  }
  assert.equal(validate({ fa: 'scalar', en: ['line'] }), false);
});
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
test('execution decisions, goals, actions and history stay explicitly linked', () => {
  const decision = {
    title: 'پایلوت بازار',
    rationale: 'سه درخواست قیمت دریافت شد.',
    assumptions: 'تحویل در شش هفته ممکن است.',
    review_trigger: 'پس از دو پایلوت.',
    status: 'approved',
    source_kind: 'analysis',
    source_id: '11111111-1111-4111-8111-111111111111',
  };
  assert.equal(check('ExecutionDecisionWrite', decision), true);
  assert.equal(
    check('ExecutionDecisionWrite', { ...decision, workspace_id: 'another-workspace' }),
    false,
  );
  const goal = { title: 'تحویل پایلوت', description: '', due_on: null, status: 'active' };
  assert.equal(check('ExecutionGoalWrite', goal), true);
  const action = {
    decision_id: '11111111-1111-4111-8111-111111111111',
    goal_id: null,
    owner_id: '22222222-2222-4222-8222-222222222222',
    title: 'اجرای پایلوت',
    description: '',
    due_on: '2026-11-14',
    status: 'planned',
  };
  assert.equal(check('ExecutionActionWrite', action), true);
  assert.equal(check('ExecutionActionWrite', { ...action, status: 'started' }), false);
  assert.equal(check('ExecutionActionUpdate', { revision: 1, status: 'blocked' }), true);
  assert.equal(check('ExecutionActionUpdate', { revision: 0, status: 'blocked' }), false);
  assert.ok(spec.paths['/api/v1/workspaces/{workspace_id}/execution/']);
  assert.ok(spec.paths['/api/v1/workspaces/{workspace_id}/execution/decisions/{record_id}/']);
  assert.ok(spec.paths['/api/v1/workspaces/{workspace_id}/execution/goals/{record_id}/']);
});
test('document library records have bounded content and explicit review metadata', () => {
  const document = {
    template_id: 'executive-onepage',
    stage: 'mvp',
    industry: 'general',
    owner_id: '11111111-1111-4111-8111-111111111111',
    reviewer_id: null,
    status: 'draft',
    content: '[Business name] helps [customer group] address [problem].',
  };
  assert.equal(check('DocumentWrite', document), true);
  assert.equal(check('DocumentWrite', { ...document, status: 'approved' }), false);
  assert.equal(check('DocumentWrite', { ...document, workspace_id: 'other' }), false);
  assert.equal(
    check('DocumentUpdate', { revision: 1, status: 'review', reviewer_id: document.owner_id }),
    true,
  );
  assert.equal(check('DocumentUpdate', { revision: 0, status: 'ready' }), false);
  assert.ok(spec.paths['/api/v1/workspaces/{workspace_id}/documents/']);
  assert.ok(spec.paths['/api/v1/workspaces/{workspace_id}/documents/{record_id}/']);
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
