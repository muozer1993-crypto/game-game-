// Son Hece — each word must start with the last syllable of the previous word.
import { el, render as draw } from '../js/ui/dom.js';
import { createKeyboard } from '../js/ui/keyboard.js';
import { createTimer } from '../js/ui/timer.js';
import { syllabify, lastSyllable } from '../js/lib/syllabify.js';
import { normalizeWord, isTurkishWord, upperTR, nameSuffix, VOWELS } from '../js/lib/tr.js';

export const meta = {
  group: 'kelime',
  name: 'Son Hece',
  icon: '🔗',
  description: 'Her kelime bir öncekinin son hecesiyle başlar. Kelime bulamayan ya da süresi biten kaybeder.',
  rules: [
    'Oyuncular sırayla kelime söyler. Her kelime bir önceki kelimenin son hecesiyle başlamalıdır: kitap → tapınak → nakış …',
    'İlk kelime serbesttir. Aynı kelime iki kez kullanılamaz.',
    'Her tur için süre vardır (varsayılan 20 saniye). Süresi biten ya da pes eden oyuncu turu kaybeder.',
    'Kelime listesinde olmayan bir kelime söylenirse rakip "Kabul" ya da "İtiraz" der. Kabul edilirse kelime geçerli sayılır; itiraz edilirse kalan süreyle yeni kelime denenir.',
    'ğ kuralı: son hece ğ ile başlıyorsa (ka-ğıt, yo-ğurt) ayara göre ya o kelime yasaktır ya da ğ atlanır (ğıt → ıt).',
  ].join('\n'),
  data: ['dictionary'],
  settings: [
    { key: 'turnSeconds', label: 'Tur süresi (saniye)', type: 'number', default: 20, min: 5, max: 120, step: 5 },
    {
      key: 'ghRule', label: 'ğ kuralı', type: 'select', default: 'skip',
      options: [
        { value: 'skip', label: 'ğ atlanır (ka-ğıt → "ıt" ile başla)' },
        { value: 'forbid', label: 'Son hecesi ğ ile başlayan kelime yasak' },
      ],
    },
  ],
};

export function setup(options = {}) {
  const seconds = Number(options.turnSeconds) > 0 ? Number(options.turnSeconds) : 20;
  return {
    turnMs: seconds * 1000,
    ghRule: options.ghRule === 'forbid' ? 'forbid' : 'skip',
    phase: 'ready', // ready | play | challenge | over
    turn: (Number(options.seed) || 0) % 2, // who says the first word: from the seed, so it changes from game to game
    words: [],      // { player, word, syllables, challenged }
    required: '',
    deadline: null,
    challenge: null, // { player, word, remainingMs }
    rejected: null,  // last word refused by the opponent (shown to the player who said it)
    loser: null,
    reason: null,   // timeout | giveup
  };
}

/** The prefix the next word must start with, after the ğ rule. */
export function nextRequired(word, ghRule) {
  const last = lastSyllable(word);
  if (last.startsWith('ğ')) {
    if (ghRule === 'forbid') return null;
    return last.slice(1);
  }
  return last;
}

function fail(msg) {
  throw new Error(msg);
}

function acceptWord(state, player, word, at, challenged) {
  const required = nextRequired(word, state.ghRule);
  return {
    ...state,
    phase: 'play',
    words: [...state.words, { player, word, syllables: syllabify(word), challenged: !!challenged }],
    required,
    turn: 1 - player,
    deadline: at + state.turnMs,
    challenge: null,
    rejected: null,
  };
}

const hasVowel = (w) => [...w].some((ch) => VOWELS.includes(ch));

