// Beni Ne Kadar Tanıyorsun? — both players get the same questions. Each player first
// answers them about themselves, then guesses the other player's answers. When both are
// done the comparison appears automatically; open-ended answers are judged by their owner
// (Tuttu / Yakın / Tutmadı). The player who guessed more wins.
//
// Answers travel in the `secret` field of the answer move, so in online mode the other
// device never holds them until the owner's device reveals them for the comparison.
import { el, render as draw } from '../js/ui/dom.js';
import { createRng, shuffle } from '../js/lib/rng.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'tanisma',
  name: 'Beni Ne Kadar Tanıyorsun?',
  icon: '💞',
  description: 'Aynı soruları önce kendin için cevapla, sonra rakibin cevaplarını tahmin et.',
  rules: [
    'İkinize de aynı sorular gelir (varsayılan 10). Her oyuncu önce soruları kendisi hakkında cevaplar, sonra aynı soruları rakibi için tahmin eder.',
    'İkiniz de bitirince karşılaştırma ekranı kendiliğinden gelir. Çoktan seçmeli sorularda eşleşme otomatik sayılır; açık uçlu sorularda cevabın sahibi karar verir: Tuttu (1 puan), Yakın (yarım puan), Tutmadı.',
    'Rakibini daha iyi tanıyan kazanır.',
    'Sorular hazır havuzdan gelir; kurulum ekranındaki "Kendi sorularınız" alanından kendi sorularınızı ekleyebilirsiniz, onlar önce sorulur.',
  ].join('\n'),
  data: ['questions'],
  handoffNote: 'Cevaplar gizli: ekranı yalnızca sırası gelen görmeli.',
  settings: [
    { key: 'count', label: 'Soru sayısı', type: 'select', default: 10, options: [{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 15, label: '15' }] },
    {
      key: 'customMode', label: 'Kendi sorularınız', type: 'select', default: 'first',
      options: [
        { value: 'first', label: 'Önce kendi sorularımız, sonra havuz' },
        { value: 'mix', label: 'Havuzla karışık' },
        { value: 'none', label: 'Kullanma' },
      ],
    },
  ],
};

export const VERDICT_POINTS = { match: 1, close: 0.5, miss: 0 };

function fail(msg) {
  throw new Error(msg);
}

function cleanQuestion(q, i) {
  const base = { id: String(q.id || `q-${i}`), category: q.category || 'ozel', type: q.type === 'choice' ? 'choice' : 'open', text: String(q.text || '').trim() };
  if (base.type === 'choice') base.options = (q.options || []).map((o) => String(o).trim()).filter(Boolean);
  if (!base.text) return null;
  if (base.type === 'choice' && base.options.length < 2) return null;
  return base;
}

/** Pick `count` questions deterministically from the seed. Exported for tests. */
export function pickQuestions(pool, custom, count, customMode, seed) {
  const rng = createRng(seed);
  const base = shuffle(rng, (pool || []).map(cleanQuestion).filter(Boolean));
  const own = customMode === 'none' ? [] : shuffle(rng, (custom || []).map(cleanQuestion).filter(Boolean));
  if (!own.length && !base.length) fail('Soru havuzu boş');
  let order = customMode === 'mix' ? shuffle(rng, own.concat(base)) : own.concat(base);
  const picked = [];
  for (let i = 0; picked.length < count; i++) picked.push(order[i % order.length]);
  return picked;
}

