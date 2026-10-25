// Kızma Birader — Ludo for two (opposite corners). Roll a six to leave the base, race round the
// 52-square loop, land on an opponent to send them home, exact roll into the centre. A six, a
// capture or a piece reaching home gives another roll; three sixes in a row lose the turn.
import { el, svg, render as draw } from '../js/ui/dom.js';
import { createRng } from '../js/lib/rng.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'masa',
  name: 'Kızma Birader',
  icon: '🎯',
  description: 'Altı at, taşını çıkar, rakibini ez, tam sayıyla eve gir. Klasik zar yarışı.',
  rules: [
    'Taşlar başlangıçta evde bekler; çıkarmak için 6 gerekir. Zar kaç geldiyse bir taşını o kadar ilerletirsin. Altı atan bir daha atar; üst üste üç altı sırayı yakar.',
    'Rakibin taşının üstüne gelirsen (yıldızlı güvenli kareler hariç) onu başa yollarsın ve bir daha atarsın. Son kareye tam sayıyla girilir; eve giren taş da bir zar daha kazandırır.',
    'Bütün taşlarını eve sokan kazanır. Oynanabilir taşın yoksa sıra kendiliğinden geçer.',
  ].join('\n'),
  data: [],
  settings: [
    { key: 'pieces', label: 'Taş sayısı', type: 'select', default: 2, options: [{ value: 2, label: '2 (hızlı)' }, { value: 4, label: '4 (klasik)' }] },
  ],
};

export const HOME = 56;           // relative position of a finished piece
export const START = [1, 27];     // absolute track index of each player's start square
export const SAFE = [1, 9, 14, 22, 27, 35, 40, 48];
// the 52-square loop on a 15×15 grid, clockwise from the left arm's top lane
export const TRACK = [];
{
  const push = (c, r) => TRACK.push([c, r]);
  for (let c = 0; c <= 5; c++) push(c, 6);
  for (let r = 5; r >= 0; r--) push(6, r);
  push(7, 0);
  for (let r = 0; r <= 5; r++) push(8, r);
  for (let c = 9; c <= 14; c++) push(c, 6);
  push(14, 7);
  for (let c = 14; c >= 9; c--) push(c, 8);
  for (let r = 9; r <= 14; r++) push(8, r);
  push(7, 14);
  for (let r = 14; r >= 9; r--) push(6, r);
  for (let c = 5; c >= 0; c--) push(c, 8);
  push(0, 7);
}
// home columns (relative 51..55) and the centre (56)
export const HOME_COL = [[[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]], [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]]];
const CENTRE = [[6.5, 7], [7.5, 7]];
const BASE = [[0, 9], [9, 0]]; // top-left corner of each 6×6 base block

function fail(msg) {
  throw new Error(msg);
}

export const absIndex = (player, rel) => (START[player] + rel) % 52;

export function setup(options = {}) {
  const n = [2, 4].includes(Number(options.pieces)) ? Number(options.pieces) : 2;
  return {
    id: String(options.seed ?? ''),
    seed: Number(options.seed) || 1,
    pieces: [Array(n).fill(-1), Array(n).fill(-1)], // -1 base, 0..50 track, 51..55 home column, 56 home
    turn: 0,
    die: null,
    rollCount: 0,
    sixes: 0,
    last: null,
    phase: 'play',
    winner: null,
  };
}

export function rollDie(seed, n) {
  return 1 + Math.floor(createRng(((Number(seed) || 1) + n * 7919) >>> 0)() * 6);
}

