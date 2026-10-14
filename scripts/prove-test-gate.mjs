import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

// Copy a synthetic contract fixture; never mutate implementation or customer records.
const directory = await mkdtemp(path.join(process.cwd(), '.stratino-gate-'));
try {
  const source = await readFile('tests/contracts.test.mjs', 'utf8');
  const fixture = path.join(directory, 'probe.mjs');
  const run = () => spawnSync(process.execPath, ['--test', '--test-name-pattern=Workspace ownership', fixture], { encoding: 'utf8' });
  await writeFile(fixture, source);
  const control = run(); assert.equal(control.status, 0, control.stdout + control.stderr);
  const original = "assert.equal(check('Workspace', workspace), true)";
  assert.ok(source.includes(original));
  await writeFile(fixture, source.replace(original, "assert.equal(check('Workspace', workspace), false)"));
  const broken = run(); assert.equal(broken.status, 1, broken.stdout + broken.stderr);
  assert.match(broken.stdout + broken.stderr, /AssertionError/);
  await writeFile(fixture, source);
  const restored = run(); assert.equal(restored.status, 0, restored.stdout + restored.stderr);
  console.log('PASS: unchanged fixture exit 0, deliberate schema assertion failure exit 1, restored fixture exit 0; isolated probe removed.');
} finally { await rm(directory, { recursive: true, force: true }); }
