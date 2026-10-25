// XOX — tic-tac-toe on a 3×3 grid.
import { el, render as draw } from '../js/ui/dom.js';

export const meta = {
  name: 'XOX',
  icon: '❌',
  description: 'Klasik üç taş: sırayla işaret koy, üçünü yan yana getiren kazanır.',
  rules: [
    '3×3 tahtada sırayla X ve O konur. Yatay, dikey ya da çapraz üçünü yan yana getiren kazanır; tahta dolarsa berabere.',
    'Her turda X ile başlayan oyuncu rastgele belirlenir.',
  ].join('\n'),
  data: [],
  settings: [],
};

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const first = (Number(options.seed) || 0) % 2;
  return { cells: new Array(9).fill(null), turn: first, first, winner: null, line: null, over: false };
}

export function applyMove(state, player, move) {
  if (!move || move.type !== 'mark') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  const i = Number(move.cell);
  if (!Number.isInteger(i) || i < 0 || i > 8) fail('Geçersiz kare');
  if (state.cells[i] !== null) fail('Bu kare dolu');
  const cells = state.cells.slice();
  cells[i] = player;
  const line = LINES.find((l) => l.every((k) => cells[k] === player)) || null;
  if (line) return { ...state, cells, line, winner: player, over: true, turn: 1 - player };
  if (cells.every((c) => c !== null)) return { ...state, cells, over: true, turn: 1 - player };
  return { ...state, cells, turn: 1 - player };
}

export function getTurn(state) {
  return state.over ? null : { player: state.turn, private: false };
}

export function getResult(state) {
  if (!state.over) return null;
  return state.winner == null ? { draw: true } : { winner: state.winner };
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const mark = (p) => (p === state.first ? 'X' : 'O');
  const mine = !state.over && viewer === state.turn;
  const lineSet = new Set(state.line || []);
  const board = el('div', { class: 'xox-board', role: 'grid', 'aria-label': 'XOX tahtası' },
    state.cells.map((v, i) => el('button', {
      type: 'button',
      class: `xox-cell ${lineSet.has(i) ? 'win' : ''} ${v === null ? '' : `p${v}`}`,
      disabled: !mine || v !== null,
      'aria-label': `${Math.floor(i / 3) + 1}. satır ${(i % 3) + 1}. sütun${v == null ? '' : `, ${mark(v)}`}`,
      onClick: () => sendMove({ type: 'mark', cell: i }),
    }, v == null ? '' : mark(v))),
  );
  let status;
  if (state.over) status = state.winner == null ? 'Berabere.' : `${players[state.winner]} (${mark(state.winner)}) kazandı!`;
  else status = mine ? `Sıra sende, ${players[viewer]} (${mark(viewer)})` : `${players[state.turn]} (${mark(state.turn)}) düşünüyor…`;
  draw(container, el('div', { class: 'status-line' }, el('strong', {}, status)), board);
  return null;
}

export default { id: 'xox', meta, setup, applyMove, render, getTurn, getResult };
