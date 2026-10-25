// Go — 9×9 (or 13×13) with area scoring. Captures, suicide forbidden, simple ko. Two passes
// open the counting phase: tap groups to mark them dead, both confirm, komi 6.5 to white.
import { el, svg, render as draw } from '../js/ui/dom.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'masa',
  name: 'Go (9×9)',
  icon: '⚫',
  description: 'Taşlarınla alan çevir, nefessiz kalan taşları al; iki pas sonra sayım.',
  rules: [
    'Siyah başlar, sırayla kesişimlere taş konur. Nefesi (bitişik boş noktası) kalmayan taş grubu alınır. Kendi grubunu nefessiz bırakan hamle yasaktır; ko: alınan tek taş hemen geri alınamaz.',
    'İkiniz de art arda pas geçince sayım başlar: ölü saydığınız gruplara dokunup işaretleyin, ikiniz de onaylayın. Alan sayımı: taşların + yalnızca kendi taşlarınla çevrili boş noktalar. Beyaz 6,5 komi alır.',
    'Sayımda anlaşamazsanız "Oyuna dön" ile devam edin. Puanı yüksek olan kazanır.',
  ].join('\n'),
  data: [],
  settings: [
    { key: 'size', label: 'Tahta', type: 'select', default: 9, options: [{ value: 9, label: '9×9' }, { value: 13, label: '13×13' }] },
  ],
};

export const KOMI = 6.5;

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const size = [9, 13].includes(Number(options.size)) ? Number(options.size) : 9;
  return {
    id: String(options.seed ?? ''),
    size,
    board: new Array(size * size).fill(null), // null, 0 (black), 1 (white)
    turn: 0,
    passes: 0,
    ko: null,            // point that may not be played this turn (simple ko)
    captures: [0, 0],    // stones captured by each player
    last: null,
    phase: 'play',       // play | count | over
    dead: [],            // indexes of stones marked dead during counting
    agree: [false, false],
    result: null,
  };
}

export function neighbours(size, i) {
  const r = Math.floor(i / size);
  const c = i % size;
  const out = [];
  if (r > 0) out.push(i - size);
  if (r < size - 1) out.push(i + size);
  if (c > 0) out.push(i - 1);
  if (c < size - 1) out.push(i + 1);
  return out;
}

/** Connected group of `i` and the set of its liberties. */
export function group(board, size, i) {
  const colour = board[i];
  const stones = [i];
  const seen = new Set([i]);
  const liberties = new Set();
  for (let k = 0; k < stones.length; k++) {
    for (const n of neighbours(size, stones[k])) {
      if (board[n] === null) liberties.add(n);
      else if (board[n] === colour && !seen.has(n)) { seen.add(n); stones.push(n); }
    }
  }
  return { stones, liberties };
}

