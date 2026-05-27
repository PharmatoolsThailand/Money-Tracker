const CACHE = 'moneytracker-v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/state.js',
  './js/utils.js',
  './js/logic/sheets-api.js',
  './js/logic/sync.js',
  './js/logic/calculations.js',
  './js/logic/ocr.js',
  './js/logic/planner.js',
  './js/ui-handler.js',
  './js/init.js',
  './assets/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE).catch(err => console.warn('precache partial fail', err)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Apps Script + OCR worker fetches: always live (data must be fresh)
  if (url.hostname.includes('script.google.com')) return;
  if (url.hostname.includes('tesseract')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetcher = fetch(e.request).then(resp => {
        if (resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetcher;
    })
  );
});
