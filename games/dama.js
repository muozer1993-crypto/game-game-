// Dama — Turkish draughts on an 8×8 board. Men move forward or sideways one square and
// capture by jumping orthogonally; kings (dama) move any distance. Capturing is mandatory,
// and the sequence that captures the most pieces must be chosen.
import { el, render as draw } from '../js/ui/dom.js';

export const meta = {
  group: 'masa',
  name: 'Dama',
  icon: '⬛',
  description: 'Türk daması: ileri ve yana git, atlayarak al, almak zorunlu.',
  rules: [
    'Her oyuncunun 16 taşı vardır (2. ve 3. sıralar). Taşlar ileri ya da yana bir kare gider; geriye gidemez.',
    'Rakip taşının üstünden boş kareye atlayarak alınır; aynı hamlede art arda atlanabilir. Alma zorunludur ve en çok taş alan dizi seçilmelidir.',
    'Son sıraya ulaşan taş dama olur: dama ileri, geri ve yana istediği kadar gider ve uzaktan da alabilir.',
    'Taşı kalmayan ya da hamlesi olmayan kaybeder. Bir taşa karşı bir dama kazanır.',
    'Oynamak için taşa, sonra gideceği kareye dokun; çoklu almada her atlama için sırayla dokun.',
  ].join('\n'),
  data: [],
  settings: [],
};

const N = 8;
const DIRS_MAN = [[0, 1], [0, -1]]; // sideways; forward is per player
const ALL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const cells = new Array(64).fill(null); // { p: 0|1, k: bool }
  for (const c of [0, 1, 2, 3, 4, 5, 6, 7]) {
    cells[1 * N + c] = { p: 1, k: false };
    cells[2 * N + c] = { p: 1, k: false };
    cells[5 * N + c] = { p: 0, k: false };
    cells[6 * N + c] = { p: 0, k: false };
  }
  // player 0 moves up (row decreasing), player 1 moves down
  return { cells, turn: (Number(options.seed) || 0) % 2, over: false, winner: null, chain: null, last: [] };
}

const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const idx = (r, c) => r * N + c;
const forward = (p) => (p === 0 ? -1 : 1);

/** All capture sequences for the piece at `from`. Each: { path: [idx...], captured: [idx...] }. */
function captureSequences(cells, from, p) {
  const piece = cells[from];
  const results = [];
  const r0 = Math.floor(from / N);
  const c0 = from % N;
  const dirs = piece.k ? ALL_DIRS : [[forward(p), 0], ...DIRS_MAN];
  const rec = (r, c, taken, path, isKing) => {
    let extended = false;
    for (const [dr, dc] of dirs) {
      if (isKing) {
        // king: slide over empty squares, jump exactly one enemy, land on any empty square after it
        let rr = r + dr;
        let cc = c + dc;
        while (inside(rr, cc) && cells[idx(rr, cc)] === null) { rr += dr; cc += dc; }
        if (!inside(rr, cc)) continue;
        const target = idx(rr, cc);
        if (cells[target] === null || cells[target].p === p || taken.includes(target)) continue;
        let lr = rr + dr;
        let lc = cc + dc;
        while (inside(lr, lc) && (cells[idx(lr, lc)] === null || idx(lr, lc) === from)) {
          extended = true;
          rec(lr, lc, taken.concat([target]), path.concat([idx(lr, lc)]), true);
          lr += dr;
          lc += dc;
        }
      } else {
        const mr = r + dr;
        const mc = c + dc;
        const lr = r + 2 * dr;
        const lc = c + 2 * dc;
        if (!inside(lr, lc)) continue;
        const target = idx(mr, mc);
        const land = idx(lr, lc);
        if (cells[target] === null || cells[target].p === p || taken.includes(target)) continue;
        if (cells[land] !== null && land !== from) continue;
        extended = true;
        // a man that reaches the last row keeps capturing as a king in Turkish draughts; keep it simple: continue as man
        rec(lr, lc, taken.concat([target]), path.concat([land]), false);
      }
    }
    if (!extended && taken.length) results.push({ path, captured: taken });
  };
  rec(r0, c0, [], [from], piece.k);
  return results;
}

/** All legal full moves for player p: { from, path, captured }. Captures are mandatory, max-capture rule applies. */
export function legalMoves(state, p = state.turn) {
  if (state.over) return [];
  const { cells } = state;
  const captures = [];
  for (let i = 0; i < 64; i++) {
    const piece = cells[i];
    if (!piece || piece.p !== p) continue;
    for (const seq of captureSequences(cells, i, p)) captures.push({ from: i, ...seq });
  }
  if (captures.length) {
    const max = Math.max(...captures.map((m) => m.captured.length));
    return captures.filter((m) => m.captured.length === max);
  }
  const moves = [];
  for (let i = 0; i < 64; i++) {
    const piece = cells[i];
    if (!piece || piece.p !== p) continue;
    const r = Math.floor(i / N);
    const c = i % N;
    const dirs = piece.k ? ALL_DIRS : [[forward(p), 0], ...DIRS_MAN];
    for (const [dr, dc] of dirs) {
      let rr = r + dr;
      let cc = c + dc;
      while (inside(rr, cc) && cells[idx(rr, cc)] === null) {
        moves.push({ from: i, path: [i, idx(rr, cc)], captured: [] });
        if (!piece.k) break;
        rr += dr;
        cc += dc;
      }
    }
  }
  return moves;
}