/** Indexes of the pieces `player` may move with `die`. */
export function legalMoves(state, player, die) {
  return state.pieces[player].map((p, i) => i).filter((i) => {
    const p = state.pieces[player][i];
    if (p === HOME) return false;
    if (p === -1) return die === 6;
    return p + die <= HOME;
  });
}

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.phase !== 'play') fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  const opp = 1 - player;
  switch (move.type) {
    case 'roll': {
      if (state.die != null) fail('Zarı attın: bir taş seç');
      const die = rollDie(state.seed, state.rollCount);
      const rollCount = state.rollCount + 1;
      const sixes = die === 6 ? state.sixes + 1 : 0;
      if (sixes >= 3) return { ...state, die: null, rollCount, sixes: 0, turn: opp, last: { player, die, event: 'threeSixes' } };
      if (!legalMoves(state, player, die).length) return { ...state, die: null, rollCount, sixes: 0, turn: opp, last: { player, die, event: 'noMove' } };
      return { ...state, die, rollCount, sixes, last: { player, die, event: 'rolled' } };
    }
    case 'move': {
      if (state.die == null) fail('Önce zar at');
      const i = Number(move.piece);
      if (!legalMoves(state, player, state.die).includes(i)) fail('Bu taş oynanamaz');
      const pieces = state.pieces.map((l) => l.slice());
      const from = pieces[player][i];
      const to = from === -1 ? 0 : from + state.die;
      pieces[player][i] = to;
      let captured = 0;
      if (to <= 50) {
        const abs = absIndex(player, to);
        if (!SAFE.includes(abs)) {
          pieces[opp] = pieces[opp].map((q) => { if (q >= 0 && q <= 50 && absIndex(opp, q) === abs) { captured += 1; return -1; } return q; });
        }
      }
      const finished = pieces[player].every((q) => q === HOME);
      const again = state.die === 6 || captured > 0 || to === HOME;
      const last = { player, die: state.die, from, to, captured, event: to === HOME ? 'home' : captured ? 'capture' : 'moved' };
      if (finished) return { ...state, pieces, die: null, last, phase: 'over', winner: player };
      return { ...state, pieces, die: null, last, turn: again ? player : opp, sixes: again ? state.sixes : 0 };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase !== 'play') return null;
  return { player: state.turn, private: false }; // nothing is hidden
}

export function getResult(state) {
  return state.phase === 'over' ? { winner: state.winner } : null;
}

