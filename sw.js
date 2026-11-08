// Minimal service worker: precache the app shell, serve cache-first, fall back to network.
// Bump VERSION whenever files change so that old caches are dropped.
const VERSION = 'v107';
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
  './js/lib/sfx.js',
  './js/lib/words.js',
  './js/lib/songs.js',
  './js/lib/objections.js',
  './js/ui/dom.js',
  './js/ui/paint.js',
  './js/ui/keyboard.js',
  './js/ui/timer.js',
  './js/ui/handoff.js',
  './js/ui/clip.js',
  './js/ui/artist-pick.js',
  './js/ui/scoreboard.js',
  './js/ui/next.js',
  './js/ui/disputes.js',
  './js/net/transport.js',
  './js/net/peer.js',
  './js/net/icetest.js',
  './js/net/turn-config.js',
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
  './games/bilanco.js',
  './games/hedef-sayi.js',
  './games/okey.js',
  './games/domino.js',
  './games/go.js',
  './games/altmisalti.js',
  './games/dogruluk-cesaret.js',
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
  './games/sarki-suresi.js',
  './games/sarkiyi-bil.js',
  './data/questions.json',
  './data/trivia.json',
  './data/tabu.json',
  './data/dogruluk.json',
  './data/sarkilar.json',
  './data/common-tr.json',
  './data/words-tr.txt',
  './icons/icon.svg',
  './img/chess/wk.svg',
  './img/chess/wq.svg',
  './img/chess/wr.svg',
  './img/chess/wb.svg',
  './img/chess/wn.svg',
  './img/chess/wp.svg',
  './img/chess/bk.svg',
  './img/chess/bq.svg',
  './img/chess/br.svg',
  './img/chess/bb.svg',
  './img/chess/bn.svg',
  './img/chess/bp.svg',
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
  './tests/bilanco.test.js',
  './tests/hedef-sayi.test.js',
  './tests/okey.test.js',
  './tests/domino.test.js',
  './tests/go.test.js',
  './tests/altmisalti.test.js',
  './tests/dogruluk-cesaret.test.js',
  './tests/sarki-suresi.test.js',
  './tests/songs.test.js',
  './tests/sarkiyi-bil.test.js',
  './tests/icetest.test.js',
  './tests/turn.test.js',
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

// A JavaScript answer from our own origin (a captive-portal login page is HTML with status 200).
const isScript = (res) => !!res && res.ok && res.type === 'basic' && /javascript|ecmascript/i.test(res.headers.get('content-type') || '');

// Network-first with the cache as the safety net. The file sits in a static import chain
// (app.js -> peer.js -> turn-config.js), so a missing answer would leave the whole app blank:
// a fresh copy is stored for later, and after waitMs the stored copy is served instead.
async function freshFirst(request, waitMs = 4000) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request, { cache: 'no-store' }).then((res) => {
    if (isScript(res)) cache.put(request, res.clone()).catch(() => { /* quota or shutdown: nothing to do */ });
    return res;
  });
  if (!cached) return fresh; // nothing stored yet (first run): the network is the only source
  const timer = new Promise((resolve) => setTimeout(() => resolve(null), waitMs));
  const res = await Promise.race([fresh.catch(() => null), timer]);
  return isScript(res) ? res : cached;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return; // never touch third-party requests (PeerJS, etc.)
  // the relay settings file is edited by hand on GitHub and must take effect on the next load
  // without a new version: fresh copy first, the stored copy when the network is slow or down
  if (url.pathname.endsWith('/js/net/turn-config.js')) {
    event.respondWith(freshFirst(request));
    return;
  }
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
