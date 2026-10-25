// Minimal service worker: precache the app shell, serve cache-first, fall back to network.
// Bump VERSION whenever files change so that old caches are dropped.
const VERSION = 'v67';
const CACHE = `oyun-gecesi-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/session.js',
  './js/version.js',
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
  './games/adam-asmaca.js',
  './games/harf-avi.js',
  './games/kelime-turetme.js',
  './games/isim-sehir.js',
  './games/yalanci-zar.js',
  './games/zar-pokeri.js',
  './games/sekizler.js',
  './games/poker.js',
  './games/kizma-birader.js',
  './games/hedef-sayi.js',
  './games/okey.js',
  './games/domino.js',
  './games/go.js',
  './games/kelime-tahtasi.js',
  './games/tabu.js',
  './games/beni-tani.js',
  './games/dort-baglanti.js',
  './games/reversi.js',
  './games/bes-tas.js',
  './games/hex.js',
  './games/dokuz-tas.js',
  './games/xox.js',
  './games/noktalar-kutular.js',
  './games/amiral-batti.js',
  './games/tavla.js',
  './games/satranc.js',
  './games/genel-kultur.js',
  './games/hesap-yarisi.js',
  './games/renk-tuzagi.js',
  './games/hafiza-dizisi.js',
  './games/bilardo.js',
  './games/hafiza.js',
  './games/tas-kagit-makas.js',
  './games/refleks.js',
  './games/mayin-tarlasi.js',
  './games/sudoku.js',
  './games/mangala.js',
  './games/dama.js',
  './games/pisti.js',
  './games/durak.js',
  './data/questions.json',
  './data/trivia.json',
  './data/tabu.json',
  './data/common-tr.json',
  './data/words-tr.txt',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './README.md',
  './data/LICENSES.md',
  './tests/index.html',
  './tests/runner.js',
  './tests/all.js',
  './tests/node.mjs',
  './tests/tr.test.js',
  './tests/version.test.js',
  './tests/syllabify.test.js',
  './tests/rng.test.js',
  './tests/session.test.js',
  './tests/son-hece.test.js',
  './tests/sudoku.test.js',
  './tests/gizli-kelime.test.js',
  './tests/beni-tani.test.js',
  './tests/bes-tas.test.js',
  './tests/adam-asmaca.test.js',
  './tests/amiral-batti.test.js',
  './tests/bilardo.test.js',
  './tests/dama.test.js',
  './tests/dokuz-tas.test.js',
  './tests/dort-baglanti.test.js',
  './tests/durak.test.js',
  './tests/genel-kultur.test.js',
  './tests/hafiza.test.js',
  './tests/hafiza-dizisi.test.js',
  './tests/harf-avi.test.js',
  './tests/hesap-yarisi.test.js',
  './tests/hex.test.js',
  './tests/kelime-turetme.test.js',
  './tests/isim-sehir.test.js',
  './tests/yalanci-zar.test.js',
  './tests/zar-pokeri.test.js',
  './tests/sekizler.test.js',
  './tests/poker.test.js',
  './tests/kizma-birader.test.js',
  './tests/hedef-sayi.test.js',
  './tests/okey.test.js',
  './tests/domino.test.js',
  './tests/go.test.js',
  './tests/kelime-tahtasi.test.js',
  './tests/mangala.test.js',
  './tests/mayin-tarlasi.test.js',
  './tests/noktalar-kutular.test.js',
  './tests/pisti.test.js',
  './tests/refleks.test.js',
  './tests/renk-tuzagi.test.js',
  './tests/satranc.test.js',
  './tests/reversi.test.js',
  './tests/tabu.test.js',
  './tests/tas-kagit-makas.test.js',
  './tests/tavla.test.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' bypasses the HTTP cache so a VERSION bump really fetches new files;
      // one missing file must not break the whole install, so files are added one by one
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })))))
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
    // an invite link (?oda=KOD) is the same app shell
    caches.match(request, request.mode === 'navigate' ? { ignoreSearch: true } : undefined).then((cached) => {
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
