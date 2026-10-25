import { test, assert } from './runner.js';
import game, { BOARD, N, GROUPS, CARDS, JAIL, JAIL_FEE, GO_BONUS, MAX_HOUSES, MAX_ROUNDS, BUYOUT_MULT, TRANSPORT_RENT, baseRent, rollDice, rentOf, netWorth, canBuild, canBuyOut, ownsGroup, cellOf, accusative } from '../games/bilanco.js';

const ctx = { players: ['Ali', 'Ayşe'] };
const play = (s, p, move) => game.applyMove(s, p, move, ctx);

/** First roll index n >= from whose dice satisfy `ok`, so a test can line up the roll it needs. */
function findRoll(seed, from, ok) {
  for (let n = from; n < from + 5000; n++) if (ok(rollDice(seed, n))) return n;
  throw new Error('no such roll');
}
/** A state where player `p` is about to roll a specific total (not a double unless asked). */
function rigged(seed, p, pos, ok, extra = {}) {
  const s = game.setup({ seed, rounds: 10 });
  const rollCount = findRoll(seed, 0, ok);
  return { ...s, turn: p, rollCount, pos: p === 0 ? [pos, 0] : [0, pos], ...extra };
}

test('bilanço: tahta 20 kare, 6×6 halkada her kareye bir hücre; çiftler ve fiyatlar', () => {
  assert.equal(N, 20);
  assert.equal(BOARD[0].kind, 'go');
  assert.equal(BOARD[JAIL].kind, 'jail');
  assert.equal(BOARD[15].kind, 'gotojail');
  const cells = BOARD.map((_, i) => cellOf(i).join(','));
  assert.equal(new Set(cells).size, 20, 'every square has its own cell');
  cells.forEach((c, i) => {
    const [r, col] = cellOf(i);
    assert.ok(r === 1 || r === 6 || col === 1 || col === 6, `square ${i} on the ring`);
    const [r2, c2] = cellOf((i + 1) % N);
    assert.equal(Math.abs(r - r2) + Math.abs(col - c2), 1, `squares ${i} and ${i + 1} touch`);
  });
  assert.deepEqual(cellOf(0), [6, 6], 'Başla bottom-right');
  for (const g of Object.keys(GROUPS)) assert.equal(BOARD.filter((sq) => sq.group === g).length, 2, `${g} is a pair`);
  assert.equal(BOARD.filter((sq) => sq.kind === 'transport').length, 2);
  assert.equal(baseRent(19), 32);
  assert.ok(CARDS.length >= 10);
});

test('bilanço: zarlar tohumdan, iki telefonda aynı; ilk oyuncu tohumdan', () => {
  assert.deepEqual(rollDice(9, 4), rollDice(9, 4));
  for (let n = 0; n < 200; n++) {
    const [a, b] = rollDice(3, n);
    assert.ok(a >= 1 && a <= 6 && b >= 1 && b <= 6);
  }
  assert.equal(game.setup({ seed: 4 }).turn, 0);
  assert.equal(game.setup({ seed: 5 }).turn, 1);
  const s = game.setup({ seed: 8, cash: 1500, rounds: 6 });
  assert.deepEqual(s.cash, [1500, 1500]);
  assert.equal(s.rounds, 6);
  assert.equal(game.setup({ seed: 8, rounds: 99 }).rounds, 10, 'unknown rounds fall back to 10');
  assert.equal(game.setup({ seed: 8, rounds: 0 }).rounds, 0, '0 = until bankruptcy');
});

test('bilanço: zar at, boş şehre gel, satın al, sırayı ver; sıra ve hata mesajları', () => {
  // Ali (0) on Başla rolls a non-double 3 → Kastamonu (60)
  let s = rigged(11, 0, 0, ([a, b]) => a + b === 3);
  assert.throws(() => play(s, 1, { type: 'roll' }), 'Sıra sende değil');
  assert.throws(() => play(s, 0, { type: 'end' }), 'Önce zar at');
  assert.throws(() => play(s, 0, { type: 'buy' }), 'Satın alınacak');
  s = play(s, 0, { type: 'roll' });
  assert.equal(s.pos[0], 3);
  assert.equal(s.phase, 'buy');
  assert.deepEqual(s.last.path, [1, 2, 3]);
  assert.throws(() => play(s, 0, { type: 'end' }), 'Önce satın al ya da geç');
  s = play(s, 0, { type: 'buy' });
  assert.equal(s.owner[3], 0);
  assert.equal(s.cash[0], 1000 - 60);
  assert.equal(s.phase, 'act');
  s = play(s, 0, { type: 'end' });
  assert.equal(s.turn, 1);
  assert.equal(s.phase, 'roll');
  assert.deepEqual(s.played, [1, 0]);
  assert.ok(s.log.some((t) => t.includes("Ali Kastamonu'yu aldı")));
  assert.equal(accusative(BOARD[7]), 'Garı');
  assert.equal(accusative(BOARD[12]), 'Havalimanını');
  assert.equal(accusative(BOARD[1]), "Sinop'u");
  // "Alma" leaves it unowned
  let t = rigged(11, 0, 0, ([a, b]) => a + b === 3);
  t = play(t, 0, { type: 'roll' });
  t = play(t, 0, { type: 'pass' });
  assert.equal(t.owner[3], null);
  assert.equal(t.phase, 'act');
});

