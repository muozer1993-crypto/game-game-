// Kelime Türetme — both players get the same rack of letters; make as many dictionary
// words as you can from them before time runs out. Words stay on the finder's device until
// both have finished; words both found cancel out.
import { el, render as draw } from '../js/ui/dom.js';
import { createTimer } from '../js/ui/timer.js';
import { createRng } from '../js/lib/rng.js';
import { upperTR, normalizeWord, isTurkishWord, VOWELS, nameSuffix } from '../js/lib/tr.js';
import { points, score } from './harf-avi.js';

export const meta = {
  group: 'kelime',
  name: 'Kelime Türetme',
  icon: '🔠',
  description: 'Aynı harflerden süre dolana kadar kelime türet; uzun kelime çok puan.',
  rules: [
    'İkinize de aynı harfler gelir. Harflere sırayla dokunarak kelime oluştur; her harf, rafta kaç tane varsa o kadar kullanılır. En az 3 harf, kelime listesinde olmalı.',
    'Puan: 3–4 harf 1, 5 harf 2, 6 harf 3, 7 harf 5, 8+ harf 11. İkinizin de bulduğu kelime kimseye puan getirmez.',
    'Tek telefonda sırayla oynanır; iki telefonda aynı anda.',
  ].join('\n'),
  data: ['dictionary'],
  handoffNote: 'Bulduğun kelimeler rakibin bitirene kadar gizli kalır.',
  settings: [
    { key: 'letters', label: 'Harf sayısı', type: 'select', default: 8, options: [{ value: 7, label: '7' }, { value: 8, label: '8' }, { value: 9, label: '9' }] },
    { key: 'seconds', label: 'Süre', type: 'select', default: 90, options: [{ value: 60, label: '60 sn' }, { value: 90, label: '90 sn' }, { value: 120, label: '120 sn' }, { value: 180, label: '3 dk' }] },
  ],
};

export const MIN_LEN = 3;
const VOWEL_W = { a: 120, e: 90, i: 86, ı: 50, u: 33, o: 26, ü: 20, ö: 9 };
const CONS_W = { n: 75, r: 70, l: 60, k: 50, d: 47, m: 37, y: 34, t: 33, s: 30, b: 28, ş: 18, z: 15, g: 13, ç: 12, h: 12, v: 10, c: 10, p: 9, f: 5, ğ: 4 };

function fail(msg) {
  throw new Error(msg);
}

function weighted(rng, weights) {
  const letters = Object.keys(weights);
  const total = letters.reduce((s, l) => s + weights[l], 0);
  let r = rng() * total;
  for (const l of letters) { r -= weights[l]; if (r < 0) return l; }
  return letters[0];
}

/** Rack of `n` letters: about a third vowels, no letter more than twice, seeded. */
export function makeRack(n, seed) {
  const rng = createRng(seed);
  const vowels = Math.max(2, Math.round(n / 3));
  for (let attempt = 0; attempt < 200; attempt++) {
    const rack = [];
    while (rack.length < vowels) rack.push(weighted(rng, VOWEL_W));
    while (rack.length < n) rack.push(weighted(rng, CONS_W));
    const counts = {};
    rack.forEach((l) => { counts[l] = (counts[l] || 0) + 1; });
    if (Object.values(counts).every((c) => c <= 2) && rack.filter((l) => l === 'ğ').length <= 1) return rack.sort((a, b) => a.localeCompare(b, 'tr'));
  }
  return Array.from({ length: n }, (_, i) => (i < vowels ? 'a' : 'n'));
}

/** Can `word` be spelled from the rack (each letter at most as often as it appears)? */
export function fitsRack(rack, word) {
  const left = {};
  rack.forEach((l) => { left[l] = (left[l] || 0) + 1; });
  for (const ch of word) {
    if (!left[ch]) return false;
    left[ch] -= 1;
  }
  return true;
}

