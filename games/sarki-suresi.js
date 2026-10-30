// Şarkı Süresi — a song from the player's own Spotify list comes up and both players guess how
// long it is (m:ss); the guess closer to the real length takes the round. Normal mode shows the
// title; hard mode hides it and plays a ten-second clip instead.
//
// Song data: data/sarkilar.json — { weights: { artist: w }, tracks: [{ a, t, s, dz?, p?, np? }] }
//   a artist, t title, s length in seconds, p a Spotify preview url (does not expire),
//   dz a Deezer track id (its preview url is fetched when the clip is played, stored ones expire),
//   np: the song has no preview anywhere (hard mode skips it).
import { el, render as draw, toast } from '../js/ui/dom.js';
import { createKeyboard } from '../js/ui/keyboard.js';
import { createRng } from '../js/lib/rng.js';

export const CLIP_SECONDS = 10;
const ROUND_OPTIONS = [5, 10, 15];
const FAVOR_OPTIONS = ['high', 'mid', 'none'];

export const meta = {
  group: 'tanisma',
  name: 'Şarkı Süresi',
  icon: '🎵',
  description: 'Listenden bir şarkı gelir: kaç dakika sürüyor? Gerçek süreye yakın tahmin eden turu alır.',
  rules: [
    'Senin Spotify listenden bir şarkı gelir. İkiniz de şarkının kaç dakika sürdüğünü tahmin edersiniz (ör. 4:32). Gerçek süreye daha yakın olan turu alır; eşitlikte kimse puan almaz.',
    'Normal: şarkının adı ve grubu yazar. Zor: ad gizlidir, ▶ düğmesi şarkıdan 10 saniye çalar (internet gerekir); ad ancak ikiniz de tahmin edince açıklanır.',
    'Tek telefonda önce biri tahminini gizlice girer ve telefonu verir, sonra öbürü girer; ardından ikiniz de sonucu görürsünüz. İlk tahmin eden her şarkıda değişir.',
    'Süreyi dakika ve saniye olarak art arda yazarsın: 4 3 2 → 4:32. Oyun sonunda çok tur alan kazanır; eşitlikte tahminlerinin gerçekten toplam sapması az olan.',
    'Favoriler ayarı açıkken Katatonia, Opeth, Anathema ve Antimatter (ve benzer gruplar) daha sık çıkar. Liste ve ağırlıklar data/sarkilar.json dosyasında.',
  ].join('\n'),
  data: ['songs'],
  handoffNote: 'Tahminler gizli: ekranı yalnızca sırası gelen görmeli.',
  settings: [
    {
      key: 'mode', label: 'Oyun türü', type: 'select', default: 'normal',
      options: [
        { value: 'normal', label: 'Normal: şarkının adı yazar' },
        { value: 'hard', label: 'Zor: ad gizli, 10 saniye çalar' },
      ],
    },
    { key: 'rounds', label: 'Şarkı sayısı', type: 'select', default: 10, options: ROUND_OPTIONS.map((n) => ({ value: n, label: String(n) })) },
    {
      key: 'favor', label: 'Favori gruplar', type: 'select', default: 'high',
      options: [
        { value: 'high', label: 'Çok çıksın' },
        { value: 'mid', label: 'Biraz daha sık çıksın' },
        { value: 'none', label: 'Herkes eşit' },
      ],
      help: 'Katatonia, Opeth, Anathema, Antimatter ve benzerleri daha sık gelir.',
    },
  ],
};

function fail(msg) {
  throw new Error(msg);
}

/** 257 → "4:17" */
export const fmt = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

/** Signed difference guess − real: "+1:05", "−0:22" or "tam isabet". */
export function fmtDiff(guess, real) {
  const d = guess - real;
  if (d === 0) return 'tam isabet';
  return `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`;
}