test('bilanço: kira, çift tamamlanınca iki kat, ulaşım iki kare birlikte daha çok', () => {
  const s = game.setup({ seed: 2 });
  s.owner[1] = 1;
  assert.equal(rentOf(s, 1), 6);
  s.owner[3] = 1;
  assert.ok(ownsGroup(s, 1, 'kahve'));
  assert.equal(rentOf(s, 1), 12, 'full pair doubles');
  s.houses[1] = 2;
  assert.equal(rentOf(s, 1), 60, 'two houses = ×10');
  s.owner[7] = 0;
  assert.equal(rentOf(s, 7), TRANSPORT_RENT[1]);
  s.owner[12] = 0;
  assert.equal(rentOf(s, 7), TRANSPORT_RENT[2]);
  assert.equal(rentOf(s, 0), 0);
});

test('bilanço: rakibin mülküne gelen kira öder (çiftle iki kat, evle daha çok)', () => {
  // Ali at İstanbul (19) rolls a non-double 4 → passes Başla (+100) and lands on Kastamonu (3)
  let s = rigged(21, 0, 19, ([a, b]) => a !== b && a + b === 4);
  s = { ...s, owner: s.owner.slice(), houses: s.houses.slice() };
  s.owner[1] = 1; s.owner[3] = 1; s.houses[3] = 1;
  s = play(s, 0, { type: 'roll' });
  assert.equal(s.pos[0], 3);
  assert.equal(s.cash[0], 1000 + GO_BONUS - 24, 'Başla bonus, then 6×4 rent');
  assert.equal(s.cash[1], 1000 + 24);
  assert.equal(s.phase, 'act');
  assert.ok(s.log.some((t) => t.includes("Ali, Ayşe'ye Kastamonu kirası ödedi: ₺24")));
});

test('bilanço: bölünmüş çift — rakibin şehrini kiradan sonra iki katına alıp çifti tamamla', () => {
  // Ali owns Antalya (11); Ayşe owns Muğla (13). Ali at Otopark (10) rolls a non-double 3 → Muğla
  const owner = BOARD.map(() => null); owner[11] = 0; owner[13] = 1;
  let s = { ...rigged(91, 0, 10, ([a, b]) => a !== b && a + b === 3), owner };
  s = play(s, 0, { type: 'roll' });
  assert.equal(s.pos[0], 13);
  assert.equal(s.phase, 'buy', 'buyout offered after the rent');
  assert.deepEqual(s.cash, [1000 - 18, 1000 + 18]);
  assert.ok(canBuyOut(s, 0, 13));
  assert.throws(() => play(s, 0, { type: 'end' }), 'Önce satın al ya da geç');
  const bought = play(s, 0, { type: 'buy' });
  assert.equal(bought.owner[13], 0);
  assert.deepEqual(bought.cash, [1000 - 18 - 180 * BUYOUT_MULT, 1000 + 18 + 180 * BUYOUT_MULT]);
  assert.ok(ownsGroup(bought, 0, 'turuncu'));
  assert.equal(bought.phase, 'act');
  assert.ok(bought.log.at(-1).includes("Ali Muğla'yı Ayşe'den satın aldı (₺360)"), bought.log.at(-1));
  assert.ok(canBuild(bought, 0, 11), 'the pair is complete: houses allowed');
  const passed = play(s, 0, { type: 'pass' });
  assert.equal(passed.owner[13], 1);
  assert.equal(passed.phase, 'act');
  // no offer without the pair-mate, with houses on it, without the money, or on a transport square
  const o2 = BOARD.map(() => null); o2[13] = 1;
  let t = { ...rigged(91, 0, 10, ([a, b]) => a !== b && a + b === 3), owner: o2 };
  t = play(t, 0, { type: 'roll' });
  assert.equal(t.phase, 'act');
  let u = { ...rigged(91, 0, 10, ([a, b]) => a !== b && a + b === 3), owner, cash: [300, 1000] };
  u = play(u, 0, { type: 'roll' });
  assert.equal(u.phase, 'act', '282 left, 360 needed');
  const o3 = BOARD.map(() => null); o3[7] = 1; o3[12] = 0;
  let v = { ...rigged(92, 0, 3, ([a, b]) => a !== b && a + b === 4), owner: o3 };
  v = play(v, 0, { type: 'roll' });
  assert.equal(v.pos[0], 7);
  assert.equal(v.phase, 'act', 'transport squares cannot be bought out');
});

