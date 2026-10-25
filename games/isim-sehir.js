// İsim Şehir — the classic paper game: one letter per round, both players write a name, a
// city, an animal, a plant and an object starting with it. Different answers score 10, the
// same answer 5, an empty or wrong-letter answer 0. Answers stay on the writer's device until
// both have finished; the compare screen lets the opponent veto made-up answers.
import { el, render as draw } from '../js/ui/dom.js';
import { createTimer } from '../js/ui/timer.js';
import { createRng, shuffle } from '../js/lib/rng.js';
import { upperTR, lowerTR, nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'kelime',
  name: 'İsim Şehir',
  icon: '🏙️',
  description: 'Aynı harfle isim, şehir, hayvan, bitki, eşya yaz; farklı cevap 10, aynı cevap 5 puan.',
  rules: [
    'Her turda bir harf gelir. O harfle başlayan bir isim, şehir, hayvan, bitki ve eşya (geniş sette ülke, meslek ve yemek de) yazarsın; süre dolunca ya da "Bitir"e basınca cevapların kilitlenir.',
    'Puan: ikiniz farklı cevap yazdıysanız 10, aynı cevabı yazdıysanız 5, boş ya da harfe uymayan cevap 0. Karşılaştırma ekranında rakibinin uydurma cevabına "Geçersiz" diyebilirsin (0 puan).',
    'İki telefonda biri bitirince diğerinin 15 saniyesi kalır ("Bitti!" kuralı). Tek telefonda sırayla yazılır, sonra karşılaştırma ekranı ikinize gelir.',
  ].join('\n'),
  data: [],
  handoffNote: 'Cevapların rakibin bitirene kadar gizli kalır.',
  settings: [
    { key: 'rounds', label: 'Tur sayısı', type: 'select', default: 5, options: [{ value: 3, label: '3' }, { value: 5, label: '5' }, { value: 7, label: '7' }] },
    { key: 'seconds', label: 'Tur süresi', type: 'select', default: 90, options: [{ value: 60, label: '60 sn' }, { value: 90, label: '90 sn' }, { value: 120, label: '2 dk' }, { value: 0, label: 'Süresiz' }] },
    { key: 'set', label: 'Kategoriler', type: 'select', default: 'klasik', options: [{ value: 'klasik', label: 'Klasik (isim, şehir, hayvan, bitki, eşya)' }, { value: 'genis', label: 'Geniş (+ ülke, meslek, yemek)' }] },
  ],
};

export const SETS = {
  klasik: ['İsim', 'Şehir', 'Hayvan', 'Bitki', 'Eşya'],
  genis: ['İsim', 'Şehir', 'Hayvan', 'Bitki', 'Eşya', 'Ülke', 'Meslek', 'Yemek'],
};
// ğ, ı and j start too few words in most categories
export const LETTERS = [...'abcçdefghiklmnoöprsştuüvyz'];
export const GRACE_MS = 15000; // "Bitti!": time left for the other phone once one player has finished
const MAX_LEN = 40;

function fail(msg) {
  throw new Error(msg);
}

/** `count` distinct letters, seeded. */
export function pickLetters(count, seed) {
  const rng = createRng(seed);
  const pool = shuffle(rng, LETTERS.slice());
  const out = [];
  while (out.length < count) out.push(pool[out.length % pool.length]);
  return out;
}

export const normalize = (s) => lowerTR(String(s == null ? '' : s)).replace(/\s+/g, ' ').trim();
const cleanAnswer = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);

export function setup(options = {}) {
  const rounds = [3, 5, 7].includes(Number(options.rounds)) ? Number(options.rounds) : 5;
  const seconds = [0, 60, 90, 120].includes(Number(options.seconds)) ? Number(options.seconds) : 90;
  const categories = SETS[options.set] || SETS.klasik;
  const letters = pickLetters(rounds, Number(options.seed) || 1);
  return {
    id: String(options.seed ?? ''),
    rounds,
    seconds,
    categories,
    letters,
    round: 0,
    phase: 'write',   // write | compare | over
    entries: letters.map(() => ({ answers: [null, null], vetoes: [categories.map(() => false), categories.map(() => false)] })),
    scores: [0, 0],
  };
}

/** Is this answer worth anything: non-empty, starts with the round's letter, not vetoed? */
export function isValid(answer, letter, vetoed) {
  const a = normalize(answer);
  return !!a && a.startsWith(letter) && !vetoed;
}

/** Points per category for both players: [[p0...], [p1...]]. */
export function scoreRound(entry, letter) {
  const n = entry.vetoes[0].length;
  const pts = [[], []];
  for (let c = 0; c < n; c++) {
    const a = entry.answers[0] ? entry.answers[0][c] : '';
    const b = entry.answers[1] ? entry.answers[1][c] : '';
    const va = isValid(a, letter, entry.vetoes[0][c]);
    const vb = isValid(b, letter, entry.vetoes[1][c]);
    if (va && vb) {
      const same = normalize(a) === normalize(b);
      pts[0].push(same ? 5 : 10);
      pts[1].push(same ? 5 : 10);
    } else {
      pts[0].push(va ? 10 : 0);
      pts[1].push(vb ? 10 : 0);
    }
  }
  return pts;
}

