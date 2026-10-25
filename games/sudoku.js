// Sudoku Düellosu — both players solve the same seeded puzzle on their own; the faster
// correct solution wins, otherwise the one with more conflict-free cells filled.
import { el, render as draw } from '../js/ui/dom.js';
import { createTimer } from '../js/ui/timer.js';
import { createRng, shuffle } from '../js/lib/rng.js';

export const meta = {
  group: 'masa',
  name: 'Sudoku Düellosu',
  icon: '🔢',
  description: 'Aynı sudoku ikinize; önce doğru çözen kazanır.',
  rules: [
    'İkinize de aynı bulmaca gelir. Kareye dokun, 1–9 tuşla; çakışan rakamlar kırmızı görünür.',
    'Bütün kareler çakışmasız dolunca çözülmüş sayılır. İkiniz de çözerseniz hızlı olan kazanır; kimse çözemezse çakışmasız doldurduğu kare sayısı çok olan.',
    'Tek telefonda sırayla (önce biri, sonra diğeri), iki telefonda aynı anda oynanır.',
  ].join('\n'),
  data: [],
  handoffNote: 'Bulmaca aynı: çözümünü rakibin görmemeli.',
  settings: [
    { key: 'level', label: 'Zorluk', type: 'select', default: 'easy', options: [{ value: 'easy', label: 'Kolay (45 ipucu)' }, { value: 'medium', label: 'Orta (35 ipucu)' }, { value: 'hard', label: 'Zor (28 ipucu)' }] },
    { key: 'minutes', label: 'Süre', type: 'select', default: 10, options: [{ value: 5, label: '5 dk' }, { value: 10, label: '10 dk' }, { value: 20, label: '20 dk' }, { value: 0, label: 'Süresiz' }] },
  ],
};

const GIVENS = { easy: 45, medium: 35, hard: 28 };

function fail(msg) {
  throw new Error(msg);
}

/** A full valid grid from the seed: a base pattern with digits, rows, columns and bands shuffled. */
export function makeSolution(seed) {
  const rng = createRng(seed);
  const base = (r, c) => (r * 3 + Math.floor(r / 3) + c) % 9;
  const digits = shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const perm = () => shuffle(rng, [0, 1, 2]);
  const rows = perm().flatMap((band) => perm().map((r) => band * 3 + r));
  const cols = perm().flatMap((stack) => perm().map((c) => stack * 3 + c));
  const grid = new Array(81);
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) grid[r * 9 + c] = digits[base(rows[r], cols[c])];
  return grid;
}

export function makePuzzle(level, seed) {
  const solution = makeSolution(seed);
  const rng = createRng(seed ^ 0x5bd1e995);
  const keep = new Set(shuffle(rng, [...Array(81).keys()]).slice(0, GIVENS[level] || GIVENS.easy));
  return solution.map((v, i) => (keep.has(i) ? v : 0));
}

/** Indexes of cells whose value clashes with another in its row, column or box. */
export function conflicts(grid) {
  const bad = new Set();
  const groups = [];
  for (let i = 0; i < 9; i++) {
    groups.push([...Array(9).keys()].map((k) => i * 9 + k));
    groups.push([...Array(9).keys()].map((k) => k * 9 + i));
    const r0 = Math.floor(i / 3) * 3;
    const c0 = (i % 3) * 3;
    groups.push([0, 1, 2].flatMap((dr) => [0, 1, 2].map((dc) => (r0 + dr) * 9 + c0 + dc)));
  }
  for (const g of groups) {
    const seen = {};
    for (const i of g) if (grid[i]) (seen[grid[i]] = seen[grid[i]] || []).push(i);
    for (const list of Object.values(seen)) if (list.length > 1) list.forEach((i) => bad.add(i));
  }
  return bad;
}

export const isSolved = (grid) => grid.every((v) => v >= 1 && v <= 9) && conflicts(grid).size === 0;

export function setup(options = {}) {
  const level = ['easy', 'medium', 'hard'].includes(options.level) ? options.level : 'easy';
  const minutes = [0, 5, 10, 20].includes(Number(options.minutes)) ? Number(options.minutes) : 10;
  const givens = makePuzzle(level, Number(options.seed) || 1);
  return {
    id: String(options.seed ?? ''),
    level,
    minutes,
    givens,
    grids: [givens.slice(), givens.slice()],
    status: ['playing', 'playing'], // playing | solved | time
    ms: [null, null],
    finished: [false, false],
    phase: 'play',
  };
}

/** Filled cells that do not clash (givens included). */
export function goodCount(grid) {
  const bad = conflicts(grid);
  return grid.filter((v, i) => v && !bad.has(i)).length;
}

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (state.phase !== 'play') fail('Oyun bitti');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.finished[player]) fail('Senin bulmacan bitti');
  const grids = state.grids.map((g) => g.slice());
  const finish = (status, ms) => {
    const st = state.status.slice();
    st[player] = status;
    const times = state.ms.slice();
    times[player] = Math.max(0, Math.round(Number(ms) || 0));
    const finished = state.finished.slice();
    finished[player] = true;
    return { ...state, grids, status: st, ms: times, finished, phase: finished[0] && finished[1] ? 'over' : 'play' };
  };
  if (move.type === 'set') {
    const i = Number(move.cell);
    const v = Number(move.value);
    if (!Number.isInteger(i) || i < 0 || i >= 81) fail('Geçersiz kare');
    if (state.givens[i]) fail('İpucu kareleri değiştirilemez');
    if (!Number.isInteger(v) || v < 0 || v > 9) fail('1–9 arası bir rakam');
    grids[player][i] = v;
    if (isSolved(grids[player])) return finish('solved', move.ms);
    return { ...state, grids };
  }
  if (move.type === 'finish') return finish('time', move.ms);
  fail(`Bilinmeyen hamle: ${move.type}`);
  return state;
}

