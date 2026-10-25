// Kelime Tahtası — a Scrabble-like word board for two: 11×11 board with premium squares,
// Turkish tile set, seven-tile racks, dictionary-checked words, pass and exchange.
import { el, render as draw } from '../js/ui/dom.js';
import { createRng, shuffle } from '../js/lib/rng.js';
import { upperTR, nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'kelime',
  name: 'Kelime Tahtası',
  icon: '🔡',
  description: 'Rafındaki harflerle tahtaya kelime diz; katlı kareler puanı artırır. Torba bitince çok puanı olan kazanır.',
  rules: [
    'Her oyuncu torbadan yedi harf alır. Sırası gelen, harflerini tek bir satıra ya da sütuna, tahtadaki harflere bitişik olacak şekilde dizer; ilk kelime ortadaki yıldızdan geçer.',
    'Oluşan bütün kelimeler (yan kelimeler dahil) kelime listesinde olmalı. Puan: harf değerleri toplamı; mavi kareler harfi 2× / 3×, kırmızı kareler kelimeyi 2× / 3× katlar (yalnızca o tur konan harfler için). Yedi harfi birden koyan +50 alır.',
    'Pas geçilebilir ya da (torbada en az 7 harf varken) harf değiştirilebilir. Torba bitip bir oyuncunun harfi tükenince ya da art arda dört puansız hamle (pas ya da değiştirme) olunca oyun biter. Harflerini bitiren, rakibinin elinde kalan harflerin değerini kendi puanına ekler (rakipten düşülür); puansız hamlelerle biterse herkesin kalan harfleri kendisinden düşülür. Çok puan kazanır.',
  ].join('\n'),
  data: ['dictionary'],
  handoffNote: 'Rafındaki harfleri rakibin görmemeli.',
  settings: [],
};

export const SIZE = 11;
export const RACK = 7;
// Turkish letter set (official distribution without blanks) and values
export const TILES = { a: 12, b: 2, c: 2, ç: 2, d: 2, e: 8, f: 1, g: 1, ğ: 1, h: 1, ı: 4, i: 7, j: 1, k: 7, l: 7, m: 4, n: 5, o: 3, ö: 1, p: 1, r: 6, s: 3, ş: 2, t: 5, u: 3, ü: 2, v: 1, y: 2, z: 2 };
export const VALUES = { a: 1, b: 3, c: 4, ç: 4, d: 3, e: 1, f: 7, g: 5, ğ: 8, h: 5, ı: 2, i: 1, j: 10, k: 1, l: 1, m: 2, n: 1, o: 2, ö: 7, p: 5, r: 1, s: 2, ş: 4, t: 1, u: 2, ü: 3, v: 7, y: 3, z: 4 };
// premium squares, symmetric: 'W3' 'W2' 'L3' 'L2'
export const PREMIUM = (() => {
  const p = {};
  const set = (r, c, k) => { p[r * SIZE + c] = k; };
  const corners = [[0, 0], [0, 10], [10, 0], [10, 10]];
  corners.forEach(([r, c]) => set(r, c, 'W3'));
  [[0, 5], [5, 0], [5, 10], [10, 5]].forEach(([r, c]) => set(r, c, 'L3'));
  [[1, 1], [2, 2], [3, 3], [1, 9], [2, 8], [3, 7], [9, 1], [8, 2], [7, 3], [9, 9], [8, 8], [7, 7]].forEach(([r, c]) => set(r, c, 'W2'));
  [[1, 5], [5, 1], [5, 9], [9, 5], [2, 4], [2, 6], [8, 4], [8, 6], [4, 2], [6, 2], [4, 8], [6, 8], [0, 2], [0, 8], [10, 2], [10, 8], [2, 0], [8, 0], [2, 10], [8, 10]].forEach(([r, c]) => set(r, c, 'L2'));
  set(5, 5, 'W2'); // the centre star
  return p;
})();
export const CENTER = 5 * SIZE + 5;

function fail(msg) {
  throw new Error(msg);
}

export function makeBag(seed) {
  const bag = [];
  for (const [l, n] of Object.entries(TILES)) for (let i = 0; i < n; i++) bag.push(l);
  return shuffle(createRng(seed), bag);
}

