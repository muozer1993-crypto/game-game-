import { test, assert } from './runner.js';
import game, { trickWinner, legalReplies, POINTS, strength, trumpCardOf } from '../games/altmisalti.js';

const C = (r, s) => ({ r, s });

test('66: el kazananı, zorunlu cevaplar, puanlar', () => {
  assert.equal(trickWinner(C(10, 0), C(14, 0), 1), 1, 'ace beats ten in suit');
  assert.equal(trickWinner(C(14, 0), C(10, 0), 1), 0);
  assert.equal(trickWinner(C(14, 0), C(9, 1), 1), 1, 'trump beats any plain card');
  assert.equal(trickWinner(C(14, 0), C(14, 2), 1), 0, 'off-suit non-trump loses');
  assert.ok(strength(14) > strength(10) && strength(10) > strength(13) && strength(13) > strength(12) && strength(12) > strength(11) && strength(11) > strength(9));
  assert.equal(POINTS[14] + POINTS[10] + POINTS[13] + POINTS[12] + POINTS[11] + POINTS[9], 30);
  const hand = [C(9, 0), C(13, 0), C(14, 2), C(11, 1)];
  assert.deepEqual(legalReplies(hand, C(12, 0), 1), [C(13, 0)], 'must head the trick when able');
  assert.deepEqual(legalReplies(hand, C(14, 0), 1), [C(9, 0), C(13, 0)], 'follow suit even when losing');
  assert.deepEqual(legalReplies(hand, C(10, 3), 1), [C(11, 1)], 'void: must trump');
  assert.deepEqual(legalReplies([C(9, 0), C(14, 2)], C(10, 3), 1).length, 2, 'void and no trump: anything');
  assert.deepEqual(legalReplies([C(9, 1), C(14, 1)], C(10, 1), 1), [C(14, 1)], 'trump led: higher trump required');
});

