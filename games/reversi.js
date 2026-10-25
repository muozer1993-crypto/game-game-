// Reversi (Othello) — place a disc so that it sandwiches the opponent's discs; they flip.
// No legal move: the turn passes. Neither can move: whoever has more discs wins.
import { el, render as draw } from '../js/ui/dom.js';
import { nameSuffix } from '../js/lib/tr.js';
import { discCanvas, keyDot, PIECE } from '../js/ui/paint.js';

export const meta = {
  group: 'masa',
  name: 'Reversi',
  icon: '⚫',
  description: 'Rakibin taşlarını iki taşının arasına al, hepsi senin rengine döner. Tahta dolunca çok taşı olan kazanır.',
  rules: [
    'Tahta 8×8, ortada ikişer taşla başlar. Siyah başlar.',
    'Taşını öyle koy ki rakibin bir ya da daha çok taşı, yeni taşınla bir başka taşının arasında kalsın (yatay, dikey ya da çapraz); aradakiler senin rengine döner. En az bir taş çevirmeyen hamle yapılamaz.',
    'Oynayacak yerin yoksa sıra rakibe geçer. İkiniz de oynayamazsanız oyun biter; çok taşı olan kazanır.',
  ].join('\n'),
  data: [],
  settings: [],
};

export const N = 8;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const cells = new Array(N * N).fill(null);
  const first = (Number(options.seed) || 0) % 2; // plays black and starts
  const second = 1 - first;
  cells[3 * N + 3] = second; // d4 white
  cells[3 * N + 4] = first;  // e4 black
  cells[4 * N + 3] = first;  // d5 black
  cells[4 * N + 4] = second; // e5 white
  return {
    cells,
    black: first,
    turn: first,
    last: null,
    flipped: [],
    passed: null, // player who had to pass before this turn, if any
    over: false,
  };
}

/** Discs flipped by `player` placing at `idx`, or [] if the move is illegal. */
export function flips(cells, idx, player) {
  if (cells[idx] !== null) return [];
  const r0 = Math.floor(idx / N);
  const c0 = idx % N;
  const out = [];
  for (const [dr, dc] of DIRS) {
    const run = [];
    let r = r0 + dr;
    let c = c0 + dc;
    while (r >= 0 && r < N && c >= 0 && c < N && cells[r * N + c] === 1 - player) {
      run.push(r * N + c);
      r += dr;
      c += dc;
    }
    if (run.length && r >= 0 && r < N && c >= 0 && c < N && cells[r * N + c] === player) out.push(...run);
  }
  return out;
}

export function legalMoves(cells, player) {
  const out = [];
  for (let i = 0; i < N * N; i++) if (flips(cells, i, player).length) out.push(i);
  return out;
}

export function counts(cells) {
  const c = [0, 0];
  for (const v of cells) if (v !== null) c[v] += 1;
  return c;
}

export function applyMove(state, player, move) {
  if (!move || move.type !== 'place') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  const idx = Number(move.cell);
  if (!Number.isInteger(idx) || idx < 0 || idx >= N * N) fail('Geçersiz kare');
  if (state.cells[idx] !== null) fail('Bu kare dolu');
  const taken = flips(state.cells, idx, player);
  if (!taken.length) fail('Bu hamle hiç taş çevirmiyor');
  const cells = state.cells.slice();
  cells[idx] = player;
  for (const i of taken) cells[i] = player;
  const other = 1 - player;
  if (legalMoves(cells, other).length) return { ...state, cells, last: idx, flipped: taken, passed: null, turn: other };
  if (legalMoves(cells, player).length) return { ...state, cells, last: idx, flipped: taken, passed: other, turn: player };
  return { ...state, cells, last: idx, flipped: taken, passed: null, over: true };
}

export function getTurn(state) {
  return state.over ? null : { player: state.turn, private: false };
}

export function getResult(state) {
  if (!state.over) return null;
  const [a, b] = counts(state.cells);
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const mine = !state.over && viewer === state.turn;
  const colour = (p) => (p === state.black ? 'black' : 'white');
  const colourName = (p) => (p === state.black ? 'Siyah' : 'Beyaz');
  const legal = new Set(mine ? legalMoves(state.cells, viewer) : []);
  const flippedSet = new Set(state.flipped || []);
  const [c0, c1] = counts(state.cells);
  const board = el('div', { class: 'rv-board', role: 'grid', 'aria-label': 'Reversi tahtası' });
  for (let i = 0; i < N * N; i++) {
    const v = state.cells[i];
    board.append(el('button', {
      type: 'button',
      class: `rv-cell ${v === null ? '' : colour(v)} ${legal.has(i) ? 'legal' : ''} ${state.last === i ? 'last' : ''} ${flippedSet.has(i) ? 'flipped' : ''}`,
      'aria-label': `${String.fromCharCode(97 + (i % N))}${Math.floor(i / N) + 1}${v === null ? '' : `, ${players[v]}`}`,
      disabled: !mine || !legal.has(i),
      onClick: () => sendMove({ type: 'place', cell: i }),
    }, v === null ? (legal.has(i) ? el('span', { class: 'disc' }) : null) : el('span', { class: 'disc' }, discCanvas(PIECE[colour(v)]))));
  }
  let status;
  if (state.over) {
    status = c0 === c1 ? `Berabere: ${c0}–${c1}` : `${players[c0 > c1 ? 0 : 1]} kazandı: ${Math.max(c0, c1)}–${Math.min(c0, c1)}`;
  } else if (mine) status = `Sıra sende, ${players[viewer]} (${colourName(viewer)}): bir noktaya dokun`;
  else status = `${players[state.turn]} (${colourName(state.turn)}) düşünüyor…`;
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, status)),
    state.passed != null && !state.over ? el('p', { class: 'hint notice' }, `${players[state.passed]} oynayamadı, sıra yine ${nameSuffix(players[state.turn], 'de')}.`) : null,
    el('div', { class: 'c4-legend' },
      el('span', { class: 'rv-key' }, keyDot(PIECE[colour(0)]), `${players[0]}: ${c0}`),
      el('span', { class: 'rv-key' }, keyDot(PIECE[colour(1)]), `${players[1]}: ${c1}`),
    ),
    board,
  );
  return null;
}

export default { id: 'reversi', meta, setup, applyMove, render, getTurn, getResult };
