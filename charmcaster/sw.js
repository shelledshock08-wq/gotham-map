// Offline support: the app shell is network-first (updates land right away),
// the MediaPipe runtime and models are cache-first (their URLs are versioned).
const SHELL_CACHE = 'charm-shell-v10';
const MODEL_CACHE = 'charm-models-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './js/app.js', './js/tracker.js', './js/toon.js', './js/charm.js', './js/body.js', './js/geom.js', './js/canonical.js', './js/capture.js',
  './icons/icon.svg', './icons/icon-192.png',
];
const IMMUTABLE = /cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@|storage\.googleapis\.com\/mediapipe-models\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== MODEL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (IMMUTABLE.test(req.url)) {
    e.respondWith(caches.open(MODEL_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (new URL(req.url).origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })),
    );
  }
});
