// Hesap Yarışı — both players get the same seeded arithmetic questions; most correct wins,
// ties go to the faster player. One phone: one after the other; two phones: at once.
import { el, render as draw } from '../js/ui/dom.js';
import { createTimer } from '../js/ui/timer.js';
import { createKeyboard } from '../js/ui/keyboard.js';
import { createRng } from '../js/lib/rng.js';

export const meta = {
  group: 'tanisma',
  name: 'Hesap Yarışı',
  icon: '🧮',
  description: 'Aynı işlemler ikinize; doğru sayısı, eşitlikte hız kazandırır.',
  rules: [
    'İkinize de aynı işlemler gelir. Cevabı tuşlayıp "Gir"e bas; süre dolarsa yanlış sayılır.',
    'Kolay: 20\'ye kadar toplama/çıkarma, küçük çarpım. Orta: iki basamaklı işlemler, çarpım tablosu, bölme. Zor: üç basamaklı toplama/çıkarma, büyük çarpım ve bölme, karışık işlem.',
    'Tek telefonda önce biri bütün soruları çözer, sonra telefonu verir; iki telefonda ikiniz aynı anda çözersiniz. Doğru sayısı fazla olan kazanır; eşitlikte toplam süresi az olan.',
  ].join('\n'),
  data: [],
  handoffNote: 'Sorular aynı: cevaplarını rakibin görmemeli.',
  settings: [
    { key: 'count', label: 'Soru sayısı', type: 'select', default: 10, options: [{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 15, label: '15' }, { value: 20, label: '20' }] },
    { key: 'level', label: 'Zorluk', type: 'select', default: 'medium', options: [{ value: 'easy', label: 'Kolay' }, { value: 'medium', label: 'Orta' }, { value: 'hard', label: 'Zor' }] },
    { key: 'timeLimit', label: 'Soru başına süre', type: 'select', default: 15, options: [{ value: 10, label: '10 sn' }, { value: 15, label: '15 sn' }, { value: 20, label: '20 sn' }, { value: 0, label: 'Süresiz' }] },
  ],
};

function fail(msg) {
  throw new Error(msg);
}

/** Deterministic questions: { text, answer } with non-negative integer answers. */
export function generateQuestions(count, level, seed) {
  const rng = createRng(seed);
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const out = [];
  const seen = new Set();
  for (let guard = 0; out.length < count && guard < count * 50; guard++) {
    let q;
    const kind = rng();
    if (level === 'easy') {
      if (kind < 0.4) { const a = int(1, 20); const b = int(1, 20); q = { text: `${a} + ${b}`, answer: a + b }; }
      else if (kind < 0.75) { const a = int(2, 20); const b = int(1, a); q = { text: `${a} − ${b}`, answer: a - b }; }
      else { const a = int(2, 5); const b = int(2, 9); q = { text: `${a} × ${b}`, answer: a * b }; }
    } else if (level === 'hard') {
      if (kind < 0.25) { const a = int(100, 999); const b = int(100, 999); q = { text: `${a} + ${b}`, answer: a + b }; }
      else if (kind < 0.5) { const a = int(200, 999); const b = int(100, a); q = { text: `${a} − ${b}`, answer: a - b }; }
      else if (kind < 0.7) { const a = int(11, 29); const b = int(3, 12); q = { text: `${a} × ${b}`, answer: a * b }; }
      else if (kind < 0.85) { const b = int(3, 19); const r = int(3, 29); q = { text: `${b * r} ÷ ${b}`, answer: r }; }
      else { const a = int(3, 12); const b = int(3, 12); const c = int(10, 99); q = { text: `${a} × ${b} + ${c}`, answer: a * b + c }; }
    } else {
      if (kind < 0.3) { const a = int(10, 99); const b = int(10, 99); q = { text: `${a} + ${b}`, answer: a + b }; }
      else if (kind < 0.55) { const a = int(20, 99); const b = int(10, a); q = { text: `${a} − ${b}`, answer: a - b }; }
      else if (kind < 0.8) { const a = int(2, 12); const b = int(2, 12); q = { text: `${a} × ${b}`, answer: a * b }; }
      else { const b = int(2, 12); const r = int(2, 12); q = { text: `${b * r} ÷ ${b}`, answer: r }; }
    }
    if (seen.has(q.text)) continue;
    seen.add(q.text);
    out.push(q);
  }
  return out;
}

export function setup(options = {}) {
  const count = [5, 10, 15, 20].includes(Number(options.count)) ? Number(options.count) : 10;
  const timeLimit = [0, 10, 15, 20].includes(Number(options.timeLimit)) ? Number(options.timeLimit) : 15;
  const level = ['easy', 'medium', 'hard'].includes(options.level) ? options.level : 'medium';
  return {
    id: String(options.seed ?? ''),
    count,
    level,
    timeLimit,
    questions: generateQuestions(count, level, Number(options.seed) || 1),
    answers: [[], []],  // answers[p][i] = { value (null = time out), ms }
    phase: 'play',      // play | over
  };
}

