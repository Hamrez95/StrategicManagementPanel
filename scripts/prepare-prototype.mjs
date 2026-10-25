import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
const destination = 'apps/web/public';
// Only remove outputs owned by this script. Keep source assets such as brand/google-g.png.
for (const generated of [
  'prototype',
  'assets',
  'src',
  'theme-init.js',
  'manifest.webmanifest',
  'manifest-en.webmanifest',
  'sw.js',
]) {
  await rm(`${destination}/${generated}`, { recursive: true, force: true });
}
await mkdir(`${destination}/prototype`, { recursive: true });
await cp('public/assets', `${destination}/assets`, { recursive: true });
await cp('src', `${destination}/src`, { recursive: true });
await cp('apps/web/boot/theme-init.js', `${destination}/theme-init.js`);
await cp('public/index.html', `${destination}/prototype/index.html`);
for (const file of ['manifest.webmanifest', 'manifest-en.webmanifest']) {
  const manifest = JSON.parse(await readFile(`public/${file}`, 'utf8'));
  manifest.id = '/prototype/';
  manifest.start_url = '/prototype/';
  manifest.scope = '/prototype/';
  await writeFile(`${destination}/${file}`, JSON.stringify(manifest, null, 2) + '\n');
}
const source = await readFile('public/sw.js', 'utf8');
await writeFile(
  `${destination}/prototype/sw.js`,
  source
    .replaceAll('strategy-prototype-', 'stratino-prototype-')
    .replaceAll("'/index.html'", "'/prototype/index.html'")
    .replace("['/',", "['/prototype/',"),
);
// Retire the previous root-scoped prototype worker without touching business records.
await writeFile(
  `${destination}/sw.js`,
  "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('strategy-prototype-')).map(k=>caches.delete(k)))).then(()=>self.registration.unregister()).then(()=>self.clients.claim())));\n",
);
console.log('Legacy prototype preserved under /prototype/ with a scoped asset-only worker.');
await import('./prepare-academy.mjs');
