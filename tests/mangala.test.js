import { test, assert } from './runner.js';
import game, { legalPits } from '../games/mangala.js';

test('mangala: diziliş, dağıtma, bir taş bırakma kuralı', () => {
  let s = game.setup({ seed: 0 });
  assert.equal(s.pits.reduce((a, b) => a + b, 0), 48);
  assert.deepEqual(legalPits(s), [0, 1, 2, 3, 4, 5]);
  assert.throws(() => game.applyMove(s, 1, { type: 'sow', pit: 7 }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'sow', pit: 7 }), 'senin değil');
  // pit 2 has 4 stones: leave 1, sow 3 -> pits 3,4,5 get one each; last in 5 (own pit, not empty) -> turn passes
  s = game.applyMove(s, 0, { type: 'sow', pit: 2 });
  assert.deepEqual(s.pits.slice(0, 7), [4, 4, 1, 5, 5, 5, 0]);
  assert.equal(s.turn, 1);
  // pit 3 has 4: leave 1, sow 3 -> 4,5 and the store: extra turn
  let t = game.setup({ seed: 0 });
  t = game.applyMove(t, 0, { type: 'sow', pit: 3 });
  assert.equal(t.pits[6], 1);
  assert.equal(t.turn, 0, 'last stone in own store: play again');
  assert.equal(t.last.again, true);
  // single stone moves to the next pit (no "leave one" rule)
  let u = game.setup({ seed: 0 });
  u.pits = u.pits.slice(); u.pits[0] = 1;
  u = game.applyMove(u, 0, { type: 'sow', pit: 0 });
  assert.equal(u.pits[0], 0);
  assert.equal(u.pits[1], 5);
});

test('mangala: çift yakalama ve karşı kuyu yakalama, rakip haznesi atlanır', () => {
  // player 0 pit 5 with 3 stones: leave 1, sow 2 -> store (6) and pit 7 (opponent) which has 4 -> 5 odd: no capture
  let s = game.setup({ seed: 0 });
  s.pits = s.pits.slice(); s.pits[5] = 3;
  s = game.applyMove(s, 0, { type: 'sow', pit: 5 });
  assert.equal(s.pits[7], 5);
  assert.equal(s.last.captured, 0);
  // opponent pit with 3 stones becomes 4 (even) -> captured
  let c = game.setup({ seed: 0 });
  c.pits = c.pits.slice(); c.pits[5] = 3; c.pits[7] = 3;
  c = game.applyMove(c, 0, { type: 'sow', pit: 5 });
  assert.equal(c.pits[7], 0);
  assert.equal(c.pits[6], 1 + 4, 'store got the sown stone plus the captured four');
  assert.equal(c.last.captured, 4);
  // own empty pit capture: pit 0 has 2 stones -> leave 1, sow 1 into pit 1 which is empty -> opposite pit 11 (4 stones) captured + own stone
  let d = game.setup({ seed: 0 });
  d.pits = d.pits.slice(); d.pits[0] = 2; d.pits[1] = 0;
  d = game.applyMove(d, 0, { type: 'sow', pit: 0 });
  assert.equal(d.pits[1], 0);
  assert.equal(d.pits[11], 0);
  assert.equal(d.pits[6], 5);
  // long sow skips the opponent's store: 15 stones from pit 5 -> leave 1, 14 go 6,7..12,(skip 13),0..5,6
  let e = game.setup({ seed: 0 });
  e.pits = e.pits.slice(); e.pits[5] = 15;
  e = game.applyMove(e, 0, { type: 'sow', pit: 5 });
  assert.equal(e.pits[13], 0, 'opponent store skipped');
  assert.equal(e.pits[6], 2);
  assert.equal(e.turn, 0, 'ended in own store');
});

test('mangala: bir taraf boşalınca oyun biter, kalan taşlar diğerine', () => {
  let s = game.setup({ seed: 0 });
  s.pits = new Array(14).fill(0);
  s.pits[5] = 1; s.pits[6] = 20; s.pits[13] = 15; s.pits[7] = 3; s.pits[8] = 2;
  s = game.applyMove(s, 0, { type: 'sow', pit: 5 }); // single stone -> store, side empty -> over
  assert.equal(s.over, true);
  assert.equal(s.pits[6], 21);
  assert.equal(s.pits[13], 20, 'player 1 collected its remaining 5 stones');
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.throws(() => game.applyMove(s, 0, { type: 'sow', pit: 0 }), 'Oyun bitti');
});