export function setup(options = {}) {
  const n = [7, 8, 9].includes(Number(options.letters)) ? Number(options.letters) : 8;
  const seconds = [60, 90, 120, 180].includes(Number(options.seconds)) ? Number(options.seconds) : 90;
  return {
    id: String(options.seed ?? ''),
    seconds,
    rack: makeRack(n, Number(options.seed) || 1),
    phase: 'play',
    started: [false, false],
    finished: [false, false],
    counts: [0, 0],
    words: [[], []],
    result: null,
  };
}

function cleanWords(list) {
  const out = [];
  for (const w of Array.isArray(list) ? list : []) {
    const x = normalizeWord(w);
    if (x && isTurkishWord(x) && !out.includes(x)) out.push(x);
  }
  return out;
}

export function applyMove(state, player, move, ctx = {}) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.phase !== 'play') fail('Oyun bitti');
  switch (move.type) {
    case 'start': {
      if (state.started[player]) fail('Zaten başladın');
      const started = state.started.slice();
      started[player] = true;
      return { ...state, started };
    }
    case 'word': {
      if (!state.started[player]) fail('Önce başla');
      if (state.finished[player]) fail('Süren doldu');
      const words = state.words.map((l) => l.slice());
      if (move.secret && move.secret.word != null) {
        const word = normalizeWord(move.secret.word);
        if ([...word].length < MIN_LEN) fail(`En az ${MIN_LEN} harf`);
        if (!isTurkishWord(word)) fail('Yalnızca Türkçe harfler');
        if (!fitsRack(state.rack, word)) fail('Bu kelime raftaki harflerle yazılamıyor');
        if (words[player].includes(word)) fail('Bunu zaten buldun');
        if (ctx.dict && !ctx.remote && !ctx.dict.has(word)) fail('Kelime listesinde yok');
        words[player].push(word);
      }
      const counts = state.counts.slice();
      counts[player] += 1;
      return { ...state, words, counts };
    }
    case 'finish': {
      if (!state.started[player]) fail('Önce başla');
      if (state.finished[player]) fail('Zaten bitirdin');
      const finished = state.finished.slice();
      finished[player] = true;
      const words = state.words.map((l) => l.slice());
      if (Array.isArray(move.words)) words[player] = cleanWords(move.words);
      const counts = state.counts.slice();
      counts[player] = words[player].length;
      const next = { ...state, finished, words, counts };
      if (finished[0] && finished[1]) return { ...next, phase: 'over', result: score(words[0], words[1]) };
      return next;
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase !== 'play') return null;
  const p = state.finished[0] ? (state.finished[1] ? null : 1) : 0;
  return p == null ? null : { player: p, private: true, simultaneous: true };
}

