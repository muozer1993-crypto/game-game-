// Harf Avı — word hunt on a shared letter grid. Both players get the same grid and the
// same time; each player's words stay on their own device until both have finished.
import { el, render as draw } from '../js/ui/dom.js';
import { createTimer } from '../js/ui/timer.js';
import { createRng } from '../js/lib/rng.js';
import { upperTR, normalizeWord, isTurkishWord, VOWELS, nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'kelime',
  name: 'Harf Avı',
  icon: '🔎',
  description: 'Aynı harf tablosunda süre dolana kadar komşu harflerden kelime çıkar; uzun kelime çok puan.',
  rules: [
    'İkinize de aynı harf tablosu gelir. Yan yana (çapraz da olur) harflere sırayla dokunarak kelime oluştur; bir harf aynı kelimede iki kez kullanılamaz. En az 3 harf, kelime listesinde olmalı.',
    'Puan: 3–4 harf 1, 5 harf 2, 6 harf 3, 7 harf 5, 8+ harf 11. İkinizin de bulduğu kelime kimseye puan getirmez.',
    'Tek telefonda sırayla oynanır: biri bitirince telefon diğerine geçer, kelimeler sona kadar gizli kalır. İki telefonda aynı anda oynanır.',
  ].join('\n'),
  data: ['dictionary'],
  handoffNote: 'Bulduğun kelimeler rakibin bitirene kadar gizli kalır.',
  settings: [
    { key: 'size', label: 'Tablo', type: 'select', default: 4, options: [{ value: 4, label: '4×4' }, { value: 5, label: '5×5' }] },
    { key: 'seconds', label: 'Süre', type: 'select', default: 90, options: [{ value: 60, label: '60 sn' }, { value: 90, label: '90 sn' }, { value: 120, label: '120 sn' }, { value: 180, label: '3 dk' }] },
  ],
};

export const MIN_LEN = 3;
// rough Turkish letter frequencies (per mille), used to draw the grid
const WEIGHTS = { a: 120, e: 90, i: 86, n: 75, r: 70, l: 60, ı: 50, k: 50, d: 47, m: 37, y: 34, t: 33, u: 33, s: 30, b: 28, o: 26, ü: 20, ş: 18, z: 15, g: 13, ç: 12, h: 12, ğ: 11, v: 10, c: 10, ö: 9, p: 9, f: 5, j: 1 };

function fail(msg) {
  throw new Error(msg);
}

export function makeGrid(size, seed) {
  const rng = createRng(seed);
  const letters = Object.keys(WEIGHTS);
  const total = letters.reduce((s, l) => s + WEIGHTS[l], 0);
  const pickLetter = () => {
    let r = rng() * total;
    for (const l of letters) { r -= WEIGHTS[l]; if (r < 0) return l; }
    return 'a';
  };
  let cells = [];
  for (let attempt = 0; attempt < 200; attempt++) {
    cells = Array.from({ length: size * size }, pickLetter);
    const vowels = cells.filter((c) => VOWELS.includes(c)).length / cells.length;
    const rare = cells.filter((c) => c === 'ğ' || c === 'j').length;
    if (vowels >= 0.3 && vowels <= 0.5 && rare <= 1) return cells;
  }
  return cells;
}

/** Cell indexes spelling `word` by king-moves without reuse, or null. */
export function findPath(cells, size, word) {
  const chars = [...word];
  if (!chars.length) return null;
  const used = new Set();
  const path = [];
  const dfs = (i, k) => {
    if (cells[i] !== chars[k]) return false;
    used.add(i);
    path.push(i);
    if (k === chars.length - 1) return true;
    const r = Math.floor(i / size);
    const c = i % size;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const n = nr * size + nc;
        if (!used.has(n) && dfs(n, k + 1)) return true;
      }
    }
    used.delete(i);
    path.pop();
    return false;
  };
  for (let i = 0; i < cells.length; i++) if (dfs(i, 0)) return path.slice();
  return null;
}

export function points(word) {
  const n = [...word].length;
  if (n < MIN_LEN) return 0;
  if (n <= 4) return 1;
  if (n === 5) return 2;
  if (n === 6) return 3;
  if (n === 7) return 5;
  return 11;
}

export function setup(options = {}) {
  const size = Number(options.size) === 5 ? 5 : 4;
  const seconds = [60, 90, 120, 180].includes(Number(options.seconds)) ? Number(options.seconds) : 90;
  return {
    id: String(options.seed ?? ''),
    size,
    seconds,
    cells: makeGrid(size, Number(options.seed) || 1),
    phase: 'play',          // play | over
    started: [false, false],
    finished: [false, false],
    counts: [0, 0],         // words found so far (public)
    words: [[], []],        // the words themselves: own device only until 'finish'
    result: null,           // { points: [a, b], shared: [...] }
  };
}