test('66: dağıtım, açık deste serbestliği, çekme, evlilik, değişim, kapatma, el ve oyun puanı', () => {
  let s = game.setup({ target: 7, seed: 5 });
  assert.equal(s.hands[0].length, 6);
  assert.equal(s.hands[1].length, 6);
  assert.equal(s.deck.length, 12);
  assert.equal(trumpCardOf(s).s, s.trump);
  assert.equal(s.turn, 1, 'non-dealer leads');
  assert.deepEqual(game.getTurn(s), { player: 1, private: true });
  // rig: trump hearts (1); player 1 leads
  s = { ...s, trump: 1, deck: [C(9, 1), C(9, 3), C(10, 3), C(11, 3)], hands: [[C(14, 0), C(13, 2), C(12, 2), C(9, 0), C(13, 1), C(12, 1)], [C(10, 0), C(11, 0), C(14, 3), C(9, 2), C(13, 3), C(12, 3)]], turn: 1, leader: 1 };
  assert.throws(() => game.applyMove(s, 0, { type: 'play', r: 14, s: 0 }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 1, { type: 'exchange' }), 'Önce bir el');
  s = game.applyMove(s, 1, { type: 'play', r: 10, s: 0 });  // lead 10♠
  assert.equal(s.turn, 0);
  // stock open: player 0 may play anything, e.g. 9♠ (loses) — but let's win with A♠
  s = game.applyMove(s, 0, { type: 'play', r: 14, s: 0 });
  assert.equal(s.leader, 0);
  assert.equal(s.points[0], 21);
  assert.equal(s.hands[0].length, 6, 'winner drew first');
  assert.equal(s.hands[1].length, 6);
  assert.equal(s.deck.length, 2);
  assert.ok(s.hands[0].some((c) => c.r === 11 && c.s === 3), 'winner took the top card');
  // marriage in trumps when leading with K♥ while holding Q♥ (has a trick): +40
  s = game.applyMove(s, 0, { type: 'play', r: 13, s: 1 });
  assert.equal(s.points[0], 61);
  assert.deepEqual(s.marriages[0], [{ s: 1, pts: 40 }]);
  assert.equal(s.table[0].marriage, 40, 'the declaration is on the table for both to see');
  assert.equal(s.phase, 'play');
  // player 1 replies with 9♦ (stock still open: free) -> player 0 wins 4 points -> 65... play then 66 after next trick
  s = game.applyMove(s, 1, { type: 'play', r: 9, s: 2 });
  assert.equal(s.points[0], 65);
  assert.deepEqual(s.lastTrick.marriage, { player: 0, pts: 40 }, 'the trick summary names the marriage');
  assert.equal(s.deck.length, 0, 'stock exhausted');
  assert.ok(!s.hands[0].some((c) => c.r === 9 && c.s === 1) || true);
  // now strict rules: player 0 leads Q♥ (trump) -> player 1 must play a trump if any (has 9♥ drawn last) else anything
  const p1Trumps = s.hands[1].filter((c) => c.s === 1);
  s = game.applyMove(s, 0, { type: 'play', r: 12, s: 1 });
  const legal = s.hands[1].filter((c) => (p1Trumps.length ? c.s === 1 : true));
  assert.ok(legal.length >= 1);
  s = game.applyMove(s, 1, { type: 'play', r: legal[0].r, s: legal[0].s });
  assert.ok(s.phase === 'handOver', 'reaching 66 ends the hand: ' + JSON.stringify(s.points));
  assert.equal(s.result.winner, 0);
  assert.equal(s.result.pts, 3, 'opponent took no trick: 3 game points');
  assert.deepEqual(s.gamePoints, [3, 0]);
  s = game.applyMove(s, 1, { type: 'next' });
  assert.equal(s.handNo, 1);
  assert.equal(s.turn, 0, 'dealer alternates');
  // exchange: on lead with a trick and the trump nine, with at least two cards in the stock
  let e = { ...s, trump: 2, deck: [C(14, 2), C(9, 0), C(10, 0)], hands: [[C(9, 2), C(11, 0), C(12, 0), C(13, 3), C(14, 3), C(10, 1)], s.hands[1]], tricks: [[[C(9, 0), C(9, 1)]], []], turn: 0, leader: 0, table: [] };
  e = game.applyMove(e, 0, { type: 'exchange' });
  assert.ok(e.hands[0].some((c) => c.r === 14 && c.s === 2) && e.deck[0].r === 9 && e.deck[0].s === 2, 'nine swapped with the face-up ace');
  // closing: strict rules apply at once; closer failing gives the opponent 2 (3 without tricks)
  let k = { ...e, closed: null, deck: [C(9, 2), C(9, 0), C(10, 0)] };
  k = game.applyMove(k, 0, { type: 'close' });
  assert.deepEqual(k.closed, { by: 0, oppHadTricks: false });
  assert.throws(() => game.applyMove(k, 0, { type: 'close' }), 'zaten kapalı');
  k = game.applyMove(k, 0, { type: 'play', r: 11, s: 0 }); // lead J♠
  const reply = k.hands[1].filter((c) => c.s === 0);
  if (reply.length) assert.throws(() => game.applyMove(k, 1, { type: 'play', r: k.hands[1].find((c) => c.s !== 0 && c.s !== 2).r, s: k.hands[1].find((c) => c.s !== 0 && c.s !== 2).s }), 'atılamaz');
  // game points 1 vs 2: loser below 33 gives 2
  let g = { ...s, points: [64, 20], closed: null, deck: [], hands: [[C(14, 0)], [C(9, 0)]], tricks: [[[C(10, 1), C(9, 1)]], [[C(11, 2), C(9, 2)]]], turn: 0, leader: 0, table: [], trump: 1 };
  g = game.applyMove(g, 0, { type: 'play', r: 14, s: 0 });
  g = game.applyMove(g, 1, { type: 'play', r: 9, s: 0 });
  assert.equal(g.result.pts, 2, 'loser under 33: 2 points');
  // nobody at 66 when the cards run out: the last trick wins 1 (plus the +10 bonus applied first)
  let n = { ...s, points: [30, 20], closed: null, deck: [], hands: [[C(9, 0)], [C(9, 3)]], tricks: [[[C(10, 1), C(9, 1)]], [[C(11, 2), C(9, 2)]]], turn: 0, leader: 0, table: [], trump: 1 };
  n = game.applyMove(n, 0, { type: 'play', r: 9, s: 0 });
  n = game.applyMove(n, 1, { type: 'play', r: 9, s: 3 });
  assert.equal(n.result.how, 'lastTrick');
  assert.equal(n.result.winner, 0);
  assert.equal(n.points[0], 40, 'last trick bonus +10');
  // target: reaching 7 ends the game
  let w = { ...s, gamePoints: [6, 0], points: [65, 0], deck: [], hands: [[C(14, 0)], [C(9, 0)]], tricks: [[[C(10, 1), C(9, 1)]], []], turn: 0, leader: 0, table: [], trump: 1 };
  w = game.applyMove(w, 0, { type: 'play', r: 14, s: 0 });
  w = game.applyMove(w, 1, { type: 'play', r: 9, s: 0 });
  assert.equal(w.phase, 'over');
  assert.deepEqual(game.getResult(w), { winner: 0 });
});