export function applyMove(state, player, move, ctx = {}) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  const at = typeof move.at === 'number' ? move.at : 0;

  switch (move.type) {
    case 'start': {
      if (state.phase !== 'ready') fail('Oyun zaten başladı');
      return { ...state, phase: 'play', deadline: at + state.turnMs };
    }
    case 'word': {
      if (state.phase !== 'play') fail('Şu anda kelime söylenemez');
      if (player !== state.turn) fail('Sıra sende değil');
      const word = normalizeWord(move.word || '');
      if (!word) fail('Bir kelime yaz');
      if (!isTurkishWord(word)) fail('Yalnızca Türkçe harfler kullanılabilir');
      if (!hasVowel(word)) fail('Kelimede en az bir ünlü olmalı');
      if (state.required && !word.startsWith(state.required)) {
        fail(`Kelime "${state.required}" ile başlamalı`);
      }
      // The device that typed the word decides whether it is in the list (move.known), so
      // that two devices with different list versions never disagree; otherwise look it up.
      const known = typeof move.known === 'boolean' ? move.known : (ctx.dict ? ctx.dict.has(word) : true);
      if (word === state.required && !known) fail('Yalnızca hece yazdın, kelimeyi tamamla');
      if (state.words.some((w) => w.word === word)) fail('Bu kelime daha önce söylendi');
      if (nextRequired(word, state.ghRule) === null) {
        fail(`Son hecesi ğ ile başlıyor (${syllabify(word).join('-')}); bu ayarda yasak`);
      }
      if (known) return acceptWord(state, player, word, at, false);
      const remainingMs = state.deadline == null ? state.turnMs : Math.max(0, state.deadline - at);
      return { ...state, phase: 'challenge', deadline: null, challenge: { player, word, remainingMs } };
    }
    case 'accept': {
      if (state.phase !== 'challenge') fail('Bekleyen itiraz yok');
      if (player !== 1 - state.challenge.player) fail('Bunu rakip karar verir');
      return acceptWord(state, state.challenge.player, state.challenge.word, at, true);
    }
    case 'reject': {
      if (state.phase !== 'challenge') fail('Bekleyen itiraz yok');
      if (player !== 1 - state.challenge.player) fail('Bunu rakip karar verir');
      return { ...state, phase: 'play', deadline: at + state.challenge.remainingMs, challenge: null, rejected: state.challenge.word };
    }
    case 'timeout': {
      if (state.phase !== 'play') return state; // late timer: ignore
      if (player !== state.turn) fail('Sıra sende değil');
      return { ...state, phase: 'over', deadline: null, loser: state.turn, reason: 'timeout' };
    }
    case 'giveup': {
      if (state.phase !== 'play') fail('Şu anda pes edilemez');
      if (player !== state.turn) fail('Sıra sende değil');
      return { ...state, phase: 'over', deadline: null, loser: player, reason: 'giveup' };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase === 'over') return null;
  if (state.phase === 'challenge') return { player: 1 - state.challenge.player, private: false };
  return { player: state.turn, private: false };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  return { winner: 1 - state.loser };
}

