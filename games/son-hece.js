// Son Hece — each word must start with the last syllable of the previous word.
import { el, render as draw } from '../js/ui/dom.js';
import { createKeyboard } from '../js/ui/keyboard.js';
import { createTimer } from '../js/ui/timer.js';
import { syllabify, lastSyllable } from '../js/lib/syllabify.js';
import { normalizeWord, isTurkishWord, upperTR, nameSuffix, VOWELS } from '../js/lib/tr.js';
import { toggled, carried, checkObjection } from '../js/lib/objections.js';
import { unlistedMark, objectionList } from '../js/ui/disputes.js';
import { nextButton } from '../js/ui/next.js';

export const meta = {
  group: 'kelime',
  name: 'Son Hece',
  icon: '🔗',
  description: 'Her kelime bir öncekinin son hecesiyle başlar. Kelime bulamayan ya da süresi biten kaybeder.',
  rules: [
    'Oyuncular sırayla kelime söyler. Her kelime bir önceki kelimenin son hecesiyle başlamalıdır: kitap → tapınak → nakış …',
    'İlk kelime serbesttir. Aynı kelime iki kez kullanılamaz.',
    'Her tur için süre vardır (varsayılan 20 saniye). Süresi biten ya da pes eden oyuncu turu kaybeder.',
    'Kelime listesinde olmayan bir kelimeyi de söyleyebilirsin (iki kez onaylarsın): zincirde işaretli (?) kalır, oyun akar. Oyun bitince rakip bu kelimelere itiraz edebilir; itiraz edilen ilk kelimeyi söyleyen kaybeder (zincir orada kopmuş sayılır). Sonuca iki telefonda odayı kuran geçer.',
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
    phase: 'ready', // ready | play | review (objections to unlisted words) | over
    turn: (Number(options.seed) || 0) % 2, // who says the first word: from the seed, so it changes from game to game
    words: [],      // { player, word, syllables, unlisted? }
    required: '',
    deadline: null,
    objected: [],   // `w${index}` of chain words the other player objected to
    loser: null,
    reason: null,   // timeout | giveup | objection
    objectedWord: null, // the word that lost the game on an objection
  };
}

/** Chain words the list does not have, as objection items. */
export function reviewItems(state) {
  return state.words.map((w, i) => ({ w, i })).filter((x) => x.w.unlisted)
    .map(({ w, i }) => ({ id: `w${i}`, owner: w.player, word: w.word, detail: `${i + 1}. kelime` }));
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

function acceptWord(state, player, word, at, unlisted) {
  const required = nextRequired(word, state.ghRule);
  const entry = { player, word, syllables: syllabify(word) };
  if (unlisted) entry.unlisted = true;
  return {
    ...state,
    phase: 'play',
    words: [...state.words, entry],
    required,
    turn: 1 - player,
    deadline: at + state.turnMs,
  };
}

/** The game is lost (time, giving up): objections first if an unlisted word is in the chain. */
function endGame(state, loser, reason) {
  const review = state.words.some((w) => w.unlisted);
  return { ...state, phase: review ? 'review' : 'over', deadline: null, loser, reason };
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
      // a word the list does not have counts, marked, when the sayer confirmed it (the other player may object at the end)
      return acceptWord(state, player, word, at, !known);
    }
    case 'timeout': {
      if (state.phase !== 'play') return state; // late timer: ignore
      if (player !== state.turn) fail('Sıra sende değil');
      return endGame(state, state.turn, 'timeout');
    }
    case 'giveup': {
      if (state.phase !== 'play') fail('Şu anda pes edilemez');
      if (player !== state.turn) fail('Sıra sende değil');
      return endGame(state, player, 'giveup');
    }
    case 'object': {
      if (state.phase !== 'review') fail('İtiraz oyun bitince yapılır');
      const item = reviewItems(state).find((it) => it.id === move.id);
      checkObjection(item, player, ctx);
      return { ...state, objected: toggled(state.objected, item.id, !!move.on) };
    }
    case 'next': { // closes the objections; they travel with the move as the presser saw them
      if (state.phase !== 'review') fail('Önce oyun bitsin');
      const objected = carried(move.objected, reviewItems(state).map((it) => it.id), state.objected || []);
      if (!objected.length) return { ...state, objected, phase: 'over' };
      // the chain broke at the first objected word: whoever said it loses
      const first = Math.min(...objected.map((id) => Number(id.slice(1))));
      const w = state.words[first];
      return { ...state, objected, phase: 'over', loser: w.player, reason: 'objection', objectedWord: w.word };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase === 'over' || state.phase === 'review') return null; // the objections are made at the same screen
  return { player: state.turn, private: false };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  return { winner: 1 - state.loser };
}

