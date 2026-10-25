// Satranç — full chess: castling, en passant, promotion, check/checkmate, stalemate,
// insufficient material, fifty-move rule and threefold repetition.
import { el, render as draw } from '../js/ui/dom.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'masa',
  name: 'Satranç',
  icon: '♞',
  description: 'Klasik satranç: rok, geçerken alma, piyon terfisi, şah mat, pat.',
  rules: [
    'Beyaz başlar; ilk oyuncunun rengi her turda rastgele belirlenir. Taşına dokun, gidebileceği kareler işaretlenir, karesine dokun.',
    'Rok, geçerken alma ve terfi (vezir/kale/fil/at seçimi) uygulanır. Şahı tehdit altındayken onu kurtarmayan hamle yapılamaz.',
    'Şah mat kazandırır. Pat, yetersiz materyal, elli hamle kuralı ve üç kez tekrar beraberliktir. "Pes" ile oyun bırakılabilir.',
  ].join('\n'),
  data: [],
  settings: [],
};

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const BISHOP = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function fail(msg) {
  throw new Error(msg);
}

export const sq = (r, c) => r * 8 + c;
export const rowOf = (i) => Math.floor(i / 8);
export const colOf = (i) => i % 8;
export const name = (i) => `${'abcdefgh'[colOf(i)]}${8 - rowOf(i)}`;
export const index = (n) => sq(8 - Number(n[1]), 'abcdefgh'.indexOf(n[0]));
const other = (c) => (c === 'w' ? 'b' : 'w');

export function initialCells() {
  const cells = new Array(64).fill(null);
  const back = 'rnbqkbnr';
  for (let c = 0; c < 8; c++) {
    cells[sq(0, c)] = `b${back[c]}`;
    cells[sq(1, c)] = 'bp';
    cells[sq(6, c)] = 'wp';
    cells[sq(7, c)] = `w${back[c]}`;
  }
  return cells;
}

export function setup(options = {}) {
  const cells = initialCells();
  return {
    id: String(options.seed ?? ''),
    cells,
    white: (Number(options.seed) || 0) % 2, // which player plays white
    turn: 'w',
    castling: 'KQkq',
    ep: null,            // square a pawn may capture en passant onto
    half: 0,             // half-moves since the last capture or pawn move
    full: 1,
    last: null,          // { from, to }
    check: false,
    keys: { [positionKey(cells, 'w', 'KQkq', null)]: 1 },
    over: false,
    result: null,        // { winner: 'w'|'b' } | { draw: true }
    reason: null,        // 'mate' | 'stalemate' | 'material' | 'fifty' | 'repetition' | 'resign'
    captured: { w: [], b: [] }, // pieces taken by each colour
  };
}

/** State from a FEN string (tests and positions): pieces, side to move, castling, en passant, half/full moves. */
export function fromFen(fen, options = {}) {
  const [board, turn = 'w', castling = '-', epName = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
  const cells = new Array(64).fill(null);
  let i = 0;
  for (const ch of board) {
    if (ch === '/') continue;
    if (/\d/.test(ch)) { i += Number(ch); continue; }
    cells[i++] = `${ch === ch.toUpperCase() ? 'w' : 'b'}${ch.toLowerCase()}`;
  }
  const ep = epName === '-' ? null : index(epName);
  const base = setup(options);
  return {
    ...base, cells, turn, castling: castling === '-' ? '-' : castling, ep, half: Number(half), full: Number(full),
    check: inCheck(cells, turn), keys: { [positionKey(cells, turn, castling, ep)]: 1 },
  };
}

export function positionKey(cells, turn, castling, ep) {
  return `${cells.map((p) => p || '-').join('')}|${turn}|${castling}|${ep == null ? '-' : ep}`;
}

/** Is `square` attacked by `by` ('w'|'b')? */
export function attacked(cells, square, by) {
  const r = rowOf(square);
  const c = colOf(square);
  const at = (rr, cc) => (rr < 0 || rr > 7 || cc < 0 || cc > 7 ? undefined : cells[sq(rr, cc)]);
  const pawnDir = by === 'w' ? 1 : -1; // a white pawn attacks upward, so it sits one row below
  for (const dc of [-1, 1]) if (at(r + pawnDir, c + dc) === `${by}p`) return true;
  for (const [dr, dc] of KNIGHT) if (at(r + dr, c + dc) === `${by}n`) return true;
  for (const [dr, dc] of KING) if (at(r + dr, c + dc) === `${by}k`) return true;
  const slide = (dirs, types) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr;
      let cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        const p = cells[sq(rr, cc)];
        if (p) { if (p[0] === by && types.includes(p[1])) return true; break; }
        rr += dr;
        cc += dc;
      }
    }
    return false;
  };
  return slide(BISHOP, 'bq') || slide(ROOK, 'rq');
}

