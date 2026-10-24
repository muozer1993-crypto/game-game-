// Beni Ne Kadar Tanıyorsun? — one player answers questions about themselves, the other
// guesses the answers; then roles swap. Multiple-choice answers are compared
// automatically; for open-ended questions the answer's owner judges: Tuttu / Yakın / Tutmadı.
//
// Answers travel in the `secret` field of the answer move, so in online mode the
// guesser's device never holds them until the owner's device reveals them for judging.
import { el, render as draw } from '../js/ui/dom.js';
import { createRng, shuffle } from '../js/lib/rng.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  name: 'Beni Ne Kadar Tanıyorsun?',
  icon: '💞',
  description: 'Biri kendisi hakkında cevaplar, öteki tahmin eder; sonra roller değişir.',
  rules: [
    'Bir tur 10 sorudur (ayarlanabilir). Önce bir oyuncu soruları kendisi hakkında cevaplar, sonra diğeri onun cevaplarını tahmin eder.',
    'Çoktan seçmeli sorularda eşleşme otomatik sayılır. Açık uçlu sorularda cevabın sahibi karar verir: Tuttu (1 puan), Yakın (yarım puan), Tutmadı.',
    'Sonra roller değişir. Rakibini daha iyi tanıyan kazanır.',
    'Sorular hazır havuzdan gelir; ayarlar ekranından kendi sorularınızı da ekleyebilirsiniz.',
  ].join('\n'),
  data: ['questions'],
  handoffNote: 'Cevaplar gizli: ekranı yalnızca sırası gelen görmeli.',
  settings: [
    { key: 'perRound', label: 'Tur başına soru', type: 'select', default: 10, options: [{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 15, label: '15' }] },
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

/** Pick 2 × perRound questions deterministically from the seed. Exported for tests. */
export function pickQuestions(pool, custom, perRound, customMode, seed) {
  const rng = createRng(seed);
  const base = shuffle(rng, (pool || []).map(cleanQuestion).filter(Boolean));
  const own = customMode === 'none' ? [] : shuffle(rng, (custom || []).map(cleanQuestion).filter(Boolean));
  let order;
  if (customMode === 'mix') order = shuffle(rng, own.concat(base));
  else order = own.concat(base);
  const need = perRound * 2;
  if (!order.length) fail('Soru havuzu boş');
  const picked = [];
  for (let i = 0; picked.length < need; i++) picked.push(order[i % order.length]);
  return [picked.slice(0, perRound), picked.slice(perRound, need)];
}

export function setup(options = {}, ctx = {}) {
  const perRound = [5, 10, 15].includes(Number(options.perRound)) ? Number(options.perRound) : 10;
  const pool = ctx.questions && Array.isArray(ctx.questions.questions) ? ctx.questions.questions : (Array.isArray(ctx.questions) ? ctx.questions : []);
  const custom = Array.isArray(ctx.customQuestions) ? ctx.customQuestions : [];
  const questions = pickQuestions(pool, custom, perRound, options.customMode || 'first', Number(options.seed) || 1);
  const empty = () => [new Array(perRound).fill(null), new Array(perRound).fill(null)];
  return {
    perRound,
    round: 0,          // round r: player r answers, player 1-r guesses
    phase: 'answer',   // answer | guess | judge | over
    questions,
    answers: empty(),  // known on the answerer's device (and after reveal)
    answered: [0, 0],
    guesses: empty(),
    judgments: empty(),
    revealed: [false, false],
  };
}

const answererOf = (state) => state.round;
const guesserOf = (state) => 1 - state.round;

function validateValue(q, raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) fail('Bir cevap yaz');
  if (q.type === 'choice' && !q.options.includes(value)) fail('Seçeneklerden birini seç');
  if (value.length > 80) fail('Cevap çok uzun (en fazla 80 karakter)');
  return value;
}

function autoJudge(state, r) {
  const judgments = state.judgments.map((l) => l.slice());
  state.questions[r].forEach((q, i) => {
    if (q.type === 'choice' && judgments[r][i] == null && state.answers[r][i] != null && state.guesses[r][i] != null) {
      judgments[r][i] = state.answers[r][i] === state.guesses[r][i] ? 'match' : 'miss';
    }
  });
  return judgments;
}

export function roundPoints(state, r) {
  return state.judgments[r].reduce((sum, v) => sum + (VERDICT_POINTS[v] || 0), 0);
}

