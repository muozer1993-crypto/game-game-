// Dokuz Taş (nine men's morris) — place nine pieces each, then slide them; three in a
// line is a mill and takes an opponent's piece. Below three pieces or no move: you lose.
import { el, svg, render as draw } from '../js/ui/dom.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'masa',
  name: 'Dokuz Taş',
  icon: '🔘',
  description: 'Dokuzar taşı sırayla koy, sonra sür; üç taşı aynı çizgiye getiren rakibin bir taşını alır.',
  rules: [
    'Önce sırayla dokuzar taş boş noktalara konur; sonra taşlar çizgi boyunca komşu boş noktaya sürülür.',
    'Üç taşını aynı çizgiye getirince (üçlü) rakibin bir taşını alırsın; üçlüdeki taşlar, rakibin başka taşı varsa alınamaz.',
    'Üç taşı kalan oyuncu, ayar açıksa taşını istediği boş noktaya uçurabilir. İki taşı kalan ya da sürecek yeri olmayan kaybeder.',
  ].join('\n'),
  data: [],
  settings: [
    { key: 'flying', label: 'Üç taş kalınca uçma', type: 'toggle', default: true, help: 'Açıkken üç taşı kalan oyuncu taşını herhangi bir boş noktaya sürebilir.' },
  ],
};

// 24 points on a 7×7 grid: three squares joined at the midpoints of their sides.
export const COORDS = [[0, 0], [3, 0], [6, 0], [1, 1], [3, 1], [5, 1], [2, 2], [3, 2], [4, 2], [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3], [2, 4], [3, 4], [4, 4], [1, 5], [3, 5], [5, 5], [0, 6], [3, 6], [6, 6]];
export const ADJ = [[1, 9], [0, 2, 4], [1, 14], [4, 10], [1, 3, 5, 7], [4, 13], [7, 11], [4, 6, 8], [7, 12], [0, 10, 21], [3, 9, 11, 18], [6, 10, 15], [8, 13, 17], [5, 12, 14, 20], [2, 13, 23], [11, 16], [15, 17, 19], [12, 16], [10, 19], [16, 18, 20, 22], [13, 19], [9, 22], [19, 21, 23], [14, 22]];
export const MILLS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
];
export const PIECES = 9;

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  return {
    points: new Array(24).fill(null),
    hand: [PIECES, PIECES],
    turn: (Number(options.seed) || 0) % 2,
    flying: options.flying !== false,
    mustRemove: false,   // the player on turn formed a mill and now takes a piece
    last: null,          // { from?, to?, removed? }
    over: false,
    winner: null,
    reason: null,        // 'pieces' | 'blocked'
  };
}

export const count = (points, p) => points.reduce((n, v) => n + (v === p ? 1 : 0), 0);

export function inMill(points, idx, player) {
  return MILLS.some((m) => m.includes(idx) && m.every((i) => points[i] === player));
}

/** Opponent pieces that may be taken: those outside mills, or all of them if every piece is in a mill. */
export function removable(points, opponent) {
  const all = [];
  for (let i = 0; i < 24; i++) if (points[i] === opponent) all.push(i);
  const free = all.filter((i) => !inMill(points, i, opponent));
  return free.length ? free : all;
}

export function legalMoves(state, player) {
  const out = [];
  if (state.hand[player] > 0) {
    for (let i = 0; i < 24; i++) if (state.points[i] === null) out.push({ to: i });
    return out;
  }
  const fly = state.flying && count(state.points, player) === 3;
  for (let from = 0; from < 24; from++) {
    if (state.points[from] !== player) continue;
    const targets = fly ? [...Array(24).keys()] : ADJ[from];
    for (const to of targets) if (state.points[to] === null) out.push({ from, to });
  }
  return out;
}