export function getResult(state) {
  if (state.phase !== 'over' || !state.result) return null;
  const [a, b] = state.result.points;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
const starts = new Map();
const drafts = new Map(); // `${id}:${player}` -> indexes of rack tiles used, in order

function wordList(words, { shared = [] } = {}) {
  if (!words.length) return el('p', { class: 'hint' }, 'Henüz kelime yok.');
  return el('div', { class: 'wh-list' }, words.map((w) => {
    const dup = shared.includes(w);
    return el('span', { class: `wh-chip ${dup ? 'shared' : ''}` }, `${upperTR(w)} ${dup ? '0' : `+${points(w)}`}`);
  }));
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  const opp = 1 - viewer;
  const key = `${state.id}:${viewer}`;
  const cleanups = [];
  const rackView = () => el('div', { class: 'kt-rack' }, state.rack.map((l) => el('span', { class: 'wh-chip' }, upperTR(l))));

  if (state.phase === 'over') {
    const { points: pts, shared } = state.result;
    const line = pts[0] === pts[1] ? `Berabere: ${pts[0]}–${pts[1]}` : `${players[pts[0] > pts[1] ? 0 : 1]} kazandı: ${Math.max(...pts)}–${Math.min(...pts)}`;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, line)),
      rackView(),
      shared.length ? el('p', { class: 'hint' }, `İkinizin de bulduğu ${shared.length} kelime puan getirmedi.`) : null,
      el('div', { class: 'two-col' },
        el('div', {}, el('div', { class: 'col-title' }, `${players[0]} — ${state.words[0].length} kelime, ${pts[0]} puan`), wordList(state.words[0], { shared })),
        el('div', {}, el('div', { class: 'col-title' }, `${players[1]} — ${state.words[1].length} kelime, ${pts[1]} puan`), wordList(state.words[1], { shared })),
      ),
    );
    return null;
  }
  const mine = state.words[viewer];
  if (state.finished[viewer]) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `Bitirdin: ${mine.length} kelime.`)),
      el('p', { class: 'hint' }, state.finished[opp] ? 'Sonuç hazırlanıyor…' : (state.started[opp] ? `${players[opp]} oynuyor… (${state.counts[opp]} kelime)` : `${players[opp]} henüz başlamadı.`)),
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      wordList(mine),
    );
    return null;
  }
  if (!state.started[viewer]) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}, hazır olunca başla`)),
      el('p', { class: 'hint' }, `${state.rack.length} harf, ${state.seconds} saniye. Süre "Başla"ya basınca işler.${online ? '' : (state.finished[opp] ? ' Bitirince ikinizin de kelimeleri ve sonuç açıklanır.' : ` Sonra telefon ${nameSuffix(players[opp], 'e')} geçer.`)}`),
      online && state.started[opp] ? el('p', { class: 'hint' }, `${players[opp]} başladı (${state.counts[opp]} kelime).`) : null,
      el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'start' }) }, 'Başla'),
    );
    return null;
  }

  // ---- playing
  if (!starts.has(key)) starts.set(key, Date.now());
  const deadline = starts.get(key) + state.seconds * 1000;
  let used = drafts.get(key) || [];
  const wordOf = (u) => u.map((i) => state.rack[i]).join('');
  if (used.length && mine.includes(wordOf(used))) used = [];
  drafts.set(key, used);
  const finish = () => sendMove({ type: 'finish', words: state.words[viewer] });
  const timerBox = el('div');
  const timer = createTimer(timerBox, { deadline, total: state.seconds * 1000, onExpire: finish });
  cleanups.push(() => timer.stop());

  const wordBox = el('div', { class: 'wh-word' });
  const tiles = [];
  const submitBtn = el('button', { type: 'button', class: 'btn btn-primary', onClick: () => { if (used.length >= MIN_LEN) sendMove({ type: 'word', secret: { word: wordOf(used) } }); } }, 'Gönder');
  const update = () => {
    drafts.set(key, used);
    tiles.forEach((t, i) => { t.disabled = used.includes(i); });
    wordBox.textContent = used.length ? upperTR(wordOf(used)) : '';
    submitBtn.disabled = used.length < MIN_LEN;
  };
  const rack = el('div', { class: 'kt-tiles' }, state.rack.map((l, i) => {
    const t = el('button', { type: 'button', class: 'wh-cell kt-tile', 'aria-label': upperTR(l), onClick: () => { if (!used.includes(i)) { used = used.concat([i]); update(); } } }, upperTR(l));
    tiles.push(t);
    return t;
  }));
  update();
  const provisional = mine.reduce((s, w) => s + points(w), 0);
  draw(container,
    timerBox,
    el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}: ${mine.length} kelime, ${provisional} puan${online && state.started[opp] ? ` · ${players[opp]}: ${state.counts[opp]} kelime` : ''}`)),
    wordBox,
    rack,
    el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px', marginTop: '8px' } },
      el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => { used = used.slice(0, -1); update(); } }, 'Sil'),
      el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => { used = []; update(); } }, 'Temizle'),
      submitBtn,
      el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => { if (confirm('Süren bitmeden bitirilsin mi?')) finish(); } }, 'Bitir'),
    ),
    el('div', { class: 'col-title', style: { marginTop: '10px' } }, 'Bulduğun kelimeler'),
    wordList(mine.slice().reverse()),
  );
  return () => cleanups.forEach((fn) => fn());
}

export default { id: 'kelime-turetme', meta, setup, applyMove, render, getTurn, getResult };
