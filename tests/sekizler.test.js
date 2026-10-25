import { test, assert } from './runner.js';
import game, { canPlay, cardPoints, handPoints, topCard, HAND } from '../games/sekizler.js';

test('sekizler: dağıtım, kart uyumu, puanlar', () => {
  const s = game.setup({ target: 100, seed: 3 });
  assert.equal(s.hands[0].length, HAND);
  assert.equal(s.hands[1].length, HAND);
  assert.equal(s.pile.length, 1);
  assert.ok(topCard(s).r !== 8, 'the first open card is never an eight');
  assert.equal(s.deck.length + 2 * HAND + 1, 52);
  assert.equal(s.suit, topCard(s).s);
  assert.equal(s.turn, 1, 'the non-dealer (dealer 0 deals first) plays first');
  assert.deepEqual(game.getTurn(s), { player: 1, private: true });
  const t = { ...s, pile: [{ r: 5, s: 1 }], suit: 1 };
  assert.ok(canPlay(t, { r: 9, s: 1 }) && canPlay(t, { r: 5, s: 3 }) && canPlay(t, { r: 8, s: 0 }));
  assert.ok(!canPlay(t, { r: 9, s: 0 }));
  assert.ok(!canPlay({ ...t, suit: 2 }, { r: 9, s: 1 }), 'after an eight only the named suit (or the rank) fits');
  assert.equal(cardPoints({ r: 8, s: 0 }), 50);
  assert.equal(cardPoints({ r: 12, s: 0 }), 10);
  assert.equal(cardPoints({ r: 1, s: 0 }), 1);
  assert.equal(handPoints([{ r: 8, s: 0 }, { r: 13, s: 1 }, { r: 7, s: 2 }]), 67);
});

test('sekizler: atma, sekiz, çekme, pas, deste karıştırma, el ve oyun sonu', () => {
  let s = game.setup({ target: 100, seed: 3 });
  // rig a position: player 1 to move, pile 5♥, hands known
  s = { ...s, turn: 1, pile: [{ r: 5, s: 1 }], suit: 1, hands: [[{ r: 2, s: 0 }, { r: 8, s: 3 }], [{ r: 9, s: 1 }, { r: 9, s: 0 }, { r: 8, s: 2 }]] };
  assert.throws(() => game.applyMove(s, 0, { type: 'play', card: 0 }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 1, { type: 'play', card: 1 }), 'uymuyor');
  assert.throws(() => game.applyMove(s, 1, { type: 'play', card: 2 }), 'renk seç');
  assert.throws(() => game.applyMove(s, 1, { type: 'pass' }), 'Önce bir kart çek');
  s = game.applyMove(s, 1, { type: 'play', card: 0 }); // 9♥
  assert.equal(topCard(s).r, 9);
  assert.equal(s.turn, 0);
  assert.equal(s.hands[1].length, 2);
  // player 0 has nothing that fits (2♠ no, 8♣ yes!) -> the eight fits, choose spades
  s = game.applyMove(s, 0, { type: 'play', card: 1, suit: 0 });
  assert.equal(s.suit, 0);
  assert.equal(topCard(s).r, 8);
  // player 1: 9♠ fits (suit), 8♦ fits
  s = game.applyMove(s, 1, { type: 'play', card: 0 });
  assert.equal(s.turn, 0);
  // player 0 holds 2♠ which fits spades (suit 0 after 9♠) -> play, hand empty -> round over, scores 8♦ = 50
  s = game.applyMove(s, 0, { type: 'play', card: 0 });
  assert.equal(s.phase, 'roundOver');
  assert.deepEqual(s.scores, [50, 0]);
  assert.deepEqual(s.lastRound, { winner: 0, points: 50 });
  assert.equal(game.getTurn(s), null);
  assert.throws(() => game.applyMove(s, 0, { type: 'draw' }), 'sonraki ele');
  s = game.applyMove(s, 1, { type: 'next' });
  assert.equal(s.phase, 'play');
  assert.equal(s.dealNo, 1);
  assert.equal(s.turn, 0, 'deal alternates: dealer 1 now, player 0 leads');
  assert.equal(s.hands[0].length, HAND);
  // drawing: one card per turn, then play it or pass
  const before = s.hands[0].length;
  const deckBefore = s.deck.length;
  s = game.applyMove(s, 0, { type: 'draw' });
  assert.equal(s.hands[0].length, before + 1);
  assert.equal(s.deck.length, deckBefore - 1);
  assert.equal(s.drew, true);
  assert.throws(() => game.applyMove(s, 0, { type: 'draw' }), 'bir kart çektin');
  s = game.applyMove(s, 0, { type: 'pass' });
  assert.equal(s.turn, 1);
  assert.equal(s.drew, false);
  // empty stock: the pile (minus its top) is reshuffled into the deck
  let r = { ...s, turn: 1, deck: [], pile: [{ r: 3, s: 0 }, { r: 4, s: 0 }, { r: 5, s: 1 }], suit: 1 };
  r = game.applyMove(r, 1, { type: 'draw' });
  assert.equal(r.pile.length, 1);
  assert.equal(topCard(r).r, 5);
  assert.equal(r.deck.length, 1);
  assert.equal(r.hands[1].length, s.hands[1].length + 1);
  assert.equal(r.shuffles, 1);
  // nothing left anywhere: pass without drawing is allowed
  let e = { ...s, turn: 1, deck: [], pile: [{ r: 5, s: 1 }], suit: 1 };
  assert.throws(() => game.applyMove(e, 1, { type: 'draw' }), 'kalmadı');
  e = game.applyMove(e, 1, { type: 'pass' });
  assert.equal(e.turn, 0);
  // target reached -> over; single-round target 0 ends after one round
  let g = { ...s, turn: 0, scores: [90, 0], pile: [{ r: 5, s: 1 }], suit: 1, hands: [[{ r: 5, s: 2 }], [{ r: 13, s: 0 }, { r: 8, s: 1 }]] };
  g = game.applyMove(g, 0, { type: 'play', card: 0 });
  assert.equal(g.phase, 'over');
  assert.deepEqual(g.scores, [150, 0]);
  assert.deepEqual(game.getResult(g), { winner: 0 });
  let one = { ...game.setup({ target: 0, seed: 4 }), turn: 0, pile: [{ r: 5, s: 1 }], suit: 1, hands: [[{ r: 5, s: 2 }], [{ r: 2, s: 0 }]] };
  one = game.applyMove(one, 0, { type: 'play', card: 0 });
  assert.equal(one.phase, 'over');
  assert.deepEqual(game.getResult(one), { winner: 0 });
});