export function setup(options = {}, ctx = {}) {
  const count = [5, 10, 15].includes(Number(options.count)) ? Number(options.count) : 10;
  const pool = ctx.questions && Array.isArray(ctx.questions.questions) ? ctx.questions.questions : (Array.isArray(ctx.questions) ? ctx.questions : []);
  const custom = Array.isArray(ctx.customQuestions) ? ctx.customQuestions : [];
  const questions = pickQuestions(pool, custom, count, options.customMode || 'first', Number(options.seed) || 1);
  const empty = () => [new Array(count).fill(null), new Array(count).fill(null)];
  return {
    id: String(options.seed ?? ''), // new every game: typed drafts are kept per game
    count,
    phase: 'play',      // play | compare | over
    questions,
    answers: empty(),   // answers[p][i]: known on p's device (and everywhere after reveal)
    answered: [0, 0],
    guesses: empty(),   // guesses[p][i]: p's guess of the other player's answer (public)
    guessed: [0, 0],
    finished: [false, false],
    done: [false, false],    // pressed "Sonucu gör" (both must, online)
    revealed: [false, false],
    judgments: empty(), // judgments[owner][i]: verdict for the other player's guess of owner's answer
  };
}

function validateValue(q, raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) fail('Bir cevap yaz');
  if (q.type === 'choice' && !q.options.includes(value)) fail('Seçeneklerden birini seç');
  if (value.length > 80) fail('Cevap çok uzun (en fazla 80 karakter)');
  return value;
}

function autoJudge(state, owner) {
  const judgments = state.judgments.map((l) => l.slice());
  state.questions.forEach((q, i) => {
    if (q.type === 'choice' && judgments[owner][i] == null && state.answers[owner][i] != null && state.guesses[1 - owner][i] != null) {
      judgments[owner][i] = state.answers[owner][i] === state.guesses[1 - owner][i] ? 'match' : 'miss';
    }
  });
  return judgments;
}

/** points[p] = how well p guessed the other player (sum of the other player's judgments). */
export function points(state) {
  const sum = (owner) => state.judgments[owner].reduce((acc, v) => acc + (VERDICT_POINTS[v] || 0), 0);
  return [sum(1), sum(0)];
}

export function allJudged(state) {
  return state.revealed[0] && state.revealed[1] && state.judgments.every((l) => l.every((v) => v != null));
}

/** done[] arrived with a later build; a state made by an older build may lack it. */
const doneOf = (state) => state.done || [false, false];

