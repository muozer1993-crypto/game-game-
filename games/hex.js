// Hex — connect your two sides of a rhombus of hexagons before the opponent connects theirs.
// Player 0 links top to bottom, player 1 links left to right; a draw is impossible.
import { el, render as draw } from '../js/ui/dom.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'masa',
  name: 'Hex',
  icon: '⬡',
  description: 'Altıgen tahtada sırayla taş koy; kendi iki kenarını bağlayan kazanır.',
  rules: [
    'Tahta altıgenlerden oluşan bir eşkenar dörtgendir. Bir oyuncu üst ile alt kenarı, diğeri sol ile sağ kenarı bağlamaya çalışır.',
    'Sırayla boş bir altıgene taş konur; taşlar kaldırılmaz. Kendi iki kenarı arasında kesintisiz bir zincir kuran kazanır. Berabere olamaz.',
    'İlk oyuncu her turda rastgele belirlenir; ilk oyuncu üst–alt kenarları alır.',
  ].join('\n'),
  data: [],
  settings: [
    { key: 'size', label: 'Tahta', type: 'select', default: 7, options: [{ value: 5, label: '5×5' }, { value: 7, label: '7×7' }, { value: 9, label: '9×9' }] },
  ],
};

// hex neighbours on an offset-free rhombus grid: (r, c) touches (r-1,c) (r-1,c+1) (r,c-1) (r,c+1) (r+1,c-1) (r+1,c)
const NB = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]];

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const size = [5, 7, 9].includes(Number(options.size)) ? Number(options.size) : 7;
  const first = (Number(options.seed) || 0) % 2;
  return {
    size,
    cells: new Array(size * size).fill(null),
    turn: first,
    vertical: first, // this player connects top and bottom; the other connects left and right
    last: null,
    path: null,
    winner: null,
    over: false,
  };
}

/** The winning chain of `player`'s stones, or null. Stones are player indexes. */
export function winningPath(state, player) {
  const n = state.size;
  const vertical = player === state.vertical;
  const starts = [];
  for (let k = 0; k < n; k++) {
    const i = vertical ? k : k * n; // top row or left column
    if (state.cells[i] === player) starts.push(i);
  }
  const prev = new Map();
  const stack = starts.slice();
  starts.forEach((i) => prev.set(i, -1));
  while (stack.length) {
    const i = stack.pop();
    const r = Math.floor(i / n);
    const c = i % n;
    if (vertical ? r === n - 1 : c === n - 1) {
      const path = [];
      for (let k = i; k !== -1; k = prev.get(k)) path.push(k);
      return path.reverse();
    }
    for (const [dr, dc] of NB) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
      const j = rr * n + cc;
      if (state.cells[j] === player && !prev.has(j)) { prev.set(j, i); stack.push(j); }
    }
  }
  return null;
}

export function applyMove(state, player, move) {
  if (!move || move.type !== 'place') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  const idx = Number(move.cell);
  if (!Number.isInteger(idx) || idx < 0 || idx >= state.cells.length) fail('Geçersiz altıgen');
  if (state.cells[idx] !== null) fail('Bu altıgen dolu');
  const cells = state.cells.slice();
  cells[idx] = player;
  const next = { ...state, cells, last: idx, turn: 1 - player };
  const path = winningPath(next, player);
  if (path) return { ...next, winner: player, path, over: true };
  return next;
}

export function getTurn(state) {
  return state.over ? null : { player: state.turn, private: false };
}

export function getResult(state) {
  return state.over ? { winner: state.winner } : null;
}

const COLOURS = ['#e53935', '#3b6ef6'];

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const mine = !state.over && viewer === state.turn;
  const n = state.size;
  const pathSet = new Set(state.path || []);
  const vert = state.vertical;
  const horiz = 1 - vert;
  const board = el('div', { class: 'hx-board', role: 'grid', 'aria-label': 'Hex tahtası' });
  const cellWidth = `${(50 / n).toFixed(3)}%`; // the last row is shifted by half the board width
  for (let r = 0; r < n; r++) {
    const row = el('div', { class: 'hx-row', style: { marginLeft: `${r * 50 / n}%` } });
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      const v = state.cells[i];
      row.append(el('button', {
        type: 'button',
        class: `hx-cell ${v === null ? '' : `p${v}`} ${pathSet.has(i) ? 'win' : ''} ${state.last === i ? 'last' : ''}`,
        style: { flex: `0 0 ${cellWidth}` },
        'aria-label': `${r + 1}. satır ${c + 1}. sütun${v == null ? '' : `, ${players[v]}`}`,
        disabled: !mine || v !== null,
        onClick: () => sendMove({ type: 'place', cell: i }),
      }));
    }
    board.append(row);
  }
  let status;
  if (state.over) status = `${players[state.winner]} kenarlarını bağladı!`;
  else status = mine ? `Sıra sende, ${players[viewer]}: bir altıgene dokun` : `${players[state.turn]} düşünüyor…`;
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, status)),
    el('div', { class: 'c4-legend' },
      el('span', { class: 'hx-key', style: { color: COLOURS[vert] } }, `${players[vert]}: üst ↔ alt`),
      el('span', { class: 'hx-key', style: { color: COLOURS[horiz] } }, `${players[horiz]}: sol ↔ sağ`),
    ),
    el('div', { class: 'hx-wrap', style: { backgroundImage: `linear-gradient(to bottom, ${COLOURS[vert]} 0, ${COLOURS[vert]} 6px, transparent 6px, transparent calc(100% - 6px), ${COLOURS[vert]} calc(100% - 6px)), linear-gradient(to right, ${COLOURS[horiz]} 0, ${COLOURS[horiz]} 6px, transparent 6px, transparent calc(100% - 6px), ${COLOURS[horiz]} calc(100% - 6px))` } }, board),
    el('p', { class: 'hint' }, `Üst ve alt kenar ${nameSuffix(players[vert], 'in')}, sol ve sağ kenar ${nameSuffix(players[horiz], 'in')}.`),
  );
  return null;
}

export default { id: 'hex', meta, setup, applyMove, render, getTurn, getResult };