/** Try a move: returns { board, captured } or a string error. */
export function tryPlace(state, player, i) {
  const { size } = state;
  if (!Number.isInteger(i) || i < 0 || i >= size * size) return 'Geçersiz nokta';
  if (state.board[i] !== null) return 'Burası dolu';
  if (state.ko === i) return 'Ko: bu taş hemen geri alınamaz';
  const board = state.board.slice();
  board[i] = player;
  let captured = [];
  for (const n of neighbours(size, i)) {
    if (board[n] === 1 - player) {
      const g = group(board, size, n);
      if (!g.liberties.size) { captured = captured.concat(g.stones); g.stones.forEach((s) => { board[s] = null; }); }
    }
  }
  if (!group(board, size, i).liberties.size) return 'İntihar: grubun nefessiz kalır';
  return { board, captured };
}

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.phase === 'over') fail('Oyun bitti');
  const opp = 1 - player;
  if (state.phase === 'count') {
    switch (move.type) {
      case 'dead': {
        const i = Number(move.cell);
        if (state.board[i] == null) fail('Burada taş yok');
        const g = group(state.board, state.size, i).stones;
        const dead = new Set(state.dead);
        const marking = !dead.has(i);
        g.forEach((s) => { if (marking) dead.add(s); else dead.delete(s); });
        return { ...state, dead: [...dead].sort((a, b) => a - b), agree: [false, false] };
      }
      case 'agree': {
        const agree = state.agree.slice();
        agree[player] = true;
        if (agree[0] && agree[1]) return { ...state, agree, phase: 'over', result: score(state) };
        return { ...state, agree };
      }
      case 'resume':
        return { ...state, phase: 'play', passes: 0, dead: [], agree: [false, false], turn: player };
      default:
        fail('Sayım sırasında taş konmaz');
    }
  }
  if (player !== state.turn) fail('Sıra sende değil');
  switch (move.type) {
    case 'place': {
      const i = Number(move.cell);
      const r = tryPlace(state, player, i);
      if (typeof r === 'string') fail(r);
      const captures = state.captures.slice();
      captures[player] += r.captured.length;
      // simple ko: a single stone captured by a single stone may not be retaken at once
      const ko = r.captured.length === 1 && group(r.board, state.size, i).stones.length === 1 && group(r.board, state.size, i).liberties.size === 1 ? r.captured[0] : null;
      return { ...state, board: r.board, captures, ko, passes: 0, last: i, turn: opp };
    }
    case 'pass': {
      const passes = state.passes + 1;
      if (passes >= 2) return { ...state, passes, ko: null, last: null, turn: opp, phase: 'count', dead: [], agree: [false, false] };
      return { ...state, passes, ko: null, last: null, turn: opp };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

/** Area score with the dead stones removed: { area: [b, w], total: [b, w + komi], winner } */
export function score(state) {
  const { size } = state;
  const dead = new Set(state.dead);
  const board = state.board.map((v, i) => (dead.has(i) ? null : v));
  const area = [0, 0];
  board.forEach((v) => { if (v !== null) area[v] += 1; });
  const seen = new Set();
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== null || seen.has(i)) continue;
    const region = [i];
    seen.add(i);
    const borders = new Set();
    for (let k = 0; k < region.length; k++) {
      for (const n of neighbours(size, region[k])) {
        if (board[n] === null) { if (!seen.has(n)) { seen.add(n); region.push(n); } } else borders.add(board[n]);
      }
    }
    if (borders.size === 1) area[[...borders][0]] += region.length;
  }
  const total = [area[0], area[1] + KOMI];
  return { area, total, winner: total[0] > total[1] ? 0 : 1 };
}

export function getTurn(state) {
  if (state.phase === 'play') return { player: state.turn, private: false };
  if (state.phase === 'count') return { player: state.agree[0] ? 1 : 0, private: false, simultaneous: true };
  return null;
}

export function getResult(state) {
  return state.phase === 'over' && state.result ? { winner: state.result.winner } : null;
}