test('bilanço: ev kurma ve satma; tam çift, sınır ve para şartı', () => {
  let s = game.setup({ seed: 6 });
  s = { ...s, turn: 0, owner: s.owner.slice() };
  s.owner[6] = 0;
  assert.ok(!canBuild(s, 0, 6), 'needs the full pair');
  assert.throws(() => play(s, 0, { type: 'build', pos: 6 }), 'Buraya ev kurulamaz');
  s.owner[8] = 0;
  assert.ok(canBuild(s, 0, 6));
  for (let k = 0; k < MAX_HOUSES; k++) s = play(s, 0, { type: 'build', pos: 6 });
  assert.equal(s.houses[6], 3);
  assert.equal(s.cash[0], 1000 - 3 * GROUPS.mavi.house);
  assert.throws(() => play(s, 0, { type: 'build', pos: 6 }), 'Buraya ev kurulamaz');
  assert.ok(s.log.some((t) => t.includes("Eskişehir'e ev kurdu")));
  assert.equal(netWorth(s, 0), 1000 + 100 + 120, 'houses count at cost');
  s = play(s, 0, { type: 'sellHouse', pos: 6 });
  assert.equal(s.houses[6], 2);
  assert.equal(s.cash[0], 1000 - 3 * 60 + 30, 'sold back at half');
  assert.throws(() => play(s, 0, { type: 'sellHouse', pos: 8 }), 'Satılacak ev yok');
  assert.throws(() => play(s, 1, { type: 'build', pos: 6 }), 'Sıra sende değil');
  const poor = { ...s, cash: [10, 1000] };
  assert.throws(() => play(poor, 0, { type: 'build', pos: 8 }), 'Buraya ev kurulamaz');
});