export const kingSquare = (cells, colour) => cells.indexOf(`${colour}k`);
export const inCheck = (cells, colour) => attacked(cells, kingSquare(cells, colour), other(colour));

function pseudoMoves(state, colour) {
  const { cells } = state;
  const out = [];
  const add = (from, to, extra = {}) => out.push({ from, to, ...extra });
  for (let from = 0; from < 64; from++) {
    const p = cells[from];
    if (!p || p[0] !== colour) continue;
    const r = rowOf(from);
    const c = colOf(from);
    const t = p[1];
    if (t === 'p') {
      const dir = colour === 'w' ? -1 : 1;
      const startRow = colour === 'w' ? 6 : 1;
      const lastRow = colour === 'w' ? 0 : 7;
      const push = (to, extra) => {
        if (rowOf(to) === lastRow) for (const promo of ['q', 'r', 'b', 'n']) add(from, to, { ...extra, promo });
        else add(from, to, extra);
      };
      const one = sq(r + dir, c);
      if (r + dir >= 0 && r + dir < 8 && !cells[one]) {
        push(one, {});
        const two = sq(r + 2 * dir, c);
        if (r === startRow && !cells[two]) add(from, two, { double: true });
      }
      for (const dc of [-1, 1]) {
        const cc = c + dc;
        if (cc < 0 || cc > 7 || r + dir < 0 || r + dir > 7) continue;
        const to = sq(r + dir, cc);
        if (cells[to] && cells[to][0] !== colour) push(to, { capture: true });
        else if (state.ep === to) add(from, to, { ep: true, capture: true });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, dc] of (t === 'n' ? KNIGHT : KING)) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
        const to = sq(rr, cc);
        if (!cells[to]) add(from, to);
        else if (cells[to][0] !== colour) add(from, to, { capture: true });
      }
      if (t === 'k') {
        const home = colour === 'w' ? 7 : 0;
        const rights = state.castling;
        const kingSide = colour === 'w' ? 'K' : 'k';
        const queenSide = colour === 'w' ? 'Q' : 'q';
        if (from === sq(home, 4) && !inCheck(cells, colour)) {
          const enemy = other(colour);
          if (rights.includes(kingSide) && cells[sq(home, 7)] === `${colour}r` && !cells[sq(home, 5)] && !cells[sq(home, 6)]
            && !attacked(cells, sq(home, 5), enemy) && !attacked(cells, sq(home, 6), enemy)) add(from, sq(home, 6), { castle: 'k' });
          if (rights.includes(queenSide) && cells[sq(home, 0)] === `${colour}r` && !cells[sq(home, 1)] && !cells[sq(home, 2)] && !cells[sq(home, 3)]
            && !attacked(cells, sq(home, 3), enemy) && !attacked(cells, sq(home, 2), enemy)) add(from, sq(home, 2), { castle: 'q' });
        }
      }
    } else {
      const dirs = t === 'b' ? BISHOP : t === 'r' ? ROOK : BISHOP.concat(ROOK);
      for (const [dr, dc] of dirs) {
        let rr = r + dr;
        let cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
          const to = sq(rr, cc);
          if (!cells[to]) add(from, to);
          else { if (cells[to][0] !== colour) add(from, to, { capture: true }); break; }
          rr += dr;
          cc += dc;
        }
      }
    }
  }
  return out;
}

/** Board after `move` (no legality check): cells, castling rights, ep square, captured piece. */
function play(state, move) {
  const cells = state.cells.slice();
  const piece = cells[move.from];
  const colour = piece[0];
  let captured = cells[move.to];
  cells[move.to] = move.promo ? `${colour}${move.promo}` : piece;
  cells[move.from] = null;
  if (move.ep) {
    const capSq = sq(rowOf(move.from), colOf(move.to));
    captured = cells[capSq];
    cells[capSq] = null;
  }
  if (move.castle) {
    const home = rowOf(move.from);
    if (move.castle === 'k') { cells[sq(home, 5)] = cells[sq(home, 7)]; cells[sq(home, 7)] = null; }
    else { cells[sq(home, 3)] = cells[sq(home, 0)]; cells[sq(home, 0)] = null; }
  }
  let castling = state.castling;
  const drop = (letters) => { castling = castling.split('').filter((ch) => !letters.includes(ch)).join(''); };
  if (piece[1] === 'k') drop(colour === 'w' ? 'KQ' : 'kq');
  if (piece[1] === 'r') {
    if (move.from === sq(7, 0)) drop('Q');
    if (move.from === sq(7, 7)) drop('K');
    if (move.from === sq(0, 0)) drop('q');
    if (move.from === sq(0, 7)) drop('k');
  }
  if (move.to === sq(7, 0)) drop('Q');
  if (move.to === sq(7, 7)) drop('K');
  if (move.to === sq(0, 0)) drop('q');
  if (move.to === sq(0, 7)) drop('k');
  // the en passant square only matters (and only changes the position) when an enemy pawn
  // stands beside the pushed pawn; otherwise it would spoil repetition detection
  let ep = null;
  if (move.double) {
    const enemyPawn = `${other(colour)}p`;
    const r = rowOf(move.to);
    const c = colOf(move.to);
    if ((c > 0 && cells[sq(r, c - 1)] === enemyPawn) || (c < 7 && cells[sq(r, c + 1)] === enemyPawn)) ep = sq((rowOf(move.from) + r) / 2, c);
  }
  return { cells, castling: castling || '-', ep, captured, piece };
}