export function scoreOf(state, p) {
  let correct = 0;
  let ms = 0;
  state.answers[p].forEach((a, i) => { if (a.value === state.questions[i].answer) correct += 1; ms += a.ms; });
  return { correct, ms };
}

export function applyMove(state, player, move) {
  if (!move || move.type !== 'answer') fail('Geçersiz hamle');
  if (state.phase !== 'play') fail('Oyun bitti');
  const i = Number(move.index);
  if (i !== state.answers[player].length) fail('Sorular sırayla cevaplanır');
  if (i >= state.count) fail('Bütün soruları cevapladın');
  let value = move.value == null || move.value === '' ? null : Number(move.value);
  if (value != null && (!Number.isInteger(value) || value < 0 || value > 999999)) fail('Geçersiz cevap');
  const limit = state.timeLimit * 1000;
  let ms = Number(move.ms);
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  if (limit) ms = Math.min(ms, limit);
  const answers = state.answers.map((l) => l.slice());
  answers[player].push({ value, ms: Math.round(ms) });
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
const shownAt = new WeakMap(); // container -> { viewer, index, questions, at }

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const opp = 1 - viewer;
  const total = state.count;

  if (state.phase === 'play') {
    const mineDone = state.answers[viewer].length;
    if (mineDone >= total) {
      draw(container,
        el('div', { class: 'status-line' }, el('strong', {}, `Bitirdin: ${scoreOf(state, viewer).correct}/${total} doğru.`)),
        el('p', { class: 'hint' }, `${players[opp]} çözüyor… (${state.answers[opp].length}/${total})`),
        el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      );
      return null;
    }
    const i = mineDone;
    const q = state.questions[i];
    let shown = shownAt.get(container);
    if (!shown || shown.viewer !== viewer || shown.index !== i || shown.questions !== state.questions) {
      shown = { viewer, index: i, questions: state.questions, at: Date.now(), typed: '' };
      shownAt.set(container, shown);
    }
    const startedAt = shown.at;
    const limitMs = state.timeLimit * 1000;
    let answered = false;
    let typed = shown.typed || ''; // survives a re-render caused by the opponent's answer online
    const send = (value) => {
      if (answered) return;
      answered = true;
      sendMove({ type: 'answer', index: i, value, ms: Date.now() - startedAt });
    };
    const timerBox = el('div');
    let timer = null;
    // an already-passed deadline fires onExpire deferred (and cancelled by the cleanup if superseded)
    if (limitMs) timer = createTimer(timerBox, { deadline: startedAt + limitMs, total: limitMs, onExpire: () => send(null) });
    const answerBox = el('div', { class: 'hy-answer' }, '');
    const drawAnswer = () => { shown.typed = typed; answerBox.textContent = typed || ' '; answerBox.classList.toggle('empty', !typed); };
    drawAnswer();
    const kbBox = el('div');
    const kb = createKeyboard(kbBox, {
      layout: 'digits',
      onKey: (k) => { if (typed.length < 6 && !(typed === '0')) { typed += k; drawAnswer(); } },
      onBackspace: () => { typed = typed.slice(0, -1); drawAnswer(); },
      onEnter: () => { if (typed) send(Number(typed)); },
    });
    const prev = i > 0 ? state.answers[viewer][i - 1] : null;
    const prevQ = i > 0 ? state.questions[i - 1] : null;
    const feedback = prev
      ? el('p', { class: `hint ${prev.value === prevQ.answer ? 'notice' : 'rejected-note'}` },
        prev.value === prevQ.answer ? 'Önceki soru: doğru!' : `Önceki soru: ${prev.value == null ? 'süre doldu' : 'yanlış'} — ${prevQ.text} = ${prevQ.answer}`)
      : null;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]} — Soru ${i + 1}/${total}`)),
      feedback,
      timerBox,
      el('div', { class: 'question-card card hy-card' }, el('div', { class: 'hy-expr' }, `${q.text} = ?`), answerBox),
      kbBox,
    );
    return () => { if (timer) timer.stop(); kb.destroy(); };
  }

  const scores = [scoreOf(state, 0), scoreOf(state, 1)];
  const rows = state.questions.map((q, i) => {
    const cell = (p) => {
      const a = state.answers[p][i];
      const ok = a && a.value === q.answer;
      return el('span', { class: `badge ${ok ? 'match' : 'miss'}` }, a ? (a.value == null ? 'süre' : String(a.value)) : '—');
    };
    return el('div', { class: 'compare-item card' },
      el('div', { class: 'q' }, `${i + 1}. ${q.text} = ${q.answer}`),
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

export default { id: 'hesap-yarisi', meta, setup, applyMove, render, getTurn, getResult };