export function setup(options = {}) {
  const bag = makeBag(Number(options.seed) || 1);
  const racks = [[], []];
  for (let i = 0; i < RACK; i++) for (const p of [0, 1]) racks[p].push(bag.pop());
  return {
    id: String(options.seed ?? ''),
    board: new Array(SIZE * SIZE).fill(null), // letters
    bag,
    racks,
    scores: [0, 0],
    turn: (Number(options.seed) || 0) % 2,
    passes: 0,
    last: [],          // cells placed in the last move
    lastWords: [],     // { word, points }
    over: false,
    reason: null,
  };
}

const rowOf = (i) => Math.floor(i / SIZE);
const colOf = (i) => i % SIZE;

/** Words formed by placing `tiles` ({ cell, letter }) on `board`; null plus a reason when illegal. */
export function placementWords(board, tiles, firstMove) {
  if (!tiles.length) return { error: 'En az bir harf koy' };
  const cells = tiles.map((t) => t.cell);
  if (new Set(cells).size !== cells.length) return { error: 'Aynı kareye iki harf' };
  if (cells.some((c) => board[c] !== null)) return { error: 'Dolu kareye harf konmaz' };
  const rows = new Set(cells.map(rowOf));
  const cols = new Set(cells.map(colOf));
  if (rows.size > 1 && cols.size > 1) return { error: 'Harfler tek bir satıra ya da sütuna dizilmeli' };
  const next = board.slice();
  tiles.forEach((t) => { next[t.cell] = t.letter; });
  const horizontal = rows.size === 1 && (cols.size > 1 || !hasVerticalNeighbour(next, cells[0]));
  // contiguous along the line (existing tiles may fill gaps)
  const line = horizontal ? [...cols] : [...rows];
  const lo = Math.min(...line);
  const hi = Math.max(...line);
  const fixed = horizontal ? rowOf(cells[0]) : colOf(cells[0]);
  for (let k = lo; k <= hi; k++) if (next[horizontal ? fixed * SIZE + k : k * SIZE + fixed] === null) return { error: 'Harfler arasında boşluk olamaz' };
  if (firstMove) {
    if (!cells.includes(CENTER)) return { error: 'İlk kelime ortadaki yıldızdan geçmeli' };
    if (tiles.length < 2) return { error: 'İlk kelime en az iki harfli olmalı' };
  } else {
    const touches = cells.some((c) => neighbours(c).some((n) => board[n] !== null));
    if (!touches) return { error: 'Kelime tahtadaki harflere bitişik olmalı' };
  }
  const words = [];
  const main = wordThrough(next, cells[0], horizontal);
  if (main.cells.length > 1) words.push(main);
  for (const c of cells) {
    const cross = wordThrough(next, c, !horizontal);
    if (cross.cells.length > 1) words.push(cross);
  }
  if (!words.length) return { error: 'Kelime oluşmadı' };
  return { words, horizontal };
}

function neighbours(i) {
  const r = rowOf(i);
  const c = colOf(i);
  const out = [];
  if (r > 0) out.push(i - SIZE);
  if (r < SIZE - 1) out.push(i + SIZE);
  if (c > 0) out.push(i - 1);
  if (c < SIZE - 1) out.push(i + 1);
  return out;
}
const hasVerticalNeighbour = (board, i) => (rowOf(i) > 0 && board[i - SIZE] !== null) || (rowOf(i) < SIZE - 1 && board[i + SIZE] !== null);

/** The maximal run of letters through `i` in the given direction: { word, cells }. */
export function wordThrough(board, i, horizontal) {
  const step = horizontal ? 1 : SIZE;
  const inLine = (j) => (horizontal ? rowOf(j) === rowOf(i) : true) && j >= 0 && j < SIZE * SIZE;
  let start = i;
  while (inLine(start - step) && board[start - step] !== null) start -= step;
  const cells = [];
  for (let j = start; inLine(j) && board[j] !== null; j += step) cells.push(j);
  return { word: cells.map((j) => board[j]).join(''), cells };
}