test('bilanço: çift tekrar attırır, üç çift kodese; kodes: öde, çift dene, üçüncüde öde çık', () => {
  // a double from Başla that lands somewhere quiet → roll again
  const seed = 31;
  const n0 = findRoll(seed, 0, ([a, b]) => a === b && [4, 6, 10].includes(a + b) === false && a + b !== 2 * 2 + 0 && ![2, 9, 14, 15].includes(a + b));
  let s = { ...game.setup({ seed }), turn: 0, rollCount: n0 };
  s = play(s, 0, { type: 'roll' });
  if (s.phase === 'buy') s = play(s, 0, { type: 'pass' });
  assert.equal(s.phase, 'roll', 'double rolls again');
  assert.equal(s.turn, 0);
  assert.equal(s.doubles, 1);
  // three doubles in a row → jail
  let t = { ...game.setup({ seed }), turn: 0, doubles: 2, rollCount: findRoll(seed, 0, ([a, b]) => a === b) };
  t = play(t, 0, { type: 'roll' });
  assert.equal(t.pos[0], JAIL);
  assert.equal(t.jail[0], 0);
  assert.equal(t.phase, 'act');
  t = play(t, 0, { type: 'end' });
  assert.equal(t.turn, 1);
  // in jail: paying gets you out and you then roll normally
  let j = { ...game.setup({ seed }), turn: 0, pos: [JAIL, 0], jail: [0, null] };
  j = play(j, 0, { type: 'payJail' });
  assert.equal(j.jail[0], null);
  assert.equal(j.cash[0], 1000 - JAIL_FEE);
  assert.equal(j.phase, 'roll');
  // failing to roll a double keeps you in
  let k = { ...game.setup({ seed }), turn: 0, pos: [JAIL, 0], jail: [0, null], rollCount: findRoll(seed, 0, ([a, b]) => a !== b) };
  k = play(k, 0, { type: 'roll' });
  assert.equal(k.jail[0], 1);
  assert.equal(k.pos[0], JAIL);
  assert.equal(k.phase, 'act');
  // a double frees you and moves you, but gives no extra roll
  let d = { ...game.setup({ seed }), turn: 0, pos: [JAIL, 0], jail: [1, null], rollCount: findRoll(seed, 0, ([a, b]) => a === b && [7, 11].includes(JAIL + a + b)) };
  const dice = rollDice(seed, d.rollCount);
  d = play(d, 0, { type: 'roll' });
  assert.equal(d.jail[0], null);
  assert.equal(d.pos[0], JAIL + dice[0] + dice[1]);
  if (d.phase === 'buy') d = play(d, 0, { type: 'pass' });
  assert.ok(d.phase === 'act' || d.phase === 'over', 'no extra roll after leaving jail on a double');
  // third failed attempt: pay and move
  // (land on a quiet square: Eskişehir, Gar, Bursa, Otopark or Antalya — all free, so a buy offer at most)
  let f = { ...game.setup({ seed }), turn: 0, pos: [JAIL, 0], jail: [2, null], rollCount: findRoll(seed, 0, ([a, b]) => a !== b && [6, 7, 8, 10, 11].includes(JAIL + a + b)) };
  const fd = rollDice(seed, f.rollCount);
  f = play(f, 0, { type: 'roll' });
  assert.equal(f.jail[0], null);
  assert.equal(f.pos[0], JAIL + fd[0] + fd[1]);
  assert.equal(f.cash[0], 1000 - JAIL_FEE, 'paid the fee');
  // third attempt with no money and nothing to sell: bankrupt
  let z = { ...game.setup({ seed }), turn: 0, pos: [JAIL, 0], jail: [2, null], cash: [20, 900], rollCount: findRoll(seed, 0, ([a, b]) => a !== b) };
  z = play(z, 0, { type: 'roll' });
  assert.equal(z.phase, 'over');
  assert.deepEqual(game.getResult(z), { winner: 1 });
  assert.equal(z.cash[1], 900, 'a fee to the bank is not paid to the opponent');
  // paying out of jail needs the money
  assert.throws(() => play({ ...game.setup({ seed }), turn: 0, pos: [JAIL, 0], jail: [0, null], cash: [40, 900] }, 0, { type: 'payJail' }), 'Paran yetmiyor');
  assert.throws(() => play({ ...game.setup({ seed }), turn: 0 }, 0, { type: 'payJail' }), 'Kodeste değilsin');
  assert.ok(f.log.some((t2) => t2.includes('üçüncü denemede')));
});

test('bilanço: Kodese Gir karesi doğruca kodese götürür, Başla parası yok', () => {
  let s = rigged(41, 0, 11, ([a, b]) => a !== b && a + b === 4); // 11 + 4 = 15
  s = play(s, 0, { type: 'roll' });
  assert.equal(s.pos[0], JAIL);
  assert.equal(s.jail[0], 0);
  assert.equal(s.cash[0], 1000);
  assert.deepEqual(s.last.path, [12, 13, 14, 15, JAIL]);
});

