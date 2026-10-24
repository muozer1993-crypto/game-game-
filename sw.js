// Minimal service worker: precache the app shell, serve cache-first, fall back to network.
// Bump VERSION whenever files change so that old caches are dropped.
const VERSION = 'v2';
const CACHE = `oyun-gecesi-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/session.js',
  './js/lib/tr.js',
  './js/lib/syllabify.js',
  './js/lib/rng.js',
  './js/lib/storage.js',
  './js/lib/words.js',
  './js/ui/dom.js',
  './js/ui/keyboard.js',
  './js/ui/timer.js',
  './js/ui/handoff.js',
  './js/ui/scoreboard.js',
  './js/net/transport.js',
  './js/net/peer.js',
  './vendor/peerjs.min.js',
  './games/index.js',
  './games/son-hece.js',
  './games/gizli-kelime.js',
  './games/gizli-sayi.js',
  './games/beni-tani.js',
  './data/questions.json',
  './data/common-tr.json',
  './data/words-tr.txt',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './README.md',
  './tests/index.html',
  './tests/runner.js',
  './tests/all.js',
  './tests/node.mjs',
  './tests/tr.test.js',
  './tests/syllabify.test.js',
  './tests/rng.test.js',
  './tests/session.test.js',
  './tests/son-hece.test.js',
  './tests/gizli-kelime.test.js',
  './tests/beni-tani.test.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' bypasses the HTTP cache so a VERSION bump really fetches new files
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return; // never touch third-party requests (PeerJS, etc.)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => {
        // Offline and not cached: only the app shell itself falls back to index.html.
        const scope = new URL('./', self.registration.scope).pathname;
        const path = url.pathname;
        if (request.mode === 'navigate' && (path === scope || path === `${scope}index.html`)) return caches.match('./index.html');
        return Response.error();
      });
    }),
  );
});