export function applyMove(state, player, move, ctx = {}) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  switch (move.type) {
    case 'answer': {
      if (state.phase !== 'play') fail('Cevap aşaması bitti');
      if (state.finished[player]) fail('Bitirdin');
      const i = move.index;
      if (i !== state.answered[player]) fail('Sorular sırayla cevaplanır');
      const answers = state.answers.map((l) => l.slice());
      if (move.secret && move.secret.value != null) answers[player][i] = validateValue(state.questions[i], move.secret.value);
      const answered = state.answered.slice();
      answered[player] = i + 1;
      return { ...state, answers, answered };
    }
    case 'guess': {
      if (state.phase !== 'play') fail('Tahmin aşaması bitti');
      if (state.finished[player]) fail('Bitirdin');
      if (state.answered[player] < state.count) fail('Önce kendi cevaplarını ver');
      const i = move.index;
      if (i !== state.guessed[player]) fail('Sorular sırayla tahmin edilir');
      const guesses = state.guesses.map((l) => l.slice());
      guesses[player][i] = validateValue(state.questions[i], move.value);
      const guessed = state.guessed.slice();
      guessed[player] = i + 1;
      const finished = state.finished.slice();
      finished[player] = guessed[player] >= state.count;
      const next = { ...state, guesses, guessed, finished };
      if (finished[0] && finished[1]) next.phase = 'compare';
      return next;
    }
    case 'reveal': {
      if (state.phase !== 'compare') fail('Cevaplar bu aşamada açıklanmaz');
      if (state.revealed[player]) return state;
      if (!Array.isArray(move.answers) || move.answers.length !== state.count) fail('Geçersiz cevap listesi');
      const answers = state.answers.map((l) => l.slice());
      answers[player] = move.answers.map((a) => (a == null ? null : String(a)));
      const revealed = state.revealed.slice();
      revealed[player] = true;
      const next = { ...state, answers, revealed };
      return { ...next, judgments: autoJudge(next, player) };
    }
    case 'judge': {
      if (state.phase !== 'compare') fail('Şu anda karar verilemez');
      const owner = move.owner;
      if (owner !== 0 && owner !== 1) fail('Geçersiz hamle');
      // On one shared phone either player may tap the buttons; online only the owner decides.
      if (ctx.mode === 'online' && player !== owner) fail('Buna cevabın sahibi karar verir');
      if (!state.revealed[owner]) fail('Önce cevaplar açıklanmalı');
      if (doneOf(state)[owner]) fail('Bu oyuncu sonucu onayladı; karar değiştirilemez');
      const q = state.questions[move.index];
      if (!q) fail('Geçersiz soru');
      if (q.type !== 'open') fail('Bu soru otomatik puanlanır');
      if (!Object.hasOwn(VERDICT_POINTS, move.verdict)) fail('Geçersiz karar');
      const judgments = state.judgments.map((l) => l.slice());
      judgments[owner][move.index] = move.verdict;
      return { ...state, judgments };
    }
    case 'finish': {
      if (state.phase !== 'compare') fail('Karşılaştırma bitmedi');
      if (!allJudged(state)) fail('Önce bütün açık uçlu cevaplara karar verilmeli');
      // on one phone a single tap ends it; online each player confirms, so the two devices
      // cannot end with different judgments (a late judge move is rejected once its owner is done)
      const done = ctx.mode === 'online' ? doneOf(state).map((d, p) => d || p === player) : [true, true];
      return { ...state, done, phase: done[0] && done[1] ? 'over' : 'compare' };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function autoMove(state, player) {
  if (state.phase === 'compare' && !state.revealed[player] && state.answers[player].every((a) => a != null)) {
    return { type: 'reveal', answers: state.answers[player] };
  }
  return null;
}

export function getTurn(state) {
  if (state.phase !== 'play') return null; // comparison and result are looked at together
  const p = state.finished[0] ? (state.finished[1] ? null : 1) : 0;
  return p == null ? null : { player: p, private: true, simultaneous: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const [a, b] = points(state);
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

export function formatPoints(n) {
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

// ----------------------------------------------------------------- render
function questionCard(q, no, total, categories, intro) {
  return el('div', { class: 'question-card card' },
    el('div', { class: 'question-no' }, `Soru ${no}/${total} · ${categories[q.category] || 'Sizin sorunuz'}`),
    intro ? el('div', { class: 'muted', style: { marginBottom: '6px' } }, intro) : null,
    el('div', { class: 'question-text' }, q.text),
  );
}

// Half-typed open answers survive the re-render caused by the opponent's moves (online).
const drafts = new Map(); // `${viewer}:${step}:${index}` -> text
let draftsFor = null;     // state.id the drafts belong to

function answerInput(q, onSubmit, draftKey) {
  if (q.type === 'choice') {
    return el('div', { class: 'options' }, q.options.map((o) =>
      el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => onSubmit(o) }, o)));
  }
  const input = el('input', { type: 'text', class: 'input', maxlength: 80, autocomplete: 'off', placeholder: 'Cevabın…', 'aria-label': 'Cevap' });
  if (draftKey && drafts.has(draftKey)) input.value = drafts.get(draftKey);
  input.addEventListener('input', () => { if (draftKey) drafts.set(draftKey, input.value); });
  const form = el('form', { onSubmit: (e) => { e.preventDefault(); if (draftKey) drafts.delete(draftKey); onSubmit(input.value); } },
    el('div', { class: 'field' }, input),
    el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Kaydet'),
  );
  queueMicrotask(() => { if (document.activeElement !== input && !(document.activeElement && document.activeElement.tagName === 'INPUT')) input.focus(); });
  return form;
}

const VERDICT_LABEL = { match: 'Tuttu', close: 'Yakın', miss: 'Tutmadı' };

export function render(state, viewer, container, sendMove, ctx = {}) {
  if (draftsFor !== state.id) { drafts.clear(); draftsFor = state.id; }
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const categories = (ctx.questions && ctx.questions.categories) || {};
  const online = ctx.mode === 'online';
  const total = state.count;
  const opp = 1 - viewer;

  if (state.phase === 'play') {
    if (state.finished[viewer]) {
      draw(container,
        el('div', { class: 'status-line' }, el('strong', {}, 'Bitirdin!')),
        el('p', { class: 'hint' }, `${players[opp]} devam ediyor… (cevap ${state.answered[opp]}/${total}, tahmin ${state.guessed[opp]}/${total})`),
        el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      );
      return null;
    }
    if (state.answered[viewer] < total) {
      const i = state.answered[viewer];
      draw(container,
        el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}, kendin hakkında cevapla`)),
        el('p', { class: 'hint' }, `1. adım: kendi cevapların (${i + 1}/${total}) · 2. adım: ${nameSuffix(players[opp], 'in')} cevaplarını tahmin et`),
        questionCard(state.questions[i], i + 1, total, categories, null),
        answerInput(state.questions[i], (value) => sendMove({ type: 'answer', index: i, secret: { value } }), `${viewer}:answer:${i}`),
      );
      return null;
    }
    const i = state.guessed[viewer];
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}, ${nameSuffix(players[opp], 'in')} cevabını tahmin et`)),
      el('p', { class: 'hint' }, `2. adım: tahminler (${i + 1}/${total})`),
      questionCard(state.questions[i], i + 1, total, categories, `${nameSuffix(players[opp], 'e')} de bu soru soruldu — sence ne cevap verdi?`),
      answerInput(state.questions[i], (value) => sendMove({ type: 'guess', index: i, value }), `${viewer}:guess:${i}`),
    );
    return null;
  }

  // compare / over
  if (!state.revealed[0] || !state.revealed[1]) {
    draw(container, el('div', { class: 'status-line' }, el('span', { class: 'muted' }, 'Cevaplar karşılaştırılıyor…')), el('div', { class: 'spinner', 'aria-hidden': 'true' }));
    return null;
  }
  const pts = points(state);
  const canJudge = (owner) => state.phase === 'compare' && !doneOf(state)[owner] && (!online || viewer === owner);
  const pairRow = (owner, i) => {
    const guesser = 1 - owner;
    const verdict = state.judgments[owner][i];
    const q = state.questions[i];
    const badge = verdict ? el('span', { class: `badge ${verdict}` }, VERDICT_LABEL[verdict]) : null;
    const buttons = q.type === 'open' && canJudge(owner)
      ? el('div', { class: 'judge-buttons' }, ['match', 'close', 'miss'].map((v) =>
        el('button', { type: 'button', class: `btn ${verdict === v ? 'btn-primary' : 'btn-secondary'}`, onClick: () => sendMove({ type: 'judge', owner, index: i, verdict: v }) }, VERDICT_LABEL[v])))
      : (q.type === 'open' && !verdict ? el('div', { class: 'muted', style: { fontSize: '0.9rem' } }, `${players[owner]} karar verecek…`) : null);
    return el('div', { class: 'pair' },
      el('div', { class: 'ans' }, el('span', { class: 'muted' }, `${players[owner]}: `), state.answers[owner][i] ?? '—',
        el('span', { class: 'muted' }, ` · ${nameSuffix(players[guesser], 'in')} tahmini: `), state.guesses[guesser][i] ?? '—', ' ', badge),
      buttons,
    );
  };
  const items = state.questions.map((q, i) => el('div', { class: 'compare-item card' },
    el('div', { class: 'q' }, `${i + 1}. ${q.text}`),
    pairRow(0, i),
    pairRow(1, i),
  ));
  const summary = el('div', { class: 'status-line' },
    el('div', {}, el('strong', {}, `${players[0]}, ${nameSuffix(players[1], 'i')} ${total} üzerinden ${formatPoints(pts[0])} tanıyor`)),
    el('div', {}, el('strong', {}, `${players[1]}, ${nameSuffix(players[0], 'i')} ${total} üzerinden ${formatPoints(pts[1])} tanıyor`)),
  );
  const done = allJudged(state);
  const mineDone = online && doneOf(state)[viewer];
  draw(container,
    summary,
    state.phase === 'compare' && !done ? el('p', { class: 'hint' }, 'Açık uçlu cevaplara Tuttu / Yakın / Tutmadı diyerek karar verin.') : null,
    el('div', { class: 'compare-list' }, items),
    state.phase === 'compare' ? el('div', { class: 'section' },
      mineDone
        ? el('p', { class: 'hint' }, `${players[opp]} sonucu onaylayınca bitecek…`)
        : el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', disabled: !done, onClick: () => sendMove({ type: 'finish' }) }, 'Sonucu gör'),
    ) : null,
  );
  return null;
}

// ----------------------------------------------------------------- custom questions (setup screen)
export function setupExtra(container, storage) {
  const KEY = 'custom-questions';
  let list = storage.load(KEY, []);
  const listBox = el('div', { class: 'custom-q-list' });
  const typeSel = el('select', { class: 'select', id: 'custom-q-type', 'aria-label': 'Soru türü' },
    el('option', { value: 'choice' }, '4 seçenekli'),
    el('option', { value: 'open' }, 'Açık uçlu (serbest cevap)'));
  const text = el('input', { type: 'text', class: 'input', id: 'custom-q-text', maxlength: 120, placeholder: 'Örn: En sevdiğin tatlı hangisi?' });
  const optInputs = [0, 1, 2, 3].map((i) => el('input', { type: 'text', class: 'input', id: `custom-q-opt-${i}`, maxlength: 40, placeholder: `${i + 1}. seçenek` }));
  const optBox = el('div', { class: 'options', style: { marginTop: '8px' } }, optInputs);
  typeSel.addEventListener('change', () => { optBox.style.display = typeSel.value === 'choice' ? '' : 'none'; });
  const title = el('h2', { class: 'section-title' });

  const drawList = () => {
    title.textContent = `Kendi sorularınız (${list.length})`;
    draw(listBox, list.length
      ? list.map((q, i) => el('div', { class: 'custom-q-item' },
        el('span', {}, `${q.text}${q.type === 'choice' ? ` (${q.options.join(' / ')})` : ' (açık uçlu)'}`),
        el('button', { type: 'button', class: 'btn btn-small', 'aria-label': 'Sil', onClick: () => { list = list.filter((_, k) => k !== i); storage.save(KEY, list); drawList(); } }, '✕')))
      : el('p', { class: 'muted' }, 'Henüz kendi sorunuz yok. Aşağıdan ekleyin; eklediğiniz sorular havuzdakilerden önce sorulur.'));
  };
  drawList();

  const add = () => {
    const q = { id: `custom-${Date.now()}`, category: 'ozel', type: typeSel.value, text: text.value.trim() };
    if (!q.text) { text.focus(); return; }
    if (q.type === 'choice') {
      q.options = optInputs.map((o) => o.value.trim()).filter(Boolean);
      if (q.options.length < 2) { optInputs[0].focus(); return; }
    }
    list = list.concat([q]);
    storage.save(KEY, list);
    text.value = '';
    optInputs.forEach((o) => { o.value = ''; });
    drawList();
    text.focus();
  };

  draw(container, el('section', { class: 'section card' },
    title,
    listBox,
    el('div', { class: 'field', style: { marginTop: '12px' } }, el('label', { for: 'custom-q-text' }, 'Yeni soru (sen diliyle yaz)'), text),
    el('div', { class: 'field' }, el('label', { for: 'custom-q-type' }, 'Soru türü'), typeSel),
    optBox,
    el('button', { type: 'button', class: 'btn btn-secondary btn-block', style: { marginTop: '8px' }, onClick: add }, '+ Soruyu ekle'),
  ));
}

export default { id: 'beni-tani', meta, setup, applyMove, autoMove, render, getTurn, getResult, setupExtra };