// ----------------------------------------------------------------- render
const COLOURS = ['#e53935', '#fbc02d'];
const LIGHT = ['#ffcdd2', '#fff3c4'];
const DIE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** Grid coordinates (cell units) of a piece: base slot, track square, home column or centre. */
function cellOf(player, rel, slot) {
  if (rel === -1) { const [bx, by] = BASE[player]; return [bx + 1.5 + (slot % 2) * 3, by + 1.5 + Math.floor(slot / 2) * 3]; }
  if (rel <= 50) { const [c, r] = TRACK[absIndex(player, rel)]; return [c + 0.5, r + 0.5]; }
  if (rel < HOME) { const [c, r] = HOME_COL[player][rel - 51]; return [c + 0.5, r + 0.5]; }
  return [CENTRE[player][0] + 0.5, CENTRE[player][1] + 0.5];
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  const p = state.turn;
  const mine = !online || viewer === p;
  const legal = state.die != null && mine && state.phase === 'play' ? legalMoves(state, p, state.die) : [];
  const board = svg('svg', { class: 'ld-board', viewBox: '0 0 15 15', role: 'img', 'aria-label': 'Kızma Birader tahtası' });
  const rect = (x, y, w, h, fill, extra = {}) => svg('rect', { x, y, width: w, height: h, fill, ...extra });
  // the two corners no player uses, so the board still reads as a Ludo board
  [[0, 0], [9, 9]].forEach(([bx, by]) => board.append(rect(bx, by, 6, 6, 'var(--secondary)', { rx: 0.4, opacity: 0.6 })));
  // bases
  BASE.forEach(([bx, by], q) => {
    board.append(rect(bx, by, 6, 6, LIGHT[q], { rx: 0.4 }));
    board.append(rect(bx + 1, by + 1, 4, 4, 'var(--card)', { rx: 0.3, stroke: COLOURS[q], 'stroke-width': 0.08 }));
  });
  // the loop
  TRACK.forEach(([c, r], i) => {
    const startOf = START.indexOf(i);
    board.append(rect(c, r, 1, 1, startOf >= 0 ? LIGHT[startOf] : 'var(--card)', { stroke: 'var(--border)', 'stroke-width': 0.05 }));
    if (SAFE.includes(i)) board.append(svg('text', { x: c + 0.5, y: r + 0.72, 'text-anchor': 'middle', 'font-size': 0.6, fill: 'var(--muted)', text: '★' }));
  });
  HOME_COL.forEach((col, q) => col.forEach(([c, r]) => board.append(rect(c, r, 1, 1, LIGHT[q], { stroke: 'var(--border)', 'stroke-width': 0.05 }))));
  // the centre: two coloured halves
  board.append(svg('polygon', { points: '6,6 7.5,7.5 6,9', fill: COLOURS[0] }));
  board.append(svg('polygon', { points: '9,6 7.5,7.5 9,9', fill: COLOURS[1] }));
  board.append(svg('polygon', { points: '6,6 9,6 7.5,7.5', fill: 'var(--secondary)' }));
  board.append(svg('polygon', { points: '6,9 9,9 7.5,7.5', fill: 'var(--secondary)' }));
  // pieces (stacked pieces on one square are spread a little)
  const groups = new Map();
  [0, 1].forEach((q) => state.pieces[q].forEach((rel, i) => {
    const [x, y] = cellOf(q, rel, i);
    const key = rel === -1 ? `b${q}${i}` : `${x},${y}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ q, i, rel, x, y });
  }));
  for (const list of groups.values()) {
    list.forEach((pc, k) => {
      const off = list.length > 1 ? (k - (list.length - 1) / 2) * 0.28 : 0;
      const movable = pc.q === p && legal.includes(pc.i);
      const lastMoved = state.last && state.last.player === pc.q && state.last.to === pc.rel && state.last.event !== 'rolled' && state.last.event !== 'noMove';
      board.append(svg('circle', {
        cx: (pc.x + off).toFixed(2), cy: pc.y.toFixed(2), r: 0.38, fill: COLOURS[pc.q], stroke: movable ? '#111' : lastMoved ? '#fff' : 'rgba(0,0,0,0.35)', 'stroke-width': movable ? 0.12 : 0.06,
        class: `ld-piece p${pc.q} ${movable ? 'movable' : ''}`, role: movable ? 'button' : null, tabindex: movable ? '0' : null,
        'aria-label': `${players[pc.q]} taş ${pc.i + 1}${pc.rel === -1 ? ' (evde)' : pc.rel === HOME ? ' (bitirdi)' : ''}`,
        onClick: movable ? () => sendMove({ type: 'move', piece: pc.i }) : null,
      }));
    });
  }
  const L = state.last;
  let note = null;
  if (L) {
    const who = players[L.player];
    if (L.event === 'threeSixes') note = `${who} üst üste üç altı attı: sıra yandı.`;
    else if (L.event === 'noMove') note = `${who} ${L.die} attı, oynayacak taşı yok.`;
    else if (L.event === 'capture') note = `${who} ${nameSuffix(players[1 - L.player], 'in')} taşını başa yolladı!`;
    else if (L.event === 'home') note = `${nameSuffix(who, 'in')} bir taşı eve girdi.`;
  }
  const done = [0, 1].map((q) => state.pieces[q].filter((x) => x === HOME).length);
  const legend = el('div', { class: 'c4-legend' },
    el('span', { style: { color: COLOURS[0] } }, `● ${players[0]}: ${done[0]}/${state.pieces[0].length} evde`),
    el('span', { style: { color: '#b8860b' } }, `● ${players[1]}: ${done[1]}/${state.pieces[1].length} evde`));
  if (state.phase === 'over') {
    draw(container, el('div', { class: 'status-line' }, el('strong', {}, `${players[state.winner]} bütün taşlarını eve soktu!`)), legend, el('div', { class: 'ld-wrap' }, board));
    return null;
  }
  const dieView = state.die != null || (L && L.event === 'noMove') ? el('span', { class: 'ld-die', 'aria-label': `zar ${state.die ?? L.die}` }, DIE_FACES[state.die ?? L.die]) : null;
  let status;
  if (!mine) status = `${players[p]} oynuyor…`;
  else if (state.die == null) status = `${players[p]}, zar at`;
  else status = `${players[p]}: ${state.die} attın, bir taş seç`;
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, status), dieView),
    note ? el('p', { class: 'hint' }, note) : null,
    el('div', { class: 'ld-wrap' }, board),
    mine && state.die == null ? el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', onClick: () => sendMove({ type: 'roll' }) }, 'Zar at') : null,
    mine && state.die != null ? el('p', { class: 'hint' }, 'Koyu çerçeveli taşlardan birine dokun.') : null,
    legend,
  );
  return null;
}

export default { id: 'kizma-birader', meta, setup, applyMove, render, getTurn, getResult };
