import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completedPractice,
  emptyPractice,
  gradePractice,
  lessonAvailability,
  parsePractice,
  recordPractice,
  validateAcademyLessons,
} from '../dist/academy.js';
const a = {
  id: 'a',
  version: 1,
  title: 'A',
  objective: 'test',
  prerequisites: [],
  sourceRefs: ['source'],
  reviewStatus: 'draft',
  questions: [
    {
      id: 'q',
      prompt: 'question',
      choices: [
        { id: 'yes', text: 'Yes' },
        { id: 'no', text: 'No' },
      ],
      correctChoiceId: 'yes',
      explanation: 'why',
    },
  ],
};
const b = { ...a, id: 'b', prerequisites: ['a'] };
const lessons = [a, b];
test('prerequisite gate blocks direct attempts and unknown routes', () => {
  assert.equal(lessonAvailability('b', lessons, emptyPractice()), 'locked');
  assert.equal(lessonAvailability('absent', lessons, emptyPractice()), 'missing');
  assert.throws(() => recordPractice(b, lessons, emptyPractice(), { q: 'yes' }));
});
test('incomplete, extra, prototype-inherited and unknown answers never pass', () => {
  for (const answers of [
    {},
    { q: 'yes', other: 'yes' },
    { q: 'invented' },
    Object.create({ q: 'yes' }),
  ]) {
    assert.equal(gradePractice(a, answers).valid, false);
    assert.equal(gradePractice(a, answers).passed, false);
  }
});
test('passing answers unlock next lesson and retries do not erase success', () => {
  const first = recordPractice(a, lessons, emptyPractice(), { q: 'yes' });
  assert.equal(lessonAvailability('b', lessons, first), 'available');
  assert.equal(lessonAvailability('a', lessons, first), 'completed');
  const retry = recordPractice(a, lessons, first, { q: 'no' });
  assert.deepEqual(retry, first);
  const all = recordPractice(b, lessons, retry, { q: 'yes' });
  assert.equal(completedPractice(lessons, all).size, 2);
});
test('repeated success does not accumulate reward-bearing attempt copies', () => {
  let state = emptyPractice();
  for (let i = 0; i < 20; i++) state = recordPractice(a, lessons, state, { q: 'yes' });
  assert.equal(state.attempts.length, 1);
});
test('tampered stored percent/completion and stale versions are ignored', () => {
  const state = parsePractice(
    JSON.stringify({
      schemaVersion: 1,
      completed: ['a', 'b'],
      attempts: [
        { lessonId: 'a', version: 0, answers: { q: 'yes' }, percent: 100 },
        { lessonId: 'b', version: 1, answers: { q: 'yes' } },
      ],
    }),
  ).state;
  assert.equal(completedPractice(lessons, state).size, 0);
});
test('corrupt state, unsupported versions and non-string answers recover explicitly', () => {
  for (const raw of [
    '{',
    'null',
    '[]',
    '{"schemaVersion":2,"attempts":[]}',
    '{"schemaVersion":1,"attempts":[{"lessonId":"a","version":1,"answers":{"q":true}}]}',
  ]) {
    const parsed = parsePractice(raw);
    assert.equal(parsed.invalid, true);
    assert.deepEqual(parsed.state, emptyPractice());
  }
  assert.equal(parsePractice(null).invalid, false);
});
test('cycles, unknown prerequisites and duplicate IDs are rejected', () => {
  for (const invalid of [
    [a, a],
    [{ ...a, prerequisites: ['missing'] }],
    [{ ...a, prerequisites: ['b'] }, b],
  ])
    assert.throws(() => validateAcademyLessons(invalid));
  validateAcademyLessons(lessons);
});
test('empty questions, missing sources and corrupt answer keys are rejected', () => {
  for (const invalid of [
    { ...a, questions: [] },
    { ...a, sourceRefs: [] },
    { ...a, version: NaN },
    { ...a, questions: [{ ...a.questions[0], correctChoiceId: 'absent' }] },
  ])
    assert.throws(() => validateAcademyLessons([invalid]));
});
test('percent threshold is a practice policy and fails when below 80 percent', () => {
  const lesson = {
    ...a,
    questions: Array.from({ length: 5 }, (_, i) => ({ ...a.questions[0], id: String(i) })),
  };
  assert.equal(
    gradePractice(lesson, { 0: 'yes', 1: 'yes', 2: 'yes', 3: 'yes', 4: 'no' }).passed,
    true,
  );
  assert.equal(
    gradePractice(lesson, { 0: 'yes', 1: 'yes', 2: 'yes', 3: 'no', 4: 'no' }).passed,
    false,
  );
});
test('out-of-order curriculum listing still resolves dependency closure', () => {
  const state = {
    schemaVersion: 1,
    attempts: [
      { lessonId: 'a', version: 1, answers: { q: 'yes' } },
      { lessonId: 'b', version: 1, answers: { q: 'yes' } },
    ],
  };
  assert.equal(completedPractice([b, a], state).size, 2);
});
