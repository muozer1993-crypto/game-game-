// Hedef Sayı — the numbers round: six numbers, a three-digit target, four operations. Both
// players get the same puzzle and race the clock on their own device; the closest result scores,
// an exact hit scores most. The solver guarantees every target is reachable and shows a solution.
import { el, render as draw } from '../js/ui/dom.js';
import { createTimer } from '../js/ui/timer.js';
import { createRng, shuffle } from '../js/lib/rng.js';

export const meta = {
  group: 'tanisma',
  name: 'Hedef Sayı',
  icon: '🎯',
  description: 'Altı sayı, dört işlem, üç basamaklı hedef: süre dolmadan en yakına ulaş.',
  rules: [
    'İkinize de aynı altı sayı ve aynı hedef gelir. Bir sayıya, bir işleme, sonra başka bir sayıya dokun: sonuç yeni bir sayı olarak havuza girer, kullandıkların çıkar. Her sayı en çok bir kez kullanılır; çıkarma eksiye düşemez, bölme tam bölünmeli.',
    'Süre dolunca ya da "Gönder" deyince havuzdaki hedefe en yakın sayı cevabındır. Puan: tam isabet 10, en çok 5 uzak 7, en çok 10 uzak 5. Tur sonunda bir çözüm de gösterilir.',
    'Tek telefonda sırayla, iki telefonda aynı anda oynanır; turlar bitince toplam puan kazanır.',
  ].join('\n'),
  data: [],
  handoffNote: 'Hedef ve sayılar ikinize de aynı; cevabın rakibin bitirene kadar gizli.',
  settings: [
    { key: 'rounds', label: 'Tur sayısı', type: 'select', default: 3, options: [{ value: 3, label: '3' }, { value: 5, label: '5' }] },
    { key: 'seconds', label: 'Tur süresi', type: 'select', default: 90, options: [{ value: 60, label: '60 sn' }, { value: 90, label: '90 sn' }, { value: 120, label: '2 dk' }, { value: 0, label: 'Süresiz' }] },
    { key: 'large', label: 'Büyük sayı', type: 'select', default: 1, options: [{ value: 1, label: '1 büyük (25–100) + 5 küçük' }, { value: 2, label: '2 büyük + 4 küçük' }] },
  ],
};

export const OPS = ['+', '−', '×', '÷'];
const LARGE = [25, 50, 75, 100];
export const GRACE_MS = 15000;

function fail(msg) {
  throw new Error(msg);
}

/** a op b, or null when the result is not a positive integer (or pointless). */
export function calc(a, op, b) {
  switch (op) {
    case '+': return a + b;
    case '−': return a > b ? a - b : null;
    case '×': return a * b;
    case '÷': return b !== 0 && a % b === 0 ? a / b : null;
    default: return null;
  }
}

/** Best reachable value: { value, steps: [{ a, op, b, r }] }. Exact search with early exit. */
export function solve(numbers, target) {
  let best = { value: numbers[0], steps: [] };
  let bestDiff = Math.abs(numbers[0] - target);
  numbers.forEach((n) => { const d = Math.abs(n - target); if (d < bestDiff) { bestDiff = d; best = { value: n, steps: [] }; } });
  if (bestDiff === 0) return best;
  const seen = new Set();
  const rec = (list, steps) => {
    if (bestDiff === 0) return;
    const key = list.slice().sort((x, y) => x - y).join(',');
    if (seen.has(key)) return;
    seen.add(key);
    for (let i = 0; i < list.length && bestDiff > 0; i++) {
      for (let j = 0; j < list.length && bestDiff > 0; j++) {
        if (i === j) continue;
        const a = list[i];
        const b = list[j];
        if (j < i && (a === b)) continue;
        for (const op of OPS) {
          if ((op === '+' || op === '×') && j < i) continue; // commutative: once
          if (op === '×' && (a === 1 || b === 1)) continue;
          if (op === '÷' && b === 1) continue;
          const r = calc(a, op, b);
          if (r == null) continue;
          const next = list.filter((_, k) => k !== i && k !== j).concat([r]);
          const nextSteps = steps.concat([{ a, op, b, r }]);
          const d = Math.abs(r - target);
          if (d < bestDiff || (d === bestDiff && nextSteps.length < best.steps.length)) { bestDiff = d; best = { value: r, steps: nextSteps }; }
          if (bestDiff === 0) return;
          if (next.length > 1) rec(next, nextSteps);
        }
      }
    }
  };
  rec(numbers, []);
  return best;
}

