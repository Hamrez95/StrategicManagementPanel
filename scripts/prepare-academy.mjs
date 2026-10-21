import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const manifest = await read('docs/learning-design/handoff/manifest.json');
const catalog = await read('docs/learning-design/catalog.v1.json');
const out = resolve(root, 'apps/web/public/academy-content');
if (relative(resolve(root, 'apps/web/public'), out) !== 'academy-content')
  throw new Error('Invalid output directory');
for (const item of [
  ...manifest.courses,
  manifest.catalog,
  ...manifest.media,
  ...manifest.typography,
  manifest.locales,
]) {
  const bytes = await readFile(resolve(root, item.path));
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  if (
    hash(bytes) !== item.sha256 &&
    hash(bytes.toString('utf8').replaceAll('\r\n', '\n')) !== item.sha256
  )
    throw new Error(
      `Handoff hash mismatch: ${item.path}. Rebuild the manifest from the source first.`,
    );
}
// Assessment feedback and keys never enter a browser asset. Teaching examples stay intact.
const sourceCourses = new Map(
  await Promise.all(manifest.courses.map(async (ref) => [ref.id, await read(ref.path)])),
);
const cardOwners = new Map(
  [...sourceCourses.values()].flatMap((course) =>
    course.stages.flatMap((stage) =>
      stage.lessons.flatMap((lesson) => lesson.learning_cards.map((card) => [card.id, lesson.id])),
    ),
  ),
);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const publicQuestion = (q) => ({
  id: q.id,
  version: q.version,
  type: q.type,
  prompt: q.prompt,
  options: q.options.map(({ id, text }) => ({ id, text })),
  origin_question_id: q.origin_question_id,
  equivalence_group: q.equivalence_group,
  remediation_lesson_id: q.remediation_lesson_id ?? cardOwners.get(q.remediation_card_id),
  remediation_card_id: q.remediation_card_id,
  remediation_scope: q.remediation_scope,
});
const index = {
  version: catalog.curriculum_version,
  language: 'fa',
  direction: 'rtl',
  production_ready: manifest.production_ready,
  counts: manifest.counts,
  release_followups: manifest.release_followups,
  paths: catalog.paths,
  access: catalog.access,
  courses: [],
};
let lessonCount = 0,
  reviewCount = 0,
  cardCount = 0;
const samples = new Set(['P00', 'C01', 'C08', 'C03', 'S01-C1', 'S01-C3', 'E01']);
for (const ref of manifest.courses) {
  if (process.argv.includes('--samples') && !samples.has(ref.id)) continue;
  const course = sourceCourses.get(ref.id),
    meta = catalog.courses.find((c) => c.id === course.id);
  const summary = {
    id: course.id,
    title: course.title,
    version: course.version,
    revision: ref.sha256,
    path_id: meta.path_id,
    recommended_prerequisites: meta.recommended_prerequisites,
    status: course.status,
    stages: [],
    final_review_id: course.final_assessment?.questions?.length ? course.final_assessment.id : null,
  };
  const save = async (unit) =>
    writeFile(resolve(out, `${unit.id}.json`), JSON.stringify(unit) + '\n');
  for (const stage of course.stages) {
    const stageSummary = {
      id: stage.id,
      title: stage.title,
      order: stage.order,
      color_token: stage.color_token,
      lessons: [],
      review_id: stage.checkpoint?.id,
    };
    for (const lesson of stage.lessons) {
      const unit = {
        ...lesson,
        kind: 'lesson',
        course_id: course.id,
        course_title: course.title,
        stage_id: stage.id,
        revision: ref.sha256,
        questions: lesson.questions.map(publicQuestion),
      };
      if (lesson.practice_activity) {
        const {
          type,
          prompt,
          unit: unitLabel,
          expected_output,
          auto_grade,
        } = lesson.practice_activity;
        unit.practice_activity = { type, prompt, unit: unitLabel, expected_output, auto_grade };
      }
      await save(unit);
      lessonCount++;
      cardCount += lesson.learning_cards.length;
      stageSummary.lessons.push({
        id: lesson.id,
        title: lesson.title,
        objective: lesson.objective,
        suggested_minutes: lesson.suggested_minutes,
        free_sample: stageSummary.order === 1 && stageSummary.lessons.length === 0,
      });
    }
    if (stage.checkpoint?.questions?.length) {
      await save({
        ...stage.checkpoint,
        kind: 'stage_review',
        course_id: course.id,
        stage_id: stage.id,
        course_title: course.title,
        revision: ref.sha256,
        title: `مرور ${stage.title}`,
        learning_cards: [],
        questions: stage.checkpoint.questions.map(publicQuestion),
      });
      reviewCount++;
    }
    summary.stages.push(stageSummary);
  }
  if (course.final_assessment?.questions?.length) {
    await save({
      ...course.final_assessment,
      kind: 'final_review',
      title: `مرور پایانی ${course.title}`,
      course_id: course.id,
      course_title: course.title,
      revision: ref.sha256,
      learning_cards: [],
      questions: course.final_assessment.questions.map(publicQuestion),
    });
    reviewCount++;
  }
  index.courses.push(summary);
}
await writeFile(resolve(out, 'catalog.json'), JSON.stringify(index) + '\n');
await cp(resolve(root, 'docs/learning-design/content/media'), resolve(out, 'media'), {
  recursive: true,
});
await cp(resolve(root, 'public/typography'), resolve(root, 'apps/web/public/typography'), {
  recursive: true,
});
console.log(
  `Academy: ${index.courses.length} courses, ${lessonCount} lessons, ${cardCount} cards, ${reviewCount} reviews; ${manifest.media.length} SVG assets. Keys stay server-side.`,
);