export const roundTotals = (entry, letter) => scoreRound(entry, letter).map((l) => l.reduce((s, x) => s + x, 0));

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.phase === 'over') fail('Oyun bitti');
  const entry = state.entries[state.round];
  const replaceEntry = (e) => state.entries.map((x, i) => (i === state.round ? e : x));
  switch (move.type) {
    case 'finish': {
      if (state.phase !== 'write') fail('Bu tur bitti');
      if (entry.answers[player]) fail('Cevaplarını zaten verdin');
      const given = Array.isArray(move.answers) ? move.answers : [];
      const answers = entry.answers.slice();
      answers[player] = state.categories.map((_, c) => cleanAnswer(given[c]));
      const both = answers[0] && answers[1];
      return { ...state, phase: both ? 'compare' : 'write', entries: replaceEntry({ ...entry, answers }) };
    }
    case 'veto': {
      if (state.phase !== 'compare') fail('Önce ikiniz de cevaplarınızı verin');
      const c = Number(move.category);
      if (!Number.isInteger(c) || c < 0 || c >= state.categories.length) fail('Geçersiz kategori');
      const target = move.target == null ? 1 - player : Number(move.target); // one phone: either column
      if (target !== 0 && target !== 1) fail('Geçersiz oyuncu');
      const vetoes = entry.vetoes.map((l) => l.slice());
      vetoes[target][c] = !!move.on;
      return { ...state, entries: replaceEntry({ ...entry, vetoes }) };
    }
    case 'next': {
      if (state.phase !== 'compare') fail('Bu tur henüz bitmedi');
      // the vetoes as the presser saw them travel with the move: a veto and a 'next' crossing on the
      // wire would otherwise score the round differently on the two phones
      const n = state.categories.length;
      const given = move.vetoes;
      const vetoes = Array.isArray(given) && given.length === 2 && given.every((l) => Array.isArray(l) && l.length === n)
        ? given.map((l) => l.map(Boolean)) : entry.vetoes;
      const scored = { ...entry, vetoes };
      const pts = roundTotals(scored, state.letters[state.round]);
      const scores = [state.scores[0] + pts[0], state.scores[1] + pts[1]];
      const round = state.round + 1;
      return { ...state, scores, entries: replaceEntry(scored), round: Math.min(round, state.rounds - 1), phase: round >= state.rounds ? 'over' : 'write' };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase !== 'write') return null; // the compare screen is looked at together
  const e = state.entries[state.round];
  const p = e.answers[0] ? (e.answers[1] ? null : 1) : 0;
  return p == null ? null : { player: p, private: true, simultaneous: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const [a, b] = state.scores;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
const starts = new Map(); // `${id}:${viewer}:${round}` -> Date.now() when this device first showed the form
const caps = new Map();   // same key -> deadline once the opponent finished first (online "Bitti!")
const drafts = new Map(); // same key -> { answers: string[], focus: index|null }
let draftsFor = null;

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  const opp = 1 - viewer;
  const letter = state.letters[state.round];
  const entry = state.entries[state.round];
  const cats = state.categories;
  if (draftsFor !== state.id) { drafts.clear(); starts.clear(); caps.clear(); draftsFor = state.id; }
  const scoreLine = el('div', { class: 'c4-legend' }, el('span', {}, `${players[0]}: ${state.scores[0]}`), el('span', {}, `${players[1]}: ${state.scores[1]}`), el('span', { class: 'muted' }, `${Math.min(state.round + 1, state.rounds)}. tur / ${state.rounds}`));

  if (state.phase === 'over') {
    const [a, b] = state.scores;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, a === b ? `Berabere: ${a}–${b}` : `${players[a > b ? 0 : 1]} kazandı: ${Math.max(a, b)}–${Math.min(a, b)}`)),
      scoreLine,
      el('div', { class: 'is-rounds' }, state.entries.map((e, i) => {
        const t = roundTotals(e, state.letters[i]);
        return el('div', { class: 'is-round card' }, el('strong', {}, upperTR(state.letters[i])), el('span', {}, `${players[0]} ${t[0]} · ${players[1]} ${t[1]}`));
      })),
    );
    return null;
  }

  if (state.phase === 'compare') {
    const pts = scoreRound(entry, letter);
    const totals = pts.map((l) => l.reduce((s, x) => s + x, 0));
    const cell = (p, c) => {
      const ans = entry.answers[p][c];
      const vetoed = entry.vetoes[p][c];
      const same = pts[0][c] === 5;
      const canVeto = !!ans && (online ? p === opp : true);
      return el('div', { class: `is-cell ${vetoed ? 'vetoed' : ''} ${same ? 'same' : ''}` },
        el('span', { class: 'is-ans' }, ans || '—'),
        el('span', { class: 'is-pts' }, vetoed ? 'geçersiz · 0' : `${pts[p][c]} puan${same ? ' (aynı)' : ''}`),
        canVeto ? el('button', { type: 'button', class: 'btn btn-small is-veto', onClick: () => sendMove({ type: 'veto', target: p, category: c, on: !vetoed }) }, vetoed ? 'Geçerli say' : 'Geçersiz') : null,
      );
    };
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${state.round + 1}. tur — ${upperTR(letter)} harfi: ${players[0]} ${totals[0]}, ${players[1]} ${totals[1]} puan`)),
      scoreLine,
      el('div', { class: 'is-table' },
        el('div', { class: 'is-head' }, ''), el('div', { class: 'is-head' }, players[0]), el('div', { class: 'is-head' }, players[1]),
        cats.flatMap((name, c) => [el('div', { class: 'is-cat' }, name), cell(0, c), cell(1, c)]),
      ),
      el('p', { class: 'hint' }, online ? 'Rakibinin uydurma cevabına "Geçersiz" diyebilirsin.' : 'Uydurma bir cevaba "Geçersiz" deyin; puan tura geçerken yazılır.'),
      el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'next', vetoes: entry.vetoes }) },
        state.round + 1 >= state.rounds ? 'Sonucu gör' : 'Sonraki tur'),
    );
    return null;
  }

  // ---- write
  if (entry.answers[viewer]) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, 'Cevapların alındı.')),
      el('p', { class: 'hint' }, `${players[opp]} yazıyor…${online ? ` (${GRACE_MS / 1000} saniyesi kaldı)` : ''}`),
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      scoreLine,
    );
    return null;
  }
  const key = `${state.id}:${viewer}:${state.round}`;
  if (!starts.has(key)) starts.set(key, Date.now());
  let deadline = state.seconds ? starts.get(key) + state.seconds * 1000 : 0;
  if (online && entry.answers[opp]) {
    if (!caps.has(key)) caps.set(key, Date.now() + GRACE_MS);
    deadline = deadline ? Math.min(deadline, caps.get(key)) : caps.get(key);
  }
  const draft = drafts.get(key) || { answers: cats.map(() => ''), focus: null };
  drafts.set(key, draft);
  let done = false;
  const finish = () => { if (done) return; done = true; sendMove({ type: 'finish', answers: draft.answers.slice() }); };
  const timerBox = el('div');
  let timer = null;
  if (deadline) timer = createTimer(timerBox, { deadline, total: online && entry.answers[opp] ? GRACE_MS : state.seconds * 1000, onExpire: finish });
  const inputs = cats.map((name, c) => {
    const input = el('input', {
      type: 'text', class: 'input', value: draft.answers[c], maxlength: MAX_LEN, autocomplete: 'off', autocapitalize: 'words', enterkeyhint: c === cats.length - 1 ? 'done' : 'next',
      placeholder: `${upperTR(letter)}…`, 'aria-label': name, id: `is-in-${c}`,
      onInput: (e) => { draft.answers[c] = e.target.value; input.classList.toggle('is-bad', !!normalize(e.target.value) && !normalize(e.target.value).startsWith(letter)); },
      onFocus: () => { draft.focus = c; },
      onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); if (c < cats.length - 1) inputs[c + 1].focus(); else finish(); } },
    });
    if (normalize(draft.answers[c]) && !normalize(draft.answers[c]).startsWith(letter)) input.classList.add('is-bad');
    return input;
  });
  draw(container,
    timerBox,
    el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}, harf:`)),
    el('div', { class: 'is-letter' }, upperTR(letter)),
    online && entry.answers[opp] ? el('p', { class: 'hint rejected-note' }, `${players[opp]} bitirdi! ${GRACE_MS / 1000} saniyen var.`) : null,
    el('div', { class: 'is-form' }, cats.map((name, c) => el('div', { class: 'is-row' }, el('label', { for: `is-in-${c}` }, name), inputs[c]))),
    el('p', { class: 'hint' }, `Her cevap ${upperTR(letter)} ile başlamalı; boş bırakılan 0 puan.${online ? '' : entry.answers[opp] ? ' Bitirince karşılaştırma ekranı ikinize gelir.' : ` Bitirince telefon ${nameSuffix(players[opp], 'e')} geçer.`}`),
    el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '8px' }, onClick: finish }, 'Bitir'),
    scoreLine,
  );
  // a re-render (the opponent finishing) must not steal the caret from the field being typed in
  if (draft.focus != null && inputs[draft.focus] && !inputs[draft.focus].disabled) {
    const inp = inputs[draft.focus];
    inp.focus({ preventScroll: true });
    try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch { /* ignore */ }
  }
  return () => { if (timer) timer.stop(); };
}

export default { id: 'isim-sehir', meta, setup, applyMove, render, getTurn, getResult };
