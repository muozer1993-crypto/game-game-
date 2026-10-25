import { test, assert } from './runner.js';
import game, { makeDeck, beats, canAttackWith, HAND } from '../games/durak.js';

const c = (r, s) => ({ r, s });
const base = () => game.setup({ seed: 5 });
/** A hand-made position: trump spades (s=0). */
function position({ hands, deck = [], attacker = 0, table = [], taking = false, phase = 'attack', discard = 0 }) {
  const s = base();
  return { ...s, trump: 0, trumpCard: c(6, 0), hands, deck, attacker, table, taking, phase, discard, limit: Math.min(6, hands[1 - attacker].length) };
}

test('durak: deste, dağıtım, koz, en küçük koz başlar', () => {
  const deck = makeDeck(1);
  assert.equal(deck.length, 36);
  assert.equal(new Set(deck.map((x) => `${x.r}${x.s}`)).size, 36);
  assert.ok(deck.every((x) => x.r >= 6 && x.r <= 14));
  const s = base();
  assert.equal(s.hands[0].length, HAND);
  assert.equal(s.hands[1].length, HAND);
  assert.equal(s.deck.length, 36 - 12);
  assert.deepEqual(s.trumpCard, s.deck[0], 'the trump card is the bottom of the deck');
  assert.equal(s.trump, s.trumpCard.s);
  const low = (p) => s.hands[p].filter((x) => x.s === s.trump).map((x) => x.r);
  const m0 = Math.min(...low(0), 99);
  const m1 = Math.min(...low(1), 99);
  if (m0 !== m1) assert.equal(s.attacker, m0 < m1 ? 0 : 1, 'lowest trump attacks first');
  assert.deepEqual(game.getTurn(s), { player: s.attacker, private: true });
  assert.ok(beats(c(10, 1), c(7, 1), 0) && !beats(c(7, 1), c(10, 1), 0) && beats(c(6, 0), c(14, 1), 0) && !beats(c(14, 1), c(6, 0), 0) && beats(c(8, 0), c(7, 0), 0));
});

test('durak: saldırı, kırma, değer eşleme, bitti ve rol değişimi, çekme sırası', () => {
  let s = position({
    hands: [[c(7, 1), c(7, 2), c(9, 3), c(12, 1), c(13, 2), c(14, 3)], [c(8, 1), c(7, 3), c(10, 2), c(8, 0), c(11, 1), c(9, 1)]],
    deck: [c(6, 0), c(10, 3), c(11, 3)], // deck[0] = trump card, drawn last
  });
  assert.throws(() => game.applyMove(s, 1, { type: 'attack', card: c(8, 1) }), 'Saldıran sen değilsin');
  assert.throws(() => game.applyMove(s, 0, { type: 'attack', card: c(8, 1) }), 'elinde yok');
  assert.throws(() => game.applyMove(s, 0, { type: 'done' }), 'Önce bir kart at');
  s = game.applyMove(s, 0, { type: 'attack', card: c(7, 1) });
  assert.equal(s.phase, 'defend');
  assert.deepEqual(game.getTurn(s), { player: 1, private: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'attack', card: c(7, 2) }), 'Sıra savunanda');
  assert.throws(() => game.applyMove(s, 1, { type: 'beat', card: c(7, 3) }), 'kırmaz');
  s = game.applyMove(s, 1, { type: 'beat', card: c(8, 1) });
  assert.equal(s.phase, 'attack');
  assert.deepEqual(s.table, [{ a: c(7, 1), d: c(8, 1) }]);
  assert.throws(() => game.applyMove(s, 0, { type: 'attack', card: c(9, 3) }), 'aynı değerde');
  assert.ok(canAttackWith(s, c(8, 3)) && canAttackWith(s, c(7, 2)));
  s = game.applyMove(s, 0, { type: 'attack', card: c(7, 2) }); // matches the 7 on the table
  s = game.applyMove(s, 1, { type: 'beat', card: c(8, 0) });   // trump beats
  assert.throws(() => game.applyMove(s, 1, { type: 'done' }), 'Eli saldıran bitirir');
  s = game.applyMove(s, 0, { type: 'done' });
  assert.equal(s.discard, 4);
  assert.deepEqual(s.table, []);
  assert.equal(s.attacker, 1, 'the defender who beat everything attacks next');
  // drawing: the attacker (player 0) first, then the defender; deck had 3 cards
  assert.equal(s.hands[0].length, 6, 'attacker refilled to 6');
  assert.equal(s.hands[1].length, 5, 'defender got the rest: 4 + 1');
  assert.equal(s.deck.length, 0);
  assert.ok(s.hands[1].some((x) => x.r === 6 && x.s === 0), 'the trump card was drawn last');
  assert.equal(s.limit, 6);
});

test('durak: alma, atılan ek kartlar, kart sınırı, oyun sonu ve berabere', () => {
  let s = position({
    hands: [[c(9, 1), c(9, 2), c(10, 3), c(12, 1)], [c(7, 3), c(8, 2)]],
    deck: [],
  });
  assert.equal(s.limit, 2, 'no more attacks than the defender has cards');
  s = game.applyMove(s, 0, { type: 'attack', card: c(9, 1) });
  assert.throws(() => game.applyMove(s, 1, { type: 'done' }), 'Önce savunan oynasın');
  s = game.applyMove(s, 1, { type: 'take' });
  assert.equal(s.taking, true);
  assert.equal(s.phase, 'attack');
  s = game.applyMove(s, 0, { type: 'attack', card: c(9, 2) }); // thrown in while taking: hits the limit, bout ends
  assert.deepEqual(s.table, []);
  assert.equal(s.hands[1].length, 4, 'defender picked up both');
  assert.equal(s.attacker, 0, 'the attacker keeps attacking after a pick-up');
  assert.equal(s.over, false);
  // deck empty: the attacker runs out of cards -> the defender is the durak
  let e = position({ hands: [[c(14, 0)], [c(7, 3), c(8, 2)]], deck: [] });
  e = game.applyMove(e, 0, { type: 'attack', card: c(14, 0) });
  e = game.applyMove(e, 1, { type: 'take' });
  assert.equal(e.over, true, 'attacker has no cards left: the bout ends at once');
  assert.equal(e.loser, 1);
  assert.deepEqual(game.getResult(e), { winner: 0 });
  assert.throws(() => game.applyMove(e, 0, { type: 'done' }), 'Oyun bitti');
  // both run out together: draw
  let d = position({ hands: [[c(7, 1)], [c(8, 1)]], deck: [] });
  d = game.applyMove(d, 0, { type: 'attack', card: c(7, 1) });
  d = game.applyMove(d, 1, { type: 'beat', card: c(8, 1) });
  assert.equal(d.over, true);
  assert.equal(d.loser, null);
  assert.deepEqual(game.getResult(d), { draw: true });
  // the defender cannot take when nothing is undefended; the attacker cannot finish with an unbeaten card
  let f = position({ hands: [[c(7, 1), c(7, 2), c(10, 0)], [c(8, 1), c(8, 2), c(9, 0)]], deck: [c(6, 0)] });
  f = game.applyMove(f, 0, { type: 'attack', card: c(7, 1) });
  assert.throws(() => game.applyMove(f, 0, { type: 'done' }), 'Önce savunan oynasın');
  f = game.applyMove(f, 1, { type: 'beat', card: c(8, 1) });
  assert.throws(() => game.applyMove(f, 1, { type: 'take' }), 'Alınacak kart yok');
});
