// Mayın Tarlası — both players sweep the same seeded minefield on their own; the one who
// clears it (or, failing that, uncovers more safe cells) wins. A zero region around a
// seeded start cell is opened for both, so nobody dies on the first tap.
import { el, render as draw } from '../js/ui/dom.js';
import { createTimer } from '../js/ui/timer.js';
import { createRng, shuffle } from '../js/lib/rng.js';

export const meta = {
  group: 'masa',
  name: 'Mayın Tarlası',
  icon: '💣',
  description: 'Aynı mayın tarlası ikinize: temizleyen ya da daha çok kare açan kazanır.',
  rules: [
    'İkinize de aynı tarla gelir; başlangıçta aynı boş bölge açıktır. Kareye dokununca açılır, sayılar komşu mayınları gösterir.',
    '"Bayrak" modunda dokunduğun kareye bayrak koyarsın. Mayına basarsan o tarlada işin biter; açtığın güvenli kareler sayılır.',
    'Tarlayı temizleyen kazanır; ikiniz de temizlerseniz hızlı olan. Kimse temizleyemezse çok güvenli kare açan kazanır. Tek telefonda sırayla, iki telefonda aynı anda oynanır.',
  ].join('\n'),
  data: [],
  handoffNote: 'Tarla aynı: açtığın kareleri rakibin görmemeli.',
  settings: [
    { key: 'size', label: 'Tarla', type: 'select', default: 9, options: [{ value: 8, label: '8×8, 8 mayın' }, { value: 9, label: '9×9, 10 mayın' }, { value: 12, label: '12×12, 22 mayın' }] },
    { key: 'seconds', label: 'Süre', type: 'select', default: 180, options: [{ value: 120, label: '2 dk' }, { value: 180, label: '3 dk' }, { value: 300, label: '5 dk' }, { value: 0, label: 'Süresiz' }] },
  ],
};

const MINES = { 8: 8, 9: 10, 12: 22 };

function fail(msg) {
  throw new Error(msg);
}

export function neighbours(size, i) {
  const r = Math.floor(i / size);
  const c = i % size;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < size && cc >= 0 && cc < size) out.push(rr * size + cc);
    }
  }
  return out;
}

/**
 * A seeded minefield plus a start cell: a zero cell whose region is modest (about a tenth
 * of the board), so the opening gives a foothold without solving half the field.
 */
export function makeField(size, seed) {
  const rng = createRng(seed);
  const n = size * size;
  const target = Math.max(4, Math.round(n / 10));
  let fallback = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const mines = new Set(shuffle(rng, [...Array(n).keys()]).slice(0, MINES[size]));
    const numbers = Array.from({ length: n }, (_, i) => (mines.has(i) ? -1 : neighbours(size, i).filter((k) => mines.has(k)).length));
    const field = { mines: [...mines].sort((a, b) => a - b), numbers };
    const zeros = numbers.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
    const sized = zeros.map((i) => ({ i, size: flood(size, numbers, [], i).length }));
    const good = sized.filter((z) => z.size >= 3 && z.size <= target * 2).sort((a, b) => Math.abs(a.size - target) - Math.abs(b.size - target));
    if (good.length) return { ...field, start: good[0].i };
    if (!fallback) {
      const any = sized.sort((a, b) => a.size - b.size)[0];
      fallback = { ...field, start: any ? any.i : numbers.findIndex((v) => v >= 0) };
    }
  }
  return fallback;
}

/** Cells opened by revealing `i`: flood-fills through zeros. */
export function flood(size, numbers, revealed, i) {
  const out = [];
  const seen = new Set(revealed);
  const stack = [i];
  while (stack.length) {
    const k = stack.pop();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (numbers[k] === 0) for (const nb of neighbours(size, k)) if (!seen.has(nb)) stack.push(nb);
  }
  return out;
}

export function setup(options = {}) {
  const size = [8, 9, 12].includes(Number(options.size)) ? Number(options.size) : 9;
  const seconds = [0, 120, 180, 300].includes(Number(options.seconds)) ? Number(options.seconds) : 180;
  const field = makeField(size, Number(options.seed) || 1);
  const opened = flood(size, field.numbers, [], field.start);
  const board = () => ({ revealed: opened.slice(), flags: [], status: 'playing', ms: null }); // playing | dead | cleared | time
  return {
    id: String(options.seed ?? ''),
    size,
    seconds,
    mines: field.mines,
    numbers: field.numbers,
    start: field.start,
    boards: [board(), board()],
    finished: [false, false],
    phase: 'play',
  };
}