/** Microwave-style entry: the digits typed so far ("432") shown as a clock ("4:32"). */
export function clockFromDigits(digits) {
  if (!digits) return '–:––';
  const n = digits.padStart(3, '0');
  return `${Number(n.slice(0, -2))}:${n.slice(-2)}`;
}

/** Typed digits → { seconds } or { error }. */
export function parseDigits(digits) {
  if (!digits) return { error: 'Önce bir süre yaz' };
  const n = digits.padStart(3, '0');
  const m = Number(n.slice(0, -2));
  const s = Number(n.slice(-2));
  if (s > 59) return { error: 'Saniye 59\'dan büyük olamaz' };
  const total = m * 60 + s;
  if (total < 1) return { error: 'Süre sıfır olamaz' };
  return { seconds: total };
}

const normKey = (s) => String(s || '').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();

/** Can a clip be played for this song? */
export const hasAudio = (t) => !!(t && (t.p || (t.dz && !t.np)));

/**
 * Pick `count` songs, deterministic from the seed. Favourite artists (the weights table) come up
 * more often: favor 'high' uses the weights as they are, 'mid' their square root, 'none' ignores
 * them. No song twice, at most a few songs per artist, and no artist in two rounds in a row while
 * the pool allows it. With `needAudio` only songs that can play a clip are used.
 */
export function pickSongs(data, { count, favor = 'high', seed = 1, needAudio = false }) {
  const tracks = (data && Array.isArray(data.tracks) ? data.tracks : [])
    .filter((t) => t && t.a && t.t && Number(t.s) >= 30 && (!needAudio || hasAudio(t)));
  if (!tracks.length) fail('Şarkı listesi boş');
  const table = new Map();
  for (const [k, v] of Object.entries((data && data.weights) || {})) if (Number(v) > 0) table.set(normKey(k), Number(v));
  const weightOf = (t) => {
    const w = table.get(normKey(t.a)) || 1;
    return favor === 'none' ? 1 : favor === 'mid' ? Math.sqrt(w) : w;
  };
  const rng = createRng(seed);
  const cap = Math.max(2, Math.ceil(count / 4));
  const perArtist = new Map();
  const used = new Set();
  const picked = [];
  const n = Math.min(count, tracks.length);
  while (picked.length < n) {
    const last = picked.length ? normKey(picked[picked.length - 1].a) : null;
    const free = tracks.filter((t) => !used.has(t));
    let pool = free.filter((t) => (perArtist.get(normKey(t.a)) || 0) < cap && normKey(t.a) !== last);
    if (!pool.length) pool = free.filter((t) => (perArtist.get(normKey(t.a)) || 0) < cap);
    if (!pool.length) pool = free;
    let total = 0;
    for (const t of pool) total += weightOf(t);
    let r = rng() * total;
    let chosen = pool[pool.length - 1];
    for (const t of pool) {
      r -= weightOf(t);
      if (r <= 0) { chosen = t; break; }
    }
    used.add(chosen);
    perArtist.set(normKey(chosen.a), (perArtist.get(normKey(chosen.a)) || 0) + 1);
    picked.push(chosen);
  }
  return picked.map((t) => {
    const song = { a: String(t.a), t: String(t.t), s: Math.round(Number(t.s)) };
    if (t.p) song.p = String(t.p);
    if (t.dz) song.dz = Number(t.dz);
    return song;
  });
}

export function setup(options = {}, ctx = {}) {
  const mode = options.mode === 'hard' ? 'hard' : 'normal';
  const count = ROUND_OPTIONS.includes(Number(options.rounds)) ? Number(options.rounds) : 10;
  const favor = FAVOR_OPTIONS.includes(options.favor) ? options.favor : 'high';
  const songs = pickSongs(ctx.songs, { count, favor, seed: Number(options.seed) || 1, needAudio: mode === 'hard' });
  return {
    mode,
    clipSec: CLIP_SECONDS,
    songs,                                   // one per round: { a, t, s, p?, dz? }
    guesses: songs.map(() => [null, null]),  // guesses[round][player] in seconds
    index: 0,                                // current round
    phase: 'guess',                          // guess | reveal | over
  };
}