/** points[p] = how many points player p scored as the guesser. */
export function points(state) {
  return [roundPoints(state, 1), roundPoints(state, 0)];
}

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  const r = state.round;
  switch (move.type) {
    case 'answer': {
      if (state.phase !== 'answer') fail('Şu anda cevap verilemez');
      if (player !== answererOf(state)) fail('Sıra sende değil');
      const i = move.index;
      if (i !== state.answered[r]) fail('Sorular sırayla cevaplanır');
      const answers = state.answers.map((l) => l.slice());
      if (move.secret && move.secret.value != null) {
        answers[r][i] = validateValue(state.questions[r][i], move.secret.value);
      }
      const answered = state.answered.slice();
      answered[r] = i + 1;
      const next = { ...state, answers, answered };
      if (answered[r] >= state.perRound) next.phase = 'guess';
      return next;
    }
    case 'guess': {
      if (state.phase !== 'guess') fail('Şu anda tahmin yapılamaz');
      if (player !== guesserOf(state)) fail('Sıra sende değil');
      const i = move.index;
      const done = state.guesses[r].filter((g) => g != null).length;
      if (i !== done) fail('Sorular sırayla tahmin edilir');
      const guesses = state.guesses.map((l) => l.slice());
      guesses[r][i] = validateValue(state.questions[r][i], move.value);
      const next = { ...state, guesses };
      if (i + 1 >= state.perRound) next.phase = 'judge';
      return next;
    }
    case 'reveal': {
      if (state.phase !== 'judge') fail('Cevaplar bu aşamada açıklanmaz');
      if (player !== answererOf(state)) fail('Cevapları sahibi açıklar');
      if (state.revealed[r]) return state;
      if (!Array.isArray(move.answers) || move.answers.length !== state.perRound) fail('Geçersiz cevap listesi');
      const answers = state.answers.map((l) => l.slice());
      answers[r] = move.answers.map((a) => (a == null ? null : String(a)));
      const revealed = state.revealed.slice();
      revealed[r] = true;
      const next = { ...state, answers, revealed };
      return { ...next, judgments: autoJudge(next, r) };
    }
    case 'judge': {
      if (state.phase !== 'judge') fail('Şu anda karar verilemez');
      if (player !== answererOf(state)) fail('Buna cevabın sahibi karar verir');
      if (!state.revealed[r]) fail('Önce cevaplar açıklanmalı');
      const i = move.index;
      const q = state.questions[r][i];
      if (!q) fail('Geçersiz soru');
      if (q.type !== 'open') fail('Bu soru otomatik puanlanır');
      if (!(move.verdict in VERDICT_POINTS)) fail('Geçersiz karar');
      const judgments = state.judgments.map((l) => l.slice());
      judgments[r][i] = move.verdict;
      return { ...state, judgments };
    }
    case 'continue': {
      if (state.phase !== 'judge') fail('Tur henüz bitmedi');
      if (player !== answererOf(state)) fail('Sıra sende değil');
      if (!state.revealed[r] || state.judgments[r].some((v) => v == null)) fail('Önce bütün açık uçlu cevaplara karar ver');
      if (r === 0) return { ...state, round: 1, phase: 'answer' };
      return { ...state, phase: 'over' };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function autoMove(state, player) {
  const r = state.round;
  if (state.phase === 'judge' && !state.revealed[r] && player === answererOf(state)) {
    const answers = state.answers[r];
    if (answers.every((a) => a != null)) return { type: 'reveal', answers };
  }
  return null;
}

export function getTurn(state) {
  if (state.phase === 'over') return null;
  const p = state.phase === 'guess' ? guesserOf(state) : answererOf(state);
  return { player: p, private: true };
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

function answerInput(q, onSubmit) {
  if (q.type === 'choice') {
    return el('div', { class: 'options' }, q.options.map((o) =>
      el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => onSubmit(o) }, o)));
  }
  const input = el('input', { type: 'text', class: 'input', maxlength: 80, autocomplete: 'off', placeholder: 'Cevabın…', 'aria-label': 'Cevap' });
  const form = el('form', { onSubmit: (e) => { e.preventDefault(); onSubmit(input.value); } },
    el('div', { class: 'field' }, input),
    el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Kaydet'),
  );
  queueMicrotask(() => input.focus());
  return form;
}

const VERDICT_LABEL = { match: 'Tuttu', close: 'Yakın', miss: 'Tutmadı' };

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const categories = (ctx.questions && ctx.questions.categories) || {};
  const r = state.round;
  const answerer = answererOf(state);
  const guesser = guesserOf(state);
  const total = state.perRound;

  if (state.phase === 'answer') {
    if (viewer !== answerer) {
      draw(container, el('div', { class: 'status-line' }, el('span', { class: 'muted' }, `${players[answerer]} soruları cevaplıyor… (${state.answered[r]}/${total})`)), el('div', { class: 'spinner', 'aria-hidden': 'true' }));
      return null;
    }
    const i = state.answered[r];
    const q = state.questions[r][i];
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[answerer]}, kendin hakkında cevapla`)),
      questionCard(q, i + 1, total, categories, null),
      answerInput(q, (value) => sendMove({ type: 'answer', index: i, secret: { value } })),
    );
    return null;
  }

  if (state.phase === 'guess') {
    if (viewer !== guesser) {
      const done = state.guesses[r].filter((g) => g != null).length;
      draw(container, el('div', { class: 'status-line' }, el('span', { class: 'muted' }, `${players[guesser]} tahmin ediyor… (${done}/${total})`)), el('div', { class: 'spinner', 'aria-hidden': 'true' }));
      return null;
    }
    const i = state.guesses[r].filter((g) => g != null).length;
    const q = state.questions[r][i];
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[guesser]}, ${nameSuffix(players[answerer], 'in')} cevabını tahmin et`)),
      questionCard(q, i + 1, total, categories, `${nameSuffix(players[answerer], 'e')} soruldu — sence ne cevap verdi?`),
      answerInput(q, (value) => sendMove({ type: 'guess', index: i, value })),
    );
    return null;
  }

  if (state.phase === 'judge') {
    const isJudge = viewer === answerer;
    if (!state.revealed[r]) {
      draw(container, el('div', { class: 'status-line' }, el('span', { class: 'muted' }, 'Cevaplar karşılaştırılıyor…')), el('div', { class: 'spinner', 'aria-hidden': 'true' }));
      return null;
    }
    const items = state.questions[r].map((q, i) => {
      const verdict = state.judgments[r][i];
      const badge = verdict ? el('span', { class: `badge ${verdict}` }, VERDICT_LABEL[verdict]) : null;
      const buttons = isJudge && q.type === 'open'
        ? el('div', { class: 'judge-buttons' }, ['match', 'close', 'miss'].map((v) =>
          el('button', { type: 'button', class: `btn ${verdict === v ? 'btn-primary' : 'btn-secondary'}`, onClick: () => sendMove({ type: 'judge', index: i, verdict: v }) }, VERDICT_LABEL[v])))
        : null;
      return el('div', { class: 'compare-item card' },
        el('div', { class: 'q' }, `${i + 1}. ${q.text}`),
        el('div', { class: 'ans' }, el('span', { class: 'muted' }, `${players[answerer]}: `), state.answers[r][i] ?? '—'),
        el('div', { class: 'ans' }, el('span', { class: 'muted' }, `${players[guesser]} tahmini: `), state.guesses[r][i] ?? '—'),
        badge,
        buttons,
      );
    });
    const allJudged = state.judgments[r].every((v) => v != null);
    const score = roundPoints(state, r);
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, isJudge
        ? (allJudged ? `${players[guesser]} seni ${total} üzerinden ${formatPoints(score)} tanıyor.` : 'Açık uçlu cevaplara karar ver')
        : `${players[answerer]} cevapları değerlendiriyor…`)),
      el('div', { class: 'compare-list' }, items),
      isJudge ? el('div', { class: 'section' },
        el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', disabled: !allJudged, onClick: () => sendMove({ type: 'continue' }) }, r === 0 ? 'Devam: roller değişsin' : 'Sonucu gör'),
      ) : null,
    );
    return null;
  }

  // over
  const pts = points(state);
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, 'Tur bitti')),
    el('div', { class: 'compare-list' },
      [0, 1].map((p) => el('div', { class: 'card' },
        el('div', { class: 'q' }, `${players[p]}, ${nameSuffix(players[1 - p], 'i')} ${total} üzerinden ${formatPoints(pts[p])} tanıyor`),
      )),
    ),
  );
  return null;
}