// ----------------------------------------------------------------- render
export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  const n = state.size;
  const mine = !online || viewer === state.turn;
  const counting = state.phase === 'count';
  const canMark = counting && (!online || !state.agree[viewer]);
  const dead = new Set(state.dead);
  const pad = 0.6;
  const W = n - 1 + 2 * pad;
  const board = svg('svg', { class: 'go-board', viewBox: `0 0 ${W} ${W}`, role: 'grid', 'aria-label': 'Go tahtası' });
  board.append(svg('rect', { x: 0, y: 0, width: W, height: W, rx: 0.2, fill: '#e8c88a' }));
  for (let k = 0; k < n; k++) {
    board.append(svg('line', { x1: pad, y1: pad + k, x2: pad + n - 1, y2: pad + k, stroke: '#5b4a2a', 'stroke-width': 0.04 }));
    board.append(svg('line', { x1: pad + k, y1: pad, x2: pad + k, y2: pad + n - 1, stroke: '#5b4a2a', 'stroke-width': 0.04 }));
  }
  const stars = n === 9 ? [2, 4, 6] : [3, 6, 9];
  stars.forEach((r) => stars.forEach((c) => { if (n === 9 && (r === 4) !== (c === 4) && !(r === 4 && c === 4)) return; board.append(svg('circle', { cx: pad + c, cy: pad + r, r: 0.09, fill: '#5b4a2a' })); }));
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    const v = state.board[i];
    const x = pad + c;
    const y = pad + r;
    if (v !== null) {
      board.append(svg('circle', { cx: x, cy: y, r: 0.46, fill: v === 0 ? '#111' : '#f7f7f7', stroke: v === 0 ? '#000' : '#999', 'stroke-width': 0.03, class: `go-stone p${v} ${dead.has(i) ? 'dead' : ''}`, opacity: dead.has(i) ? 0.35 : 1 }));
      if (state.last === i && !counting) board.append(svg('circle', { cx: x, cy: y, r: 0.16, fill: 'none', stroke: v === 0 ? '#fff' : '#111', 'stroke-width': 0.06 }));
      if (dead.has(i)) board.append(svg('text', { x, y: y + 0.18, 'text-anchor': 'middle', 'font-size': 0.5, fill: '#c62828', text: '×' }));
    }
    const clickable = counting ? (canMark && v !== null) : (mine && state.phase === 'play' && v === null);
    board.append(svg('rect', {
      x: x - 0.5, y: y - 0.5, width: 1, height: 1, fill: 'transparent', class: `go-cell ${clickable ? 'free' : ''} ${v === null ? 'empty' : ''}`,
      role: 'gridcell', 'aria-label': `${r + 1}. satır ${c + 1}. sütun${v == null ? '' : `, ${v === 0 ? 'siyah' : 'beyaz'}${dead.has(i) ? ' (ölü)' : ''}`}`,
      onClick: clickable ? () => sendMove({ type: counting ? 'dead' : 'place', cell: i }) : null,
    }));
  }
  const caps = el('div', { class: 'c4-legend' }, el('span', {}, `⚫ ${players[0]}: ${state.captures[0]} esir`), el('span', {}, `⚪ ${players[1]}: ${state.captures[1]} esir`), el('span', { class: 'muted' }, `komi ${KOMI}`));
  if (state.phase === 'over') {
    const R = state.result;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[R.winner]} kazandı: ${R.total[0]} – ${R.total[1]}`)),
      el('p', { class: 'hint' }, `Alan: siyah ${R.area[0]}, beyaz ${R.area[1]} + komi ${KOMI}.`),
      el('div', { class: 'go-wrap' }, board), caps,
    );
    return null;
  }
  if (counting) {
    const est = score(state);
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, 'Sayım: ölü grupları işaretleyin')),
      el('p', { class: 'hint' }, `Şu an: siyah ${est.total[0]} – beyaz ${est.total[1]} (komi dahil). ${state.agree[0] ? `${players[0]} onayladı. ` : ''}${state.agree[1] ? `${players[1]} onayladı. ` : ''}`),
      el('div', { class: 'go-wrap' }, board),
      el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px' } },
        el('button', { type: 'button', class: 'btn btn-primary', disabled: online && state.agree[viewer], onClick: () => sendMove({ type: 'agree' }) }, online ? (state.agree[viewer] ? 'Onayladın' : 'Onayla') : `Onayla (${players[state.agree[0] ? 1 : 0]})`),
        el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => sendMove({ type: 'resume' }) }, 'Oyuna dön'),
      ),
      caps,
    );
    return null;
  }
  const who = state.turn === 0 ? '⚫' : '⚪';
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, mine ? `${who} ${players[state.turn]}, sıra sende${state.passes ? ' (rakip pas geçti)' : ''}` : `${who} ${players[state.turn]} düşünüyor…`)),
    el('div', { class: 'go-wrap' }, board),
    mine ? el('button', { type: 'button', class: 'btn btn-secondary btn-block', onClick: () => sendMove({ type: 'pass' }) }, state.passes ? 'Pas (sayıma geç)' : 'Pas') : null,
    caps,
  );
  return null;
}

export default { id: 'go', meta, setup, applyMove, render, getTurn, getResult };