/** The player who guesses first in round i (alternates). */
export const firstGuesser = (i) => i % 2;

/** 0 | 1 who took round i, -1 for a tie, null while the round is open. */
export function roundWinner(state, i) {
  const [g0, g1] = state.guesses[i];
  if (g0 == null || g1 == null) return null;
  const real = state.songs[i].s;
  const d0 = Math.abs(g0 - real);
  const d1 = Math.abs(g1 - real);
  if (d0 === d1) return -1;
  return d0 < d1 ? 0 : 1;
}

/** Rounds taken and the total distance of the guesses from the real lengths (seconds). */
export function scoreOf(state, p) {
  let points = 0;
  let error = 0;
  state.guesses.forEach((g, i) => {
    if (g[0] == null || g[1] == null) return;
    if (roundWinner(state, i) === p) points += 1;
    error += Math.abs(g[p] - state.songs[i].s);
  });
  return { points, error };
}

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (move.type === 'guess') {
    if (state.phase !== 'guess') fail('Şu an tahmin sırası değil');
    if (Number(move.round) !== state.index) fail('Bu şarkının sırası geçti');
    const turn = getTurn(state);
    if (!turn || turn.player !== player) fail('Sıra sende değil');
    const secs = Number(move.seconds);
    if (!Number.isInteger(secs) || secs < 1 || secs > 3599) fail('Geçersiz süre');
    const guesses = state.guesses.map((g) => g.slice());
    guesses[state.index][player] = secs;
    const both = guesses[state.index][0] != null && guesses[state.index][1] != null;
    return { ...state, guesses, phase: both ? 'reveal' : 'guess' };
  }
  if (move.type === 'next') {
    if (state.phase !== 'reveal') fail('Önce ikiniz de tahmin edin');
    const index = state.index + 1;
    if (index >= state.songs.length) return { ...state, phase: 'over' };
    return { ...state, index, phase: 'guess' };
  }
  return fail('Geçersiz hamle');
}

export function getTurn(state) {
  if (state.phase === 'guess') {
    const f = firstGuesser(state.index);
    const g = state.guesses[state.index];
    return { player: g[f] == null ? f : 1 - f, private: true };
  }
  if (state.phase === 'reveal') return { player: 1 - firstGuesser(state.index), private: false };
  return null;
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const a = scoreOf(state, 0);
  const b = scoreOf(state, 1);
  if (a.points !== b.points) return { winner: a.points > b.points ? 0 : 1 };
  if (a.error !== b.error) return { winner: a.error < b.error ? 0 : 1 };
  return { draw: true };
}

// ----------------------------------------------------------------- audio (hard mode)
const previewCache = new Map(); // deezer track id -> Promise<string|null>

/** Deezer's public API answers JSONP; the preview url it returns is valid for about a day. */
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = `__dz${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const script = document.createElement('script');
    let timer = null;
    const cleanup = () => { delete window[cb]; script.remove(); clearTimeout(timer); };
    window[cb] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('Ses sunucusuna ulaşılamadı')); };
    timer = setTimeout(() => { cleanup(); reject(new Error('Ses sunucusu yanıt vermedi')); }, 8000);
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${cb}`;
    document.head.append(script);
  });
}

/** The 30-second preview url for a song, or null when there is none. */
export function previewUrl(song) {
  if (song.p) return Promise.resolve(song.p);
  if (!song.dz) return Promise.resolve(null);
  if (!previewCache.has(song.dz)) {
    previewCache.set(song.dz, jsonp(`https://api.deezer.com/track/${encodeURIComponent(song.dz)}?output=jsonp`)
      .then((d) => (d && typeof d.preview === 'string' && d.preview) || null)
      .catch(() => null));
  }
  return previewCache.get(song.dz);
}

