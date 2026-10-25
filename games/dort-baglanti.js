// Dört Bağlantı — drop discs into a 6×7 grid; four in a row (any direction) wins.
import { el, render as draw } from '../js/ui/dom.js';
import { discCanvas, keyDot, PIECE } from '../js/ui/paint.js';

export const meta = {
  group: 'masa',
  name: 'Dört Bağlantı',
  icon: '🔴',
  description: 'Sırayla taş bırak; yatay, dikey ya da çapraz dört taşı yan yana getiren kazanır.',
  rules: [
    'Tahta 6 satır × 7 sütundur. Sırası gelen oyuncu bir sütuna dokunur, taş o sütunun en altındaki boş yere düşer.',
    'Yatay, dikey ya da çapraz olarak dört taşını yan yana getiren kazanır. Tahta dolar ve kimse dört yapamazsa berabere.',
    'Her turda ilk oyuncu rastgele belirlenir.',
  ].join('\n'),
  data: [],
  settings: [],
};

export const ROWS = 6;
export const COLS = 7;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  return {
    rows: ROWS,
    cols: COLS,
    cells: new Array(ROWS * COLS).fill(null), // row-major, row 0 = top
    turn: (Number(options.seed) || 0) % 2,
    winner: null,
    line: null,
    last: null,
    over: false,
  };
}

/** Returns the four winning cell indexes through `idx` for `player`, or null. */
export function findLine(state, idx, player) {
  const r0 = Math.floor(idx / state.cols);
  const c0 = idx % state.cols;
  for (const [dr, dc] of DIRS) {
    const line = [idx];
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign;
      let c = c0 + dc * sign;
      while (r >= 0 && r < state.rows && c >= 0 && c < state.cols && state.cells[r * state.cols + c] === player) {
        line.push(r * state.cols + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 4) return line.sort((a, b) => a - b).slice(0, 4);
  }
  return null;
}

export function applyMove(state, player, move) {
  if (!move || move.type !== 'drop') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  const col = Number(move.col);
  if (!Number.isInteger(col) || col < 0 || col >= state.cols) fail('Geçersiz sütun');
  let row = -1;
  for (let r = state.rows - 1; r >= 0; r--) {
    if (state.cells[r * state.cols + col] === null) { row = r; break; }
  }
  if (row < 0) fail('Bu sütun dolu');
  const cells = state.cells.slice();
  const idx = row * state.cols + col;
  cells[idx] = player;
  const next = { ...state, cells, last: idx, turn: 1 - player };
  const line = findLine(next, idx, player);
  if (line) return { ...next, winner: player, line, over: true };
  if (cells.every((c) => c !== null)) return { ...next, over: true };
  return next;
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
  const mine = !state.over && viewer === state.turn;
  const lineSet = new Set(state.line || []);
  const board = el('div', { class: 'c4-board', role: 'grid', 'aria-label': 'Dört Bağlantı tahtası', style: { gridTemplateColumns: `repeat(${state.cols}, 1fr)` } });
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const idx = r * state.cols + c;
      const v = state.cells[idx];
      board.append(el('button', {
        type: 'button',
        class: `c4-cell ${v === 0 ? 'p0' : v === 1 ? 'p1' : ''} ${lineSet.has(idx) ? 'win' : ''} ${state.last === idx ? 'last' : ''}`,
        'aria-label': `${r + 1}. satır ${c + 1}. sütun${v == null ? '' : `, ${players[v]}`}`,
        disabled: !mine,
        onClick: () => sendMove({ type: 'drop', col: c }),
      }, el('span', { class: 'disc' }, v == null ? null : discCanvas(v === 0 ? PIECE.red : PIECE.yellow))));
    }
  }
  let status;
  if (state.over) status = state.winner == null ? 'Tahta doldu: berabere.' : `${players[state.winner]} dört yaptı!`;
  else status = mine ? `Sıra sende, ${players[viewer]}: bir sütuna dokun` : `${players[state.turn]} düşünüyor…`;
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, status)),
    el('div', { class: 'c4-legend' },
      el('span', { class: 'c4-key' }, keyDot(PIECE.red), players[0]),
      el('span', { class: 'c4-key' }, keyDot(PIECE.yellow), players[1]),
    ),
    board,
  );
  return null;
}

export default { id: 'dort-baglanti', meta, setup, applyMove, render, getTurn, getResult };
