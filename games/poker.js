// Poker (Texas Hold'em, heads-up). Each player gets two hidden cards, five community cards
// come out over three betting rounds. Blinds, check/call/raise/fold, all-ins with the excess
// returned, showdown with the best five of seven. The hand ends when one stack is empty.
import { el, render as draw } from '../js/ui/dom.js';
import { createRng, shuffle } from '../js/lib/rng.js';
import { nameSuffix } from '../js/lib/tr.js';
import { SUITS, cardText } from './pisti.js';

export const meta = {
  group: 'masa',
  name: 'Poker',
  icon: '♠️',
  description: 'Texas Hold\'em bire bir: iki gizli kart, beş ortak kart, körler ve rest.',
  rules: [
    'İkinize de iki gizli kart dağıtılır; ortaya sırayla üç (flop), bir (turn) ve bir (river) ortak kart açılır. Her turda bahis dönülür: Bekle, Gör, Yükselt ya da Pas (eli bırak).',
    'Dağıtan küçük körü (10), diğeri büyük körü (20) yatırır; ilk turda dağıtan, sonraki turlarda diğeri önce konuşur. Yükseltme en az büyük kör (ya da son yükseltme) kadar olmalı; "Rest" bütün fişleri koyar, fazlası iade edilir.',
    'Biri pas derse pot diğerinin olur. Son turdan sonra (ya da biri rest çekip görülünce) kartlar açılır: yedi karttan en iyi beşli kazanır. Fişi biten oyunu kaybeder.',
  ].join('\n'),
  data: [],
  handoffNote: 'Kartlarını rakibin görmemeli.',
  settings: [
    { key: 'stack', label: 'Başlangıç fişi', type: 'select', default: 1000, options: [{ value: 500, label: '500' }, { value: 1000, label: '1000' }, { value: 2000, label: '2000' }] },
  ],
};

export const SB = 10;
export const BB = 20;
const STREETS = ['preflop', 'flop', 'turn', 'river'];
const RANK_NAMES = ['Yüksek kart', 'Çift', 'İki çift', 'Üçlü', 'Kent', 'Renk', 'Full', 'Kare', 'Kent floş'];

function fail(msg) {
  throw new Error(msg);
}

function makeDeck(seed) {
  const cards = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) cards.push({ r, s }); // 14 = ace
  return shuffle(createRng(seed), cards);
}

/** Evaluate exactly five cards: { rank 0..8, keys[] for tie-breaks, name }. */
export function evaluate5(cards) {
  const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
  const counts = {};
  ranks.forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
  const groups = Object.keys(counts).map(Number).sort((a, b) => counts[b] - counts[a] || b - a); // by count, then rank
  const flush = cards.every((c) => c.s === cards[0].s);
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq.join() === '14,5,4,3,2') straightHigh = 5; // wheel
  }
  const c0 = counts[groups[0]];
  const c1 = counts[groups[1]] || 0;
  if (flush && straightHigh) return { rank: 8, keys: [straightHigh], name: straightHigh === 14 ? 'Royal floş' : 'Kent floş' };
  if (c0 === 4) return { rank: 7, keys: [groups[0], groups[1]], name: 'Kare' };
  if (c0 === 3 && c1 === 2) return { rank: 6, keys: [groups[0], groups[1]], name: 'Full' };
  if (flush) return { rank: 5, keys: ranks, name: 'Renk' };
  if (straightHigh) return { rank: 4, keys: [straightHigh], name: 'Kent' };
  if (c0 === 3) return { rank: 3, keys: [groups[0], ...groups.slice(1)], name: 'Üçlü' };
  if (c0 === 2 && c1 === 2) return { rank: 2, keys: [groups[0], groups[1], groups[2]], name: 'İki çift' };
  if (c0 === 2) return { rank: 1, keys: [groups[0], ...groups.slice(1)], name: 'Çift' };
  return { rank: 0, keys: ranks, name: 'Yüksek kart' };
}

