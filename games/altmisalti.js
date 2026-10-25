// Altmışaltı (66) — the classic two-player trick game: 24 cards, six each, a face-up trump.
// While the stock is open anything goes; once it is closed or empty you must follow suit, head
// the trick if you can, or trump. Marriages score 20 (40 in trumps); first to 66 wins the hand.
import { el, render as draw } from '../js/ui/dom.js';
import { createRng, shuffle } from '../js/lib/rng.js';
import { nameSuffix } from '../js/lib/tr.js';
import { SUITS } from './pisti.js';

export const meta = {
  group: 'kart',
  name: 'Altmışaltı (66)',
  icon: '🃏',
  description: 'Altışar kart, açık koz, evlilikler; eli ilk 66 puanı toplayan alır.',
  rules: [
    'Yirmi dört kart (9, 10, J, Q, K, A), altışar dağıtılır; bir kart koz olarak açılır. Puanlar: A 11, 10 10, K 4, Q 3, J 2, 9 0. Eli kazanan önce desteden çeker, sonra diğeri çeker ve kazanan açar.',
    'Deste açıkken istediğin kartı atabilirsin. Deste bitince ya da "Kapat" denince renk uymak, uyuyorsa büyüğünü atmak, renk yoksa koz atmak zorunludur. Aynı renkten K+Q ile açarken evlilik: 20, kozda 40 (en az bir el almış olmalısın). Elinde koz 9 varsa, en az bir el almışken ve açarken (destede en az iki kart varken) açık kozla değişebilirsin.',
    'Puanı 66\'ya ulaşan eli alır: rakip 33 ve üstüyse 1, altıysa 2, hiç el almadıysa 3 oyun puanı. Kapatan 66\'ya ulaşamazsa rakip 2 (kapatıldığında eli yoksa 3) alır. Son eli alan +10 alır (kapatılmadıysa). 7 oyun puanına ulaşan kazanır.',
  ].join('\n'),
  data: [],
  handoffNote: 'Kartlarını rakibin görmemeli.',
  settings: [
    { key: 'target', label: 'Hedef oyun puanı', type: 'select', default: 7, options: [{ value: 0, label: 'Tek el' }, { value: 7, label: '7' }] },
  ],
};

