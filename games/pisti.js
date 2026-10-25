// Pişti — the classic Turkish two-player card game. Match the top card (or play a Jack) to
// take the pile; taking a single card with a match is "pişti". First to 151 points wins.
import { el, render as draw } from '../js/ui/dom.js';
import { createRng, shuffle } from '../js/lib/rng.js';

export const meta = {
  group: 'masa',
  name: 'Pişti',
  icon: '🂡',
  description: 'Masadaki kartla aynı değeri ya da vale at, yığını al. 151 puana ilk ulaşan kazanır.',
  rules: [
    'Her oyuncuya 4 kart dağıtılır, masaya 4 kart konur (yalnızca üstteki açık). Sırası gelen elinden bir kart atar.',
    'Atılan kart masanın üstündeki kartla aynı değerdeyse ya da valeyse masadaki kartların hepsi alınır. Masada tek kart varken alınırsa "pişti" olur: 10 puan (vale üstüne vale 20 puan).',
    'Eller bitince yeniden 4 kart dağıtılır; deste bitince masada kalanlar son alana gider.',
    'Puanlar: sinek 2\'lisi 2, karo 10\'lusu 3, her vale 1, her as 1, çok kart toplayan 3 (26-26 ise kimseye). 151 puana ilk ulaşan kazanır.',
    'Tek telefonda eller gizli olduğu için her kartta telefon el değiştirir; iki telefonda herkes kendi elini görür.',
  ].join('\n'),
  data: [],
  handoffNote: 'Kartların gizli: ekranı yalnızca sırası gelen görmeli.',
  settings: [
    { key: 'target', label: 'Hedef puan', type: 'select', default: 151, options: [{ value: 51, label: '51 (kısa)' }, { value: 101, label: '101' }, { value: 151, label: '151' }] },
    {
      key: 'hideHands', label: 'Tek telefonda eller gizli olsun', type: 'toggle', default: true,
      help: 'Açıksa her kartta telefon el değiştirir. Kapatırsanız iki el de görünür, telefon vermeden oynanır.',
    },
  ],
};

export const SUITS = ['♠', '♥', '♦', '♣'];
const RANK_TEXT = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

function fail(msg) {
  throw new Error(msg);
}

export const cardText = (c) => `${RANK_TEXT[c.r] || c.r}${SUITS[c.s]}`;

function makeDeck(seed) {
  const cards = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) cards.push({ r, s });
  return shuffle(createRng(seed), cards);
}

function startDeal(state, dealNo) {
  let deck = makeDeck((state.seed + dealNo * 7919) >>> 0);
  // the first open card must not be a jack: move jacks from the 4th position to the bottom
  const table = [];
  while (table.length < 4) {
    const c = deck.shift();
    if (table.length === 3 && c.r === 11) { deck.push(c); continue; }
    table.push(c);
  }
  const hands = [deck.splice(0, 4), deck.splice(0, 4)];
  const dealer = 1 - (state.dealer ?? 1);
  // the non-dealer leads; the deal alternates
  return { ...state, deck, hands, table, dealNo, captured: [[], []], pistiPoints: [0, 0], lastTaker: null, dealer, turn: 1 - dealer, justDealt: true };
}

export function setup(options = {}) {
  const target = [51, 101, 151].includes(Number(options.target)) ? Number(options.target) : 151;
  const base = { seed: (Number(options.seed) || 1) >>> 0, target, hideHands: options.hideHands !== false, scores: [0, 0], phase: 'play', dealer: Number(options.seed) % 2 === 0 ? 0 : 1, over: false, winner: null, pendingAck: null, last: null, dealResult: null };
  return { ...startDeal(base, 0), justDealt: false };
}

/** Deal points for the cards captured in one deal (without pişti bonuses). */
export function dealPoints(captured) {
  const pts = [0, 0];
  captured.forEach((cards, p) => {
    for (const c of cards) {
      if (c.r === 2 && c.s === 3) pts[p] += 2;      // 2 of clubs
      if (c.r === 10 && c.s === 2) pts[p] += 3;     // 10 of diamonds
      if (c.r === 11 || c.r === 1) pts[p] += 1;     // jacks and aces
    }
  });
  if (captured[0].length > captured[1].length) pts[0] += 3;
  else if (captured[1].length > captured[0].length) pts[1] += 3;
  return pts;
}

