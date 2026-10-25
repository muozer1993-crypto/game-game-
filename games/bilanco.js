// Bilanço — a bite-sized Monopoly for two: 20 squares of Turkish cities in five colour pairs,
// two transport squares, chance cards, tax and jail. Buy, collect rent, build up to three houses
// on a full pair. The game ends after the chosen number of rounds (or on bankruptcy): the higher
// net worth wins. Dice come from the shared seed, so both phones see the same rolls.
import { el, render as draw } from '../js/ui/dom.js';
import { diceOnce } from '../js/lib/sfx.js';
import { createRng, shuffle } from '../js/lib/rng.js';
import { nameSuffix } from '../js/lib/tr.js';
import { discCanvas, keyDot, fillCanvas } from '../js/ui/paint.js';

export const meta = {
  group: 'kart',
  name: 'Bilanço',
  icon: '🏦',
  description: 'Çerezlik Monopoly: şehirleri al, kira topla, ev kur; turlar bitince zengin olan kazanır.',
  rules: [
    'Sırayla iki zar atıp tahtada ilerlersiniz. Boştaki bir şehre ya da ulaşım karesine gelirsen satın alabilirsin; rakibinin mülküne gelirsen kira ödersin. Başla\'dan geçince 100 alırsın.',
    'Aynı renkteki iki şehir de sendeyse kira iki katına çıkar ve sıran geldiğinde bu şehirlere ev kurabilirsin (en çok 3). Ev kira getirisini çok artırır. İki ulaşım karesi birlikte daha çok kira getirir.',
    'Bölünmüş çift: rakibinin şehrine geldiğinde o rengin öbür şehri sendeyse, kirayı ödedikten sonra o şehri rakipten iki katı fiyatına satın alıp çifti tamamlayabilirsin.',
    'Çift atan bir daha atar; üst üste üç çift kodese götürür. Kodesteyken 50 ödeyip çıkabilir ya da çift atmayı deneyebilirsin; üçüncü denemede 50 ödenir. Şans kartları para, ceza ya da yer değişikliği getirir.',
    'Parası yetmeyen oyuncunun önce evleri, sonra mülkleri yarı fiyatına bankaya satılır; yine yetmezse iflas eder ve rakip kazanır. Seçilen tur sayısı dolunca ("İflasa kadar" seçiliyse en geç 40 turda) varlığı (para + mülkler + evler) çok olan kazanır.',
  ].join('\n'),
  data: [],
  settings: [
    { key: 'rounds', label: 'Tur sayısı', type: 'select', default: 10, options: [{ value: 6, label: '6 (çok kısa)' }, { value: 10, label: '10' }, { value: 15, label: '15' }, { value: 0, label: 'İflasa kadar (en çok 40)' }] },
    { key: 'cash', label: 'Başlangıç parası', type: 'select', default: 1000, options: [{ value: 1000, label: '₺1000' }, { value: 1500, label: '₺1500' }] },
    { key: 'anim', label: 'Piyon animasyonu', type: 'select', default: 'normal', options: [{ value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Hızlı' }, { value: 'off', label: 'Kapalı' }] },
  ],
};

export const GROUPS = {
  kahve: { name: 'Kahverengi', color: '#8d6e63', ink: '#fff', house: 50 },
  mavi: { name: 'Açık mavi', color: '#4fc3f7', ink: '#1b1d24', house: 60 },
  turuncu: { name: 'Turuncu', color: '#fb8c00', ink: '#1b1d24', house: 100 },
  kirmizi: { name: 'Kırmızı', color: '#e53935', ink: '#fff', house: 120 },
  lacivert: { name: 'Lacivert', color: '#283593', ink: '#fff', house: 160 },
};
export const HOUSE_MULT = [1, 4, 10, 20]; // rent multiplier by houses (0 = base, doubled for a full pair)
export const TRANSPORT_RENT = [0, 25, 60];
export const GO_BONUS = 100;
export const JAIL_FEE = 50;
export const MAX_HOUSES = 3;
export const BUYOUT_MULT = 2; // a split pair: the owner of one city may buy the other from the opponent at twice its price
export const MAX_ROUNDS = 40; // "until bankruptcy" still stops here: with split colour pairs nobody may ever go broke
export const JAIL = 5;

// the 20 squares, starting at Başla and running clockwise round the board
export const BOARD = [
  { kind: 'go', name: 'Başla' },
  { kind: 'city', name: 'Sinop', price: 60, group: 'kahve' },
  { kind: 'chance', name: 'Şans' },
  { kind: 'city', name: 'Kastamonu', price: 60, group: 'kahve' },
  { kind: 'tax', name: 'Gelir Vergisi', amount: 100 },
  { kind: 'jail', name: 'Kodes' },
  { kind: 'city', name: 'Eskişehir', price: 100, group: 'mavi' },
  { kind: 'transport', name: 'Gar', price: 150, acc: 'Garı' },
  { kind: 'city', name: 'Bursa', price: 120, group: 'mavi' },
  { kind: 'chance', name: 'Şans' },
  { kind: 'parking', name: 'Otopark' },
  { kind: 'city', name: 'Antalya', price: 160, group: 'turuncu' },
  { kind: 'transport', name: 'Havalimanı', price: 150, acc: 'Havalimanını' },
  { kind: 'city', name: 'Muğla', price: 180, group: 'turuncu' },
  { kind: 'chance', name: 'Şans' },
  { kind: 'gotojail', name: 'Kodese Gir' },
  { kind: 'city', name: 'İzmir', price: 220, group: 'kirmizi' },
  { kind: 'city', name: 'Ankara', price: 240, group: 'kirmizi' },
  { kind: 'city', name: 'Bodrum', price: 280, group: 'lacivert' },
  { kind: 'city', name: 'İstanbul', price: 320, group: 'lacivert' },
];
export const N = BOARD.length;
export const baseRent = (pos) => Math.round(BOARD[pos].price / 10);
/** "Sinop'u", "İstanbul'u" — the transport squares are common nouns: "Garı", "Havalimanını". */
export const accusative = (sq) => sq.acc || nameSuffix(sq.name, 'i');

export const CARDS = [
  { text: 'Başla\'ya ilerle.', go: 0 },
  { text: 'Banka hatası lehine: ₺100 al.', cash: 100 },
  { text: 'Doktor masrafı: ₺50 öde.', cash: -50 },
  { text: 'Doğum günün! Rakibinden ₺30 al.', fromOpp: 30 },
  { text: 'Hız cezası: ₺20 öde.', cash: -20 },
  { text: 'Doğruca kodese gir.', jail: true },
  { text: '3 kare geri git.', back: 3 },
  { text: 'En yakın ulaşım karesine ilerle.', nearestTransport: true },
  { text: 'Ev bakımı: ev başına ₺20 öde.', perHouse: 20 },
  { text: 'Piyangodan ₺150 kazandın.', cash: 150 },
  { text: 'İstanbul\'a ilerle.', go: 19 },
  { text: 'Vergi iadesi: ₺50 al.', cash: 50 },
];

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const rounds = [0, 6, 10, 15].includes(Number(options.rounds)) ? Number(options.rounds) : 10;
  const cash = [1000, 1500].includes(Number(options.cash)) ? Number(options.cash) : 1000;
  const seed = Number(options.seed) || 1;
  return {
    id: String(options.seed ?? ''),
    seed,
    rounds,
    cash: [cash, cash],
    pos: [0, 0],
    owner: BOARD.map(() => null),   // player index owning each square
    houses: BOARD.map(() => 0),
    jail: [null, null],             // null, or failed attempts while in jail
    turn: seed % 2,
    phase: 'roll',                  // roll | buy | act | over
    doubles: 0,                     // doubles in a row this turn
    rollCount: 0,
    dice: null,                     // [d1, d2] of the last roll
    deck: shuffle(createRng((seed * 31 + 7) >>> 0), CARDS.map((_, i) => i)),
    drawn: 0,
    played: [0, 0],                 // turns completed by each player
    log: [],                        // latest events, newest last (kept short)
    last: null,                     // { player, path, n } for the token replay
    n: 0,
    result: null,
  };
}

export function rollDice(seed, n) {
  const r = createRng(((Number(seed) || 1) * 7 + n * 7919) >>> 0);
  return [1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6)];
}

export const ownsGroup = (state, p, group) => BOARD.every((sq, i) => sq.group !== group || state.owner[i] === p);
export const transportsOwned = (state, p) => BOARD.reduce((n, sq, i) => n + (sq.kind === 'transport' && state.owner[i] === p ? 1 : 0), 0);

export function rentOf(state, pos) {
  const sq = BOARD[pos];
  const o = state.owner[pos];
  if (o == null) return 0;
  if (sq.kind === 'transport') return TRANSPORT_RENT[transportsOwned(state, o)];
  const h = state.houses[pos];
  if (h > 0) return baseRent(pos) * HOUSE_MULT[h];
  return baseRent(pos) * (ownsGroup(state, o, sq.group) ? 2 : 1);
}

export function netWorth(state, p) {
  let v = state.cash[p];
  BOARD.forEach((sq, i) => {
    if (state.owner[i] !== p) return;
    v += sq.price;
    if (sq.group) v += state.houses[i] * GROUPS[sq.group].house;
  });
  return v;
}

/** Standing on the opponent's city whose pair-mate p owns: p may buy it from them at BUYOUT_MULT × price. */
export function canBuyOut(state, p, pos) {
  const sq = BOARD[pos];
  return sq.kind === 'city' && state.owner[pos] === 1 - p && !state.houses[pos]
    && BOARD.some((o, i) => i !== pos && o.group === sq.group && state.owner[i] === p)
    && state.cash[p] >= sq.price * BUYOUT_MULT;
}

export function canBuild(state, p, pos) {
  const sq = BOARD[pos];
  return sq.kind === 'city' && state.owner[pos] === p && ownsGroup(state, p, sq.group)
    && state.houses[pos] < MAX_HOUSES && state.cash[p] >= GROUPS[sq.group].house;
}

// ------------------------------------------------------------------ engine helpers (mutate a copy)
const clone = (s) => ({ ...s, cash: s.cash.slice(), pos: s.pos.slice(), owner: s.owner.slice(), houses: s.houses.slice(), jail: s.jail.slice(), played: s.played.slice(), log: s.log.slice() });
const note = (s, text) => { s.log.push(text); if (s.log.length > 6) s.log.shift(); };

/** Pay `amount` (to the opponent when `toOpp`), selling houses then properties if needed. Returns false on bankruptcy. */
function pay(s, p, amount, toOpp, players) {
  const opp = 1 - p;
  if (s.cash[p] < amount) {
    // sell houses first (most valuable groups first), then properties (cheapest first), at half price
    const mine = BOARD.map((sq, i) => i).filter((i) => s.owner[i] === p);
    for (const i of mine.slice().sort((a, b) => BOARD[b].price - BOARD[a].price)) {
      while (s.houses[i] > 0 && s.cash[p] < amount) {
        s.houses[i] -= 1;
        s.cash[p] += GROUPS[BOARD[i].group].house / 2;
        note(s, `${players[p]} ${nameSuffix(BOARD[i].name, 'de')}ki bir evi bankaya sattı (₺${GROUPS[BOARD[i].group].house / 2}).`);
      }
    }
    for (const i of mine.slice().sort((a, b) => BOARD[a].price - BOARD[b].price)) {
      if (s.cash[p] >= amount) break;
      // a property can only be sold once its group has no houses left
      if (BOARD[i].group && BOARD.some((sq, k) => sq.group === BOARD[i].group && s.houses[k] > 0)) continue;
      s.owner[i] = null;
      s.cash[p] += BOARD[i].price / 2;
      note(s, `${players[p]} ${BOARD[i].name} mülkünü bankaya sattı (₺${BOARD[i].price / 2}).`);
    }
  }
  if (s.cash[p] < amount) {
    if (toOpp) s.cash[opp] += s.cash[p];
    s.cash[p] = 0;
    s.phase = 'over';
    s.result = { winner: opp, reason: 'bankrupt' };
    note(s, `${players[p]} iflas etti!`);
    return false;
  }
  s.cash[p] -= amount;
  if (toOpp) s.cash[opp] += amount;
  return true;
}

/** Move forward `steps` squares (negative = backwards), collecting the Başla bonus when passing it. */
function advance(s, p, steps, path, players) {
  const dir = steps < 0 ? -1 : 1;
  for (let k = 0; k < Math.abs(steps); k++) {
    s.pos[p] = (s.pos[p] + dir + N) % N;
    path.push(s.pos[p]);
    if (dir > 0 && s.pos[p] === 0) { s.cash[p] += GO_BONUS; note(s, `${players[p]} Başla'dan geçti: +₺${GO_BONUS}.`); }
  }
}

function sendToJail(s, p, path, players) {
  s.pos[p] = JAIL;
  path.push(JAIL);
  s.jail[p] = 0;
  s.doubles = 0;
  s.phase = 'act';
  note(s, `${players[p]} kodese girdi.`);
}

/** Resolve the square the player stands on (rent, tax, cards, buying). */
function land(s, p, path, players, depth = 0) {
  const pos = s.pos[p];
  const sq = BOARD[pos];
  const opp = 1 - p;
  if (sq.kind === 'city' || sq.kind === 'transport') {
    const o = s.owner[pos];
    if (o == null) {
      if (s.cash[p] >= sq.price) { s.phase = 'buy'; return; }
      note(s, `${nameSuffix(players[p], 'in')} ${sq.name} için yeterli parası yok.`);
    } else if (o === opp) {
      const rent = rentOf(s, pos);
      note(s, `${players[p]}, ${nameSuffix(players[opp], 'e')} ${sq.name} kirası ödedi: ₺${rent}.`);
      if (!pay(s, p, rent, true, players)) return;
      if (canBuyOut(s, p, pos)) s.phase = 'buy';
    }
  } else if (sq.kind === 'tax') {
    note(s, `${players[p]} vergi ödedi: ₺${sq.amount}.`);
    if (!pay(s, p, sq.amount, false, players)) return;
  } else if (sq.kind === 'gotojail') {
    sendToJail(s, p, path, players);
    return;
  } else if (sq.kind === 'chance' && depth < 2) {
    const card = CARDS[s.deck[s.drawn % s.deck.length]];
    s.drawn += 1;
    note(s, `Şans: ${card.text}`);
    if (card.cash > 0) s.cash[p] += card.cash;
    else if (card.cash < 0) { if (!pay(s, p, -card.cash, false, players)) return; }
    else if (card.fromOpp) { if (!pay(s, opp, card.fromOpp, true, players)) return; }
    else if (card.perHouse) {
      const total = s.houses.reduce((a, h, i) => a + (s.owner[i] === p ? h : 0), 0) * card.perHouse;
      if (total && !pay(s, p, total, false, players)) return;
    } else if (card.jail) { sendToJail(s, p, path, players); return; }
    else if (card.back) { advance(s, p, -card.back, path, players); land(s, p, path, players, depth + 1); return; }
    else if (card.go != null) { advance(s, p, (card.go - s.pos[p] + N) % N || N, path, players); land(s, p, path, players, depth + 1); return; }
    else if (card.nearestTransport) {
      let k = 1;
      while (BOARD[(s.pos[p] + k) % N].kind !== 'transport') k += 1;
      advance(s, p, k, path, players);
      land(s, p, path, players, depth + 1);
      return;
    }
  }
}

/** After a move: roll again on doubles, otherwise wait for "Sırayı ver". */
function afterMove(s) {
  if (s.phase === 'over' || s.phase === 'buy') return;
  s.phase = s.dice && s.dice[0] === s.dice[1] && s.jail[s.turn] == null && s.doubles > 0 ? 'roll' : 'act';
}

function endTurn(s, players) {
  const p = s.turn;
  s.played[p] += 1;
  s.doubles = 0;
  const limit = s.rounds || MAX_ROUNDS;
  if (s.played[0] >= limit && s.played[1] >= limit) {
    const a = netWorth(s, 0);
    const b = netWorth(s, 1);
    s.phase = 'over';
    s.result = a === b ? { draw: true, reason: 'rounds' } : { winner: a > b ? 0 : 1, reason: 'rounds' };
    note(s, `Turlar bitti: ${players[0]} ₺${a}, ${players[1]} ₺${b}.`);
    return;
  }
  s.turn = 1 - p;
  s.phase = 'roll';
}

const PLAYERS = ['Oyuncu 1', 'Oyuncu 2'];

export function applyMove(state, player, move, ctx = {}) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.phase === 'over') fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  const players = ctx.players || PLAYERS;
  const s = clone(state);
  const p = player;
  const path = [];
  switch (move.type) {
    case 'roll': {
      if (s.phase !== 'roll') fail('Şimdi zar atılmaz');
      const dice = rollDice(s.seed, s.rollCount);
      s.rollCount += 1;
      s.dice = dice;
      const isDouble = dice[0] === dice[1];
      if (s.jail[p] != null) {
        if (isDouble) {
          s.jail[p] = null;
          note(s, `${players[p]} ${dice[0]}-${dice[1]} çift attı, kodesten çıktı.`);
          s.doubles = 0; // doubles out of jail do not give another roll
          advance(s, p, dice[0] + dice[1], path, players);
          land(s, p, path, players);
          if (s.phase !== 'over' && s.phase !== 'buy') s.phase = 'act';
        } else if (s.jail[p] >= 2) {
          note(s, `${players[p]} üçüncü denemede çift atamadı: ₺${JAIL_FEE} ödeyip çıkıyor.`);
          if (!pay(s, p, JAIL_FEE, false, players)) break;
          s.jail[p] = null;
          advance(s, p, dice[0] + dice[1], path, players);
          land(s, p, path, players);
          if (s.phase !== 'over' && s.phase !== 'buy') s.phase = 'act';
        } else {
          s.jail[p] += 1;
          note(s, `${players[p]} çift atamadı (${dice[0]}-${dice[1]}), kodeste kaldı.`);
          s.phase = 'act';
        }
        break;
      }
      s.doubles = isDouble ? s.doubles + 1 : 0;
      if (s.doubles >= 3) {
        note(s, `${players[p]} üst üste üç çift attı!`);
        sendToJail(s, p, path, players);
        break;
      }
      advance(s, p, dice[0] + dice[1], path, players);
      land(s, p, path, players);
      afterMove(s);
      break;
    }
    case 'payJail': {
      if (s.phase !== 'roll' || s.jail[p] == null) fail('Kodeste değilsin');
      if (s.cash[p] < JAIL_FEE) fail('Paran yetmiyor');
      s.cash[p] -= JAIL_FEE;
      s.jail[p] = null;
      note(s, `${players[p]} ₺${JAIL_FEE} ödeyip kodesten çıktı.`);
      break;
    }
    case 'buy': {
      if (s.phase !== 'buy') fail('Satın alınacak bir şey yok');
      const pos = s.pos[p];
      const sq = BOARD[pos];
      if (s.owner[pos] === 1 - p && canBuyOut(s, p, pos)) {
        const cost = sq.price * BUYOUT_MULT;
        s.cash[p] -= cost;
        s.cash[1 - p] += cost;
        s.owner[pos] = p;
        note(s, `${players[p]} ${accusative(sq)} ${nameSuffix(players[1 - p], 'de')}n satın aldı (₺${cost}): ${GROUPS[sq.group].name.toLowerCase()} çift tamam!`);
      } else {
        if (s.owner[pos] != null || s.cash[p] < sq.price) fail('Satın alınamaz');
        s.cash[p] -= sq.price;
        s.owner[pos] = p;
        note(s, `${players[p]} ${accusative(sq)} aldı (₺${sq.price}).`);
      }
      s.phase = 'buy-done';
      afterMove(s);
      if (s.phase === 'buy-done') s.phase = 'act';
      break;
    }
    case 'pass': {
      if (s.phase !== 'buy') fail('Geçilecek bir şey yok');
      note(s, `${players[p]} ${accusative(BOARD[s.pos[p]])} almadı.`);
      s.phase = 'buy-done';
      afterMove(s);
      if (s.phase === 'buy-done') s.phase = 'act';
      break;
    }
    case 'build': {
      if (s.phase !== 'roll' && s.phase !== 'act') fail('Şimdi ev kurulmaz');
      const pos = Number(move.pos);
      if (!Number.isInteger(pos) || pos < 0 || pos >= N || !canBuild(s, p, pos)) fail('Buraya ev kurulamaz');
      const cost = GROUPS[BOARD[pos].group].house;
      s.cash[p] -= cost;
      s.houses[pos] += 1;
      note(s, `${players[p]} ${nameSuffix(BOARD[pos].name, 'e')} ev kurdu (₺${cost}).`);
      break;
    }
    case 'sellHouse': {
      if (s.phase !== 'roll' && s.phase !== 'act') fail('Şimdi ev satılmaz');
      const pos = Number(move.pos);
      if (!Number.isInteger(pos) || s.owner[pos] !== p || !(s.houses[pos] > 0)) fail('Satılacak ev yok');
      const back = GROUPS[BOARD[pos].group].house / 2;
      s.houses[pos] -= 1;
      s.cash[p] += back;
      note(s, `${players[p]} ${nameSuffix(BOARD[pos].name, 'de')}ki bir evi sattı (₺${back}).`);
      break;
    }
    case 'end': {
      if (s.phase !== 'act') fail(s.phase === 'buy' ? 'Önce satın al ya da geç' : 'Önce zar at');
      endTurn(s, players);
      break;
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  if (path.length) { s.n = (state.n || 0) + 1; s.last = { player: p, from: state.pos[p], path, n: s.n }; }
  return s;
}

export function getTurn(state) {
  if (state.phase === 'over') return null;
  return { player: state.turn, private: false };
}

export function getResult(state) {
  if (state.phase !== 'over' || !state.result) return null;
  return state.result.draw ? { draw: true } : { winner: state.result.winner };
}

// ------------------------------------------------------------------ render
const TOKEN = ['#e53935', '#1e88e5'];
const STEP_MS = { normal: 170, fast: 80 };
const replayed = new Map(); // `${id}:${n}` -> start time | 'done'
let replayedFor = null;
// The main button changes meaning in place ("Sırayı ver" becomes the next player's "Zar at"):
// taps in the first moments after a step are ignored so a double tap cannot act twice.
const TAP_GUARD_MS = 350;
let armed = { key: '', at: 0 };

/** Grid cell (row, col) of a square on the 6×6 ring: Başla bottom-right, clockwise. */
export function cellOf(i) {
  if (i <= 5) return [6, 6 - i];          // bottom row, right to left
  if (i <= 10) return [6 - (i - 5), 1];   // left column, bottom to top
  if (i <= 15) return [1, 1 + (i - 10)];  // top row, left to right
  return [1 + (i - 15), 6];               // right column, top to bottom
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  if (state.rollCount) diceOnce(`bl:${state.id}:${state.rollCount}`);
  const players = ctx.players || PLAYERS;
  const online = ctx.mode === 'online';
  const anim = (ctx.options && ctx.options.anim) || 'normal';
  if (replayedFor !== state.id) { replayed.clear(); replayedFor = state.id; }
  const p = state.turn;
  const mine = state.phase !== 'over' && (!online || viewer === p);
  // token replay: the mover's token hops along last.path
  const L = state.last;
  const key = L ? `${state.id}:${L.n}` : '';
  let animating = !!(L && anim !== 'off' && replayed.get(key) !== 'done' && L.path.length);
  if (animating && !replayed.has(key)) replayed.set(key, Date.now());
  const stepMs = STEP_MS[anim] || STEP_MS.normal;
  const stepKey = `${state.id}:${state.rollCount}:${state.phase}:${state.turn}:${state.played.join()}:${state.jail.join()}`;
  if (armed.key !== stepKey) armed = { key: stepKey, at: Date.now() };
  const act = (move) => { if (Date.now() - armed.at >= TAP_GUARD_MS) sendMove(move); };

  const board = el('div', { class: `bl-board${animating ? ' animating' : ''}` });
  const cells = [];
  BOARD.forEach((sq, i) => {
    const [r, c] = cellOf(i);
    const o = state.owner[i];
    const g = sq.group ? GROUPS[sq.group] : null;
    const corner = i % 5 === 0;
    const label = sq.kind === 'chance' ? '❓' : sq.kind === 'tax' ? '💸' : sq.kind === 'transport' ? (sq.name === 'Gar' ? '🚆' : '✈️') : sq.kind === 'go' ? '⬅️' : sq.kind === 'jail' ? '🔒' : sq.kind === 'parking' ? '🅿️' : sq.kind === 'gotojail' ? '👮' : '';
    const cell = el('div', {
      class: `bl-cell ${corner ? 'corner' : ''} ${o != null ? `own${o}` : ''}`,
      style: { gridRow: String(r), gridColumn: String(c) },
      'aria-label': `${sq.name}${sq.price ? `, ₺${sq.price}` : ''}${o != null ? `, sahibi ${players[o]}` : ''}${state.houses[i] ? `, ${state.houses[i]} ev` : ''}`,
    },
    g ? el('div', { class: 'bl-band', style: { color: g.ink } }, fillCanvas(g.color, 'bl-band-bg'), el('span', {}, state.houses[i] ? '⌂'.repeat(state.houses[i]) : '')) : null,
    el('div', { class: 'bl-name' }, label ? `${label} ${sq.name}` : sq.name),
    sq.price ? el('div', { class: 'bl-price' }, o != null ? `kira ${rentOf(state, i)}` : `₺${sq.price}`) : null,
    el('div', { class: 'bl-tokens' }));
    cells[i] = cell;
    board.append(cell);
  });
  const placeTokens = (pos) => {
    cells.forEach((c) => c.querySelector('.bl-tokens').replaceChildren());
    [0, 1].forEach((q) => cells[pos[q]].querySelector('.bl-tokens').append(el('span', { class: `bl-token t${q}`, title: players[q] }, discCanvas(TOKEN[q], { rim: '#fff', size: 40 }))));
  };
  const center = el('div', { class: 'bl-center' },
    el('div', { class: 'bl-dice', 'aria-label': state.dice ? `Zar: ${state.dice[0]} ve ${state.dice[1]}` : 'Henüz zar atılmadı' },
      state.dice ? state.dice.map((d) => el('span', { class: 'bl-die' }, String(d))) : el('span', { class: 'bl-die idle' }, '🎲')),
    el('div', { class: 'bl-log' }, state.log.slice(-3).map((t) => el('div', {}, t))),
  );
  board.append(center);
  placeTokens(state.pos);

  const money = el('div', { class: 'bl-money' }, [0, 1].map((q) => el('div', { class: `bl-player ${state.turn === q && state.phase !== 'over' ? 'active' : ''}` },
    keyDot(TOKEN[q]),
    el('strong', {}, players[q]), ` ₺${state.cash[q]}`,
    el('span', { class: 'muted' }, ` · varlık ₺${netWorth(state, q)}${state.jail[q] != null ? ' · kodeste' : ''}`))));

  let status;
  if (state.phase === 'over') {
    const R = state.result;
    status = R.draw ? 'Berabere!' : R.reason === 'bankrupt' ? `${players[R.winner]} kazandı: rakip iflas etti!` : `${players[R.winner]} kazandı: varlık ₺${netWorth(state, R.winner)} – ₺${netWorth(state, 1 - R.winner)}`;
  } else if (mine) status = `${players[p]}, sıra sende`;
  else status = `${players[p]} oynuyor…`;
  const roundInfo = state.rounds ? `Tur ${Math.min(state.played[p] + 1, state.rounds)} / ${state.rounds}` : `Tur ${Math.min(state.played[p] + 1, MAX_ROUNDS)} · iflasa kadar (en çok ${MAX_ROUNDS})`;

  // actions
  const actions = el('div', { class: 'bl-actions' });
  const sq = BOARD[state.pos[p]];
  if (mine && !animating) {
    if (state.phase === 'roll') {
      if (state.jail[p] != null) {
        actions.append(
          el('button', { type: 'button', class: 'btn btn-primary', onClick: () => act({ type: 'roll' }) }, `Çift atmayı dene (${(state.jail[p] || 0) + 1}/3)`),
          el('button', { type: 'button', class: 'btn btn-secondary', disabled: state.cash[p] < JAIL_FEE, onClick: () => act({ type: 'payJail' }) }, `₺${JAIL_FEE} öde, çık`),
        );
      } else {
        actions.append(el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', onClick: () => act({ type: 'roll' }) }, state.doubles > 0 ? 'Çift! Tekrar zar at' : 'Zar at'));
      }
    } else if (state.phase === 'buy') {
      const buyout = state.owner[state.pos[p]] === 1 - p;
      actions.append(
        buyout ? el('p', { class: 'hint bl-offer' }, `${GROUPS[sq.group].name} çiftin öbür şehri sende: ${accusative(sq)} ${nameSuffix(players[1 - p], 'de')}n iki katı fiyatına alıp çifti tamamlayabilirsin.`) : null,
        el('button', { type: 'button', class: 'btn btn-primary', onClick: () => act({ type: 'buy' }) }, buyout ? `${accusative(sq)} satın al (₺${sq.price * BUYOUT_MULT})` : `${accusative(sq)} al (₺${sq.price})`),
        el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => act({ type: 'pass' }) }, 'Alma'),
      );
    } else if (state.phase === 'act') {
      actions.append(el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', onClick: () => act({ type: 'end' }) }, 'Sırayı ver'));
    }
  }
  // own properties with build/sell buttons (only on your turn, before/after rolling)
  const canManage = mine && !animating && (state.phase === 'roll' || state.phase === 'act');
  const ownView = (q) => {
    const list = BOARD.map((s2, i) => i).filter((i) => state.owner[i] === q);
    if (!list.length) return el('p', { class: 'hint' }, `${players[q]}: henüz mülk yok.`);
    return el('div', { class: 'bl-props' }, el('div', { class: 'col-title' }, `${nameSuffix(players[q], 'in')} mülkleri`), list.map((i) => {
      const s2 = BOARD[i];
      const g = s2.group ? GROUPS[s2.group] : null;
      const full = g && ownsGroup(state, q, s2.group);
      return el('div', { class: 'bl-prop' },
        fillCanvas(g ? g.color : '#9e9e9e', 'bl-swatch'),
        el('span', { class: 'bl-pname' }, `${s2.name}${state.houses[i] ? ` ${'⌂'.repeat(state.houses[i])}` : ''}`),
        el('span', { class: 'muted' }, `kira ₺${rentOf(state, i)}${g && !full ? ' · çifti tamamla' : ''}`),
        canManage && q === p && g && full ? el('span', { class: 'bl-btns' },
          state.houses[i] ? el('button', { type: 'button', class: 'btn btn-small', 'aria-label': `${s2.name} ev sat`, onClick: () => sendMove({ type: 'sellHouse', pos: i }) }, '−') : null,
          state.houses[i] < MAX_HOUSES ? el('button', { type: 'button', class: 'btn btn-small btn-secondary', disabled: !canBuild(state, q, i), onClick: () => sendMove({ type: 'build', pos: i }) }, `+ev ₺${g.house}`) : null,
        ) : null);
    }));
  };
  const statusEl = el('div', { class: 'status-line' }, el('strong', {}, status), el('span', { class: 'muted' }, ` · ${roundInfo}`));
  draw(container, statusEl, money, board, actions, ownView(viewer), ownView(1 - viewer));
  if (!animating) return null;

  // ---- token replay
  const start = replayed.get(key);
  const timers = [];
  const startPos = state.pos.slice();
  startPos[L.player] = L.from;
  const due = Math.min(L.path.length, Math.floor((Date.now() - start) / stepMs));
  const show = (k) => { const pos = startPos.slice(); pos[L.player] = k === 0 ? L.from : L.path[k - 1]; placeTokens(pos); };
  show(due);
  statusEl.replaceChildren(el('strong', {}, `${players[L.player]} ilerliyor…`), el('span', { class: 'muted' }, ' (geçmek için dokun)'));
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    timers.forEach((t) => clearTimeout(t));
    replayed.set(key, 'done');
    if (container.isConnected) render(state, viewer, container, sendMove, ctx);
  };
  board.addEventListener('click', finish);
  for (let k = due + 1; k <= L.path.length; k++) timers.push(setTimeout(() => show(k), start + k * stepMs - Date.now()));
  timers.push(setTimeout(finish, start + (L.path.length + 1) * stepMs - Date.now()));
  return () => { done = true; timers.forEach((t) => clearTimeout(t)); };
}

export default { id: 'bilanco', meta, setup, applyMove, render, getTurn, getResult };
