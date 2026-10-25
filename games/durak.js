// Durak — two-player: 36 cards, a trump suit; the attacker lays cards, the defender beats
// them or picks them up. Whoever is left holding cards when the deck is gone is the durak.
import { el, render as draw } from '../js/ui/dom.js';
import { createRng, shuffle } from '../js/lib/rng.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'kart',
  name: 'Durak',
  icon: '🃏',
  description: 'Saldır, savun ya da kartları al; deste bitince elinde kart kalan "durak" olur.',
  rules: [
    '36 kart (6–As), destenin altındaki kart kozu gösterir. Altışar kart dağıtılır; en küçük kozu olan başlar.',
    'Saldıran bir kart atar. Savunan onu aynı renkten daha büyük bir kartla ya da bir kozla kırar; kıramazsa (ya da istemezse) "Al" der. Saldıran, masadaki kartlarla aynı değerde kartlar ekleyebilir (en çok 6 ve savunanın kart sayısı kadar).',
    'Bütün kartlar kırılırsa masa atılır ve roller değişir; alan oyuncu yeniden savunur. Her elden sonra önce saldıran, sonra savunan desteden 6\'ya tamamlar. Deste bitince kartı biten oyundan çıkar; elinde kart kalan durak olur.',
  ].join('\n'),
  data: [],
  handoffNote: 'Elindeki kartları rakibin görmemeli.',
  settings: [],
};

export const SUITS = ['♠', '♥', '♦', '♣'];
const RANK_TEXT = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const cardText = (c) => `${RANK_TEXT[c.r] || c.r}${SUITS[c.s]}`;
export const HAND = 6;
export const MAX_ATTACKS = 6;

function fail(msg) {
  throw new Error(msg);
}

export function makeDeck(seed) {
  const cards = [];
  for (let s = 0; s < 4; s++) for (let r = 6; r <= 14; r++) cards.push({ r, s });
  return shuffle(createRng(seed), cards);
}

/** Does `d` beat the attack card `a` under trump suit `trump`? */
export function beats(d, a, trump) {
  if (d.s === a.s) return d.r > a.r;
  return d.s === trump;
}

export function setup(options = {}) {
  const seed = Number(options.seed) || 1;
  const deck = makeDeck(seed);            // deck[0] is the face-up trump card, drawn last
  const trumpCard = deck[0];
  const hands = [[], []];
  for (let i = 0; i < HAND; i++) for (const p of [0, 1]) hands[p].push(deck.pop());
  const lowest = (p) => hands[p].filter((c) => c.s === trumpCard.s).reduce((m, c) => Math.min(m, c.r), 99);
  let attacker = seed % 2;
  if (lowest(0) !== lowest(1)) attacker = lowest(0) < lowest(1) ? 0 : 1;
  return {
    id: String(options.seed ?? ''),
    deck,
    trump: trumpCard.s,
    trumpCard,
    hands,
    table: [],           // { a: card, d: card | null }
    attacker,
    phase: 'attack',     // attack | defend | over
    taking: false,       // the defender gave up this bout and will pick the cards up
    limit: Math.min(MAX_ATTACKS, hands[1 - attacker].length),
    discard: 0,
    over: false,
    loser: null,         // player index, or null for a draw
  };
}

const sameCard = (a, b) => a.r === b.r && a.s === b.s;
const findCard = (hand, card) => hand.findIndex((c) => card && sameCard(c, card));

function drawUp(state, order) {
  const deck = state.deck.slice();
  const hands = state.hands.map((h) => h.slice());
  for (const p of order) while (hands[p].length < HAND && deck.length) hands[p].push(deck.pop());
  return { deck, hands };
}

