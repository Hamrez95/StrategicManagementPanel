const CACHE = 'strategy-prototype-v2';
const ASSETS = ['/', '/index.html', '/src/app.js', '/src/data.js', '/src/calculations.js', '/src/charts.js', '/src/styles.css', '/src/appearance.js', '/src/preferences.js', '/src/i18n.js', '/src/translations.js', '/src/tours.js', '/src/illustrations.js', '/assets/vazirmatn.woff2', '/assets/icon.svg', '/assets/icon-192.png', '/assets/icon-512.png', '/manifest.webmanifest', '/manifest-en.webmanifest'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('strategy-prototype-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === 'navigate' ? caches.match('/index.html') : Response.error()))));
});
