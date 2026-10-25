// Noktalar ve Kutular — draw lines between dots; closing a box scores it and grants
// another move. Most boxes wins.
import { el, svg, render as draw } from '../js/ui/dom.js';

export const meta = {
  name: 'Noktalar ve Kutular',
  icon: '🔲',
  description: 'Noktaların arasına çizgi çek; kutuyu kapatan puanı alır ve bir daha oynar.',
  rules: [
    'Sırayla iki nokta arasına bir çizgi çekilir. Bir kutunun dördüncü kenarını çeken kutuyu alır ve yeniden oynar.',
    'Bütün kutular dolunca çok kutusu olan kazanır. Eşitlikte berabere.',
  ].join('\n'),
  data: [],
  settings: [
    { key: 'size', label: 'Tahta (kutu sayısı)', type: 'select', default: 4, options: [{ value: 3, label: '3 × 3' }, { value: 4, label: '4 × 4' }, { value: 5, label: '5 × 5' }, { value: 6, label: '6 × 6' }] },
  ],
};

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const n = [3, 4, 5, 6].includes(Number(options.size)) ? Number(options.size) : 4;
  return {
    n,
    h: new Array((n + 1) * n).fill(null), // horizontal lines: (n+1) rows × n columns, owner or null
    v: new Array(n * (n + 1)).fill(null), // vertical lines: n rows × (n+1) columns
    boxes: new Array(n * n).fill(null),
    scores: [0, 0],
    turn: (Number(options.seed) || 0) % 2,
    last: null,
    over: false,
  };
}

const hIdx = (n, r, c) => r * n + c;          // r in 0..n, c in 0..n-1
const vIdx = (n, r, c) => r * (n + 1) + c;    // r in 0..n-1, c in 0..n

function boxComplete(state, r, c) {
  const { n, h, v } = state;
  return h[hIdx(n, r, c)] !== null && h[hIdx(n, r + 1, c)] !== null && v[vIdx(n, r, c)] !== null && v[vIdx(n, r, c + 1)] !== null;
}

export function applyMove(state, player, move) {
  if (!move || move.type !== 'line') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  const { n } = state;
  const index = Number(move.index);
  const kind = move.kind;
  if (kind !== 'h' && kind !== 'v') fail('Geçersiz çizgi');
  const arr = state[kind];
  if (!Number.isInteger(index) || index < 0 || index >= arr.length) fail('Geçersiz çizgi');
  if (arr[index] !== null) fail('Bu çizgi zaten çekilmiş');
  const next = { ...state, [kind]: arr.slice(), boxes: state.boxes.slice(), scores: state.scores.slice(), last: { kind, index } };
  next[kind][index] = player;
  // boxes touching this line
  const touched = [];
  if (kind === 'h') {
    const r = Math.floor(index / n);
    const c = index % n;
    if (r > 0) touched.push([r - 1, c]);
    if (r < n) touched.push([r, c]);
  } else {
    const r = Math.floor(index / (n + 1));
    const c = index % (n + 1);
    if (c > 0) touched.push([r, c - 1]);
    if (c < n) touched.push([r, c]);
  }
  let closed = 0;
  for (const [r, c] of touched) {
    if (next.boxes[r * n + c] === null && boxComplete(next, r, c)) {
      next.boxes[r * n + c] = player;
      next.scores[player] += 1;
      closed += 1;
    }
  }
  if (!closed) next.turn = 1 - player;
  if (next.boxes.every((b) => b !== null)) next.over = true;
  return next;
}

export function getTurn(state) {
  return state.over ? null : { player: state.turn, private: false };
}

export function getResult(state) {
  if (!state.over) return null;
  const [a, b] = state.scores;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

const COLORS = ['#e53935', '#3b6ef6'];

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const { n } = state;
  const mine = !state.over && viewer === state.turn;
  const S = 64;        // spacing between dots in SVG units
  const M = 20;        // margin
  const size = M * 2 + S * n;
  const root = svg('svg', { viewBox: `0 0 ${size} ${size}`, class: 'dab-board', role: 'img', 'aria-label': 'Noktalar ve kutular tahtası' });

  // boxes
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const owner = state.boxes[r * n + c];
      if (owner === null) continue;
      root.append(svg('rect', { x: M + c * S + 4, y: M + r * S + 4, width: S - 8, height: S - 8, rx: 6, fill: COLORS[owner], opacity: 0.25 }));
      root.append(svg('text', { x: M + c * S + S / 2, y: M + r * S + S / 2 + 7, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, fill: COLORS[owner], text: players[owner][0].toLocaleUpperCase('tr-TR') }));
    }
  }
  // lines (taken + free hit areas)
  const line = (kind, index, x1, y1, x2, y2) => {
    const owner = state[kind][index];
    const isLast = state.last && state.last.kind === kind && state.last.index === index;
    if (owner !== null) {
      root.append(svg('line', { x1, y1, x2, y2, stroke: COLORS[owner], 'stroke-width': isLast ? 8 : 6, 'stroke-linecap': 'round' }));
    } else {
      root.append(svg('line', { x1, y1, x2, y2, stroke: 'currentColor', 'stroke-width': 2, 'stroke-dasharray': '2 6', opacity: 0.35, 'stroke-linecap': 'round' }));
      if (mine) {
        root.append(svg('line', {
          x1, y1, x2, y2, stroke: 'transparent', 'stroke-width': 26, class: 'dab-hit', 'stroke-linecap': 'round',
          onClick: () => sendMove({ type: 'line', kind, index }),
        }));
      }
    }
  };
  for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) line('h', hIdx(n, r, c), M + c * S + 8, M + r * S, M + (c + 1) * S - 8, M + r * S);
  for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) line('v', vIdx(n, r, c), M + c * S, M + r * S + 8, M + c * S, M + (r + 1) * S - 8);
  // dots on top
  for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) root.append(svg('circle', { cx: M + c * S, cy: M + r * S, r: 6, fill: 'currentColor' }));

  let status;
  if (state.over) status = state.scores[0] === state.scores[1] ? 'Berabere.' : `${players[state.scores[0] > state.scores[1] ? 0 : 1]} daha çok kutu aldı!`;
  else status = mine ? `Sıra sende, ${players[viewer]}: bir çizgi çek` : `${players[state.turn]} düşünüyor…`;
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, status)),
    el('div', { class: 'c4-legend' },
      el('span', { class: 'dab-key', style: { color: COLORS[0] } }, `${players[0]}: ${state.scores[0]}`),
      el('span', { class: 'dab-key', style: { color: COLORS[1] } }, `${players[1]}: ${state.scores[1]}`),
    ),
    el('div', { class: 'dab-wrap' }, root),
  );
  return null;
}

export default { id: 'noktalar-kutular', meta, setup, applyMove, render, getTurn, getResult };