function finishTurn(state, player) {
  const opp = 1 - player;
  if (count(state.points, opp) + state.hand[opp] < 3) return { ...state, mustRemove: false, over: true, winner: player, reason: 'pieces' };
  const next = { ...state, turn: opp, mustRemove: false };
  if (!legalMoves(next, opp).length) return { ...next, over: true, winner: player, reason: 'blocked' };
  return next;
}

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  const opp = 1 - player;
  const points = state.points.slice();
  if (move.type === 'remove') {
    if (!state.mustRemove) fail('Alınacak taş yok');
    const idx = Number(move.point);
    if (!Number.isInteger(idx) || idx < 0 || idx >= 24) fail('Geçersiz nokta');
    if (points[idx] !== opp) fail('Rakibin bir taşını seçmelisin');
    if (!removable(points, opp).includes(idx)) fail('Üçlüdeki taş alınamaz');
    points[idx] = null;
    return finishTurn({ ...state, points, last: { ...(state.last || {}), removed: idx } }, player);
  }
  if (state.mustRemove) fail('Önce rakibin bir taşını al');
  const hand = state.hand.slice();
  let last;
  let idx;
  if (move.type === 'place') {
    if (hand[player] <= 0) fail('Elinde taş kalmadı; bir taşını sür');
    idx = Number(move.point);
    if (!Number.isInteger(idx) || idx < 0 || idx >= 24) fail('Geçersiz nokta');
    if (points[idx] !== null) fail('Bu nokta dolu');
    points[idx] = player;
    hand[player] -= 1;
    last = { to: idx };
  } else if (move.type === 'move') {
    if (hand[player] > 0) fail('Önce elindeki taşları koy');
    const from = Number(move.from);
    idx = Number(move.to);
    if (![from, idx].every((i) => Number.isInteger(i) && i >= 0 && i < 24)) fail('Geçersiz nokta');
    if (points[from] !== player) fail('Kendi taşını seçmelisin');
    if (points[idx] !== null) fail('Bu nokta dolu');
    const fly = state.flying && count(points, player) === 3;
    if (!fly && !ADJ[from].includes(idx)) fail('Taş yalnızca çizgi boyunca komşu noktaya sürülür');
    points[from] = null;
    points[idx] = player;
    last = { from, to: idx };
  } else {
    fail(`Bilinmeyen hamle: ${move.type}`);
  }
  const next = { ...state, points, hand, last };
  if (inMill(points, idx, player) && removable(points, opp).length) return { ...next, mustRemove: true };
  return finishTurn(next, player);
}

export function getTurn(state) {
  return state.over ? null : { player: state.turn, private: false };
}

export function getResult(state) {
  return state.over ? { winner: state.winner } : null;
}