// ----------------------------------------------------------------- render
function chainView(state) {
  if (!state.words.length) return el('p', { class: 'hint' }, 'Henüz kelime söylenmedi.');
  const items = state.words.map((w, i) => {
    const isLast = i === state.words.length - 1;
    const syl = w.syllables;
    const parts = syl.map((s, k) => el('span', { class: isLast && k === syl.length - 1 ? 'syl-last' : 'syl' }, s));
    const joined = [];
    parts.forEach((p, k) => { if (k) joined.push('·'); joined.push(p); });
    return el('span', { class: `chain-word p${w.player} ${w.challenged ? 'challenged' : ''}`, title: w.challenged ? 'Rakibin kabul ettiği kelime' : '' },
      joined, w.challenged ? el('span', { class: 'accepted-mark', 'aria-label': 'kabul edildi' }, ' ✓') : null);
  });
  const box = el('div', { class: 'chain' }, items);
  queueMicrotask(() => { box.scrollTop = box.scrollHeight; });
  return box;
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  const cleanups = [];
  const name = (p) => players[p] + (online && ctx.self === p ? ' (sen)' : '');

  // ---- over
  if (state.phase === 'over') {
    const text = state.reason === 'timeout'
      ? `${players[state.loser]} süresini doldurdu.`
      : `${players[state.loser]} pes etti.`;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, text)),
      chainView(state),
      el('p', { class: 'hint' }, `${state.words.length} kelime söylendi.`),
    );
    return null;
  }

  // ---- ready
  if (state.phase === 'ready') {
    const mine = viewer === state.turn;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `İlk kelimeyi ${name(state.turn)} söyleyecek.`)),
      el('p', { class: 'hint' }, `Tur süresi ${state.turnMs / 1000} saniye. ${state.ghRule === 'skip' ? 'ğ ile başlayan son hecede ğ atlanır.' : 'Son hecesi ğ ile başlayan kelimeler yasak.'}`),
      mine
        ? el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', onClick: () => sendMove({ type: 'start', at: Date.now() }) }, 'Başla')
        : el('p', { class: 'hint' }, `${nameSuffix(players[state.turn], 'in')} başlatması bekleniyor…`),
    );
    return null;
  }

  // ---- challenge
  if (state.phase === 'challenge') {
    const ch = state.challenge;
    const judge = 1 - ch.player;
    const timerBox = el('div');
    createTimer(timerBox, { deadline: 0, total: state.turnMs, paused: true, remaining: ch.remainingMs });
    const body = viewer === judge
      ? el('div', { class: 'challenge-box card' },
        el('p', {}, `${players[ch.player]} şu kelimeyi söyledi:`),
        el('div', { class: 'word' }, upperTR(ch.word)),
        el('p', { class: 'muted' }, `Kelime listesinde yok (${syllabify(ch.word).join('-')}). Geçerli sayılsın mı?`),
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'btn btn-primary btn-big', onClick: () => sendMove({ type: 'accept', at: Date.now() }) }, 'Kabul'),
          el('button', { type: 'button', class: 'btn btn-danger btn-big', onClick: () => sendMove({ type: 'reject', at: Date.now() }) }, 'İtiraz'),
        ),
      )
      : el('div', { class: 'challenge-box card' },
        el('div', { class: 'word' }, upperTR(ch.word)),
        el('p', { class: 'muted' }, `Kelime listede yok. ${players[judge]} karar veriyor…`),
      );
    draw(container, chainView(state), timerBox, body);
    return null;
  }

  // ---- play
  const mine = viewer === state.turn;
  const timerBox = el('div');
  const timer = createTimer(timerBox, {
    deadline: state.deadline,
    total: state.turnMs,
    onExpire: mine ? () => sendMove({ type: 'timeout', at: Date.now() }) : null,
  });
  cleanups.push(() => timer.stop());

  let typed = '';
  const typedView = el('div', { class: 'typed' });
  const drawTyped = () => {
    draw(typedView,
      el('span', { class: 'prefix' }, upperTR(state.required)),
      upperTR(typed),
      mine ? el('span', { class: 'caret' }) : null,
    );
  };
  drawTyped();

  const submit = () => {
    if (!mine) return;
    const word = state.required + typed;
    const known = ctx.dict ? ctx.dict.has(word) : true;
    sendMove({ type: 'word', word, known, at: Date.now() });
  };

  const kbBox = el('div');
  const keyboard = createKeyboard(kbBox, {
    onKey: (k) => { if (!mine) return; if (typed.length < 30) { typed += k; drawTyped(); } },
    onBackspace: () => { if (!mine) return; typed = typed.slice(0, -1); drawTyped(); },
    onEnter: submit,
  });
  keyboard.setDisabled(!mine);
  cleanups.push(() => keyboard.destroy());

  const requiredText = state.required
    ? el('div', { class: 'status-line' }, el('span', { class: 'muted' }, 'Kelime '), el('strong', {}, `"${upperTR(state.required)}"`), el('span', { class: 'muted' }, ' ile başlamalı'))
    : el('div', { class: 'status-line' }, el('strong', {}, 'İlk kelime serbest'));

  const rejectedNote = state.rejected && mine
    ? el('p', { class: 'hint rejected-note' }, `"${upperTR(state.rejected)}" reddedildi — kalan sürede yeni bir kelime dene.`)
    : null;

  draw(container,
    el('div', { class: 'status-line' }, mine ? el('strong', {}, `Sıra sende, ${players[viewer]}!`) : el('span', { class: 'muted' }, `${players[state.turn]} düşünüyor…`)),
    timerBox,
    rejectedNote,
    chainView(state),
    requiredText,
    typedView,
    kbBox,
    mine ? el('div', { class: 'row', style: { marginTop: '10px' } },
      el('button', { type: 'button', class: 'btn btn-secondary btn-small', onClick: () => { if (confirm('Pes ediyor musun? Bu turu kaybedersin.')) sendMove({ type: 'giveup', at: Date.now() }); } }, 'Pes'),
    ) : null,
  );

  return () => cleanups.forEach((fn) => fn());
}

export default { id: 'son-hece', meta, setup, applyMove, render, getTurn, getResult };
