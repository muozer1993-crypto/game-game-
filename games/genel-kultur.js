// Genel Kültür Düellosu — both players answer the same quiz questions; most correct wins,
// ties go to the faster player.
import { el, render as draw } from '../js/ui/dom.js';
import { createTimer } from '../js/ui/timer.js';
import { createRng, shuffle } from '../js/lib/rng.js';

export const meta = {
  group: 'tanisma',
  name: 'Genel Kültür Düellosu',
  icon: '🧠',
  description: 'Aynı sorulara ikiniz de cevap verin; doğru sayısı, eşitlikte hız kazandırır.',
  rules: [
    'İkinize de aynı sorular gelir (varsayılan 10, 4 seçenekli). Her soru için süre vardır; süre dolarsa yanlış sayılır.',
    'Tek telefonda önce biri bütün soruları cevaplar, sonra telefonu verir; iki telefonda ikiniz aynı anda oynarsınız. İkiniz de bitince sonuç ekranı gelir.',
    'Doğru sayısı fazla olan kazanır; eşitlikte toplam süresi az olan kazanır.',
  ].join('\n'),
  data: ['trivia'],
  handoffNote: 'Sorular aynı: cevaplarını rakibin görmemeli.',
  settings: [
    { key: 'count', label: 'Soru sayısı', type: 'select', default: 10, options: [{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 15, label: '15' }] },
    { key: 'timeLimit', label: 'Soru başına süre', type: 'select', default: 20, options: [{ value: 10, label: '10 sn' }, { value: 20, label: '20 sn' }, { value: 30, label: '30 sn' }, { value: 0, label: 'Süresiz' }] },
    { key: 'level', label: 'Zorluk', type: 'select', default: 'mixed', options: [{ value: 'mixed', label: 'Karışık' }, { value: 'easy', label: 'Kolay' }, { value: 'hard', label: 'Zor' }] },
  ],
};

function fail(msg) {
  throw new Error(msg);
}

function clean(q) {
  if (!q || !q.text || !Array.isArray(q.options) || q.options.length !== 4) return null;
  const answer = Number(q.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) return null;
  return { id: String(q.id || ''), category: q.category || '', difficulty: Number(q.difficulty) || 2, text: String(q.text), options: q.options.map(String), answer };
}

/** Pick `count` questions, spreading categories, deterministic from the seed. */
export function pickQuestions(pool, count, level, seed) {
  const rng = createRng(seed);
  let all = (pool || []).map(clean).filter(Boolean);
  if (level === 'easy' || level === 'hard') {
    const want = level === 'easy' ? 1 : 3;
    const strict = all.filter((q) => q.difficulty === want);
    // fall back to the neighbouring level when the pool is too small for a varied round
    all = strict.length >= count * 2 ? strict : all.filter((q) => (level === 'easy' ? q.difficulty <= 2 : q.difficulty >= 2));
  }
  if (!all.length) fail('Soru havuzu boş');
  const shuffled = shuffle(rng, all);
  const cats = new Set(shuffled.map((q) => q.category));
  const perCat = Math.ceil(count / Math.max(1, cats.size)) + 1;
  const used = {};
  const picked = [];
  for (const q of shuffled) {
    if (picked.length >= count) break;
    if ((used[q.category] || 0) >= perCat) continue;
    used[q.category] = (used[q.category] || 0) + 1;
    picked.push(q);
  }
  for (const q of shuffled) { if (picked.length >= count) break; if (!picked.includes(q)) picked.push(q); }
  while (picked.length < count) picked.push(shuffled[picked.length % shuffled.length]);
  return picked;
}

export function setup(options = {}, ctx = {}) {
  const count = [5, 10, 15].includes(Number(options.count)) ? Number(options.count) : 10;
  const timeLimit = [0, 10, 20, 30].includes(Number(options.timeLimit)) ? Number(options.timeLimit) : 20;
  const pool = ctx.trivia && Array.isArray(ctx.trivia.questions) ? ctx.trivia.questions : (Array.isArray(ctx.trivia) ? ctx.trivia : []);
  const questions = pickQuestions(pool, count, options.level || 'mixed', Number(options.seed) || 1);
  return {
    count,
    timeLimit,
    questions,          // { text, options, answer, category, difficulty }
    answers: [[], []],  // answers[p][i] = { choice (-1 = time out), ms }
    phase: 'play',      // play | over
  };
}

export function scoreOf(state, p) {
  let correct = 0;
  let ms = 0;
  state.answers[p].forEach((a, i) => { if (a.choice === state.questions[i].answer) correct += 1; ms += a.ms; });
  return { correct, ms };
}

export function applyMove(state, player, move) {
  if (!move || move.type !== 'answer') fail('Geçersiz hamle');
  if (state.phase !== 'play') fail('Oyun bitti');
  const i = Number(move.index);
  if (i !== state.answers[player].length) fail('Sorular sırayla cevaplanır');
  if (i >= state.count) fail('Bütün soruları cevapladın');
  const choice = Number(move.choice);
  if (!Number.isInteger(choice) || choice < -1 || choice > 3) fail('Geçersiz cevap');
  const limit = state.timeLimit * 1000;
  let ms = Number(move.ms);
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  if (limit) ms = Math.min(ms, limit);
  const answers = state.answers.map((l) => l.slice());
  answers[player].push({ choice, ms: Math.round(ms) });
  const next = { ...state, answers };
  if (answers[0].length >= state.count && answers[1].length >= state.count) next.phase = 'over';
  return next;
}