export function applyMove(state, player, move, ctx = {}) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  if (move.type === 'ack') {
    // on a shared phone with hidden hands the player looks at the outcome before passing the phone
    if (state.pendingAck !== player) fail('Onaylanacak hamle yok');
    const turn = state.justDealt && state.nextTurn != null ? state.nextTurn : 1 - player;
    return { ...state, pendingAck: null, turn, nextTurn: null };
  }
  if (move.type !== 'play') fail('Geçersiz hamle');
  if (state.pendingAck != null) fail('Önce "Tamam" de');
  if (player !== state.turn) fail('Sıra sende değil');
  const i = Number(move.card);
  const hand = state.hands[player];
  if (!Number.isInteger(i) || i < 0 || i >= hand.length) fail('Geçersiz kart');
  const card = hand[i];
  const hands = state.hands.map((h) => h.slice());
  hands[player].splice(i, 1);
  let table = state.table.slice();
  const captured = state.captured.map((c) => c.slice());
  const pistiPoints = state.pistiPoints.slice();
  let last = { player, card, took: 0, pisti: 0 };
  let lastTaker = state.lastTaker;
  const top = table[table.length - 1];
  if (top && (top.r === card.r || card.r === 11)) {
    if (table.length === 1) {
      last.pisti = card.r === 11 && top.r === 11 ? 20 : 10;
      pistiPoints[player] += last.pisti;
    }
    captured[player].push(...table, card);
    last.took = table.length + 1;
    table = [];
    lastTaker = player;
  } else {
    table.push(card);
  }
  const needsAck = state.hideHands !== false && ctx.mode !== 'online';
  let next = { ...state, hands, table, captured, pistiPoints, lastTaker, last, justDealt: false, turn: needsAck ? player : 1 - player, pendingAck: needsAck ? player : null };
  if (hands[0].length === 0 && hands[1].length === 0) {
    if (next.deck.length >= 8) {
      const deck = next.deck.slice();
      next = { ...next, hands: [deck.splice(0, 4), deck.splice(0, 4)], deck };
    } else {
      // end of the deal: leftover table cards go to the last taker
      if (lastTaker != null && table.length) { captured[lastTaker].push(...table); next = { ...next, table: [], captured }; }
      const pts = dealPoints(next.captured);
      const scores = [state.scores[0] + pts[0] + pistiPoints[0], state.scores[1] + pts[1] + pistiPoints[1]];
      next = { ...next, scores, dealResult: { pts, pisti: pistiPoints.slice(), cards: [next.captured[0].length, next.captured[1].length] } };
      if (scores[0] >= state.target || scores[1] >= state.target) {
        if (scores[0] !== scores[1]) return { ...next, over: true, phase: 'over', winner: scores[0] > scores[1] ? 0 : 1, pendingAck: null };
      }
      const fresh = startDeal(next, state.dealNo + 1);
      // keep the note of the final capture and the ack of the player who ended the deal
      next = { ...fresh, last, pendingAck: needsAck ? player : null, turn: needsAck ? player : fresh.turn, nextTurn: fresh.turn };
    }
  }
  return next;
}

export function getTurn(state) {
  return state.over ? null : { player: state.turn, private: state.hideHands !== false };
}

export function getResult(state) {
  if (!state.over) return null;
  return { winner: state.winner };
}

// ----------------------------------------------------------------- render
function cardEl(c, opts = {}) {
  const red = c.s === 1 || c.s === 2;
  return el(opts.button ? 'button' : 'span', {
    type: opts.button ? 'button' : null,
    class: `pcard ${red ? 'red' : ''} ${opts.small ? 'small' : ''}`,
    'aria-label': cardText(c),
    disabled: opts.button ? opts.disabled : null,
    onClick: opts.onClick,
  }, el('span', {}, RANK_TEXT[c.r] || String(c.r)), el('span', { class: 'suit' }, SUITS[c.s]));
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const opp = 1 - viewer;
  const mine = !state.over && viewer === state.turn;
  const top = state.table[state.table.length - 1];
  const tableView = el('div', { class: 'ptable' },
    el('div', { class: 'col-title' }, `Masa (${state.table.length} kart)`),
    top ? cardEl(top) : el('span', { class: 'pcard empty' }, '—'),
  );
  const handView = el('div', { class: 'phand' }, state.hands[viewer].map((c, i) => cardEl(c, { button: true, disabled: !mine, onClick: () => sendMove({ type: 'play', card: i }) })));
  const notes = [];
  if (state.last) {
    const l = state.last;
    notes.push(`${players[l.player]} ${cardText(l.card)} attı${l.took ? `, ${l.took} kart aldı` : ''}${l.pisti ? ` — PİŞTİ! (+${l.pisti})` : ''}.`);
  }
  if (state.dealResult && (state.justDealt || state.over)) {
    const d = state.dealResult;
    notes.push(`El bitti: ${players[0]} ${d.pts[0] + d.pisti[0]} puan (${d.cards[0]} kart), ${players[1]} ${d.pts[1] + d.pisti[1]} puan (${d.cards[1]} kart).`);
  }
  const acking = !state.over && state.pendingAck === viewer;
  let status;
  if (state.over) status = `${players[state.winner]} ${state.target} puana ulaştı!`;
  else if (acking) status = state.last && state.last.took ? (state.last.pisti ? 'PİŞTİ!' : `${state.last.took} kart aldın!`) : 'Kart masada kaldı.';
  else if (mine) status = `Sıra sende, ${players[viewer]}: bir kart at`;
  else status = `${players[state.turn]} oynuyor…`;
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, status)),
    el('div', { class: 'c4-legend' },
      el('span', {}, `${players[0]}: ${state.scores[0]}`),
      el('span', {}, `${players[1]}: ${state.scores[1]}`),
      el('span', { class: 'muted' }, `hedef ${state.target}`),
    ),
    el('div', { class: 'c4-legend muted' },
      el('span', {}, `${players[opp]}: elinde ${state.hands[opp].length} kart, aldığı ${state.captured[opp].length}`),
      el('span', {}, `deste ${state.deck.length}`),
    ),
    state.hideHands === false && ctx.mode !== 'online'
      ? el('div', { class: 'phand open-hand' }, state.hands[opp].map((c) => cardEl(c, { small: true })))
      : null,
    tableView,
    el('div', { class: 'col-title active' }, `Senin elin (aldığın ${state.captured[viewer].length} kart)`),
    acking ? null : handView,
    notes.length ? el('p', { class: 'hint' }, notes.join(' ')) : null,
    acking ? el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', onClick: () => sendMove({ type: 'ack' }) }, 'Tamam, telefonu ver') : null,
  );
  return null;
}

export default { id: 'pisti', meta, setup, applyMove, render, getTurn, getResult };