// ----------------------------------------------------------------- custom questions (setup screen)
export function setupExtra(container, storage) {
  const KEY = 'custom-questions';
  let list = storage.load(KEY, []);
  const listBox = el('div', { class: 'custom-q-list' });
  const typeSel = el('select', { class: 'select', 'aria-label': 'Soru türü' },
    el('option', { value: 'choice' }, '4 seçenekli'),
    el('option', { value: 'open' }, 'Açık uçlu'));
  const text = el('input', { type: 'text', class: 'input', maxlength: 120, placeholder: 'Soru (sen diliyle: "En sevdiğin … ?")' });
  const optInputs = [0, 1, 2, 3].map((i) => el('input', { type: 'text', class: 'input', maxlength: 40, placeholder: `${i + 1}. seçenek` }));
  const optBox = el('div', { class: 'options', style: { marginTop: '8px' } }, optInputs);
  typeSel.addEventListener('change', () => { optBox.style.display = typeSel.value === 'choice' ? '' : 'none'; });

  const drawList = () => {
    draw(listBox, list.length
      ? list.map((q, i) => el('div', { class: 'custom-q-item' },
        el('span', {}, `${q.text}${q.type === 'choice' ? ` (${q.options.join(' / ')})` : ' (açık uçlu)'}`),
        el('button', { type: 'button', class: 'btn btn-small', 'aria-label': 'Sil', onClick: () => { list = list.filter((_, k) => k !== i); storage.save(KEY, list); drawList(); } }, '✕')))
      : el('p', { class: 'muted' }, 'Henüz kendi sorunuz yok.'));
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
  };

  draw(container, el('details', { class: 'rules' },
    el('summary', {}, `Kendi sorularınız (${list.length})`),
    el('div', { class: 'section' },
      listBox,
      el('div', { class: 'field', style: { marginTop: '12px' } }, el('label', {}, 'Yeni soru'), text),
      el('div', { class: 'field' }, typeSel),
      optBox,
      el('button', { type: 'button', class: 'btn btn-secondary btn-block', style: { marginTop: '8px' }, onClick: add }, 'Soruyu ekle'),
    ),
  ));
}

export default { id: 'beni-tani', meta, setup, applyMove, autoMove, render, getTurn, getResult, setupExtra };