export const safeCount = (state) => state.size * state.size - state.mines.length;
export const progress = (state, p) => state.boards[p].revealed.length;

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (state.phase !== 'play') fail('Oyun bitti');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  const b = state.boards[player];
  if (state.finished[player]) fail('Senin tarlan bitti');
  const boards = state.boards.map((x) => ({ ...x, revealed: x.revealed.slice(), flags: x.flags.slice() }));
  const mine = boards[player];
  const finish = (status, ms) => {
    mine.status = status;
    mine.ms = Math.max(0, Math.round(Number(ms) || 0));
    const finished = state.finished.slice();
    finished[player] = true;
    return { ...state, boards, finished, phase: finished[0] && finished[1] ? 'over' : 'play' };
  };
  switch (move.type) {
    case 'reveal': {
      const i = Number(move.cell);
      if (!Number.isInteger(i) || i < 0 || i >= state.size * state.size) fail('Geçersiz kare');
      if (b.revealed.includes(i)) fail('Bu kare zaten açık');
      if (b.flags.includes(i)) fail('Bayraklı kare: önce bayrağı kaldır');
      if (state.numbers[i] === -1) return finish('dead', move.ms);
      mine.revealed.push(...flood(state.size, state.numbers, b.revealed, i));
      mine.flags = mine.flags.filter((f) => !mine.revealed.includes(f));
      if (mine.revealed.length >= safeCount(state)) return finish('cleared', move.ms);
      return { ...state, boards };
    }
    case 'flag': {
      const i = Number(move.cell);
      if (!Number.isInteger(i) || i < 0 || i >= state.size * state.size) fail('Geçersiz kare');
      if (b.revealed.includes(i)) fail('Açık kareye bayrak konmaz');
      mine.flags = b.flags.includes(i) ? b.flags.filter((f) => f !== i) : b.flags.concat([i]);
      return { ...state, boards };
    }
    case 'finish':
      return finish(move.reason === 'quit' ? 'quit' : 'time', move.ms); // quit = voluntary 'Bitir'
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase !== 'play') return null;
  const p = state.finished[0] ? (state.finished[1] ? null : 1) : 0;
  return p == null ? null : { player: p, private: true, simultaneous: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const [a, b] = state.boards;
  if (a.status === 'cleared' || b.status === 'cleared') {
    if (a.status !== 'cleared') return { winner: 1 };
    if (b.status !== 'cleared') return { winner: 0 };
    if (a.ms === b.ms) return { draw: true };
    return { winner: a.ms < b.ms ? 0 : 1 };
  }
  if (a.revealed.length === b.revealed.length) return { draw: true };
  return { winner: a.revealed.length > b.revealed.length ? 0 : 1 };
}