export function legalMoves(state, colour = state.turn) {
  return pseudoMoves(state, colour).filter((m) => !inCheck(play(state, m).cells, colour));
}

export function perft(state, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of legalMoves(state)) {
    const next = applyMove({ ...state, over: false }, state.white === 0 ? (state.turn === 'w' ? 0 : 1) : (state.turn === 'w' ? 1 : 0), { type: 'move', from: m.from, to: m.to, promo: m.promo });
    n += perft(next, depth - 1);
  }
  return n;
}

function insufficient(cells) {
  const pieces = cells.filter((p) => p && p[1] !== 'k');
  if (!pieces.length) return true;
  if (pieces.length === 1 && 'bn'.includes(pieces[0][1])) return true;
  if (pieces.length === 2 && pieces.every((p) => p[1] === 'b')) {
    // two bishops of opposite colours on same-coloured squares cannot mate
    const squares = cells.map((p, i) => (p && p[1] === 'b' ? i : -1)).filter((i) => i >= 0);
    const colours = new Set(squares.map((i) => (rowOf(i) + colOf(i)) % 2));
    if (pieces[0][0] !== pieces[1][0] && colours.size === 1) return true;
  }
  return false;
}

export const colourOf = (state, player) => (player === state.white ? 'w' : 'b');
export const playerOf = (state, colour) => (colour === 'w' ? state.white : 1 - state.white);

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  const colour = colourOf(state, player);
  if (move.type === 'resign') {
    return { ...state, over: true, result: { winner: other(colour) }, reason: 'resign' };
  }
  if (move.type !== 'move') fail(`Bilinmeyen hamle: ${move.type}`);
  if (colour !== state.turn) fail('Sıra sende değil');
  const from = Number(move.from);
  const to = Number(move.to);
  const legal = legalMoves(state, colour).find((m) => m.from === from && m.to === to && (m.promo || null) === (move.promo || null));
  if (!legal) {
    const piece = state.cells[from];
    if (!piece || piece[0] !== colour) fail('Kendi taşını seçmelisin');
    if (legalMoves(state, colour).some((m) => m.from === from && m.to === to)) fail('Terfi taşını seç');
    fail(inCheck(state.cells, colour) ? 'Şah tehdit altında: önce onu kurtar' : 'Bu taş oraya gidemez');
  }
  const { cells, castling, ep, captured, piece } = play(state, legal);
  const next = other(colour);
  const half = legal.capture || piece[1] === 'p' ? 0 : state.half + 1;
  const key = positionKey(cells, next, castling, ep);
  const keys = { ...state.keys, [key]: (state.keys[key] || 0) + 1 };
  const capturedList = { w: state.captured.w.slice(), b: state.captured.b.slice() };
  if (captured) capturedList[colour].push(captured[1]);
  let out = {
    ...state, cells, castling, ep, half, full: state.full + (colour === 'b' ? 1 : 0), last: { from, to }, keys,
    turn: next, check: inCheck(cells, next), captured: capturedList,
  };
  const replies = legalMoves(out, next);
  if (!replies.length) out = out.check ? { ...out, over: true, result: { winner: colour }, reason: 'mate' } : { ...out, over: true, result: { draw: true }, reason: 'stalemate' };
  else if (insufficient(cells)) out = { ...out, over: true, result: { draw: true }, reason: 'material' };
  else if (half >= 100) out = { ...out, over: true, result: { draw: true }, reason: 'fifty' };
  else if (keys[key] >= 3) out = { ...out, over: true, result: { draw: true }, reason: 'repetition' };
  return out;
}

export function getTurn(state) {
  return state.over ? null : { player: playerOf(state, state.turn), private: false };
}

export function getResult(state) {
  if (!state.over) return null;
  if (state.result.draw) return { draw: true };
  return { winner: playerOf(state, state.result.winner) };
}