function cleanWords(list) {
  const out = [];
  for (const w of Array.isArray(list) ? list : []) {
    const n = normalizeWord(w);
    if (n && isTurkishWord(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

export function score(words0, words1) {
  const shared = words0.filter((w) => words1.includes(w));
  const total = (list) => list.reduce((s, w) => s + (shared.includes(w) ? 0 : points(w)), 0);
  return { points: [total(words0), total(words1)], shared };
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
        if (!findPath(state.cells, state.size, word)) fail('Bu kelime tabloda komşu harflerle çıkmıyor');
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

// ------------------------------------------------------------------ rendering
const starts = new Map(); // `${id}:${player}` -> Date.now() when that player's clock began
const paths = new Map();  // `${id}:${player}` -> cell indexes tapped so far

const neighbours = (size, a, b) => {
  const dr = Math.abs(Math.floor(a / size) - Math.floor(b / size));
  const dc = Math.abs((a % size) - (b % size));
  return a !== b && dr <= 1 && dc <= 1;
};

function wordList(words, { shared = [] } = {}) {
  if (!words.length) return el('p', { class: 'hint' }, 'Henüz kelime yok.');
  return el('div', { class: 'wh-list' }, words.map((w) => {
    const dup = shared.includes(w);
    return el('span', { class: `wh-chip ${dup ? 'shared' : ''}`, title: dup ? 'İkiniz de buldunuz' : null }, `${upperTR(w)} ${dup ? '0' : `+${points(w)}`}`);
  }));
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  const opp = 1 - viewer;
  const key = `${state.id}:${viewer}`;
  const cleanups = [];

  if (state.phase === 'over') {
    const { points: pts, shared } = state.result;
    const line = pts[0] === pts[1] ? `Berabere: ${pts[0]}–${pts[1]}` : `${players[pts[0] > pts[1] ? 0 : 1]} kazandı: ${Math.max(...pts)}–${Math.min(...pts)}`;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, line)),
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
      el('p', { class: 'hint' }, `${state.size}×${state.size} tabloda ${state.seconds} saniyen var. Süre "Başla"ya basınca işler.${online ? '' : ` Sonra telefon ${nameSuffix(players[opp], 'e')} geçer.`}`),
      online && state.started[opp] ? el('p', { class: 'hint' }, `${players[opp]} başladı (${state.counts[opp]} kelime).`) : null,
      el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'start' }) }, 'Başla'),
    );
    return null;
  }

  // ---- playing
  if (!starts.has(key)) starts.set(key, Date.now());
  const deadline = starts.get(key) + state.seconds * 1000;
  let path = paths.get(key) || [];
  const wordOf = (p) => p.map((i) => state.cells[i]).join('');
  if (path.length && mine.includes(wordOf(path))) path = []; // the last submission went through
  paths.set(key, path);

  const finish = () => sendMove({ type: 'finish', words: state.words[viewer] });
  const timerBox = el('div');
  const timer = createTimer(timerBox, { deadline, total: state.seconds * 1000, onExpire: finish });
  cleanups.push(() => timer.stop());

  const wordBox = el('div', { class: 'wh-word' });
  const gridBox = el('div', { class: 'wh-grid', style: { gridTemplateColumns: `repeat(${state.size}, 1fr)` } });
  const cellEls = [];
  const update = () => {
    paths.set(key, path);
    const last = path[path.length - 1];
    cellEls.forEach((b, i) => {
      b.classList.toggle('sel', path.includes(i));
      b.classList.toggle('last', i === last);
    });
    wordBox.textContent = path.length ? upperTR(wordOf(path)) : '';
    submitBtn.disabled = path.length < MIN_LEN;
  };
  const submitBtn = el('button', {
    type: 'button', class: 'btn btn-primary',
    onClick: () => { if (path.length >= MIN_LEN) sendMove({ type: 'word', secret: { word: wordOf(path) } }); },
  }, 'Gönder');
  for (let i = 0; i < state.cells.length; i++) {
    const b = el('button', {
      type: 'button', class: `wh-cell ${state.size === 5 ? 'small' : ''}`, 'aria-label': upperTR(state.cells[i]),
      onClick: () => {
        const last = path[path.length - 1];
        if (i === last) path = path.slice(0, -1);
        else if (path.includes(i)) path = path.slice(0, path.indexOf(i) + 1);
        else if (!path.length || neighbours(state.size, last, i)) path = path.concat([i]);
        update();
      },
    }, upperTR(state.cells[i]));
    cellEls.push(b);
    gridBox.append(b);
  }
  update();
  const provisional = mine.reduce((s, w) => s + points(w), 0);
  draw(container,
    timerBox,
    el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}: ${mine.length} kelime, ${provisional} puan${online && state.started[opp] ? ` · ${players[opp]}: ${state.counts[opp]} kelime` : ''}`)),
    wordBox,
    gridBox,
    el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px', marginTop: '8px' } },
      el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => { path = []; update(); } }, 'Temizle'),
      submitBtn,
      el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => { if (confirm('Süren bitmeden bitirilsin mi?')) finish(); } }, 'Bitir'),
    ),
    el('div', { class: 'col-title', style: { marginTop: '10px' } }, 'Bulduğun kelimeler'),
    wordList(mine.slice().reverse()),
  );
  return () => cleanups.forEach((fn) => fn());
}

export default { id: 'harf-avi', meta, setup, applyMove, render, getTurn, getResult };