test('bilanço: şans kartları (para, rakipten, geri, Başla, en yakın ulaşım, kodes, ev başına)', () => {
  const at = (cardIdx, pos = 2, extra = {}) => {
    // Ali stands 2 squares before a chance square and rolls a non-double 2… impossible (1+1); use 3 from one further back
    const seed = 51;
    const base = game.setup({ seed });
    const deck = [cardIdx, ...base.deck.filter((c) => c !== cardIdx)];
    const s = { ...base, deck, turn: 0, pos: [(pos - 3 + N) % N, 0], rollCount: findRoll(seed, 0, ([a, b]) => a !== b && a + b === 3), ...extra };
    return play(s, 0, { type: 'roll' });
  };
  const idx = (pred) => CARDS.findIndex(pred);
  let s = at(idx((c) => c.cash === 100));
  assert.equal(s.cash[0], 1000 + 100 - 0 + (s.last.path.includes(0) ? GO_BONUS : 0));
  s = at(idx((c) => c.cash === -50), 9);
  assert.equal(s.cash[0], 950);
  s = at(idx((c) => c.fromOpp), 9);
  assert.deepEqual(s.cash, [1030, 970]);
  s = at(idx((c) => c.back), 9); // 9 → 6 Eskişehir, free: buy
  assert.equal(s.pos[0], 6);
  assert.equal(s.phase, 'buy');
  s = at(idx((c) => c.go === 0), 9);
  assert.equal(s.pos[0], 0);
  assert.equal(s.cash[0], 1000 + GO_BONUS);
  s = at(idx((c) => c.nearestTransport), 14); // 14 → Gar (7) passing Başla
  assert.equal(s.pos[0], 7);
  assert.equal(s.cash[0], 1000 + GO_BONUS);
  assert.equal(s.phase, 'buy');
  s = at(idx((c) => c.jail), 9);
  assert.equal(s.pos[0], JAIL);
  assert.equal(s.jail[0], 0);
  const owner = BOARD.map(() => null); owner[1] = 0; owner[3] = 0;
  const houses = BOARD.map(() => 0); houses[1] = 2; houses[3] = 1;
  s = at(idx((c) => c.perHouse), 9, { owner, houses });
  assert.equal(s.cash[0], 1000 - 3 * 20);
  s = at(idx((c) => c.go === 19), 9); // straight to İstanbul, free: buy offer
  assert.equal(s.pos[0], 19);
  assert.equal(s.phase, 'buy');
  // the deck is drawn in order and cycles
  s = at(idx((c) => c.cash === 50), 9);
  assert.equal(s.drawn, 1);
});

test('bilanço: parası yetmeyen önce evi, sonra mülkü yarı fiyatına satar; yetmezse iflas', () => {
  const seed = 61;
  const roll = findRoll(seed, 0, ([a, b]) => a !== b && a + b === 3);
  // Ali has ₺10, Bursa+Eskişehir (one house on Bursa); lands on Ayşe's Kastamonu with 3 houses (rent 120)
  const owner = BOARD.map(() => null); owner[6] = 0; owner[8] = 0; owner[1] = 1; owner[3] = 1;
  const houses = BOARD.map(() => 0); houses[8] = 1; houses[3] = 3;
  let s = { ...game.setup({ seed }), turn: 0, pos: [0, 0], cash: [10, 500], owner, houses, rollCount: roll };
  assert.equal(rentOf(s, 3), 120);
  s = play(s, 0, { type: 'roll' });
  // house 30 → 40, Eskişehir 50 → 90, Bursa 60 → 150 ≥ 120
  assert.equal(s.houses[8], 0);
  assert.equal(s.owner[6], null);
  assert.equal(s.owner[8], null);
  assert.equal(s.cash[0], 150 - 120);
  assert.equal(s.cash[1], 620);
  assert.notEqual(s.phase, 'over');
  // no assets left: bankruptcy, opponent takes what's left and wins
  let b = { ...game.setup({ seed }), turn: 0, pos: [0, 0], cash: [10, 500], owner: owner.map((o, i) => (i === 1 || i === 3 ? 1 : null)), houses: houses.map((h, i) => (i === 3 ? 3 : 0)), rollCount: roll };
  b = play(b, 0, { type: 'roll' });
  assert.equal(b.phase, 'over');
  assert.deepEqual(game.getResult(b), { winner: 1 });
  assert.equal(b.result.reason, 'bankrupt');
  assert.deepEqual(b.cash, [0, 510]);
  assert.equal(game.getTurn(b), null);
  assert.throws(() => play(b, 1, { type: 'roll' }), 'Oyun bitti');
});

test('bilanço: tur sayısı dolunca varlığı çok olan kazanır; eşitlikte berabere', () => {
  let s = { ...game.setup({ seed: 70, rounds: 6 }), turn: 0, played: [6, 5], phase: 'act' };
  s = play({ ...s, turn: 1 }, 1, { type: 'end' });
  assert.equal(s.phase, 'over');
  assert.deepEqual(game.getResult(s), { draw: true });
  const owner = BOARD.map(() => null); owner[19] = 1;
  s = { ...game.setup({ seed: 70, rounds: 6 }), turn: 1, played: [6, 5], phase: 'act', owner };
  s = play(s, 1, { type: 'end' });
  assert.deepEqual(game.getResult(s), { winner: 1 });
  assert.ok(s.log.at(-1).includes('Turlar bitti'));
  // "until bankruptcy" goes on past 15 rounds but stops at MAX_ROUNDS
  s = { ...game.setup({ seed: 70, rounds: 0 }), turn: 1, played: [20, 19], phase: 'act' };
  s = play(s, 1, { type: 'end' });
  assert.equal(s.phase, 'roll');
  s = { ...game.setup({ seed: 70, rounds: 0 }), turn: 1, played: [MAX_ROUNDS, MAX_ROUNDS - 1], phase: 'act', owner };
  s = play(s, 1, { type: 'end' });
  assert.equal(s.phase, 'over');
  assert.deepEqual(game.getResult(s), { winner: 1 });
});