export function makePuzzle(seed, large) {
  const rng = createRng(seed);
  for (let attempt = 0; attempt < 30; attempt++) {
    const big = shuffle(rng, LARGE).slice(0, large);
    const small = shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, 6 - large);
    const numbers = big.concat(small);
    const target = 101 + Math.floor(rng() * 899);
    if (numbers.includes(target)) continue;
    const sol = solve(numbers, target);
    if (sol.value === target && sol.steps.length >= 2) return { numbers, target, solution: sol.steps };
  }
  const numbers = [100, 7, 3, 2, 9, 5];
  return { numbers, target: 735, solution: solve(numbers, 735).steps };
}

export function points(diff) {
  if (diff === 0) return 10;
  if (diff <= 5) return 7;
  if (diff <= 10) return 5;
  return 0;
}

export function setup(options = {}) {
  const rounds = [3, 5].includes(Number(options.rounds)) ? Number(options.rounds) : 3;
  const seconds = [0, 60, 90, 120].includes(Number(options.seconds)) ? Number(options.seconds) : 90;
  const large = [1, 2].includes(Number(options.large)) ? Number(options.large) : 1;
  const seed = Number(options.seed) || 1;
  const puzzles = Array.from({ length: rounds }, (_, i) => makePuzzle((seed + i * 7919) >>> 0, large));
  return {
    id: String(options.seed ?? ''),
    rounds,
    seconds,
    puzzles,            // { numbers, target, solution }
    round: 0,
    phase: 'play',      // play | compare | over
    answers: puzzles.map(() => [null, null]), // per round: { value, steps }
    scores: [0, 0],
  };
}

/** Replay a step list against the puzzle numbers; returns the pool after them, or null when illegal. */
export function replay(numbers, steps) {
  let pool = numbers.slice();
  const clean = [];
  for (const s of Array.isArray(steps) ? steps : []) {
    const a = Number(s.a);
    const b = Number(s.b);
    const op = String(s.op);
    const i = pool.indexOf(a);
    if (i < 0) return null;
    const rest = pool.filter((_, k) => k !== i);
    const j = rest.indexOf(b);
    if (j < 0 || !OPS.includes(op)) return null;
    const r = calc(a, op, b);
    if (r == null) return null;
    pool = rest.filter((_, k) => k !== j).concat([r]);
    clean.push({ a, op, b, r });
  }
  return { pool, steps: clean };
}