// ------------------------------------------------------------------ rendering
const GLYPH = { wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙', bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟' };
const REASON = { mate: 'şah mat', stalemate: 'pat', material: 'yetersiz materyal', fifty: 'elli hamle kuralı', repetition: 'üç kez tekrar', resign: 'pes' };
let selected = null;
let selectedFor = null;
let pendingPromo = null; // { from, to }

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  if (selectedFor !== state) { selected = null; pendingPromo = null; selectedFor = state; }
  const mine = !state.over && viewer === playerOf(state, state.turn);
  const myColour = colourOf(state, viewer);
  // one phone: white at the bottom; two phones: your own colour at the bottom
  const flip = online && myColour === 'b';
  const moves = mine ? legalMoves(state, state.turn) : [];
  const boardBox = el('div');
  const promoBox = el('div');

  const drawBoard = () => {
    const targets = new Set(selected == null ? [] : moves.filter((m) => m.from === selected).map((m) => m.to));
    const board = el('div', { class: 'ch-board', role: 'grid', 'aria-label': 'Satranç tahtası' });
    const kingInCheck = state.check ? kingSquare(state.cells, state.turn) : -1;
    for (let k = 0; k < 64; k++) {
      const i = flip ? 63 - k : k;
      const p = state.cells[i];
      const dark = (rowOf(i) + colOf(i)) % 2 === 1;
      const isLast = state.last && (state.last.from === i || state.last.to === i);
      const canPick = mine && p && p[0] === state.turn && moves.some((m) => m.from === i);
      board.append(el('button', {
        type: 'button',
        class: `ch-cell ${dark ? 'dark' : 'light'} ${isLast ? 'last' : ''} ${selected === i ? 'sel' : ''} ${targets.has(i) ? (p ? 'capture' : 'target') : ''} ${i === kingInCheck ? 'check' : ''} ${p ? p[0] : ''}`,
        'aria-label': `${name(i)}${p ? `, ${GLYPH[p]}` : ''}`,
        disabled: !mine || !(canPick || targets.has(i) || selected != null),
        onClick: () => {
          if (targets.has(i)) {
            const from = selected;
            const promo = moves.some((m) => m.from === from && m.to === i && m.promo);
            if (promo) { pendingPromo = { from, to: i }; drawPromo(); return; }
            selected = null;
            sendMove({ type: 'move', from, to: i });
            return;
          }
          selected = canPick && selected !== i ? i : null;
          pendingPromo = null;
          drawPromo();
          boardBox.replaceChildren(drawBoard());
        },
      }, p ? el('span', { class: 'ch-piece' }, GLYPH[p]) : null));
    }
    return board;
  };
  const drawPromo = () => {
    if (!pendingPromo) { draw(promoBox); return; }
    const { from, to } = pendingPromo;
    draw(promoBox, el('div', { class: 'ch-promo card' },
      el('div', { class: 'muted' }, 'Piyon terfi ediyor, taşı seç:'),
      el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px' } },
        [['q', 'Vezir'], ['r', 'Kale'], ['b', 'Fil'], ['n', 'At']].map(([promo, label]) =>
          el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => { pendingPromo = null; selected = null; sendMove({ type: 'move', from, to, promo }); } },
            `${GLYPH[`${state.turn}${promo}`]} ${label}`)))));
  };
  boardBox.append(drawBoard());
  drawPromo();

  const colourName = (c) => (c === 'w' ? 'Beyaz' : 'Siyah');
  let status;
  if (state.over) {
    status = state.result.draw ? `Berabere (${REASON[state.reason]}).` : `${players[playerOf(state, state.result.winner)]} kazandı (${REASON[state.reason]})!`;
  } else if (mine) status = `${state.check ? 'Şah! ' : ''}Sıra sende, ${players[viewer]} (${colourName(myColour)})${selected != null ? ': nereye?' : ''}`;
  else status = `${state.check ? 'Şah! ' : ''}${players[playerOf(state, state.turn)]} (${colourName(state.turn)}) düşünüyor…`;
  const material = (c) => state.captured[c].reduce((s, t) => s + PIECE_VALUE[t], 0);
  const capLine = (c) => el('span', {}, `${players[playerOf(state, c)]} aldı: ${state.captured[c].map((t) => GLYPH[`${other(c)}${t}`]).join('') || '—'}${material(c) > material(other(c)) ? ` (+${material(c) - material(other(c))})` : ''}`);
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, status)),
    el('div', { class: 'c4-legend ch-legend' }, capLine('w'), capLine('b')),
    boardBox,
    promoBox,
    mine ? el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '10px' } },
      el('button', { type: 'button', class: 'btn btn-secondary btn-small', onClick: () => { if (confirm('Pes ediyor musun?')) sendMove({ type: 'resign' }); } }, 'Pes')) : null,
    el('p', { class: 'hint' }, `${state.full}. hamle · ${nameSuffix(players[playerOf(state, 'w')], 'in')} rengi beyaz`),
  );
  return null;
}

export default { id: 'satranc', meta, setup, applyMove, render, getTurn, getResult };