function endBout(state) {
  const attacker = state.attacker;
  const defender = 1 - attacker;
  let hands = state.hands.map((h) => h.slice());
  let discard = state.discard;
  let nextAttacker;
  if (state.taking) {
    for (const t of state.table) { hands[defender].push(t.a); if (t.d) hands[defender].push(t.d); }
    nextAttacker = attacker;
  } else {
    discard += state.table.reduce((n, t) => n + 1 + (t.d ? 1 : 0), 0);
    nextAttacker = defender;
  }
  const drawn = drawUp({ ...state, hands }, [attacker, defender]);
  hands = drawn.hands;
  const deck = drawn.deck;
  const base = { ...state, hands, deck, discard, table: [], taking: false, phase: 'attack' };
  if (!deck.length) {
    const empty = [0, 1].filter((p) => !hands[p].length);
    if (empty.length === 2) return { ...base, phase: 'over', over: true, loser: null };
    if (empty.length === 1) return { ...base, phase: 'over', over: true, loser: 1 - empty[0] };
  }
  return { ...base, attacker: nextAttacker, limit: Math.min(MAX_ATTACKS, hands[1 - nextAttacker].length) };
}

export function canAttackWith(state, card) {
  if (!state.table.length) return true;
  return state.table.some((t) => t.a.r === card.r || (t.d && t.d.r === card.r));
}

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  const attacker = state.attacker;
  const defender = 1 - attacker;
  const undefended = state.table.filter((t) => !t.d).length;
  switch (move.type) {
    case 'attack': {
      if (state.phase !== 'attack') fail('Sıra savunanda');
      if (player !== attacker) fail('Saldıran sen değilsin');
      const i = findCard(state.hands[player], move.card);
      if (i < 0) fail('Bu kart elinde yok');
      const card = state.hands[player][i];
      if (state.table.length >= state.limit) fail(`Bu elde en çok ${state.limit} kart atılabilir`);
      if (!canAttackWith(state, card)) fail('Masadaki kartlarla aynı değerde bir kart atmalısın');
      const hands = state.hands.map((h) => h.slice());
      hands[player].splice(i, 1);
      const table = state.table.concat([{ a: card, d: null }]);
      // when the defender is already picking up, extra cards are just thrown in; once the
      // limit is reached or the attacker is out of cards the pick-up happens by itself
      if (state.taking) {
        const next = { ...state, hands, table, phase: 'attack' };
        return table.length >= state.limit || !hands[player].length ? endBout(next) : next;
      }
      return { ...state, hands, table, phase: 'defend' };
    }
    case 'beat': {
      if (state.phase !== 'defend') fail('Kırılacak kart yok');
      if (player !== defender) fail('Savunan sen değilsin');
      const i = findCard(state.hands[player], move.card);
      if (i < 0) fail('Bu kart elinde yok');
      const card = state.hands[player][i];
      const idx = state.table.findIndex((t) => !t.d);
      if (idx < 0) fail('Kırılacak kart yok');
      if (!beats(card, state.table[idx].a, state.trump)) fail('Bu kart onu kırmaz: aynı renkten büyük ya da koz gerekir');
      const hands = state.hands.map((h) => h.slice());
      hands[player].splice(i, 1);
      const table = state.table.map((t, k) => (k === idx ? { ...t, d: card } : t));
      const next = { ...state, hands, table, phase: 'attack' };
      // nothing left to add: the bout ends by itself
      if (!hands[player].length || !hands[attacker].length || table.length >= state.limit) return endBout(next);
      return next;
    }
    case 'take': {
      if (state.phase !== 'defend' || !undefended) fail('Alınacak kart yok');
      if (player !== defender) fail('Savunan sen değilsin');
      const next = { ...state, taking: true, phase: 'attack' };
      if (!state.hands[attacker].length || state.table.length >= state.limit) return endBout(next);
      return next;
    }
    case 'done': {
      if (state.phase !== 'attack') fail('Önce savunan oynasın');
      if (player !== attacker) fail('Eli saldıran bitirir');
      if (!state.table.length) fail('Önce bir kart at');
      if (undefended && !state.taking) fail('Kırılmamış kart var');
      return endBout(state);
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.over) return null;
  return { player: state.phase === 'defend' ? 1 - state.attacker : state.attacker, private: true };
}

export function getResult(state) {
  if (!state.over) return null;
  if (state.loser == null) return { draw: true };
  return { winner: 1 - state.loser };
}

// ----------------------------------------------------------------- render
function cardEl(c, opts = {}) {
  const red = c.s === 1 || c.s === 2;
  return el(opts.button ? 'button' : 'span', {
    type: opts.button ? 'button' : null,
    class: `pcard ${red ? 'red' : ''} ${opts.small ? 'small' : ''} ${opts.trump ? 'trump' : ''}`,
    'aria-label': cardText(c),
    disabled: opts.button ? opts.disabled : null,
    onClick: opts.onClick,
  }, el('span', {}, RANK_TEXT[c.r] || String(c.r)), el('span', { class: 'suit' }, SUITS[c.s]));
}