export function getTurn(state) {
  if (state.phase !== 'play') return null;
  const p = state.answers[0].length >= state.count ? (state.answers[1].length >= state.count ? null : 1) : 0;
  return p == null ? null : { player: p, private: true, simultaneous: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const a = scoreOf(state, 0);
  const b = scoreOf(state, 1);
  if (a.correct !== b.correct) return { winner: a.correct > b.correct ? 0 : 1 };
  if (a.ms !== b.ms) return { winner: a.ms < b.ms ? 0 : 1 };
  return { draw: true };
}

// ----------------------------------------------------------------- render
// When the question was first shown on this device (the opponent's moves re-render the screen
// but must not restart the clock).
const shownAt = new WeakMap(); // container -> { viewer, index, at }

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const categories = (ctx.trivia && ctx.trivia.categories) || {};
  const opp = 1 - viewer;
  const total = state.count;

  if (state.phase === 'play') {
    const mineDone = state.answers[viewer].length;
    if (mineDone >= total) {
      draw(container,
        el('div', { class: 'status-line' }, el('strong', {}, `Bitirdin: ${scoreOf(state, viewer).correct}/${total} doğru.`)),
        el('p', { class: 'hint' }, `${players[opp]} cevaplıyor… (${state.answers[opp].length}/${total})`),
        el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      );
      return null;
    }
    const i = mineDone;
    const q = state.questions[i];
    let shown = shownAt.get(container);
    if (!shown || shown.viewer !== viewer || shown.index !== i || shown.questions !== state.questions) {
      shown = { viewer, index: i, questions: state.questions, at: Date.now() };
      shownAt.set(container, shown);
    }
    const startedAt = shown.at;
    const limitMs = state.timeLimit * 1000;
    const prev = i > 0 ? state.answers[viewer][i - 1] : null;
    const prevQ = i > 0 ? state.questions[i - 1] : null;
    let answered = false;
    const send = (choice) => {
      if (answered) return;
      answered = true;
      sendMove({ type: 'answer', index: i, choice, ms: Date.now() - startedAt });
    };
    const timerBox = el('div');
    let timer = null;
    if (limitMs) {
      if (startedAt + limitMs <= Date.now()) queueMicrotask(() => send(-1)); // already expired while re-rendering
      else timer = createTimer(timerBox, { deadline: startedAt + limitMs, total: limitMs, onExpire: () => send(-1) });
    }
    const feedback = prev
      ? el('p', { class: `hint ${prev.choice === prevQ.answer ? 'notice' : 'rejected-note'}` },
        prev.choice === prevQ.answer ? 'Önceki soru: doğru!' : `Önceki soru: ${prev.choice === -1 ? 'süre doldu' : 'yanlış'} — doğru cevap: ${prevQ.options[prevQ.answer]}`)
      : null;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]} — Soru ${i + 1}/${total}`)),
      feedback,
      timerBox,
      el('div', { class: 'question-card card' },
        el('div', { class: 'question-no' }, `${categories[q.category] || q.category}${q.difficulty === 3 ? ' · zor' : q.difficulty === 1 ? ' · kolay' : ''}`),
        el('div', { class: 'question-text' }, q.text),
      ),
      el('div', { class: 'options' }, q.options.map((o, k) =>
        el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => send(k) }, `${'ABCD'[k]}) ${o}`))),
    );
    return () => { if (timer) timer.stop(); };
  }

  // over
  const scores = [scoreOf(state, 0), scoreOf(state, 1)];
  const rows = state.questions.map((q, i) => {
    const cell = (p) => {
      const a = state.answers[p][i];
      const ok = a && a.choice === q.answer;
      return el('span', { class: `badge ${ok ? 'match' : 'miss'}` }, a ? (a.choice === -1 ? 'süre' : 'ABCD'[a.choice]) : '—');
    };
    return el('div', { class: 'compare-item card' },
      el('div', { class: 'q' }, `${i + 1}. ${q.text}`),
      el('div', { class: 'ans' }, el('span', { class: 'muted' }, 'Doğru: '), `${'ABCD'[q.answer]}) ${q.options[q.answer]}`),
      el('div', { class: 'ans' }, `${players[0]}: `, cell(0), ' · ', `${players[1]}: `, cell(1)),
    );
  });
  draw(container,
    el('div', { class: 'status-line' },
      el('div', {}, el('strong', {}, `${players[0]}: ${scores[0].correct}/${total} doğru (${(scores[0].ms / 1000).toFixed(1)} sn)`)),
      el('div', {}, el('strong', {}, `${players[1]}: ${scores[1].correct}/${total} doğru (${(scores[1].ms / 1000).toFixed(1)} sn)`)),
    ),
    el('div', { class: 'compare-list' }, rows),
  );
  return null;
}

export default { id: 'genel-kultur', meta, setup, applyMove, render, getTurn, getResult };
