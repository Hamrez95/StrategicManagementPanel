import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { validateAcademyLessons } from '../packages/domain/dist/academy.js';
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const curriculum = read('assets/academy/curriculum.json');
const { sources } = read('assets/academy/sources.json');
const sourceIds = new Set(sources.map((source) => source.id));
const byId = new Map(curriculum.modules.map((module) => [module.id, module]));
assert.equal(byId.size, curriculum.modules.length, 'unique module IDs');
assert.equal(curriculum.tracks.length, 12);
assert.equal(curriculum.levels.length, 5);
assert.equal(curriculum.modules.length, 60);
assert.equal(sourceIds.size, sources.length);
const visited = new Set(),
  visiting = new Set();
function visit(id) {
  assert.ok(byId.has(id), `missing prerequisite ${id}`);
  assert.ok(!visiting.has(id), `cycle at ${id}`);
  if (visited.has(id)) return;
  visiting.add(id);
  for (const dependency of byId.get(id).prerequisites) visit(dependency);
  visiting.delete(id);
  visited.add(id);
}
for (const module of curriculum.modules) {
  assert.ok(module.objective && module.artifact && module.chapters.length);
  assert.ok(curriculum.tracks.some((track) => track.id === module.track));
  assert.ok(curriculum.levels.some((level) => level.id === module.level));
  assert.equal(module.status, 'planned');
  assert.equal(module.reviewStatus, 'not_expert_reviewed');
  assert.ok(module.sourceRefs.every((id) => sourceIds.has(id)));
  visit(module.id);
}
for (const source of sources) {
  assert.ok(source.url.startsWith('https://') && source.sections && source.inspectedAt);
  assert.equal(source.expertReview, 'pending');
}
// Compile the authored content in memory and resolve only its three explicit imports.
const original = readFileSync('apps/web/src/features/academy/content.ts', 'utf8');
const transpiled = ts
  .transpileModule(original, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  .outputText.replace(/import .* from '@stratino\/domain\/academy';\n/, '')
  .replace(/import curriculum from .*;\n/, `const curriculum = ${JSON.stringify(curriculum)};\n`)
  .replace(
    /import sourceRegistry from .*;\n/,
    `const sourceRegistry = ${JSON.stringify({ sources })};\n`,
  )
  .replace('validateAcademyLessons(academyLessons);', '');
const { academyLessons } = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`
);
validateAcademyLessons(academyLessons);
for (const lesson of academyLessons) {
  assert.equal(lesson.reviewStatus, 'draft');
  assert.ok(lesson.sourceRefs.every((id) => sourceIds.has(id)));
  assert.ok(lesson.scene && lesson.teaching && lesson.artifactPrompt && lesson.diagram.length);
}
assert.equal(academyLessons.length, 6);
const tasks = read('docs/academy/tasks.json');
assert.equal(tasks.length, 18);
for (const task of tasks)
  assert.ok(task.dependencies.every((id) => tasks.some((other) => other.id === id)));
console.log(
  'Academy: 60 planned modules, acyclic prerequisites, 6 draft lessons, 6 inspected source mappings, 18 linked tasks validated.',
);
