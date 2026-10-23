import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const entries = [
  ['src/document-catalog.json', 'document-catalog.json'],
  ['docs/fixtures/efe-ife.json', 'fixtures/efe-ife.json'],
  ['docs/fixtures/contribution-margin.json', 'fixtures/contribution-margin.json'],
];
const check = process.argv.includes('--check');
for (const [source, destination] of entries) {
  const bytes = await readFile(new URL(source, root));
  const target = new URL(`apps/api/resources/${destination}`, root);
  if (check) {
    const packaged = await readFile(target);
    if (!bytes.equals(packaged))
      throw new Error(
        `Packaged resource drift: ${source}; run node scripts/sync-api-resources.mjs`,
      );
  } else {
    await mkdir(new URL('./', target), { recursive: true });
    await writeFile(target, bytes);
  }
}
console.log(`API reference resources ${check ? 'verified' : 'synchronized'}: ${entries.length}`);
