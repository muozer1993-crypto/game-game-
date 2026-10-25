// Beş Taş (gomoku) — place stones on a grid; five in a row in any direction wins.
import { el, render as draw } from '../js/ui/dom.js';
import { discCanvas, keyDot, PIECE } from '../js/ui/paint.js';

export const meta = {
  group: 'masa',
  name: 'Beş Taş',
  icon: '⚫',
  description: 'Sırayla taş koy; yatay, dikey ya da çapraz beş taşı yan yana getiren kazanır.',
  rules: [
    'Boş tahtaya sırayla taş konur; siyah başlar (ilk oyuncu her turda rastgele seçilir).',
    'Yatay, dikey ya da çapraz olarak beş (ya da daha çok) taşını yan yana getiren kazanır. Tahta dolar ve kimse beş yapamazsa berabere.',
  ].join('\n'),
  data: [],
  settings: [
    { key: 'size', label: 'Tahta', type: 'select', default: 13, options: [{ value: 11, label: '11×11' }, { value: 13, label: '13×13' }, { value: 15, label: '15×15' }] },
  ],
};

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const size = [11, 13, 15].includes(Number(options.size)) ? Number(options.size) : 13;
  return {
    size,
    cells: new Array(size * size).fill(null),
    turn: (Number(options.seed) || 0) % 2,
    black: (Number(options.seed) || 0) % 2, // the first player plays black
    last: null,
    line: null,
    winner: null,
    over: false,
  };
}

/** Five (or more) in a row through `idx` for `player`, or null. */
export function findLine(state, idx, player) {
  const n = state.size;
  const r0 = Math.floor(idx / n);
  const c0 = idx % n;
  for (const [dr, dc] of DIRS) {
    const line = [idx];
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign;
      let c = c0 + dc * sign;
      while (r >= 0 && r < n && c >= 0 && c < n && state.cells[r * n + c] === player) {
        line.push(r * n + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 5) return line.sort((a, b) => a - b);
  }
  return null;
}

export function applyMove(state, player, move) {
  if (!move || move.type !== 'place') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  const idx = Number(move.cell);
  if (!Number.isInteger(idx) || idx < 0 || idx >= state.cells.length) fail('Geçersiz kare');
  if (state.cells[idx] !== null) fail('Bu kare dolu');
  const cells = state.cells.slice();
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
  const colour = (p) => (p === state.black ? 'black' : 'white');
  const lineSet = new Set(state.line || []);
  const board = el('div', { class: `gm-board ${state.size === 15 ? 'dense' : ''}`, role: 'grid', 'aria-label': 'Beş Taş tahtası', style: { gridTemplateColumns: `repeat(${state.size}, 1fr)` } });
  for (let i = 0; i < state.cells.length; i++) {
    const v = state.cells[i];
    board.append(el('button', {
      type: 'button',
      class: `gm-cell ${v === null ? '' : colour(v)} ${lineSet.has(i) ? 'win' : ''} ${state.last === i ? 'last' : ''}`,
      'aria-label': `${Math.floor(i / state.size) + 1}. satır ${(i % state.size) + 1}. sütun${v == null ? '' : `, ${players[v]}`}`,
      disabled: !mine || v !== null,
      onClick: () => sendMove({ type: 'place', cell: i }),
    }, v === null ? null : el('span', { class: 'stone' }, discCanvas(PIECE[colour(v)], { size: state.size >= 13 ? 56 : 80 }))));
  }
  let status;
  if (state.over) status = state.winner == null ? 'Tahta doldu: berabere.' : `${players[state.winner]} beş yaptı!`;
  else status = mine ? `Sıra sende, ${players[viewer]} (${colour(viewer) === 'black' ? 'siyah' : 'beyaz'}): bir kareye dokun` : `${players[state.turn]} düşünüyor…`;
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, status)),
    el('div', { class: 'c4-legend' },
      el('span', { class: 'rv-key' }, keyDot(PIECE[colour(0)]), players[0]),
      el('span', { class: 'rv-key' }, keyDot(PIECE[colour(1)]), players[1]),
    ),
    board,
  );
  return null;
}

export default { id: 'bes-tas', meta, setup, applyMove, render, getTurn, getResult };