export const RANKS = [9, 11, 12, 13, 10, 14]; // strength order: 9 < J < Q < K < 10 < A
export const POINTS = { 9: 0, 11: 2, 12: 3, 13: 4, 10: 10, 14: 11 };
const RANK_TEXT = { 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const strength = (r) => RANKS.indexOf(r);

function fail(msg) {
  throw new Error(msg);
}

function makeDeck(seed) {
  const cards = [];
  for (let s = 0; s < 4; s++) for (const r of RANKS) cards.push({ r, s });
  return shuffle(createRng(seed), cards);
}

function dealHand(state, handNo) {
  const deck = makeDeck((state.seed + handNo * 7919) >>> 0);
  const hands = [deck.splice(0, 6), deck.splice(0, 6)];
  // the face-up trump card sits at the bottom of the stock (index 0) and is drawn last
  const trumpCard = deck.shift();
  deck.unshift(trumpCard);
  const dealer = handNo % 2;
  return {
    ...state, handNo, deck, trump: trumpCard.s, hands, tricks: [[], []], points: [0, 0], marriages: [[], []],
    leader: 1 - dealer, turn: 1 - dealer, table: [], closed: null, lastTrick: null, phase: 'play', result: null,
  };
}

export function setup(options = {}) {
  const target = [0, 7].includes(Number(options.target)) ? Number(options.target) : 7;
  return dealHand({ id: String(options.seed ?? ''), seed: Number(options.seed) || 1, target, gamePoints: [0, 0] }, 0);
}

export const stockOpen = (state) => state.deck.length > 0 && !state.closed;
export const trumpCardOf = (state) => (state.deck.length ? state.deck[0] : null);

/** Who wins a trick: lead card vs. reply. */
export function trickWinner(lead, reply, trump) {
  if (reply.s === lead.s) return strength(reply.r) > strength(lead.r) ? 1 : 0;
  if (reply.s === trump) return 1;
  return 0;
}

/** Cards the follower may play under strict rules (closed stock or empty stock). */
export function legalReplies(hand, lead, trump) {
  const same = hand.filter((c) => c.s === lead.s);
  if (same.length) {
    const higher = same.filter((c) => strength(c.r) > strength(lead.r));
    return higher.length ? higher : same;
  }
  const trumps = hand.filter((c) => c.s === trump);
  if (lead.s !== trump && trumps.length) return trumps;
  return hand;
}

export function legalCards(state, player) {
  const hand = state.hands[player];
  if (!state.table.length || stockOpen(state)) return hand;
  return legalReplies(hand, state.table[0].card, state.trump);
}

const hasTrick = (state, p) => state.tricks[p].length > 0;
const sameCard = (a, b) => a.r === b.r && a.s === b.s;

function gamePointsFor(state, winner, loserPts) {
  const loser = 1 - winner;
  if (!hasTrick(state, loser)) return 3;
  return loserPts < 33 ? 2 : 1;
}

function endHand(state, winner, pts, how) {
  const gamePoints = state.gamePoints.slice();
  gamePoints[winner] += pts;
  const over = !state.target || gamePoints[winner] >= state.target;
  return { ...state, gamePoints, phase: over ? 'over' : 'handOver', result: { winner, pts, how } };
}

/** After a completed trick (or when the hand is exhausted): decide whether the hand ends. */
function checkEnd(state) {
  const { closed, points } = state;
  for (const p of [0, 1]) {
    if (points[p] >= 66) {
      if (closed && closed.by !== p) return endHand(state, p, closed.oppHadTricks ? 2 : 3, 'closerFailed');
      return endHand(state, p, gamePointsFor(state, p, points[1 - p]), 'sixtysix');
    }
  }
  if (!state.hands[0].length && !state.hands[1].length) {
    if (closed) return endHand(state, 1 - closed.by, closed.oppHadTricks ? 2 : 3, 'closerFailed');
    return endHand(state, state.leader, 1, 'lastTrick'); // nobody reached 66: the last trick decides
  }
  return state;
}

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.phase === 'over') fail('Oyun bitti');
  if (move.type === 'next') {
    if (state.phase !== 'handOver') fail('El henüz bitmedi');
    return dealHand(state, state.handNo + 1);
  }
  if (state.phase !== 'play') fail('Önce sonraki ele geçin');
  if (player !== state.turn) fail('Sıra sende değil');
  const opp = 1 - player;
  const hand = state.hands[player].slice();
  const hands = state.hands.map((h, i) => (i === player ? hand : h));
  const leading = !state.table.length;
  switch (move.type) {
    case 'exchange': {
      if (!leading) fail('Değişim yalnızca açarken yapılır');
      if (!hasTrick(state, player)) fail('Önce bir el almalısın');
      if (state.deck.length < 2 || state.closed) fail('Deste kapalı ya da bitmek üzere: değişim yok');
      const i = hand.findIndex((c) => c.r === 9 && c.s === state.trump);
      if (i < 0) fail('Koz dokuzlusu sende değil');
      const deck = state.deck.slice();
      const nine = hand[i];
      hand[i] = deck[0];
      deck[0] = nine;
      return { ...state, hands, deck };
    }
    case 'close': {
      if (!leading) fail('Kapatma yalnızca açarken yapılır');
      if (state.deck.length < 2 || state.closed) fail('Deste zaten kapalı ya da bitmek üzere');
      return { ...state, closed: { by: player, oppHadTricks: hasTrick(state, opp) } };
    }
    case 'play': {
      const i = hand.findIndex((c) => c.r === Number(move.r) && c.s === Number(move.s));
      if (i < 0) fail('Bu kart sende değil');
      const card = hand[i];
      if (!legalCards(state, player).some((c) => sameCard(c, card))) fail('Bu kart atılamaz: renk uy, büyüğünü at ya da koz kullan');
      hand.splice(i, 1);
      let points = state.points.slice();
      const marriages = state.marriages.map((m) => m.slice());
      let marriage = 0;
      if (leading && (card.r === 13 || card.r === 12) && hasTrick(state, player)) {
        const partner = card.r === 13 ? 12 : 13;
        if (hand.some((c) => c.r === partner && c.s === card.s)) {
          marriage = card.s === state.trump ? 40 : 20;
          points[player] += marriage;
          marriages[player].push({ s: card.s, pts: marriage });
        }
      }
      // a marriage is declared with the lead: it rides on the table entry so both players see it
      const table = state.table.concat([marriage ? { player, card, marriage } : { player, card }]);
      if (table.length < 2) {
        const next = { ...state, hands, points, marriages, table, turn: opp };
        return checkEnd(next); // a marriage alone can reach 66
      }
      // resolve the trick
      const lead = table[0];
      const winner = trickWinner(lead.card, table[1].card, state.trump) === 0 ? lead.player : table[1].player;
      const loser = 1 - winner;
      const tricks = state.tricks.map((t) => t.slice());
      tricks[winner].push([lead.card, table[1].card]);
      points[winner] += POINTS[lead.card.r] + POINTS[table[1].card.r];
      let deck = state.deck.slice();
      if (deck.length && !state.closed) {
        hands[winner] = hands[winner].concat([deck.pop()]);
        hands[loser] = hands[loser].concat([deck.pop()]);
      }
      const lastTrick = { winner, cards: [lead.card, table[1].card], pts: POINTS[lead.card.r] + POINTS[table[1].card.r], marriage: lead.marriage ? { player: lead.player, pts: lead.marriage } : null };
      let next = { ...state, hands, deck, points, marriages, tricks, table: [], leader: winner, turn: winner, lastTrick };
      if (!hands[0].length && !hands[1].length && !state.closed && points[winner] < 66) {
        points = points.slice();
        points[winner] += 10; // last trick
        next = { ...next, points, lastTrick: { ...lastTrick, pts: lastTrick.pts + 10, bonus: true } };
      }
      return checkEnd(next);
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
  const [a, b] = state.gamePoints;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
function cardEl(c, opts = {}) {
  const red = c.s === 1 || c.s === 2;
  return el(opts.button ? 'button' : 'span', {
    type: opts.button ? 'button' : null,
    class: `pcard ${red ? 'red' : ''} ${opts.small ? 'small' : ''} ${opts.trump ? 'trump' : ''}`,
    'aria-label': `${RANK_TEXT[c.r]}${SUITS[c.s]}`,
    disabled: opts.button ? opts.disabled : null,
    onClick: opts.onClick,
  }, el('span', {}, RANK_TEXT[c.r]), el('span', { class: 'suit' }, SUITS[c.s]));
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const opp = 1 - viewer;
  const legend = el('div', { class: 'c4-legend' }, el('span', {}, `${players[0]}: ${state.gamePoints[0]}`), el('span', {}, `${players[1]}: ${state.gamePoints[1]}`), el('span', { class: 'muted' }, state.target ? `hedef ${state.target}` : 'tek el'));
  const tc = trumpCardOf(state);
  const table = el('div', { class: 'ss-table card' },
    el('div', { class: 'ss-slot' }, el('span', { class: 'muted' }, 'Koz'), tc && !state.closed ? cardEl(tc, { small: true, trump: true }) : el('span', { class: 'pcard small empty' }, SUITS[state.trump]), el('span', { class: 'ok-note' }, `${['maça', 'kupa', 'karo', 'sinek'][state.trump]} · deste ${state.closed ? 'kapalı' : state.deck.length}`)),
    el('div', { class: 'ss-slot' }, el('span', { class: 'muted' }, 'Masa'), el('div', { class: 'ce-row' }, state.table.length ? state.table.map((t) => cardEl(t.card, { small: true })) : [el('span', { class: 'pcard small empty' }, '–')])),
  );
  const declared = state.table.length && state.table[0].marriage ? el('p', { class: 'hint notice' }, `${players[state.table[0].player]} evlilik ilan etti: +${state.table[0].marriage}`) : null;
  const L = state.lastTrick;
  const lastLine = L ? el('p', { class: 'hint' }, `Son el: ${players[L.winner]} aldı (${L.cards.map((c) => `${RANK_TEXT[c.r]}${SUITS[c.s]}`).join(', ')}) +${L.pts}${L.bonus ? ' (son el +10)' : ''}${L.marriage ? ` · ${players[L.marriage.player]} evlilik +${L.marriage.pts}` : ''}`) : null;

  if (state.phase === 'handOver' || state.phase === 'over') {
    const R = state.result;
    const how = { sixtysix: '66 puana ulaştı', closerFailed: `kapatan ${players[1 - R.winner]} 66'ya ulaşamadı`, lastTrick: 'son eli aldı (kimse 66 yapamadı)' }[R.how];
    const line = `${players[R.winner]} eli aldı: ${how}, +${R.pts} oyun puanı. (${players[0]} ${state.points[0]} – ${state.points[1]} ${players[1]})`;
    const [a, b] = state.gamePoints;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, state.phase === 'over' ? (a === b ? `Berabere: ${a}–${b}` : `${players[a > b ? 0 : 1]} kazandı: ${Math.max(a, b)}–${Math.min(a, b)}`) : line)),
      state.phase === 'over' ? el('p', { class: 'hint' }, line) : null,
      legend, declared, lastLine,
      state.phase === 'handOver' ? el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'next' }) }, 'Sonraki el') : null,
    );
    return null;
  }

  const mine = viewer === state.turn;
  const hand = state.hands[viewer];
  const myPts = el('p', { class: 'hint' }, `Puanın: ${state.points[viewer]} · aldığın el: ${state.tricks[viewer].length} · ${players[opp]}: ${state.tricks[opp].length} el${state.marriages[viewer].length ? ` · evlilik: ${state.marriages[viewer].map((m) => `${SUITS[m.s]}${m.pts}`).join(' ')}` : ''}`);
  if (!mine) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[opp]} oynuyor…`)),
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      table, declared, lastLine, myPts,
      el('div', { class: 'col-title' }, 'Kartların'), el('div', { class: 'ce-hand' }, hand.map((c) => cardEl(c, { small: true }))),
      legend,
    );
    return null;
  }
  const legal = legalCards(state, viewer);
  const leading = !state.table.length;
  const canExchange = leading && hasTrick(state, viewer) && state.deck.length >= 2 && !state.closed && hand.some((c) => c.r === 9 && c.s === state.trump);
  const canClose = leading && state.deck.length >= 2 && !state.closed;
  const marriageSuits = leading && hasTrick(state, viewer) ? [0, 1, 2, 3].filter((s) => hand.some((c) => c.r === 13 && c.s === s) && hand.some((c) => c.r === 12 && c.s === s)) : [];
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, leading ? `${players[viewer]}, sen aç` : `${players[viewer]}, cevap ver`)),
    table, declared, lastLine, myPts,
    el('div', { class: 'col-title' }, `Kartların (${hand.length})`),
    el('div', { class: 'ce-hand' }, hand.map((c) => cardEl(c, { button: true, disabled: !legal.some((x) => sameCard(x, c)), onClick: () => sendMove({ type: 'play', r: c.r, s: c.s }) }))),
    marriageSuits.length ? el('p', { class: 'hint notice' }, `Evlilik hazır: ${marriageSuits.map((s) => `${SUITS[s]} K+Q (${s === state.trump ? 40 : 20})`).join(', ')} — K ya da Q ile aç.`) : null,
    el('p', { class: 'hint' }, stockOpen(state) ? 'Deste açık: istediğin kartı atabilirsin.' : 'Deste kapalı/bitti: renk uy, büyüğünü at, renk yoksa koz at.'),
    canExchange || canClose ? el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px' } },
      canExchange ? el('button', { type: 'button', class: 'btn btn-secondary btn-small', onClick: () => sendMove({ type: 'exchange' }) }, `Koz 9'u değiştir (${RANK_TEXT[tc.r]}${SUITS[tc.s]})`) : null,
      canClose ? el('button', { type: 'button', class: 'btn btn-secondary btn-small', onClick: () => { if (confirm('Deste kapatılsın mı? 66\'ya ulaşamazsan rakip 2 (eli yoksa 3) puan alır.')) sendMove({ type: 'close' }); } }, 'Kapat') : null,
    ) : null,
    legend,
  );
  return null;
}

export default { id: 'altmisalti', meta, setup, applyMove, render, getTurn, getResult };