/** Play button + progress bar that plays the first `clipSec` seconds of the preview. */
function clipPlayer(song, clipSec, onFail) {
  const label = `▶ ${clipSec} saniye çal`;
  const btn = el('button', { type: 'button', class: 'btn btn-primary btn-big ss-play' }, label);
  const fill = el('div', { class: 'ss-fill' });
  const bar = el('div', { class: 'ss-bar', 'aria-hidden': 'true' }, fill);
  const note = el('p', { class: 'hint ss-note' }, 'Dinle, süresini tahmin et. İstersen tekrar çalabilirsin.');
  const root = el('div', { class: 'ss-clip' }, btn, bar, note);
  let audio = null;
  let failed = false;
  let stopTimer = null;
  let raf = null;
  const setFailed = (why) => {
    if (failed) return;
    failed = true;
    btn.disabled = true;
    btn.textContent = 'Ses çalınamadı';
    note.textContent = why;
    if (onFail) onFail();
  };
  const ready = previewUrl(song).then((url) => {
    if (!url) { setFailed('Bu şarkının ses örneği yok; adı aşağıda.'); return; }
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('error', () => setFailed('Ses yüklenemedi (bağlantı yok mu?); adı aşağıda.'));
    audio.src = url;
  });
  const stop = () => {
    if (audio) audio.pause();
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  };
  const done = () => { stop(); fill.style.width = '100%'; btn.disabled = false; btn.textContent = '↻ Tekrar çal'; };
  const tick = () => {
    if (!audio) return;
    fill.style.width = `${Math.min(1, audio.currentTime / clipSec) * 100}%`;
    if (audio.currentTime >= clipSec) { done(); return; }
    raf = requestAnimationFrame(tick);
  };
  btn.addEventListener('click', async () => {
    if (failed) return;
    if (!audio) { btn.textContent = 'Yükleniyor…'; await ready; if (!audio) return; }
    try {
      stop();
      try { audio.currentTime = 0; } catch { /* not seekable before the metadata arrives */ }
      fill.style.width = '0%';
      await audio.play();
      btn.disabled = true;
      btn.textContent = 'Çalıyor…';
      raf = requestAnimationFrame(tick);
      stopTimer = setTimeout(done, (clipSec + 2) * 1000); // buffering may delay the start a little
    } catch {
      btn.disabled = false;
      btn.textContent = label;
      toast('Çalınamadı; bir daha dokun', { kind: 'error' });
    }
  });
  return { root, destroy: () => { stop(); if (audio) { audio.removeAttribute('src'); audio.load(); audio = null; } } };
}