test('bilanço: vergi, ulaşım kirası ve doğum günü kartı (parası yetmeyen rakip mal satar)', () => {
  // Başla → Gelir Vergisi (4) with a non-double 4
  let t = rigged(81, 0, 0, ([a, b]) => a !== b && a + b === 4);
  t = play(t, 0, { type: 'roll' });
  assert.equal(t.pos[0], 4);
  assert.equal(t.cash[0], 900);
  assert.equal(t.cash[1], 1000, 'tax goes to the bank');
  // Ali lands on Ayşe's Gar (7) while she owns both transports: 60
  const owner = BOARD.map(() => null); owner[7] = 1; owner[12] = 1;
  let r = { ...rigged(82, 0, 3, ([a, b]) => a !== b && a + b === 4), owner };
  r = play(r, 0, { type: 'roll' });
  assert.equal(r.pos[0], 7);
  assert.deepEqual(r.cash, [1000 - TRANSPORT_RENT[2], 1000 + TRANSPORT_RENT[2]]);
  // birthday card: Ayşe has ₺10 and a house on Sinop — she sells the house (₺25) to pay ₺30
  const seed = 83;
  const base = game.setup({ seed });
  const card = CARDS.findIndex((c) => c.fromOpp);
  const own2 = BOARD.map(() => null); own2[1] = 1; own2[3] = 1;
  const houses = BOARD.map(() => 0); houses[1] = 1;
  let b = { ...base, deck: [card, ...base.deck.filter((c) => c !== card)], turn: 0, pos: [6, 0], cash: [1000, 10], owner: own2, houses, rollCount: findRoll(seed, 0, ([x, y]) => x !== y && x + y === 3) };
  b = play(b, 0, { type: 'roll' });
  assert.equal(b.pos[0], 9);
  assert.equal(b.houses[1], 0, 'house sold to pay');
  assert.deepEqual(b.cash, [1030, 10 + 25 - 30]);
});

const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v); }); return Object.freeze(o); };

test('bilanço: rastgele oyunlar kuralları bozmaz (para eksiye düşmez, saf hamleler, her oyun biter)', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const rounds = [10, 6, 15, 0][seed % 4];
    let s = game.setup({ seed, rounds, cash: seed % 3 ? 1000 : 1500 });
    let steps = 0;
    while (s.phase !== 'over' && steps < 6000) {
      const p = s.turn;
      let move;
      const mine = BOARD.map((_, i) => i).filter((i) => s.owner[i] === p);
      const b = BOARD.findIndex((_, i) => canBuild(s, p, i));
      const sell = mine.find((i) => s.houses[i] > 0);
      if (s.phase === 'buy') move = { type: (seed + steps) % 3 ? 'buy' : 'pass' };
      else if (b >= 0 && (seed + steps) % 2) move = { type: 'build', pos: b };
      else if (sell != null && (seed + steps) % 11 === 0) move = { type: 'sellHouse', pos: sell };
      else if (s.phase === 'act') move = { type: 'end' };
      else if (s.jail[p] != null && (seed + steps) % 4 === 0 && s.cash[p] >= JAIL_FEE) move = { type: 'payJail' };
      else move = { type: 'roll' };
      s = play(deepFreeze(s), p, move);
      steps += 1;
      assert.ok(s.cash[0] >= 0 && s.cash[1] >= 0, `cash never negative (seed ${seed})`);
      assert.ok(s.pos.every((x) => x >= 0 && x < N));
      s.houses.forEach((h, i) => {
        if (h > 0) assert.ok(ownsGroup(s, s.owner[i], BOARD[i].group), 'houses only on full pairs');
        assert.ok(h <= MAX_HOUSES);
      });
    }
    assert.equal(s.phase, 'over', `seed ${seed} finishes`);
    assert.ok(game.getResult(s));
    const limit = rounds || MAX_ROUNDS;
    assert.ok(s.played[0] <= limit && s.played[1] <= limit);
  }
});