function countPieces(cells, p) {
  let men = 0;
  let kings = 0;
  for (const c of cells) if (c && c.p === p) { if (c.k) kings++; else men++; }
  return { men, kings, total: men + kings };
}

export function applyMove(state, player, move) {
  if (!move || move.type !== 'move') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  const from = Number(move.from);
  const path = Array.isArray(move.path) ? move.path.map(Number) : [];
  const legal = legalMoves(state, player).find((m) => m.from === from && m.path.length === path.length + 1 && m.path.slice(1).every((x, k) => x === path[k]));
  if (!legal) fail('Bu hamle kurallara uymuyor (alma zorunludur ve en çok taş alan dizi seçilmelidir)');
  const cells = state.cells.slice();
  const piece = { ...cells[from] };
  cells[from] = null;
  for (const t of legal.captured) cells[t] = null;
  const to = legal.path[legal.path.length - 1];
  const lastRow = player === 0 ? 0 : N - 1;
  if (Math.floor(to / N) === lastRow) piece.k = true;
  cells[to] = piece;
  let next = { ...state, cells, turn: 1 - player, last: legal.path };
  const mine = countPieces(cells, player);
  const theirs = countPieces(cells, 1 - player);
  if (theirs.total === 0) return { ...next, over: true, winner: player };
  if (!legalMoves(next, 1 - player).length) return { ...next, over: true, winner: player };
  // a lone man against a king loses
  if (theirs.total === 1 && theirs.kings === 0 && mine.kings >= 1) return { ...next, over: true, winner: player };
  if (mine.total === 1 && mine.kings === 0 && theirs.kings >= 1) return { ...next, over: true, winner: 1 - player };
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
  const online = ctx.mode === 'online';
  const flip = online && viewer === 1; // the online guest sees its pieces at the bottom
  const mine = !state.over && viewer === state.turn;
  const moves = mine ? legalMoves(state) : [];
  let selected = null;
  let partial = []; // chosen path squares so far (multi-capture)
  const boardBox = el('div', { class: 'dama-board', role: 'grid', 'aria-label': 'Dama tahtası' });
  const lastSet = new Set(state.last || []);

  const drawBoard = () => {
    const candidates = selected === null ? [] : moves.filter((m) => m.from === selected && partial.every((x, k) => m.path[k + 1] === x));
    const nextSquares = new Map();
    for (const m of candidates) {
      const sq = m.path[partial.length + 1];
      if (sq !== undefined) nextSquares.set(sq, m);
    }
    const sources = new Set(moves.map((m) => m.from));
    const cells = [];
    for (let d = 0; d < 64; d++) {
      const i = flip ? 63 - d : d;
      const r = Math.floor(i / N);
      const c = i % N;
      const piece = state.cells[i];
      const isNext = nextSquares.has(i);
      const dark = (r + c) % 2 === 1;
      cells.push(el('button', {
        type: 'button',
        class: `dama-sq ${dark ? 'dark' : ''} ${sources.has(i) && selected === null ? 'source' : ''} ${selected === i ? 'selected' : ''} ${isNext ? 'target' : ''} ${lastSet.has(i) ? 'last' : ''}`,
        disabled: !mine || !(sources.has(i) || isNext || selected === i),
        'aria-label': `${String.fromCharCode(97 + c)}${N - r}${piece ? `, ${players[piece.p]}${piece.k ? ' dama' : ''}` : ''}`,
        onClick: () => {
          if (isNext) {
            const m = nextSquares.get(i);
            partial = partial.concat([i]);
            // complete when the chosen prefix equals a full legal path and no longer continuation exists
            const exact = candidates.find((x) => x.path.length === partial.length + 1 && x.path.slice(1).every((v, k) => v === partial[k]));
            const longer = candidates.some((x) => x.path.length > partial.length + 1 && partial.every((v, k) => x.path[k + 1] === v));
            if (exact && !longer) { sendMove({ type: 'move', from: selected, path: partial }); return; }
            if (!longer && !exact) { sendMove({ type: 'move', from: selected, path: m.path.slice(1) }); return; }
            drawBoard();
            return;
          }
          if (selected === i) { selected = null; partial = []; } else { selected = i; partial = []; }
          drawBoard();
        },
      }, piece ? el('span', { class: `dama-piece p${piece.p} ${piece.k ? 'king' : ''}` }, piece.k ? '♛' : '') : null));
    }
    draw(boardBox, cells);
  };
  drawBoard();

  const a = countPieces(state.cells, 0);
  const b = countPieces(state.cells, 1);
  let status;
  if (state.over) status = `${players[state.winner]} kazandı!`;
  else if (mine) status = moves.some((m) => m.captured.length) ? `Sıra sende, ${players[viewer]}: alma zorunlu!` : `Sıra sende, ${players[viewer]}: taşı seç`;
  else status = `${players[state.turn]} düşünüyor…`;
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, status)),
    el('div', { class: 'c4-legend' },
      el('span', { class: 'dama-key p0' }, `${players[0]}: ${a.total}${a.kings ? ` (${a.kings} dama)` : ''}`),
      el('span', { class: 'dama-key p1' }, `${players[1]}: ${b.total}${b.kings ? ` (${b.kings} dama)` : ''}`),
    ),
    boardBox,
    el('p', { class: 'hint' }, flip ? 'Taşların yukarı doğru ilerler.' : `${players[0]} yukarı, ${players[1]} aşağı ilerler.`),
  );
  return null;
}

export default { id: 'dama', meta, setup, applyMove, render, getTurn, getResult };