export const closest = (pool, target) => pool.reduce((best, n) => (Math.abs(n - target) < Math.abs(best - target) ? n : best), pool[0]);

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.phase === 'over') fail('Oyun bitti');
  const puzzle = state.puzzles[state.round];
  switch (move.type) {
    case 'submit': {
      if (state.phase !== 'play') fail('Bu tur bitti');
      if (state.answers[state.round][player]) fail('Cevabını zaten verdin');
      const rp = replay(puzzle.numbers, move.steps) || { pool: puzzle.numbers.slice(), steps: [] };
      const value = closest(rp.pool, puzzle.target);
      const answers = state.answers.map((l, i) => (i === state.round ? l.slice() : l));
      answers[state.round][player] = { value, steps: rp.steps, diff: Math.abs(value - puzzle.target) };
      const both = answers[state.round][0] && answers[state.round][1];
      let scores = state.scores;
      if (both) scores = [0, 1].map((p) => state.scores[p] + points(answers[state.round][p].diff));
      return { ...state, answers, scores, phase: both ? 'compare' : 'play' };
    }
    case 'next': {
      if (state.phase !== 'compare') fail('Bu tur henüz bitmedi');
      const round = state.round + 1;
      return { ...state, round: Math.min(round, state.rounds - 1), phase: round >= state.rounds ? 'over' : 'play' };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase !== 'play') return null;
  const a = state.answers[state.round];
  const p = a[0] ? (a[1] ? null : 1) : 0;
  return p == null ? null : { player: p, private: true, simultaneous: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const [a, b] = state.scores;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
const starts = new Map();
const caps = new Map();
const drafts = new Map(); // `${id}:${viewer}:${round}` -> { steps, sel, op }
let draftsFor = null;
const fmtStep = (s) => `${s.a} ${s.op} ${s.b} = ${s.r}`;

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  const opp = 1 - viewer;
  const puzzle = state.puzzles[state.round];
  if (draftsFor !== state.id) { drafts.clear(); starts.clear(); caps.clear(); draftsFor = state.id; }
  const legend = el('div', { class: 'c4-legend' }, el('span', {}, `${players[0]}: ${state.scores[0]}`), el('span', {}, `${players[1]}: ${state.scores[1]}`), el('span', { class: 'muted' }, `${Math.min(state.round + 1, state.rounds)}. tur / ${state.rounds}`));
  const targetView = el('div', { class: 'hs-target' }, el('span', { class: 'muted' }, 'Hedef'), el('strong', {}, String(puzzle.target)));

  if (state.phase === 'over') {
    const [a, b] = state.scores;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, a === b ? `Berabere: ${a}–${b}` : `${players[a > b ? 0 : 1]} kazandı: ${Math.max(a, b)}–${Math.min(a, b)}`)),
      legend,
      el('div', { class: 'is-rounds' }, state.puzzles.map((pz, i) => el('div', { class: 'is-round card' }, el('strong', {}, String(pz.target)), el('span', {}, [0, 1].map((p) => { const an = state.answers[i][p]; return `${players[p]} ${an ? `${an.value} (+${points(an.diff)})` : '—'}`; }).join(' · '))))),
    );
    return null;
  }

  if (state.phase === 'compare') {
    const an = state.answers[state.round];
    const line = an[0].diff === an[1].diff ? `İkiniz de ${an[0].diff === 0 ? 'tam isabet' : `${an[0].diff} uzak`}.` : `${players[an[0].diff < an[1].diff ? 0 : 1]} daha yakın.`;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${state.round + 1}. tur: ${line}`)),
      targetView, legend,
      el('div', { class: 'two-col' }, [0, 1].map((p) => el('div', {},
        el('div', { class: 'col-title' }, `${players[p]}: ${an[p].value} (${an[p].diff === 0 ? 'tam' : `${an[p].diff} uzak`}, +${points(an[p].diff)})`),
        an[p].steps.length ? el('div', { class: 'hs-steps' }, an[p].steps.map((s) => el('div', {}, fmtStep(s)))) : el('p', { class: 'hint' }, 'İşlem yapmadı.'),
      ))),
      el('details', { class: 'rules' }, el('summary', {}, 'Bir çözüm'), el('div', { class: 'hs-steps' }, puzzle.solution.map((s) => el('div', {}, fmtStep(s))))),
      el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'next' }) },
        state.round + 1 >= state.rounds ? 'Sonucu gör' : 'Sonraki tur'),
    );
    return null;
  }

  // ---- play
  const mineDone = state.answers[state.round][viewer];
  if (mineDone) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `Cevabın: ${mineDone.value} (${mineDone.diff === 0 ? 'tam isabet!' : `${mineDone.diff} uzak`})`)),
      el('p', { class: 'hint' }, `${players[opp]} çözüyor…${online ? ` (${GRACE_MS / 1000} saniyesi kaldı)` : ''}`),
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      targetView, legend,
    );
    return null;
  }
  const key = `${state.id}:${viewer}:${state.round}`;
  if (!starts.has(key)) starts.set(key, Date.now());
  let deadline = state.seconds ? starts.get(key) + state.seconds * 1000 : 0;
  const oppDone = !!state.answers[state.round][opp];
  if (online && oppDone) {
    if (!caps.has(key)) caps.set(key, Date.now() + GRACE_MS);
    deadline = deadline ? Math.min(deadline, caps.get(key)) : caps.get(key);
  }
  const draft = drafts.get(key) || { steps: [], sel: null, op: null };
  drafts.set(key, draft);
  let done = false;
  const submit = () => { if (done) return; done = true; sendMove({ type: 'submit', steps: draft.steps.map((s) => ({ a: s.a, op: s.op, b: s.b })) }); };
  const timerBox = el('div');
  let timer = null;
  if (deadline) timer = createTimer(timerBox, { deadline, total: online && oppDone ? GRACE_MS : state.seconds * 1000, onExpire: submit });
  const poolBox = el('div', { class: 'hs-pool' });
  const opsBox = el('div', { class: 'hs-ops' });
  const stepsBox = el('div', { class: 'hs-steps' });
  const hintBox = el('p', { class: 'hint' });
  const bestLine = el('div', { class: 'status-line' });
  const redraw = (note) => {
    const rp = replay(puzzle.numbers, draft.steps);
    const pool = rp.pool;
    poolBox.replaceChildren(...pool.map((n, i) => el('button', {
      type: 'button', class: `btn hs-num ${draft.sel === i ? 'sel' : ''} ${i >= puzzle.numbers.length - draft.steps.length ? 'derived' : ''}`,
      onClick: () => {
        if (draft.sel == null || draft.op == null) { draft.sel = draft.sel === i ? null : i; draft.op = null; redraw(); return; }
        if (draft.sel === i) { draft.sel = null; draft.op = null; redraw(); return; }
        const r = calc(pool[draft.sel], draft.op, n);
        if (r == null) { redraw(draft.op === '−' ? 'Sonuç eksi olamaz: büyükten küçüğü çıkar.' : 'Tam bölünmüyor.'); return; }
        draft.steps.push({ a: pool[draft.sel], op: draft.op, b: n, r });
        draft.sel = null; draft.op = null;
        redraw();
      },
    }, String(n))));
    opsBox.replaceChildren(...OPS.map((op) => el('button', { type: 'button', class: `btn btn-secondary hs-op ${draft.op === op ? 'sel' : ''}`, disabled: draft.sel == null, 'aria-label': op, onClick: () => { draft.op = draft.op === op ? null : op; redraw(); } }, op)));
    stepsBox.replaceChildren(...draft.steps.map((s) => el('div', {}, fmtStep(s))));
    const best = closest(pool, puzzle.target);
    const diff = Math.abs(best - puzzle.target);
    draw(bestLine, el('strong', {}, diff === 0 ? `Tam isabet: ${best}!` : `En yakının: ${best} (${diff} uzak)`));
    hintBox.textContent = note || (draft.sel == null ? 'Bir sayıya dokun.' : draft.op == null ? 'Şimdi bir işlem seç.' : 'Şimdi ikinci sayıya dokun.');
    hintBox.classList.toggle('rejected-note', !!note);
  };
  redraw();
  draw(container,
    timerBox,
    targetView,
    online && oppDone ? el('p', { class: 'hint rejected-note' }, `${players[opp]} bitirdi! ${GRACE_MS / 1000} saniyen var.`) : null,
    poolBox,
    opsBox,
    hintBox,
    bestLine,
    stepsBox,
    el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px', marginTop: '8px' } },
      el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => { draft.steps.pop(); draft.sel = null; draft.op = null; redraw(); } }, 'Geri al'),
      el('button', { type: 'button', class: 'btn btn-primary', onClick: submit }, 'Gönder'),
    ),
    legend,
  );
  return () => { if (timer) timer.stop(); };
}

export default { id: 'hedef-sayi', meta, setup, applyMove, render, getTurn, getResult };
