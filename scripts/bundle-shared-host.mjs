import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, cp, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const stratino = fileURLToPath(new URL('../', import.meta.url));
const [mazedunehPath, destinationPath, python = 'python3'] = process.argv.slice(2);
if (!mazedunehPath || !destinationPath) throw new Error('Usage: node scripts/bundle-shared-host.mjs <clean-mazeduneh-checkout> <new-output-directory> [python]');

function git(checkout, args) {
  const command = spawnSync('git', ['-C', checkout, ...args], { encoding: 'utf8' });
  if (command.status !== 0) throw new Error('Cannot read the committed release source.');
  return command.stdout.trim();
}

async function archiveSource(checkout, name, destination) {
  if (git(checkout, ['status', '--porcelain'])) throw new Error(`${name}: commit reviewed changes before bundling.`);
  const commit = git(checkout, ['rev-parse', 'HEAD']);
  const archive = join(destination, `${name}.tar`);
  git(checkout, ['archive', '--format=tar', '--output', archive, commit]);
  const target = join(destination, 'sources', name);
  await mkdir(target, { recursive: true });
  const extract = spawnSync(python, ['-c', 'import sys,tarfile; tarfile.open(sys.argv[1]).extractall(sys.argv[2],filter="data")', archive, target], { encoding: 'utf8' });
  if (extract.status !== 0) throw new Error('Safe release extraction failed; partial output is retained for inspection.');
  const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
  return { commit, digest };
}

const destination = resolve(destinationPath);
try {
  await stat(destination);
  throw new Error('Output already exists. Choose a new release directory; never overwrite a running release.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(destination, { recursive: true });
const maz = await archiveSource(resolve(mazedunehPath), 'mazeduneh', destination);
const strat = await archiveSource(stratino, 'stratino', destination);
await cp(join(destination, 'sources/stratino/infra/shared-host'), destination, { recursive: true });
await writeFile(join(destination, 'release.json'), JSON.stringify({
  schema: 1, mazeduneh: maz.commit, stratino: strat.commit,
  archives: { 'mazeduneh.tar': maz.digest, 'stratino.tar': strat.digest },
  created_at: new Date().toISOString(),
}, null, 2) + '\n');
console.log(`Prepared immutable source bundle at ${destination}. No secrets generated, images run, DNS changed or service deployed.`);