/** Score of the words formed on `board`, premiums counting only on newly placed cells. */
export function scoreWords(words, placed, board) {
  const placedSet = new Set(placed);
  let total = 0;
  const detail = [];
  for (const w of words) {
    let sum = 0;
    let mult = 1;
    for (const c of w.cells) {
      const prem = placedSet.has(c) ? PREMIUM[c] : null;
      const v = VALUES[board[c]] || 0;
      sum += prem === 'L2' ? v * 2 : prem === 'L3' ? v * 3 : v;
      if (prem === 'W2') mult *= 2;
      if (prem === 'W3') mult *= 3;
    }
    detail.push({ word: w.word, points: sum * mult });
    total += sum * mult;
  }
  if (placed.length === RACK) total += 50;
  return { total, detail, bingo: placed.length === RACK };
}

export function applyMove(state, player, move, ctx = {}) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  const rack = state.racks[player].slice();
  const bag = state.bag.slice();
  const racks = state.racks.map((r) => r.slice());
  const finishTurn = (next) => {
    const other = 1 - player;
    let out = { ...next, turn: other };
    const rackEmpty = !out.racks[player].length;
    if ((rackEmpty && !out.bag.length) || out.passes >= 4) {
      const scores = out.scores.slice();
      const left = (p) => out.racks[p].reduce((s, l) => s + (VALUES[l] || 0), 0);
      if (rackEmpty) { scores[player] += left(other); scores[other] -= left(other); }
      else { scores[0] -= left(0); scores[1] -= left(1); }
      out = { ...out, scores, over: true, reason: rackEmpty ? 'empty' : 'passes' };
    }
    return out;
  };
  if (move.type === 'pass') {
    return finishTurn({ ...state, passes: state.passes + 1, last: [], lastWords: [] });
  }
  if (move.type === 'exchange') {
    if (bag.length < RACK) fail('Torbada yeterli harf yok');
    const letters = Array.isArray(move.letters) ? move.letters.map((l) => String(l)) : [];
    if (!letters.length) fail('Değiştirilecek harfleri seç');
    for (const l of letters) {
      const i = rack.indexOf(l);
      if (i < 0) fail('Bu harf rafında yok');
      rack.splice(i, 1);
    }
    // draw first, then return the old tiles under the bag in a seeded shuffle for the next draws
    while (rack.length < RACK && bag.length) rack.push(bag.pop());
    const returned = shuffle(createRng((state.bag.length * 31 + letters.length * 7 + player) >>> 0), letters);
    racks[player] = rack;
    return finishTurn({ ...state, racks, bag: returned.concat(bag), passes: state.passes + 1, last: [], lastWords: [] });
  }
  if (move.type !== 'play') fail(`Bilinmeyen hamle: ${move.type}`);
  const tiles = Array.isArray(move.tiles) ? move.tiles.map((t) => ({ cell: Number(t.cell), letter: String(t.letter) })) : [];
  if (tiles.some((t) => !Number.isInteger(t.cell) || t.cell < 0 || t.cell >= SIZE * SIZE || !VALUES[t.letter])) fail('Geçersiz harf ya da kare');
  for (const t of tiles) {
    const i = rack.indexOf(t.letter);
    if (i < 0) fail(`Rafında ${upperTR(t.letter)} yok`);
    rack.splice(i, 1);
  }
  const firstMove = state.board.every((c) => c === null);
  const res = placementWords(state.board, tiles, firstMove);
  if (res.error) fail(res.error);
  const board = state.board.slice();
  tiles.forEach((t) => { board[t.cell] = t.letter; });
  if (ctx.dict && !ctx.remote) {
    for (const w of res.words) if (!ctx.dict.has(w.word)) fail(`"${upperTR(w.word)}" kelime listesinde yok`);
  }
  const placed = tiles.map((t) => t.cell);
  const sc = scoreWords(res.words, placed, board);
  while (rack.length < RACK && bag.length) rack.push(bag.pop());
  racks[player] = rack;
  const scores = state.scores.slice();
  scores[player] += sc.total;
  return finishTurn({ ...state, board, bag, racks, scores, passes: 0, last: placed, lastWords: sc.detail.concat(sc.bingo ? [{ word: 'Yedi harf!', points: 50 }] : []) });
}

export function getTurn(state) {
  return state.over ? null : { player: state.turn, private: true };
}

