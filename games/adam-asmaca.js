// Adam Asmaca — hangman for two. One player holds a word, the other finds it letter by
// letter; roles swap every word. The word stays on the setter's device: the guesser's
// device only sees letter positions that the setter's device reports back.
import { el, svg, render as draw } from '../js/ui/dom.js';
import { createKeyboard } from '../js/ui/keyboard.js';
import { normalizeWord, isTurkishWord, upperTR, nameSuffix, LETTERS } from '../js/lib/tr.js';

export const MIN_LEN = 3;
export const MAX_LEN = 12;

export const meta = {
  group: 'kelime',
  name: 'Adam Asmaca',
  icon: '🪢',
  description: 'Biri kelimeyi tutar, öbürü harf harf bulur. Roller her kelimede değişir.',
  rules: [
    'Bir oyuncu rakibi için bir kelime tutar (kendisi yazar ya da ayara göre rastgele gelir); rakip harf harf bulmaya çalışır.',
    'Her yanlış harf bir can götürür. Kelimeyi bütün olarak da tahmin edebilirsin; yanlışsa yine bir can gider.',
    'Kelimeyi bulan kalan canı kadar puan alır; adam asılırsa puan yok. Roller her kelimede değişir, kelimeler bitince puanı çok olan kazanır.',
  ].join('\n'),
  data: ['dictionary', 'common'],
  handoffNote: 'Tuttuğun kelimeyi rakibin görmemeli.',
  settings: [
    {
      key: 'secretMode', label: 'Kelimeyi kim seçsin?', type: 'select', default: 'manual',
      options: [
        { value: 'manual', label: 'Rakip için kendim yazarım' },
        { value: 'random', label: 'Rastgele gelsin (yaygın kelimeler)' },
      ],
    },
    { key: 'rounds', label: 'Kelime sayısı', type: 'select', default: 4, options: [{ value: 2, label: '2 (birer kelime)' }, { value: 4, label: '4 (ikişer kelime)' }, { value: 6, label: '6 (üçer kelime)' }] },
    { key: 'lives', label: 'Can', type: 'select', default: 6, options: [{ value: 4, label: '4' }, { value: 6, label: '6' }, { value: 8, label: '8' }] },
  ],
};

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const rounds = [2, 4, 6].includes(Number(options.rounds)) ? Number(options.rounds) : 4;
  const lives = [4, 6, 8].includes(Number(options.lives)) ? Number(options.lives) : 6;
  return {
    id: String(options.seed ?? ''), // new every game: typed drafts are kept per game
    rounds,
    lives,
    secretMode: options.secretMode === 'random' ? 'random' : 'manual',
    round: 0,
    setter: (Number(options.seed) || 0) % 2, // who holds the first word
    phase: 'secret',    // secret | play | result | over
    secret: null,       // the word: only on the setter's device (both on one phone)
    word: null,         // public once the word is over
    length: 0,
    revealed: [],       // letter or null per position
    tried: [],          // letters tried, in order
    wrongWords: [],     // whole-word guesses that missed
    wrong: 0,           // lives lost this word
    pending: null,      // { kind: 'letter' | 'word', value } waiting for the setter's device
    solved: null,
    points: 0,
    scores: [0, 0],
    history: [],        // { setter, word, solved, wrong }
  };
}

function validateWord(raw, ctx) {
  const word = normalizeWord(raw || '');
  if (!word) fail('Bir kelime yaz');
  if (!isTurkishWord(word)) fail('Yalnızca Türkçe harfler kullanılabilir');
  if (word.length < MIN_LEN || word.length > MAX_LEN) fail(`${MIN_LEN}–${MAX_LEN} harfli bir kelime olmalı`);
  // The sending device checked its own list; remote moves are not re-checked so that two
  // devices with different list versions never diverge.
  if (ctx.dict && !ctx.remote && !ctx.dict.has(word)) fail('Bu kelime listede yok; listeden bir kelime seç');
  return word;
}

const freshWord = (length) => ({
  length, revealed: new Array(length).fill(null), tried: [], wrongWords: [], wrong: 0, pending: null, solved: null, points: 0, word: null,
});