// ----------------------------------------------------------------- render
export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const n = state.songs.length;
  const i = state.index;
  const song = state.songs[i];
  const scores = [scoreOf(state, 0), scoreOf(state, 1)];
  const status = (extra) => el('div', { class: 'status-line' },
    el('div', {}, el('strong', {}, `${players[0]} ${scores[0].points} – ${scores[1].points} ${players[1]}`)),
    el('div', { class: 'muted' }, extra),
  );

  if (state.phase === 'guess') {
    const turn = getTurn(state);
    const first = firstGuesser(i);
    if (turn.player !== viewer) { // two phones: the other player is typing
      draw(container,
        status(`Şarkı ${i + 1}/${n}`),
        el('p', { class: 'hint' }, `${players[turn.player]} tahmin ediyor…`),
        el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      );
      return null;
    }
    let clip = null;
    let card;
    if (state.mode === 'hard') {
      const fallback = el('div', { class: 'ss-fallback', hidden: true },
        el('div', { class: 'ss-artist' }, song.a), el('div', { class: 'ss-title' }, song.t));
      clip = clipPlayer(song, state.clipSec, () => { fallback.hidden = false; });
      card = el('div', { class: 'card ss-card' }, el('div', { class: 'ss-secret' }, '🎧 Gizli şarkı'), clip.root, fallback);
    } else {
      card = el('div', { class: 'card ss-card' }, el('div', { class: 'ss-artist' }, song.a), el('div', { class: 'ss-title' }, song.t));
    }
    let typed = '';
    let sent = false;
    const display = el('div', { class: 'ss-time empty' }, clockFromDigits(''));
    const update = () => { display.textContent = clockFromDigits(typed); display.classList.toggle('empty', !typed); };
    const kbBox = el('div');
    const kb = createKeyboard(kbBox, {
      layout: 'digits',
      onKey: (k) => { if (!sent && typed.length < 4) { typed += k; update(); } },
      onBackspace: () => { if (!sent) { typed = typed.slice(0, -1); update(); } },
      onEnter: () => {
        if (sent) return;
        const parsed = parseDigits(typed);
        if (parsed.error) { toast(parsed.error, { kind: 'error' }); return; }
        sent = true;
        kb.setDisabled(true);
        sendMove({ type: 'guess', round: i, seconds: parsed.seconds });
      },
    });
    const order = viewer === first
      ? `Önce sen tahmin ediyorsun, sonra ${players[1 - viewer]}.`
      : `${players[first]} tahminini yaptı; şimdi sen.`;
    draw(container,
      status(`Şarkı ${i + 1}/${n} · ${order}`),
      card,
      el('p', { class: 'hint' }, 'Kaç dakika sürüyor? Dakika ve saniyeyi art arda yaz: 4 3 2 → 4:32'),
      display,
      kbBox,
    );
    return () => { kb.destroy(); if (clip) clip.destroy(); };
  }

  if (state.phase === 'reveal') {
    const g = state.guesses[i];
    const w = roundWinner(state, i);
    const last = i + 1 >= n;
    draw(container,
      status(`Şarkı ${i + 1}/${n}`),
      el('div', { class: 'card ss-card' },
        el('div', { class: 'ss-artist' }, song.a),
        el('div', { class: 'ss-title' }, song.t),
        el('div', { class: 'ss-real' }, fmt(song.s)),
        el('div', { class: 'muted' }, 'gerçek süre'),
        el('div', { class: 'ss-guesses' }, [0, 1].map((p) => el('div', { class: `ss-guess ${w === p ? 'win' : ''}` },
          el('span', { class: 'ss-who' }, players[p]),
          el('strong', {}, fmt(g[p])),
          el('span', { class: 'ss-diff' }, fmtDiff(g[p], song.s)),
        ))),
        el('div', { class: 'ss-verdict' }, w === -1 ? 'Berabere: bu turda kimse puan almadı.' : `Turu ${players[w]} aldı!`),
      ),
      el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', onClick: () => sendMove({ type: 'next' }) }, last ? 'Sonucu gör' : 'Sonraki şarkı'),
    );
    return null;
  }

  // over
  const rows = state.songs.map((s, k) => {
    const g = state.guesses[k];
    const w = roundWinner(state, k);
    return el('div', { class: 'compare-item card' },
      el('div', { class: 'q' }, `${k + 1}. ${s.a} — ${s.t} · ${fmt(s.s)}`),
      el('div', { class: 'ans' }, `${players[0]}: ${fmt(g[0])} (${fmtDiff(g[0], s.s)}) · ${players[1]}: ${fmt(g[1])} (${fmtDiff(g[1], s.s)})`),
      el('span', { class: `badge ${w === -1 ? 'close' : 'match'}` }, w === -1 ? 'berabere' : players[w]),
    );
  });
  draw(container,
    el('div', { class: 'status-line' },
      el('div', {}, el('strong', {}, `${players[0]}: ${scores[0].points} tur · toplam sapma ${fmt(scores[0].error)}`)),
      el('div', {}, el('strong', {}, `${players[1]}: ${scores[1].points} tur · toplam sapma ${fmt(scores[1].error)}`)),
    ),
    el('div', { class: 'compare-list' }, rows),
  );
  return null;
}

export default { id: 'sarki-suresi', meta, setup, applyMove, render, getTurn, getResult };
