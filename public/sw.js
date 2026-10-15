const CACHE = 'strategy-prototype-v8';
const ASSETS = ['/', '/index.html', '/src/app.js', '/src/brand.js', '/src/search.js', '/src/data.js', '/src/document-catalog.js', '/src/document-catalog.json', '/src/calculations.js', '/src/charts.js', '/src/styles.css', '/src/appearance.js', '/src/preferences.js', '/src/i18n.js', '/src/translations.js', '/src/tours.js', '/src/illustrations.js', '/assets/vazirmatn.woff2', '/assets/icon.svg', '/assets/icon-192.png', '/assets/icon-512.png', '/manifest.webmanifest', '/manifest-en.webmanifest'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('strategy-prototype-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.includes(url.pathname) || url.search) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === 'navigate' ? caches.match('/index.html') : Response.error()))));
});
