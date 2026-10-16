import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(
  new URL('../apps/web/src/features/experience/model.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  freshDraft,
  createSpace,
  changeGoal,
  recommendedTools,
  sampleSpaces,
  updateSpace,
  isSpace,
} = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('new businesses start empty; stage stays self-reported and unknown is preserved', () => {
  const space = createSpace({ ...freshDraft, name: '  آبان  ' }, 'a');
  assert.equal(space.name, 'آبان');
  assert.equal(space.stage, 'unknown');
  assert.deepEqual(space.actions, []);
  assert.deepEqual(space.notes, []);
  assert.deepEqual(space.toolNotes, {});
  assert.equal(space.sample, false);
  assert.throws(() => createSpace({ ...freshDraft, name: ' ' }, 'b'));
});
test('objective changes invalidate only the objective-specific answer', () => {
  const original = { ...freshDraft, name: 'آبان', answer: 'شاهد', stage: 'operating' };
  const changed = changeGoal(original, 'growth');
  assert.equal(changed.answer, '');
  assert.equal(changed.stage, 'operating');
  assert.equal(changed.name, 'آبان');
  assert.equal(changeGoal(original, 'customers').answer, 'شاهد');
});
test('initial shortcuts follow the chosen objective, not a fabricated maturity score', () => {
  assert.deepEqual(recommendedTools({ goal: 'growth' }), ['finance', 'retention', 'market']);
  assert.equal(recommendedTools({ goal: 'strategy' }).length, 3);
});
test('editing one business preserves another business and existing records', () => {
  const spaces = sampleSpaces();
  const before = structuredClone(spaces);
  const result = updateSpace(spaces, 'sample-idea', (space) => ({ ...space, name: 'نام تازه' }));
  assert.deepEqual(result[1], before[1]);
  assert.deepEqual(result[0].actions, before[0].actions);
  assert.deepEqual(spaces, before);
});
test('local storage decoder rejects malformed records and prototype keys', () => {
  const good = createSpace({ ...freshDraft, name: 'آبان' }, 'a');
  assert.equal(isSpace(good), true);
  for (const bad of [
    null,
    {},
    { ...good, goal: '__proto__' },
    { ...good, actions: [null] },
    { ...good, notes: [null] },
    { ...good, toolNotes: { a: 4 } },
  ])
    assert.equal(isSpace(bad), false);
});