export function getTurn(state) {
  if (state.phase !== 'play') return null;
  const p = state.finished[0] ? (state.finished[1] ? null : 1) : 0;
  return p == null ? null : { player: p, private: true, simultaneous: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const solved = state.status.map((s) => s === 'solved');
  if (solved[0] || solved[1]) {
    if (!solved[1]) return { winner: 0 };
    if (!solved[0]) return { winner: 1 };
    if (state.ms[0] === state.ms[1]) return { draw: true };
    return { winner: state.ms[0] < state.ms[1] ? 0 : 1 };
  }
  const a = goodCount(state.grids[0]);
  const b = goodCount(state.grids[1]);
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
const starts = new Map();   // `${id}:${player}` -> clock start on this device
const selected = new Map(); // `${id}:${player}` -> selected cell

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const opp = 1 - viewer;
  const key = `${state.id}:${viewer}`;
  const grid = state.grids[viewer];
  const bad = conflicts(grid);
  const summary = (p) => {
    const g = state.grids[p];
    if (state.status[p] === 'solved') return `çözdü (${(state.ms[p] / 1000).toFixed(0)} sn)`;
    return `${goodCount(g)}/81 doğru dolu${state.status[p] === 'time' ? ', süre doldu' : ''}`;
  };

  const board = (p, { interactive = false } = {}) => {
    const g = state.grids[p];
    const clash = conflicts(g);
    const sel = selected.get(key);
    const box = el('div', { class: 'sd-grid', role: 'grid', 'aria-label': 'Sudoku' });
    for (let i = 0; i < 81; i++) {
      const given = !!state.givens[i];
      const r = Math.floor(i / 9);
      const c = i % 9;
      box.append(el('button', {
        type: 'button',
        class: `sd-cell ${given ? 'given' : ''} ${clash.has(i) ? 'bad' : ''} ${interactive && sel === i ? 'sel' : ''} ${interactive && sel != null && g[sel] && g[i] === g[sel] ? 'same' : ''} ${c % 3 === 2 && c < 8 ? 'vb' : ''} ${r % 3 === 2 && r < 8 ? 'hb' : ''}`,
        disabled: !interactive || given,
        'aria-label': `${r + 1}. satır ${c + 1}. sütun${g[i] ? `, ${g[i]}` : ''}`,
        onClick: () => { selected.set(key, i); redraw(); },
      }, g[i] ? String(g[i]) : ''));
    }
    return box;
  };
  const boardBox = el('div');
  const redraw = () => boardBox.replaceChildren(board(viewer, { interactive: true }));

  if (state.phase === 'over') {
    const r = getResult(state);
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, r.draw ? 'Berabere!' : `${players[r.winner]} kazandı!`)),
      el('p', { class: 'hint' }, `${players[0]}: ${summary(0)} · ${players[1]}: ${summary(1)}`),
      el('div', { class: 'col-title' }, `${players[viewer]} — senin çözümün`),
      board(viewer),
      el('details', { class: 'rules' }, el('summary', {}, `${players[opp]} — çözümü`), board(opp)),
    );
    return null;
  }
  if (state.finished[viewer]) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, state.status[viewer] === 'solved' ? `Çözdün! ${(state.ms[viewer] / 1000).toFixed(0)} sn` : 'Süre doldu.')),
      el('p', { class: 'hint' }, `${players[opp]} çözüyor…${ctx.mode === 'online' ? ` (${goodCount(state.grids[opp])}/81)` : ''}`),
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      board(viewer),
    );
    return null;
  }

  if (!starts.has(key)) starts.set(key, Date.now());
  const startedAt = starts.get(key);
  const timerBox = el('div');
  let timer = null;
  if (state.minutes) {
    const total = state.minutes * 60000;
    const deadline = startedAt + total;
    if (deadline <= Date.now()) queueMicrotask(() => sendMove({ type: 'finish', ms: total }));
    else timer = createTimer(timerBox, { deadline, total, onExpire: () => sendMove({ type: 'finish', ms: Date.now() - startedAt }) });
  }
  const set = (v) => {
    const i = selected.get(key);
    if (i == null || state.givens[i]) return;
    if (grid[i] === v) return;
    sendMove({ type: 'set', cell: i, value: v, ms: Date.now() - startedAt });
  };
  const pad = el('div', { class: 'sd-pad' },
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => el('button', { type: 'button', class: 'btn btn-secondary sd-key', onClick: () => set(v) }, String(v))),
    el('button', { type: 'button', class: 'btn btn-secondary sd-key', onClick: () => set(0) }, 'Sil'),
  );
  redraw();
  draw(container,
    timerBox,
    el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}: ${goodCount(grid)}/81${bad.size ? ` · ${bad.size} çakışma` : ''}`)),
    ctx.mode === 'online' ? el('p', { class: 'hint' }, `${players[opp]}: ${summary(opp)}`) : null,
    boardBox,
    pad,
  );
  return () => { if (timer) timer.stop(); };
}

export default { id: 'sudoku', meta, setup, applyMove, render, getTurn, getResult };