// ----------------------------------------------------------------- render
function chainView(state) {
  if (!state.words.length) return el('p', { class: 'hint' }, 'Henüz kelime söylenmedi.');
  const objected = new Set(state.objected || []);
  const items = state.words.map((w, i) => {
    const isLast = i === state.words.length - 1;
    const syl = w.syllables;
    const parts = syl.map((s, k) => el('span', { class: isLast && k === syl.length - 1 ? 'syl-last' : 'syl' }, s));
    const joined = [];
    parts.forEach((p, k) => { if (k) joined.push('·'); joined.push(p); });
    const out = objected.has(`w${i}`);
    return el('span', { class: `chain-word p${w.player} ${w.unlisted ? 'unlisted' : ''} ${out ? 'objected' : ''}`, title: w.unlisted ? (out ? 'İtiraz edildi' : 'Kelime listesinde yok: oyun bitince itiraz edilebilir') : '' },
      joined, w.unlisted ? unlistedMark() : null);
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
    const text = state.reason === 'objection'
      ? `${upperTR(state.objectedWord)} kelimesine itiraz edildi: ${players[state.loser]} kaybetti.`
      : state.reason === 'timeout'
        ? `${players[state.loser]} süresini doldurdu.`
        : `${players[state.loser]} pes etti.`;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, text)),
      chainView(state),
      el('p', { class: 'hint' }, `${state.words.length} kelime söylendi.`),
    );
    return null;
  }

  // ---- review: the game is over; objections to the words the list does not have
  if (state.phase === 'review') {
    const ended = state.reason === 'timeout' ? `${players[state.loser]} süresini doldurdu` : `${players[state.loser]} pes etti`;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${ended}. Önce itirazlar:`)),
      chainView(state),
      objectionList({
        items: reviewItems(state), objected: state.objected, players, viewer, online, sendMove,
        effect: `İtiraz yoksa ${players[1 - state.loser]} kazanır. İtiraz edilen ilk kelimeyi söyleyen kaybeder (zincir orada kopmuş sayılır).${online ? ' Sonra odayı kuran sonucu açar.' : ''}`,
      }),
      nextButton(ctx, sendMove, 'Sonucu gör', { move: () => ({ type: 'next', objected: state.objected }) }),
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

  // a word the list does not have: the first Enter warns, the second says it (marked, open to an objection at the end)
  let warned = null;
  const warnNote = el('p', { class: 'hint rejected-note', hidden: true });
  const submit = () => {
    if (!mine) return;
    const word = state.required + typed;
    const known = ctx.dict ? ctx.dict.has(normalizeWord(word)) : true;
    if (!known && warned !== word && normalizeWord(word) !== state.required) {
      warned = word;
      warnNote.textContent = `${upperTR(word)} kelime listesinde yok. Yine de söylemek için tekrar ↵ bas: zincirde işaretli kalır, oyun bitince rakibin itiraz ederse kaybedersin.`;
      warnNote.hidden = false;
      return;
    }
    sendMove({ type: 'word', word, known, at: Date.now() });
  };

  const clearWarn = () => { if (warned !== null) { warned = null; warnNote.hidden = true; } };
  const kbBox = el('div');
  const keyboard = createKeyboard(kbBox, {
    onKey: (k) => { if (!mine) return; if (typed.length < 30) { typed += k; drawTyped(); clearWarn(); } },
    onBackspace: () => { if (!mine) return; typed = typed.slice(0, -1); drawTyped(); clearWarn(); },
    onEnter: submit,
  });
  keyboard.setDisabled(!mine);
  cleanups.push(() => keyboard.destroy());

  const requiredText = state.required
    ? el('div', { class: 'status-line' }, el('span', { class: 'muted' }, 'Kelime '), el('strong', {}, `"${upperTR(state.required)}"`), el('span', { class: 'muted' }, ' ile başlamalı'))
    : el('div', { class: 'status-line' }, el('strong', {}, 'İlk kelime serbest'));

  draw(container,
    el('div', { class: 'status-line' }, mine ? el('strong', {}, `Sıra sende, ${players[viewer]}!`) : el('span', { class: 'muted' }, `${players[state.turn]} düşünüyor…`)),
    timerBox,
    chainView(state),
    requiredText,
    typedView,
    warnNote,
    kbBox,
    mine ? el('div', { class: 'row', style: { marginTop: '10px' } },
      el('button', { type: 'button', class: 'btn btn-secondary btn-small', onClick: () => { if (confirm('Pes ediyor musun? Bu turu kaybedersin.')) sendMove({ type: 'giveup', at: Date.now() }); } }, 'Pes'),
    ) : null,
  );

  return () => cleanups.forEach((fn) => fn());
}

export default { id: 'son-hece', meta, setup, applyMove, render, getTurn, getResult };