export function applyMove(state, player, move, ctx = {}) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  const guesser = 1 - state.setter;
  switch (move.type) {
    case 'setSecret': {
      if (state.phase !== 'secret') fail('Kelime artık değiştirilemez');
      if (player !== state.setter) fail('Bu kelimeyi rakibin tutuyor');
      let secret = null;
      if (move.secret && move.secret.word != null) secret = validateWord(move.secret.word, ctx);
      const length = secret ? secret.length : Number(move.length);
      if (!Number.isInteger(length) || length < MIN_LEN || length > MAX_LEN) fail(`${MIN_LEN}–${MAX_LEN} harfli bir kelime olmalı`);
      return { ...state, ...freshWord(length), phase: 'play', secret };
    }
    case 'guess': {
      if (state.phase !== 'play') fail('Oyun bu aşamada değil');
      if (player !== guesser) fail('Sıra sende değil');
      if (state.pending) fail('Önceki tahmin değerlendiriliyor');
      if (move.kind === 'letter') {
        const ch = normalizeWord(move.value);
        if (ch.length !== 1 || !LETTERS.includes(ch)) fail('Geçersiz harf');
        if (state.tried.includes(ch)) fail('Bu harfi denedin');
        return { ...state, pending: { kind: 'letter', value: ch } };
      }
      if (move.kind === 'word') {
        const w = normalizeWord(move.value);
        if (!w) fail('Bir kelime yaz');
        if (!isTurkishWord(w)) fail('Yalnızca Türkçe harfler kullanılabilir');
        if (w.length !== state.length) fail(`${state.length} harfli olmalı`);
        if (state.wrongWords.includes(w)) fail('Bunu denedin');
        return { ...state, pending: { kind: 'word', value: w } };
      }
      fail('Geçersiz hamle');
      return state;
    }
    case 'score': {
      // the setter's device reports where the letter is (or whether the word was right)
      if (state.phase !== 'play') fail('Oyun bu aşamada değil');
      if (player !== state.setter) fail('Değerlendirmeyi kelimeyi tutan yapar');
      if (!state.pending || move.kind !== state.pending.kind || move.value !== state.pending.value) fail('Değerlendirilecek tahmin yok');
      let revealed = state.revealed.slice();
      let { tried, wrongWords, wrong } = state;
      if (move.kind === 'letter') {
        const positions = Array.isArray(move.positions) ? move.positions.map(Number) : [];
        if (positions.some((p) => !Number.isInteger(p) || p < 0 || p >= state.length) || new Set(positions).size !== positions.length) fail('Geçersiz değerlendirme');
        tried = tried.concat([move.value]);
        if (positions.length) positions.forEach((p) => { revealed[p] = move.value; });
        else wrong += 1;
      } else if (move.hit) {
        revealed = [...move.value];
      } else {
        wrongWords = wrongWords.concat([move.value]);
        wrong += 1;
      }
      const solved = revealed.every((c) => c !== null);
      const hanged = !solved && wrong >= state.lives;
      let next = { ...state, revealed, tried, wrongWords, wrong, pending: null };
      if (solved || hanged) {
        const points = solved ? state.lives - wrong : 0;
        const scores = state.scores.slice();
        scores[guesser] += points;
        const word = typeof move.word === 'string' ? move.word : (solved ? revealed.join('') : state.secret);
        next = { ...next, phase: 'result', solved, points, scores, word, history: state.history.concat([{ setter: state.setter, word, solved, wrong }]) };
      }
      return next;
    }
    case 'next': {
      if (state.phase !== 'result') fail('Bu kelime henüz bitmedi');
      const round = state.round + 1;
      if (round >= state.rounds) return { ...state, phase: 'over' };
      return { ...state, ...freshWord(0), round, setter: guesser, phase: 'secret', secret: null, revealed: [] };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

/** Words the random mode may pick: the common-word lists of every length we have. */
export function randomPool(common) {
  if (!common || typeof common !== 'object') return [];
  return Object.values(common).flat().filter((w) => typeof w === 'string' && w.length >= MIN_LEN && w.length <= MAX_LEN);
}

export function autoMove(state, player, ctx = {}) {
  if (player !== state.setter) return null;
  if (state.phase === 'secret' && state.secretMode === 'random') {
    const pool = randomPool(ctx.common);
    if (!pool.length) return null;
    const word = pool[Math.floor(Math.random() * pool.length)];
    return { type: 'setSecret', length: word.length, secret: { word } };
  }
  if (state.phase === 'play' && state.pending && state.secret) {
    const { kind, value } = state.pending;
    if (kind === 'letter') {
      const positions = [];
      [...state.secret].forEach((ch, i) => { if (ch === value) positions.push(i); });
      const done = state.revealed.every((c, i) => c !== null || positions.includes(i)) || (!positions.length && state.wrong + 1 >= state.lives);
      return done ? { type: 'score', kind, value, positions, word: state.secret } : { type: 'score', kind, value, positions };
    }
    const hit = value === state.secret;
    const done = hit || state.wrong + 1 >= state.lives;
    return done ? { type: 'score', kind, value, hit, word: state.secret } : { type: 'score', kind, value, hit };
  }
  return null;
}

export function getTurn(state) {
  if (state.phase === 'secret') return { player: state.setter, private: state.secretMode === 'manual' };
  // the guesser also "has" the result screen: on one phone they then type the next word
  // without a handoff, since the roles swap
  if (state.phase === 'play' || state.phase === 'result') return { player: 1 - state.setter, private: false };
  return null;
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const [a, b] = state.scores;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ------------------------------------------------------------------ rendering
const drafts = new Map(); // what the viewer typed but has not sent yet
let draftsFor = null;     // state.id the drafts belong to

/** The gallows; the six body parts appear as lives run out. */
export function gallows(wrong, lives) {
  const parts = wrong <= 0 ? 0 : Math.min(6, Math.ceil((wrong / lives) * 6));
  const g = svg('svg', { viewBox: '0 0 120 140', class: 'hm-gallows', 'aria-hidden': 'true' });
  const stroke = { stroke: 'currentColor', 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' };
  g.append(svg('line', { x1: 10, y1: 130, x2: 70, y2: 130, ...stroke }));
  g.append(svg('line', { x1: 30, y1: 130, x2: 30, y2: 10, ...stroke }));
  g.append(svg('line', { x1: 30, y1: 10, x2: 80, y2: 10, ...stroke }));
  g.append(svg('line', { x1: 80, y1: 10, x2: 80, y2: 28, ...stroke }));
  const body = [
    () => svg('circle', { cx: 80, cy: 40, r: 12, ...stroke }),
    () => svg('line', { x1: 80, y1: 52, x2: 80, y2: 90, ...stroke }),
    () => svg('line', { x1: 80, y1: 62, x2: 60, y2: 82, ...stroke }),
    () => svg('line', { x1: 80, y1: 62, x2: 100, y2: 82, ...stroke }),
    () => svg('line', { x1: 80, y1: 90, x2: 64, y2: 120, ...stroke }),
    () => svg('line', { x1: 80, y1: 90, x2: 96, y2: 120, ...stroke }),
  ];
  for (let i = 0; i < parts; i++) g.append(body[i]());
  return g;
}

function wordRow(letters, { cursor = false } = {}) {
  const slots = letters.map((ch) => el('span', { class: `hm-slot ${ch ? 'filled' : ''}` }, ch ? upperTR(ch) : ''));
  if (cursor) slots.push(el('span', { class: 'hm-slot cursor' }));
  return el('div', { class: 'hm-word' }, slots);
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  if (draftsFor !== state.id) { drafts.clear(); draftsFor = state.id; }
  const { setter } = state;
  const guesser = 1 - setter;
  const cleanups = [];
  const livesLeft = Math.max(0, state.lives - state.wrong);
  const head = el('div', { class: 'c4-legend' },
    el('span', {}, `${players[0]}: ${state.scores[0]}`),
    el('span', {}, `${players[1]}: ${state.scores[1]}`),
    el('span', { class: 'muted' }, `${Math.min(state.round + 1, state.rounds)}. kelime / ${state.rounds}`),
  );

  if (state.phase === 'over') {
    const [a, b] = state.scores;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, a === b ? 'Berabere!' : `${players[a > b ? 0 : 1]} kazandı!`)),
      head,
      el('div', { class: 'hm-history' }, state.history.map((h, i) => el('div', { class: 'hm-hist-row' },
        el('span', { class: 'muted' }, `${i + 1}.`),
        el('strong', {}, upperTR(h.word || '…')),
        el('span', { class: 'muted' }, h.solved ? `${players[1 - h.setter]} buldu, +${state.lives - h.wrong}` : `${players[1 - h.setter]} bulamadı`)))),
    );
    return null;
  }

  // ---- the setter picks a word
  if (state.phase === 'secret') {
    if (viewer !== setter) {
      draw(container,
        el('div', { class: 'status-line' }, el('span', { class: 'muted' }, `${players[setter]} kelime seçiyor…`)),
        el('div', { class: 'spinner', 'aria-hidden': 'true' }),
        head);
      return null;
    }
    if (state.secretMode === 'random') {
      draw(container, el('p', { class: 'hint' }, 'Yaygın kelime listesi yüklenemediği için kelime seçilemedi. Ayarlardan "Rakip için kendim yazarım" seçeneğini dene.'), head);
      return null;
    }
    const key = `secret:${viewer}:${state.round}`;
    let typed = (drafts.get(key) || '').slice(0, MAX_LEN);
    const rowBox = el('div');
    const drawRow = () => { drafts.set(key, typed); draw(rowBox, wordRow([...typed], { cursor: typed.length < MAX_LEN })); };
    drawRow();
    const kbBox = el('div');
    const kb = createKeyboard(kbBox, {
      onKey: (k) => { if (typed.length < MAX_LEN) { typed += k; drawRow(); } },
      onBackspace: () => { typed = typed.slice(0, -1); drawRow(); },
      onEnter: () => sendMove({ type: 'setSecret', length: typed.length, secret: { word: typed } }),
    });
    cleanups.push(() => kb.destroy());
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}, ${players[guesser]} için bir kelime tut`)),
      el('p', { class: 'hint' }, `${MIN_LEN}–${MAX_LEN} harfli, kelime listesinde olan bir kelime. ${players[guesser]} bunu harf harf bulmaya çalışacak; ${state.lives} canı var.`),
      rowBox,
      kbBox,
      head,
    );
    return () => cleanups.forEach((fn) => fn());
  }

  // ---- play / result
  const result = state.phase === 'result';
  const mine = viewer === guesser && !result;
  const pending = !!state.pending;
  const misses = state.tried.filter((ch) => !state.revealed.includes(ch));
  const modeKey = `word:${viewer}:${state.round}`;
  const typedKey = `typed:${viewer}:${state.round}:${state.tried.length}:${state.wrongWords.length}`;
  let wordMode = mine && drafts.has(modeKey);
  let typed = wordMode ? (drafts.get(typedKey) || '').slice(0, state.length) : '';

  const statusText = () => {
    if (result) return el('strong', {}, state.solved ? `${players[guesser]} kelimeyi buldu! +${state.points} puan` : `Adam asıldı! ${players[guesser]} bulamadı.`);
    if (pending) return el('span', { class: 'muted' }, 'Değerlendiriliyor…');
    if (mine) return el('strong', {}, `Sıra sende, ${players[viewer]}: ${wordMode ? 'kelimeyi yaz' : 'bir harf seç'}`);
    return el('span', { class: 'muted' }, `${players[guesser]} tahmin ediyor…`);
  };
  const statusBox = el('div', { class: 'status-line' });
  const drawStatus = () => draw(statusBox, statusText());
  drawStatus();

  const typedBox = el('div');
  const drawTyped = () => {
    if (wordMode) drafts.set(typedKey, typed);
    draw(typedBox, wordMode ? wordRow([...typed].concat(new Array(Math.max(0, state.length - typed.length)).fill(null))) : null);
  };
  drawTyped();

  const kbBox = el('div');
  const kb = createKeyboard(kbBox, {
    onKey: (k) => {
      if (!mine || pending) return;
      if (wordMode) { if (typed.length < state.length) { typed += k; drawTyped(); } return; }
      sendMove({ type: 'guess', kind: 'letter', value: k });
    },
    onBackspace: () => { if (wordMode) { typed = typed.slice(0, -1); drawTyped(); } },
    onEnter: () => { if (mine && !pending && wordMode) sendMove({ type: 'guess', kind: 'word', value: typed }); },
  });
  kb.setDisabled(!mine || pending);
  const states = {};
  for (const ch of state.tried) states[ch] = state.revealed.includes(ch) ? 'correct' : 'absent';
  kb.setKeyStates(states);
  cleanups.push(() => kb.destroy());

  // switching between letter and whole-word guessing keeps the board; nothing is sent
  const modeLabel = () => (wordMode ? 'Harf tahminine dön' : 'Kelimeyi bütün olarak tahmin et');
  const modeButton = mine && !pending
    ? el('button', {
      type: 'button', class: 'btn btn-secondary btn-small',
      onClick: () => {
        wordMode = !wordMode;
        if (wordMode) drafts.set(modeKey, true); else drafts.delete(modeKey);
        typed = wordMode ? (drafts.get(typedKey) || '').slice(0, state.length) : '';
        drawTyped();
        drawStatus();
        modeButton.textContent = modeLabel();
      },
    }, modeLabel())
    : null;

  const shown = result && state.word ? [...state.word] : state.revealed;
  draw(container,
    statusBox,
    head,
    gallows(state.wrong, state.lives),
    el('div', { class: 'hint hm-lives' }, `Kalan can: ${livesLeft} / ${state.lives}`),
    wordRow(shown),
    el('div', { class: 'hm-misses muted' }, misses.length || state.wrongWords.length
      ? `Yanlış: ${misses.map(upperTR).concat(state.wrongWords.map(upperTR)).join(' ')}`
      : ''),
    !mine && !result && state.secret ? el('p', { class: 'hint' }, `Tuttuğun kelime: ${upperTR(state.secret)}`) : null,
    result
      ? el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'next' }) },
        state.round + 1 >= state.rounds ? 'Sonucu gör' : `Sonraki kelime (sıra ${nameSuffix(players[setter], 'de')})`)
      : null,
    typedBox,
    result ? null : kbBox,
    modeButton ? el('div', { class: 'row', style: { marginTop: '10px', justifyContent: 'center' } }, modeButton) : null,
  );
  return () => cleanups.forEach((fn) => fn());
}

export default { id: 'adam-asmaca', meta, setup, applyMove, autoMove, render, getTurn, getResult };
