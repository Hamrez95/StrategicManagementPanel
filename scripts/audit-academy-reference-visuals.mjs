// Full-curriculum candidate audit. A mention alone does not justify adding a model to a lesson.
import { readFile, writeFile } from 'node:fs/promises';
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const manifest = await read('docs/learning-design/handoff/manifest.json');
const registry = await read(manifest.reference_visuals.path);
const patterns = {
  bmc: /Business Model Canvas|بوم مدل کسب/iu,
  lean: /Lean Canvas|بوم ناب/iu,
  swot: /\bSWOT\b/u,
  tows: /\bTOWS\b/u,
  pestel: /\bPESTEL\b/u,
  'five-forces': /پنج نیرو|Five Forces/iu,
  vrio: /\bVRIO\b/u,
  'value-chain': /زنجیره[ٔ‌ ]+ارزش|Value Chain/iu,
  ansoff: /Ansoff|آنسوف/iu,
  bcg: /\bBCG\b/u,
  ge: /\bGE\b.{0,12}(?:McKinsey|ماتریس|مک)|ماتریس GE|GE–McKinsey/iu,
  bsc: /Balanced Scorecard|کارت امتیازی متوازن|\bBSC\b/iu,
  raci: /\bRACI\b/u,
  fishbone: /Ishikawa|Fishbone|ایشیکاوا|استخوان ماهی/iu,
  pareto: /Pareto|پارتو/iu,
  pdsa: /\bPDSA\b/u,
  ie: /ماتریس IE/iu,
  qspm: /\bQSPM\b/u,
  vpc: /Value Proposition Canvas|بوم ارزش پیشنهادی/iu,
  // These are searched too: do not invent lessons for absent models.
  smart: /\bSMART\b/u,
  pdca: /\bPDCA\b/u,
  sipoc: /\bSIPOC\b/u,
  dmaic: /\bDMAIC\b/u,
  gantt: /Gantt|گانت/iu,
  maslow: /Maslow|مزلو/iu,
  kotter: /Kotter|کاتر/iu,
  tuckman: /Tuckman|تاکمن/iu,
};
const candidates = [];
let lessons = 0;
for (const ref of manifest.courses) {
  const course = await read(ref.path);
  for (const stage of course.stages)
    for (const lesson of stage.lessons) {
      lessons++;
      for (const [model_id, re] of Object.entries(patterns)) {
        const cards = lesson.learning_cards.filter((card) => re.test(`${card.title} ${card.text}`));
        if (!cards.length) continue;
        const placements = registry.placements.filter(
          (p) => p.lesson_id === lesson.id && p.visual_id === model_id,
        );
        candidates.push({
          model_id,
          lesson_id: lesson.id,
          title: lesson.title,
          mention_card_ids: cards.map((c) => c.id),
          status: placements.length ? 'connected' : 'contextual_mention_not_expanded',
          placement_card_ids: placements.map((p) => p.card_id),
        });
      }
    }
}
const report = {
  scope: {
    courses: manifest.courses.length,
    lessons,
    search:
      'named frameworks in all learning-card titles and text; manual placements, not automatic keyword insertion',
  },
  counts: {
    models: registry.visuals.length,
    embedded_models: registry.visuals.filter((v) => v.asset_ref).length,
    original_figures: registry.visuals.filter((v) => v.kind === 'publisher_original').length,
    placements: registry.placements.length,
    lessons_with_references: new Set(registry.placements.map((p) => p.lesson_id)).size,
  },
  candidates,
  followups: registry.followups,
};
await writeFile(
  'docs/learning-design/REFERENCE_VISUAL_AUDIT.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify({ scope: report.scope, counts: report.counts }));
