// Sekizler — Crazy Eights for two: match the top card's suit or rank, or play an eight and
// name the suit. Can't play? Draw one card (play it if it fits), otherwise pass. The first to
// empty their hand scores the cards left in the opponent's hand; rounds until the target.
import { el, render as draw } from '../js/ui/dom.js';
import { createRng, shuffle } from '../js/lib/rng.js';
import { nameSuffix } from '../js/lib/tr.js';
import { SUITS, cardText } from './pisti.js';

export const meta = {
  group: 'kart',
  name: 'Sekizler',
  icon: '🃏',
  description: 'Üstteki kartla aynı renk ya da aynı sayıyı at; sekiz jokerdir, renk seçtirir.',
  rules: [
    'Yedişer kart dağıtılır, bir kart açılır. Sırası gelen, açık kartla aynı renkten (♠♥♦♣) ya da aynı sayıdan bir kart atar. Sekizler her zaman atılır ve atan yeni rengi söyler.',
    'Atacak kartın yoksa desteden bir kart çekersin; uyuyorsa atabilirsin, uymuyorsa pas geçersin. Deste bitince atılan kartlar karıştırılıp deste olur.',
    'Elini ilk bitiren, rakibinin elinde kalan kartların puanını alır: sekiz 50, J/Q/K 10, as 1, diğerleri üzerindeki sayı. Hedef puana ulaşan kazanır.',
  ].join('\n'),
  data: [],
  handoffNote: 'Kartlarını rakibin görmemeli.',
  settings: [
    { key: 'target', label: 'Hedef puan', type: 'select', default: 100, options: [{ value: 0, label: 'Tek el' }, { value: 100, label: '100' }, { value: 200, label: '200' }] },
  ],
};

export const HAND = 7;

function fail(msg) {
  throw new Error(msg);
}

export const cardPoints = (c) => (c.r === 8 ? 50 : c.r >= 11 ? 10 : c.r);
export const handPoints = (hand) => hand.reduce((s, c) => s + cardPoints(c), 0);

function makeDeck(seed) {
  const cards = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) cards.push({ r, s });
  return shuffle(createRng(seed), cards);
}

function deal(state, dealNo) {
  const deck = makeDeck((state.seed + dealNo * 7919) >>> 0);
  const hands = [deck.splice(0, HAND), deck.splice(0, HAND)];
  // the first open card must not be an eight (it would need a suit choice)
  let top = deck.shift();
  while (top.r === 8) { deck.push(top); top = deck.shift(); }
  const dealer = dealNo % 2; // the non-dealer plays first; the deal alternates
  return { ...state, dealNo, deck, hands, pile: [top], suit: top.s, turn: 1 - dealer, drew: false, shuffles: 0, phase: 'play', lastRound: null };
}

export function setup(options = {}) {
  const target = [0, 100, 200].includes(Number(options.target)) ? Number(options.target) : 100;
  const seed = Number(options.seed) || 1;
  return deal({ id: String(options.seed ?? ''), seed, target, scores: [0, 0], rounds: [] }, 0);
}

export const topCard = (state) => state.pile[state.pile.length - 1];

/** Can `card` be played on the current pile? */
export function canPlay(state, card) {
  const top = topCard(state);
  return card.r === 8 || card.s === state.suit || card.r === top.r;
}

