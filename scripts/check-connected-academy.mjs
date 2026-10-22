import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const manifest = await read('docs/learning-design/handoff/manifest.json');
const catalog = await read('apps/web/public/academy-content/catalog.json');
const references = await read(manifest.reference_visuals.path);
assert.deepEqual(
  catalog.courses.map((c) => c.id),
  manifest.courses.map((c) => c.id),
);
assert.equal(catalog.production_ready, false);
const seen = new Set();
let lessons = 0,
  cards = 0,
  reviews = 0,
  questions = 0;
function noKeys(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert(
      !['answer', 'correct_option_id', 'feedback', 'solution', 'rubric'].includes(key),
      `Assessment key in public projection: ${key}`,
    );
    noKeys(child);
  }
}
async function unit(source, kind) {
  assert(!seen.has(source.id), `Duplicate unit: ${source.id}`);
  seen.add(source.id);
  const projection = await read(`apps/web/public/academy-content/${source.id}.json`);
  noKeys(projection);
  assert.equal(projection.kind, kind);
  assert.deepEqual(
    projection.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: q.options,
      origin_question_id: q.origin_question_id,
      equivalence_group: q.equivalence_group,
    })),
    source.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: q.options.map(({ id, text }) => ({ id, text })),
      origin_question_id: q.origin_question_id,
      equivalence_group: q.equivalence_group,
    })),
  );
  questions += source.questions.length;
  if (kind === 'lesson') {
    lessons++;
    cards += source.learning_cards.length;
    assert.deepEqual(projection.learning_cards, source.learning_cards);
    assert.equal(projection.reference_visual_revision, manifest.reference_visuals.sha256);
    const expectedReferences = references.placements
      .filter((p) => p.lesson_id === source.id)
      .map((p) => ({
        ...references.visuals.find((v) => v.id === p.visual_id),
        card_id: p.card_id,
      }));
    assert.deepEqual(projection.reference_visuals, expectedReferences);
    for (const visual of projection.reference_visuals) {
      assert(source.learning_cards.some((card) => card.id === visual.card_id));
      assert(visual.creator && visual.source_url && visual.locator);
      if (visual.asset_ref) {
        assert(visual.license && visual.license_url && visual.changes);
        const name = visual.asset_ref.split('/').at(-1);
        assert.deepEqual(
          await readFile(`apps/web/public/academy-content/media/${name}`),
          await readFile(`docs/learning-design/content/media/${name}`),
        );
      }
    }
    for (const key of [
      'objective',
      'source_links',
      'source_note',
      'glossary',
      'media_plan',
      'reflection_prompt',
    ])
      assert.deepEqual(projection[key], source[key]);
    if (source.practice_activity)
      for (const key of ['type', 'prompt', 'unit', 'expected_output'])
        assert.deepEqual(projection.practice_activity[key], source.practice_activity[key]);
  } else reviews++;
}
for (const ref of manifest.courses) {
  const course = await read(ref.path);
  const projection = catalog.courses.find((c) => c.id === ref.id);
  assert.deepEqual(
    projection.stages.map((s) => [s.id, s.color_token, s.lessons.map((l) => l.id)]),
    course.stages.map((s) => [s.id, s.color_token, s.lessons.map((l) => l.id)]),
  );
  for (const stage of course.stages) {
    for (const lesson of stage.lessons) await unit(lesson, 'lesson');
    if (stage.checkpoint?.questions?.length) await unit(stage.checkpoint, 'stage_review');
  }
  if (course.final_assessment?.questions?.length)
    await unit(course.final_assessment, 'final_review');
}
for (const media of manifest.media)
  await access(`apps/web/public/academy-content/media/${media.path.split('/').at(-1)}`);
for (const font of manifest.typography)
  assert.deepEqual(
    await readFile(`apps/web/public/${font.path.slice('public/'.length)}`),
    await readFile(font.path),
  );
assert.deepEqual([lessons, cards, reviews, questions], [592, 5958, 191, 4549]);
console.log(
  `Full projection verified: ${catalog.courses.length} courses, ${lessons} lessons, ${cards} unchanged cards, ${reviews} reviews, ${questions} questions, ${manifest.media.length} media assets, ${references.placements.length} reference placements. No assessment keys in public JSON.`,
);