export function getResult(state) {
  if (!state.over) return null;
  const [a, b] = state.scores;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
const drafts = new Map(); // `${id}:${player}` -> { tiles: [{cell, letter, rackIndex}], selected: rackIndex|null, mode }
let draftsFor = null;

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  if (draftsFor !== state.id) { drafts.clear(); draftsFor = state.id; }
  const opp = 1 - viewer;
  const mine = !state.over && viewer === state.turn;
  const key = `${state.id}:${viewer}`;
  if (!drafts.has(key)) drafts.set(key, { tiles: [], selected: null, exchange: null });
  const draft = drafts.get(key);
  // a draft from a previous turn is stale once the board changed under it
  if (draft.tiles.some((t) => state.board[t.cell] !== null)) draft.tiles = [];
  const rack = state.racks[viewer];
  if (draft.selected != null && draft.selected >= rack.length) draft.selected = null; // the rack shrank (bag empty)
  const boardBox = el('div');
  const rackBox = el('div');
  const infoBox = el('div');
  const firstMove = state.board.every((c) => c === null);

  const preview = () => {
    if (!draft.tiles.length) return null;
    const res = placementWords(state.board, draft.tiles, firstMove);
    if (res.error) return { error: res.error };
    const board = state.board.slice();
    draft.tiles.forEach((t) => { board[t.cell] = t.letter; });
    const sc = scoreWords(res.words, draft.tiles.map((t) => t.cell), board);
    const missing = ctx.dict ? res.words.filter((w) => !ctx.dict.has(w.word)).map((w) => upperTR(w.word)) : [];
    return { total: sc.total, words: sc.detail, missing };
  };

  const redraw = () => {
    const pending = new Map(draft.tiles.map((t) => [t.cell, t]));
    const lastSet = new Set(state.last);
    const board = el('div', { class: 'kb-board', role: 'grid', 'aria-label': 'Kelime tahtası' });
    for (let i = 0; i < SIZE * SIZE; i++) {
      const letter = state.board[i] || (pending.get(i) ? pending.get(i).letter : null);
      const prem = PREMIUM[i];
      const canDrop = mine && state.board[i] === null && !pending.has(i) && draft.selected != null;
      board.append(el('button', {
        type: 'button',
        class: `kb-cell ${prem ? prem.toLowerCase() : ''} ${letter ? 'filled' : ''} ${pending.has(i) ? 'pending' : ''} ${lastSet.has(i) ? 'last' : ''} ${i === CENTER && !letter ? 'star' : ''}`,
        disabled: !mine || (state.board[i] !== null) || (!pending.has(i) && draft.selected == null),
        'aria-label': `${rowOf(i) + 1}. satır ${colOf(i) + 1}. sütun${letter ? `, ${upperTR(letter)}` : prem ? `, ${prem}` : ''}`,
        onClick: () => {
          if (pending.has(i)) { draft.tiles = draft.tiles.filter((t) => t.cell !== i); redraw(); return; }
          if (!canDrop) return;
          draft.tiles.push({ cell: i, letter: rack[draft.selected], rackIndex: draft.selected });
          draft.selected = null;
          redraw();
        },
      }, letter ? el('span', { class: 'kb-letter' }, upperTR(letter), el('sub', {}, VALUES[letter])) : (prem ? el('span', { class: 'kb-prem' }, i === CENTER ? '★' : prem === 'W3' ? '3×K' : prem === 'W2' ? '2×K' : prem === 'L3' ? '3×H' : '2×H') : null)));
    }
    boardBox.replaceChildren(board);
    const rackEl = el('div', { class: 'kb-rack' }, rack.map((l, k) => el('button', {
      type: 'button',
      class: `kb-tile ${draft.selected === k ? 'sel' : ''} ${draft.tiles.some((t) => t.rackIndex === k) ? 'used' : ''} ${draft.exchange && draft.exchange.has(k) ? 'swap' : ''}`,
      disabled: !mine || draft.tiles.some((t) => t.rackIndex === k),
      'aria-label': `${upperTR(l)} ${VALUES[l]} puan`,
      onClick: () => {
        if (draft.exchange) { if (draft.exchange.has(k)) draft.exchange.delete(k); else draft.exchange.add(k); redraw(); return; }
        draft.selected = draft.selected === k ? null : k;
        redraw();
      },
    }, upperTR(l), el('sub', {}, VALUES[l]))));
    rackBox.replaceChildren(rackEl);
    const pv = preview();
    const info = [];
    if (mine && draft.exchange) info.push(el('p', { class: 'hint' }, `Değiştirilecek harfleri seç (${draft.exchange.size}), sonra onayla.`));
    else if (mine && pv) {
      if (pv.error) info.push(el('p', { class: 'hint rejected-note' }, pv.error));
      else info.push(el('p', { class: `hint ${pv.missing.length ? 'rejected-note' : 'notice'}` }, `${pv.words.map((w) => `${upperTR(w.word)} ${w.points}`).join(' + ')} = ${pv.total} puan${pv.missing.length ? ` · listede yok: ${pv.missing.join(', ')}` : ''}`));
    } else if (mine) info.push(el('p', { class: 'hint' }, draft.selected != null ? 'Şimdi tahtada bir kareye dokun.' : (firstMove ? 'Raftan bir harf seç; ilk kelime ★ kareden geçmeli.' : 'Raftan bir harf seç, tahtaya koy.')));
    infoBox.replaceChildren(...info);
    btnPlay.disabled = !mine || !pv || !!pv.error || !!draft.exchange;
    btnClear.disabled = !draft.tiles.length && !draft.exchange;
    btnSwap.textContent = draft.exchange ? `Değiştir (${draft.exchange.size})` : 'Harf değiştir';
    btnSwap.disabled = !mine || state.bag.length < RACK || (draft.exchange && !draft.exchange.size);
    btnPass.disabled = !mine;
  };
  const btnPlay = el('button', { type: 'button', class: 'btn btn-primary', onClick: () => {
    const tiles = draft.tiles.map((t) => ({ cell: t.cell, letter: t.letter }));
    sendMove({ type: 'play', tiles });
  } }, 'Oyna');
  const btnClear = el('button', { type: 'button', class: 'btn btn-secondary btn-small', onClick: () => { draft.tiles = []; draft.selected = null; draft.exchange = null; redraw(); } }, 'Geri al');
  const btnSwap = el('button', { type: 'button', class: 'btn btn-secondary btn-small', onClick: () => {
    if (!draft.exchange) { draft.exchange = new Set(); draft.tiles = []; draft.selected = null; redraw(); return; }
    const letters = [...draft.exchange].map((k) => rack[k]);
    draft.exchange = null;
    sendMove({ type: 'exchange', letters });
  } }, 'Harf değiştir');
  const btnPass = el('button', { type: 'button', class: 'btn btn-secondary btn-small', onClick: () => { if (confirm('Pas geçilsin mi?')) sendMove({ type: 'pass' }); } }, 'Pas');

  let status;
  if (state.over) {
    const [a, b] = state.scores;
    const fmt = (x) => (x < 0 ? `−${-x}` : String(x)); // a real minus sign, so '3 – −9' stays readable
    status = `${a === b ? 'Berabere' : `${players[a > b ? 0 : 1]} kazandı`}: ${fmt(a)} – ${fmt(b)} (${state.reason === 'passes' ? 'art arda puansız hamleler' : 'harfler bitti'})`;
  } else if (mine) status = `Sıra sende, ${players[viewer]}`;
  else status = `${players[state.turn]} kelime diziyor…`;
  const lastLine = state.lastWords.length ? el('p', { class: 'hint' }, `Son hamle (${players[opp === state.turn ? viewer : opp]}): ${state.lastWords.map((w) => `${upperTR(w.word)} ${w.points}`).join(', ')}`) : null;
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, status)),
    el('div', { class: 'c4-legend' }, el('span', {}, `${players[0]}: ${state.scores[0]}`), el('span', {}, `${players[1]}: ${state.scores[1]}`), el('span', { class: 'muted' }, `torba ${state.bag.length}`)),
    lastLine,
    boardBox,
    state.over ? null : el('div', { class: 'col-title active' }, `${players[viewer]} — rafın${mine ? '' : ' (bekle)'}`),
    state.over ? null : rackBox,
    state.over ? null : infoBox,
    state.over ? null : el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' } }, btnPlay, btnClear, btnSwap, btnPass),
  );
  redraw();
  return null;
}

export default { id: 'kelime-tahtasi', meta, setup, applyMove, render, getTurn, getResult };