export const playable = (state, player) => state.hands[player].some((c) => canPlay(state, c));

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.phase === 'over') fail('Oyun bitti');
  if (move.type === 'next') {
    if (state.phase !== 'roundOver') fail('Bu el henüz bitmedi');
    return deal(state, state.dealNo + 1);
  }
  if (state.phase !== 'play') fail('Önce sonraki ele geçin');
  if (player !== state.turn) fail('Sıra sende değil');
  const hand = state.hands[player].slice();
  const hands = state.hands.map((h, i) => (i === player ? hand : h));
  switch (move.type) {
    case 'play': {
      const i = Number(move.card);
      if (!Number.isInteger(i) || i < 0 || i >= hand.length) fail('Geçersiz kart');
      const card = hand[i];
      if (!canPlay(state, card)) fail('Bu kart uymuyor: aynı renk, aynı sayı ya da sekiz');
      let suit = card.s;
      if (card.r === 8) {
        suit = Number(move.suit);
        if (![0, 1, 2, 3].includes(suit)) fail('Sekiz için renk seç');
      }
      hand.splice(i, 1);
      const pile = state.pile.concat([card]);
      if (!hand.length) {
        const points = handPoints(state.hands[1 - player]);
        const scores = state.scores.slice();
        scores[player] += points;
        const rounds = state.rounds.concat([{ winner: player, points }]);
        const over = !state.target || scores[player] >= state.target;
        return { ...state, hands, pile, suit, scores, rounds, drew: false, phase: over ? 'over' : 'roundOver', lastRound: { winner: player, points } };
      }
      return { ...state, hands, pile, suit, turn: 1 - player, drew: false };
    }
    case 'draw': {
      if (state.drew) fail('Bu elde bir kart çektin: at ya da pas geç');
      let deck = state.deck.slice();
      let pile = state.pile.slice();
      let shuffles = state.shuffles;
      if (!deck.length) {
        if (pile.length < 2) fail('Çekilecek kart kalmadı: pas geç');
        const top = pile.pop();
        shuffles += 1;
        deck = shuffle(createRng((state.seed + state.dealNo * 7919 + shuffles * 104729) >>> 0), pile);
        pile = [top];
      }
      hand.push(deck.pop());
      return { ...state, hands, deck, pile, shuffles, drew: true };
    }
    case 'pass': {
      const stockEmpty = !state.deck.length && state.pile.length < 2;
      if (!state.drew && !stockEmpty) fail('Önce bir kart çek');
      return { ...state, turn: 1 - player, drew: false };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase !== 'play') return null;
  return { player: state.turn, private: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const [a, b] = state.scores;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
const RANK_TEXT = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const SUIT_NAME = ['maça', 'kupa', 'karo', 'sinek'];
const drafts = new Map(); // `${id}:${dealNo}:${pile length}:${player}` -> { eight: hand index awaiting a suit }
let draftsFor = null;

function cardEl(c, opts = {}) {
  const red = c.s === 1 || c.s === 2;
  return el(opts.button ? 'button' : 'span', {
    type: opts.button ? 'button' : null,
    class: `pcard ${red ? 'red' : ''} ${opts.small ? 'small' : ''} ${opts.sel ? 'sel' : ''}`,
    'aria-label': cardText(c),
    disabled: opts.button ? opts.disabled : null,
    onClick: opts.onClick,
  }, el('span', {}, RANK_TEXT[c.r] || String(c.r)), el('span', { class: 'suit' }, SUITS[c.s]));
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const opp = 1 - viewer;
  if (draftsFor !== state.id) { drafts.clear(); draftsFor = state.id; }
  const legend = el('div', { class: 'c4-legend' }, el('span', {}, `${players[0]}: ${state.scores[0]}`), el('span', {}, `${players[1]}: ${state.scores[1]}`), el('span', { class: 'muted' }, state.target ? `hedef ${state.target}` : 'tek el'));

  if (state.phase === 'over' || state.phase === 'roundOver') {
    const L = state.lastRound;
    const [a, b] = state.scores;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, state.phase === 'over'
        ? (a === b ? `Berabere: ${a}–${b}` : `${players[a > b ? 0 : 1]} kazandı: ${Math.max(a, b)}–${Math.min(a, b)}`)
        : `${players[L.winner]} eli bitirdi: +${L.points} puan.`)),
      legend,
      el('p', { class: 'hint' }, `${nameSuffix(players[1 - L.winner], 'in')} elinde kalanlar: `, el('span', { class: 'ce-row' }, state.hands[1 - L.winner].map((c) => cardEl(c, { small: true })))),
      state.phase === 'roundOver' ? el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'next' }) }, 'Sonraki el') : null,
    );
    return null;
  }

  const mine = viewer === state.turn;
  const top = topCard(state);
  const hand = state.hands[viewer];
  const key = `${state.id}:${state.dealNo}:${state.pile.length}:${hand.length}:${viewer}`;
  const draft = drafts.get(key) || { eight: null };
  drafts.set(key, draft);
  const stockEmpty = !state.deck.length && state.pile.length < 2;
  const table = el('div', { class: 'ce-table' },
    el('div', { class: 'ce-pile' }, cardEl(top), state.suit !== top.s ? el('span', { class: 'ce-want' }, `İstenen: ${SUITS[state.suit]} ${SUIT_NAME[state.suit]}`) : null),
    el('div', { class: 'ce-deck' }, el('span', { class: 'pcard back' }, state.deck.length ? String(state.deck.length) : '0'), el('span', { class: 'muted' }, 'deste')),
  );
  const oppRow = el('p', { class: 'hint' }, `${players[opp]}: ${state.hands[opp].length} kart`);
  if (!mine) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[opp]} oynuyor…`)),
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      table, oppRow,
      el('div', { class: 'col-title' }, 'Kartların'), el('div', { class: 'ce-hand' }, hand.map((c) => cardEl(c, { small: true }))),
      legend,
    );
    return null;
  }
  const pending = draft.eight;
  const anyPlayable = playable(state, viewer);
  const handEl = el('div', { class: 'ce-hand' }, hand.map((c, i) => cardEl(c, {
    button: true, disabled: !canPlay(state, c), sel: pending === i,
    onClick: () => {
      if (c.r === 8) { draft.eight = pending === i ? null : i; rerender(); return; }
      sendMove({ type: 'play', card: i });
    },
  })));
  const suitPick = pending != null ? el('div', { class: 'ce-suits' }, el('span', { class: 'muted' }, 'Renk seç: '), SUITS.map((s, k) => el('button', {
    type: 'button', class: `btn btn-secondary ce-suit ${k === 1 || k === 2 ? 'red' : ''}`, 'aria-label': SUIT_NAME[k],
    onClick: () => sendMove({ type: 'play', card: pending, suit: k }),
  }, s))) : null;
  const hint = pending != null ? 'Sekizi atmak için rengi seç.' : anyPlayable ? 'Uyan bir karta dokun.' : state.drew ? 'Çektiğin kart da uymuyor: pas geç.' : stockEmpty ? 'Deste bitti: pas geç.' : 'Uyan kartın yok: desteden çek.';
  const rerender = () => render(state, viewer, container, sendMove, ctx);
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}, sıra sende`)),
    table, oppRow,
    el('div', { class: 'col-title' }, `Kartların (${hand.length})`),
    handEl,
    suitPick,
    el('p', { class: 'hint' }, hint),
    el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px' } },
      el('button', { type: 'button', class: 'btn btn-primary', disabled: state.drew || stockEmpty, onClick: () => sendMove({ type: 'draw' }) }, 'Kart çek'),
      el('button', { type: 'button', class: 'btn btn-secondary', disabled: !(state.drew || stockEmpty), onClick: () => sendMove({ type: 'pass' }) }, 'Pas'),
    ),
    legend,
  );
  return null;
}

export default { id: 'sekizler', meta, setup, applyMove, render, getTurn, getResult };