export function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.keys.length, b.keys.length); i++) {
    const d = (a.keys[i] || 0) - (b.keys[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** Best five-card hand out of up to seven cards. */
export function bestHand(cards) {
  let best = null;
  const n = cards.length;
  if (n <= 5) return evaluate5(cards);
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    if (n === 6 && b !== a + 1) continue;
    const five = n === 7 ? cards.filter((_, i) => i !== a && i !== b) : cards.filter((_, i) => i !== a);
    const h = evaluate5(five);
    if (!best || compareHands(h, best) > 0) best = h;
    if (n === 6) break;
  }
  return best;
}

function dealHand(state, handNo) {
  const deck = makeDeck((state.seed + handNo * 7919) >>> 0);
  const hole = [[deck.pop(), deck.pop()], [deck.pop(), deck.pop()]];
  const community = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
  const dealer = handNo % 2;
  const stacks = state.stacks.slice();
  const bets = [0, 0];
  const post = (p, amount) => { const a = Math.min(amount, stacks[p]); stacks[p] -= a; bets[p] += a; };
  post(dealer, SB);
  post(1 - dealer, BB);
  return {
    ...state, handNo, dealer, hole, community, stacks, bets, pot: 0, invested: bets.slice(),
    street: 0, turn: dealer, acted: [false, false], lastRaise: BB, phase: 'play', result: null,
  };
}

export function setup(options = {}) {
  const stack = [500, 1000, 2000].includes(Number(options.stack)) ? Number(options.stack) : 1000;
  return dealHand({ id: String(options.seed ?? ''), seed: Number(options.seed) || 1, stacks: [stack, stack], hands: 0 }, 0);
}

export const board = (state) => state.community.slice(0, state.street === 0 ? 0 : state.street + 2);
const allIn = (state, p) => state.stacks[p] === 0;

/** Finish the hand: 'fold' by `folder`, or a showdown. */
function settle(state, { folder = null } = {}) {
  const stacks = state.stacks.slice();
  const invested = state.invested.slice();
  const total = invested[0] + invested[1];
  let result;
  if (folder != null) {
    const w = 1 - folder;
    stacks[w] += total;
    result = { winner: w, folder, amount: total, hands: null, shown: false };
  } else {
    const hands = [0, 1].map((p) => bestHand(state.hole[p].concat(state.community)));
    const cmp = compareHands(hands[0], hands[1]);
    const low = Math.min(invested[0], invested[1]);
    const refund = invested[0] > invested[1] ? 0 : 1; // who gets the uncalled excess back
    stacks[refund] += total - 2 * low;
    if (cmp === 0) { stacks[0] += low; stacks[1] += low; result = { winner: null, amount: low, hands, shown: true }; }
    else { const w = cmp > 0 ? 0 : 1; stacks[w] += 2 * low; result = { winner: w, amount: 2 * low, hands, shown: true }; }
  }
  const over = stacks[0] === 0 || stacks[1] === 0;
  return { ...state, stacks, bets: [0, 0], street: folder == null ? 3 : state.street, phase: over ? 'over' : 'handOver', result, hands: state.hands + 1 };
}

/** Both have acted and the bets match: collect them and move to the next street (or showdown). */
function advance(state) {
  const invested = state.invested.slice();
  const pot = state.pot + state.bets[0] + state.bets[1];
  let next = { ...state, pot, bets: [0, 0], acted: [false, false], lastRaise: BB, invested };
  if (allIn(next, 0) || allIn(next, 1) || next.street === 3) return settle({ ...next, street: 3 });
  return { ...next, street: next.street + 1, turn: 1 - next.dealer };
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
  const stacks = state.stacks.slice();
  const bets = state.bets.slice();
  const invested = state.invested.slice();
  const acted = state.acted.slice();
  acted[player] = true;
  const put = (amount) => { stacks[player] -= amount; bets[player] += amount; invested[player] += amount; };
  const after = (next) => (acted[0] && acted[1] && (bets[0] === bets[1] || allIn(next, 0) || allIn(next, 1)) ? advance(next) : { ...next, turn: opp });
  switch (move.type) {
    case 'fold':
      return settle(state, { folder: player });
    case 'check': {
      if (bets[player] !== bets[opp]) fail('Önce görmen gerek');
      return after({ ...state, acted });
    }
    case 'call': {
      const diff = bets[opp] - bets[player];
      if (diff <= 0) fail('Görecek bahis yok: bekle');
      put(Math.min(diff, stacks[player]));
      if (bets[player] < bets[opp]) { // called all-in for less: the excess goes back
        const back = bets[opp] - bets[player];
        stacks[opp] += back; bets[opp] -= back; invested[opp] -= back;
      }
      return after({ ...state, stacks, bets, invested, acted });
    }
    case 'raise': {
      const to = Number(move.to); // total bet on this street after the raise
      const max = bets[player] + stacks[player];
      if (!Number.isInteger(to) || to <= bets[opp] || to > max) fail('Geçersiz miktar');
      const raiseBy = to - bets[opp];
      const minRaise = Math.max(BB, state.lastRaise);
      if (raiseBy < minRaise && to !== max) fail(`En az ${minRaise} yükseltmelisin (ya da rest)`);
      if (allIn(state, opp)) fail('Rakip rest çekti: gör ya da pas de');
      put(to - bets[player]);
      acted[opp] = false; // the opponent must answer the raise
      return { ...state, stacks, bets, invested, acted, lastRaise: Math.max(raiseBy, state.lastRaise), turn: opp };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase !== 'play') return null; // the showdown is looked at together
  return { player: state.turn, private: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  return { winner: state.stacks[0] === 0 ? 1 : 0 };
}

// ----------------------------------------------------------------- render
const RANK_TEXT = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const drafts = new Map(); // `${id}:${handNo}:${street}:${invested}` -> { raising: bool }
let draftsFor = null;

function cardEl(c, opts = {}) {
  if (!c) return el('span', { class: `pcard back ${opts.small ? 'small' : ''}`, 'aria-label': 'kapalı kart' }, '?');
  const red = c.s === 1 || c.s === 2;
  return el('span', { class: `pcard ${red ? 'red' : ''} ${opts.small ? 'small' : ''}`, 'aria-label': `${RANK_TEXT[c.r] || c.r}${SUITS[c.s]}` },
    el('span', {}, RANK_TEXT[c.r] || String(c.r)), el('span', { class: 'suit' }, SUITS[c.s]));
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const opp = 1 - viewer;
  if (draftsFor !== state.id) { drafts.clear(); draftsFor = state.id; }
  const shown = board(state);
  const potAll = state.pot + state.bets[0] + state.bets[1];
  const stacksLine = el('div', { class: 'c4-legend' },
    el('span', {}, `${players[0]}: ${state.stacks[0]}${state.dealer === 0 ? ' (D)' : ''}`),
    el('span', {}, `${players[1]}: ${state.stacks[1]}${state.dealer === 1 ? ' (D)' : ''}`),
    el('span', { class: 'muted' }, `${state.handNo + 1}. el`));
  const tableView = el('div', { class: 'pk-table card' },
    el('div', { class: 'pk-board' }, [0, 1, 2, 3, 4].map((i) => cardEl(shown[i] || null, { small: true }))),
    el('div', { class: 'pk-pot' }, `Pot: ${potAll}`, state.bets[0] || state.bets[1] ? el('span', { class: 'muted' }, ` (${players[0]} ${state.bets[0]} · ${players[1]} ${state.bets[1]})`) : null),
  );

  if (state.phase === 'handOver' || state.phase === 'over') {
    const R = state.result;
    const line = R.folder != null
      ? `${players[R.folder]} pas dedi; ${players[R.winner]} ${R.amount} fiş aldı.`
      : R.winner == null ? `Berabere: ${R.hands[0].name}; pot paylaşıldı.`
        : `${players[R.winner]} kazandı: ${R.hands[R.winner].name} (${R.hands[1 - R.winner].name} karşısında), ${R.amount} fiş.`;
    const final = state.phase === 'over' ? `${players[getResult(state).winner]} bütün fişleri aldı!` : null;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, final || line)),
      final ? el('p', { class: 'hint' }, line) : null,
      tableView,
      el('div', { class: 'pk-hands' }, [0, 1].map((p) => el('div', { class: 'pk-hand' },
        el('div', { class: 'col-title' }, `${players[p]}${R.hands ? ` — ${R.hands[p].name}` : ''}`),
        el('div', { class: 'ce-row' }, (R.shown || p === viewer || ctx.mode !== 'online') ? state.hole[p].map((c) => cardEl(c, { small: true })) : [cardEl(null, { small: true }), cardEl(null, { small: true })]),
      ))),
      stacksLine,
      state.phase === 'handOver' ? el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'next' }) }, 'Sonraki el') : null,
    );
    return null;
  }

  const mine = viewer === state.turn;
  const myCards = el('div', { class: 'pk-mine' }, el('div', { class: 'col-title' }, 'Kartların'), el('div', { class: 'ce-row big' }, state.hole[viewer].map((c) => cardEl(c))));
  const streetName = ['Kör turu', 'Flop', 'Turn', 'River'][state.street];
  if (!mine) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[opp]} düşünüyor… (${streetName})`)),
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      tableView, myCards, stacksLine,
    );
    return null;
  }
  const key = `${state.id}:${state.handNo}:${state.street}:${state.invested[0]}:${state.invested[1]}`;
  const draft = drafts.get(key) || { raising: false };
  drafts.set(key, draft);
  const toCall = state.bets[opp] - state.bets[viewer];
  const canCheck = toCall === 0;
  const max = state.bets[viewer] + state.stacks[viewer];
  const minTo = state.bets[opp] + Math.max(BB, state.lastRaise);
  const canRaise = !allIn(state, opp) && max > state.bets[opp];
  const rerender = () => render(state, viewer, container, sendMove, ctx);
  const amounts = [];
  if (canRaise) {
    const half = state.bets[opp] + Math.ceil((potAll + toCall) / 2);
    const pot = state.bets[opp] + potAll + toCall;
    const opts = [['Min', Math.min(minTo, max)], ['½ pot', half], ['Pot', pot], ['Rest', max]];
    const seen = new Set();
    for (const [label, to] of opts) {
      const v = Math.min(Math.max(to, Math.min(minTo, max)), max);
      if (seen.has(v)) continue;
      seen.add(v);
      amounts.push(el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => sendMove({ type: 'raise', to: v }) }, `${label} ${v}`));
    }
  }
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}, sıra sende — ${streetName}`)),
    tableView, myCards,
    el('p', { class: 'hint' }, canCheck ? 'Bahis yok: bekleyebilir ya da yükseltebilirsin.' : `Görmek için ${Math.min(toCall, state.stacks[viewer])} fiş${toCall >= state.stacks[viewer] ? ' (rest)' : ''}.`),
    draft.raising
      ? el('div', { class: 'pk-amounts' }, el('span', { class: 'muted' }, 'Ne kadar? '), amounts, el('button', { type: 'button', class: 'btn btn-small', onClick: () => { draft.raising = false; rerender(); } }, 'Vazgeç'))
      : el('div', { class: 'pk-actions' },
        el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => { if (canCheck || confirm('Eli bırakıyor musun?')) sendMove({ type: canCheck ? 'check' : 'fold' }); } }, canCheck ? 'Bekle' : 'Pas'),
        canCheck ? null : el('button', { type: 'button', class: 'btn btn-primary', onClick: () => sendMove({ type: 'call' }) }, `Gör ${Math.min(toCall, state.stacks[viewer])}`),
        canRaise ? el('button', { type: 'button', class: 'btn btn-primary', onClick: () => { draft.raising = true; rerender(); } }, canCheck ? 'Bahis' : 'Yükselt') : null,
      ),
    stacksLine,
  );
  return null;
}

export default { id: 'poker', meta, setup, applyMove, render, getTurn, getResult };