// ----------------------------------------------------------------- render
const starts = new Map();  // `${id}:${player}` -> when this player's clock began on this device
const flagMode = new Map(); // `${id}:${player}` -> flag mode on?
const NUM_CLASS = ['', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'];

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const opp = 1 - viewer;
  const key = `${state.id}:${viewer}`;
  const b = state.boards[viewer];
  const total = safeCount(state);
  const statusText = (p) => {
    const x = state.boards[p];
    const base = `${x.revealed.length}/${total} güvenli kare`;
    if (x.status === 'cleared') return `temizledi (${(x.ms / 1000).toFixed(1)} sn)`;
    if (x.status === 'dead') return `mayına bastı, ${base}`;
    if (x.status === 'time') return `süre doldu, ${base}`;
    if (x.status === 'quit') return `bıraktı, ${base}`;
    return base;
  };

  const grid = (p, { interactive = false, showMines = false } = {}) => {
    const x = state.boards[p];
    const revealed = new Set(x.revealed);
    const flags = new Set(x.flags);
    // the 12×12 field bleeds into the page gutter and never shrinks a cell below 30px (scrolls sideways instead)
    const box = el('div', { class: `ms-grid ${state.size === 12 ? 'dense' : ''}`, style: { gridTemplateColumns: `repeat(${state.size}, ${state.size === 12 ? 'minmax(30px, 1fr)' : '1fr'})` } });
    for (let i = 0; i < state.size * state.size; i++) {
      const n = state.numbers[i];
      const open = revealed.has(i);
      const isMine = n === -1;
      let label = '';
      if (open && n > 0) label = String(n);
      if (flags.has(i)) label = '🚩';
      if (showMines && isMine) label = flags.has(i) ? '🚩' : '💣';
      box.append(el('button', {
        type: 'button',
        class: `ms-cell ${open ? `open ${NUM_CLASS[n] || ''}` : ''} ${showMines && isMine && !flags.has(i) ? 'mine' : ''} ${showMines && flags.has(i) && !isMine ? 'wrong' : ''}`,
        disabled: !interactive || open,
        'aria-label': open ? (n > 0 ? `${n}` : 'boş') : (flags.has(i) ? 'bayrak' : 'kapalı'),
        onClick: () => {
          const ms = Date.now() - (starts.get(key) || Date.now());
          if (flagMode.get(key)) sendMove({ type: 'flag', cell: i });
          else if (!flags.has(i)) sendMove({ type: 'reveal', cell: i, ms });
        },
      }, label));
    }
    return box;
  };

  if (state.phase === 'over') {
    const r = getResult(state);
    const line = r.draw ? 'Berabere!' : `${players[r.winner]} kazandı!`;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, line)),
      el('p', { class: 'hint' }, `${players[0]}: ${statusText(0)} · ${players[1]}: ${statusText(1)}`),
      el('div', { class: 'col-title' }, `${players[viewer]} — senin tarlan`),
      grid(viewer, { showMines: true }),
      el('details', { class: 'rules' }, el('summary', {}, `${players[opp]} — tarlası`), grid(opp, { showMines: true })),
    );
    return null;
  }

  if (state.finished[viewer]) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, b.status === 'cleared' ? `Temizledin! ${(b.ms / 1000).toFixed(1)} sn` : b.status === 'dead' ? 'Mayına bastın!' : b.status === 'quit' ? 'Bıraktın.' : 'Süre doldu.')),
      el('p', { class: 'hint' }, `${statusText(viewer)}. ${players[opp]} oynuyor… (${progress(state, opp)}/${total})`),
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      grid(viewer, { showMines: true }),
    );
    return null;
  }

  if (!starts.has(key)) starts.set(key, Date.now());
  const startedAt = starts.get(key);
  const timerBox = el('div');
  let timer = null;
  if (state.seconds) {
    timer = createTimer(timerBox, { deadline: startedAt + state.seconds * 1000, total: state.seconds * 1000, onExpire: () => sendMove({ type: 'finish', ms: Math.min(state.seconds * 1000, Date.now() - startedAt) }) });
  }
  const flagBtn = el('button', {
    type: 'button', class: `btn btn-small ${flagMode.get(key) ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': flagMode.get(key) ? 'true' : 'false',
    onClick: () => { flagMode.set(key, !flagMode.get(key)); flagBtn.className = `btn btn-small ${flagMode.get(key) ? 'btn-primary' : 'btn-secondary'}`; flagBtn.setAttribute('aria-pressed', flagMode.get(key) ? 'true' : 'false'); flagBtn.textContent = flagMode.get(key) ? '🚩 Bayrak modu açık' : '🚩 Bayrak modu'; },
  }, flagMode.get(key) ? '🚩 Bayrak modu açık' : '🚩 Bayrak modu');
  draw(container,
    timerBox,
    el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}: ${b.revealed.length}/${total} · mayın ${state.mines.length}, bayrak ${b.flags.length}`)),
    ctx.mode === 'online' ? el('p', { class: 'hint' }, `${players[opp]}: ${statusText(opp)}`) : null,
    el('div', { class: 'row', style: { justifyContent: 'center', marginBottom: '6px', gap: '8px' } }, flagBtn,
      el('button', { type: 'button', class: 'btn btn-small', onClick: () => { if (confirm('Tarlayı bırakıp bitirilsin mi? Açtığın güvenli kareler puanın olur.')) sendMove({ type: 'finish', reason: 'quit', ms: Date.now() - startedAt }); } }, 'Bitir')),
    grid(viewer, { interactive: true }),
  );
  return () => { if (timer) timer.stop(); };
}

export default { id: 'mayin-tarlasi', meta, setup, applyMove, render, getTurn, getResult };