const sortHand = (hand, trump) => hand.slice().sort((a, b) => (a.s === trump) - (b.s === trump) || a.s - b.s || a.r - b.r);

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const opp = 1 - viewer;
  const attacker = state.attacker;
  const defender = 1 - attacker;
  const turn = state.over ? null : (state.phase === 'defend' ? defender : attacker);
  const mine = turn === viewer;
  const isAttacker = viewer === attacker;
  const undefendedIdx = state.table.findIndex((t) => !t.d);
  const hand = sortHand(state.hands[viewer], state.trump);

  let status;
  if (state.over) status = state.loser == null ? 'Berabere: ikinizin de kartı bitti.' : `${players[state.loser]} durak oldu! ${players[1 - state.loser]} kazandı.`;
  else if (mine && state.phase === 'defend') status = `Savun, ${players[viewer]}: kıracak bir kart seç ya da "Al"`;
  else if (mine && state.taking) status = `${players[opp]} alıyor: istersen aynı değerde kart ekle, sonra "Bitti"`;
  else if (mine) status = state.table.length ? `Saldırmaya devam et ${players[viewer]} (aynı değerde kart) ya da "Bitti"` : `Saldır, ${players[viewer]}: bir kart at`;
  else status = `${players[turn]} ${state.phase === 'defend' ? 'savunuyor' : 'saldırıyor'}…`;

  const canPlay = (c) => {
    if (!mine) return false;
    if (state.phase === 'defend') return undefendedIdx >= 0 && beats(c, state.table[undefendedIdx].a, state.trump);
    return state.table.length < state.limit && canAttackWith(state, c);
  };
  const play = (c) => sendMove({ type: state.phase === 'defend' ? 'beat' : 'attack', card: c });

  const tableView = el('div', { class: 'dk-table' }, state.table.length
    ? state.table.map((t) => el('div', { class: 'dk-pair' }, cardEl(t.a, { small: true, trump: t.a.s === state.trump }), t.d ? cardEl(t.d, { small: true, trump: t.d.s === state.trump }) : el('span', { class: 'pcard small empty' }, '?')))
    : el('span', { class: 'muted' }, 'Masa boş'));
  const info = el('div', { class: 'c4-legend dk-info' },
    el('span', {}, 'Koz: ', cardEl(state.trumpCard, { small: true, trump: true })),
    el('span', {}, `Deste: ${state.deck.length}`),
    el('span', {}, `${players[opp]}: ${state.hands[opp].length} kart`),
  );
  const actions = [];
  if (mine && state.phase === 'defend' && undefendedIdx >= 0) actions.push(el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => sendMove({ type: 'take' }) }, 'Al (kartları üstlen)'));
  if (mine && state.phase === 'attack' && state.table.length && (state.taking || undefendedIdx < 0)) actions.push(el('button', { type: 'button', class: 'btn btn-primary', onClick: () => sendMove({ type: 'done' }) }, state.taking ? 'Bitti (kartları alsın)' : 'Bitti (masa atılsın)'));
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, status)),
    info,
    el('div', { class: 'col-title' }, `Masa — ${players[attacker]} saldırıyor, ${players[defender]} savunuyor${state.taking ? ' (alıyor)' : ''}`),
    tableView,
    actions.length ? el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px', marginTop: '8px' } }, actions) : null,
    el('div', { class: 'col-title active', style: { marginTop: '10px' } }, `${players[viewer]} — elin (${hand.length})${isAttacker && mine && state.table.length ? `, en çok ${state.limit - state.table.length} kart daha` : ''}`),
    el('div', { class: 'phand' }, hand.map((c) => cardEl(c, { button: true, trump: c.s === state.trump, disabled: !canPlay(c), onClick: () => play(c) }))),
    state.over ? null : el('p', { class: 'hint' }, `Atılan: ${state.discard} kart`),
  );
  return null;
}

export default { id: 'durak', meta, setup, applyMove, render, getTurn, getResult };