// ------------------------------------------------------------------ rendering
const COLORS = ['#e53935', '#3b6ef6'];
let selected = null;   // the viewer's piece picked up to move (UI only)
let selectedFor = null;

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  if (selectedFor !== state) { selected = null; selectedFor = state; }
  const mine = !state.over && viewer === state.turn;
  const opp = 1 - viewer;
  const placing = state.hand[viewer] > 0;
  const fly = state.flying && !placing && count(state.points, viewer) === 3;
  const moves = mine ? legalMoves(state, viewer) : [];
  const removables = mine && state.mustRemove ? new Set(removable(state.points, opp)) : new Set();
  const boardBox = el('div');

  const drawBoard = () => {
    const U = 100;
    const M = 50;
    const pos = (i) => [M + COORDS[i][0] * U, M + COORDS[i][1] * U];
    const root = svg('svg', { viewBox: '0 0 700 700', class: 'nm-board', role: 'img', 'aria-label': 'Dokuz Taş tahtası' });
    const line = (a, b) => { const [x1, y1] = pos(a); const [x2, y2] = pos(b); root.append(svg('line', { x1, y1, x2, y2, stroke: 'currentColor', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.6 })); };
    for (const [a, , c] of MILLS) line(a, c);
    // empty points are plain dots; only the targets of a picked-up piece are highlighted
    const targets = new Set(state.mustRemove ? [] : (selected != null ? moves.filter((m) => m.from === selected).map((m) => m.to) : (placing ? moves.map((m) => m.to) : [])));
    const marked = new Set(selected != null ? targets : []);
    const movable = new Set(!placing && !state.mustRemove ? moves.map((m) => m.from) : []);
    for (let i = 0; i < 24; i++) {
      const [x, y] = pos(i);
      const v = state.points[i];
      const isLast = state.last && (state.last.to === i);
      if (v === null) {
        root.append(svg('circle', { cx: x, cy: y, r: marked.has(i) ? 14 : 8, fill: marked.has(i) ? COLORS[viewer] : 'currentColor', opacity: marked.has(i) ? 0.55 : 0.5 }));
      } else {
        root.append(svg('circle', {
          cx: x, cy: y, r: 30, fill: COLORS[v],
          stroke: selected === i ? '#ffd54f' : (removables.has(i) ? '#ffd54f' : (isLast ? 'currentColor' : 'rgba(0,0,0,0.35)')),
          'stroke-width': selected === i || removables.has(i) ? 6 : 3,
          'stroke-dasharray': removables.has(i) ? '8 6' : null,
        }));
      }
      let action = null;
      let kind = '';
      if (mine) {
        if (state.mustRemove) { if (removables.has(i)) { kind = 'take'; action = () => sendMove({ type: 'remove', point: i }); } }
        else if (placing) { if (targets.has(i)) { kind = 'place'; action = () => sendMove({ type: 'place', point: i }); } }
        else if (selected != null && targets.has(i)) { kind = 'target'; action = () => { const from = selected; selected = null; sendMove({ type: 'move', from, to: i }); }; }
        else if (v === viewer && movable.has(i)) { kind = selected === i ? 'unpick' : 'pick'; action = () => { selected = selected === i ? null : i; boardBox.replaceChildren(drawBoard()); }; }
        else if (selected != null) { kind = 'unpick'; action = () => { selected = null; boardBox.replaceChildren(drawBoard()); }; }
      }
      if (action) {
        root.append(svg('circle', { cx: x, cy: y, r: 46, fill: 'transparent', class: `nm-hit ${kind}`, onClick: action, role: 'button', tabindex: 0, 'aria-label': `${i + 1}. nokta` }));
      }
    }
    return root;
  };
  boardBox.append(drawBoard());

  let status;
  if (state.over) {
    const loser = 1 - state.winner;
    status = `${players[state.winner]} kazandı: ${state.reason === 'blocked' ? `${nameSuffix(players[loser], 'in')} sürecek taşı kalmadı` : `${nameSuffix(players[loser], 'in')} iki taşı kaldı`}.`;
  } else if (mine && state.mustRemove) status = `Üçlü yaptın, ${players[viewer]}! Rakibin bir taşını al`;
  else if (mine && placing) status = `Sıra sende, ${players[viewer]}: bir taş koy (elinde ${state.hand[viewer]})`;
  else if (mine) status = `Sıra sende, ${players[viewer]}: ${fly ? 'bir taşını seç, istediğin boş noktaya uçur' : 'bir taşını seç, komşu noktaya sür'}`;
  else if (state.mustRemove) status = `${players[state.turn]} üçlü yaptı, bir taşını alıyor…`;
  else status = `${players[state.turn]} ${state.hand[state.turn] > 0 ? 'taş koyuyor' : 'taş sürüyor'}…`;

  const legend = (p) => el('span', { class: 'nm-key', style: { '--c': COLORS[p] } }, `${players[p]}: tahtada ${count(state.points, p)}${state.hand[p] ? `, elde ${state.hand[p]}` : ''}`);
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, status)),
    el('div', { class: 'c4-legend' }, legend(0), legend(1)),
    boardBox,
  );
  return null;
}

export default { id: 'dokuz-tas', meta, setup, applyMove, render, getTurn, getResult };
