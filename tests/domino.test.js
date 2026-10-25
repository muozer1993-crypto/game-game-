import { test, assert } from './runner.js';
import game, { makeSet, pips, ends, sidesFor, hasPlay } from '../games/domino.js';

const T = (a, b, id) => ({ id, a, b });

test('domino: 28 taş, dağıtım, uç eşleme', () => {
  const set = makeSet();
  assert.equal(set.length, 28);
  assert.equal(new Set(set.map((t) => `${t.a}-${t.b}`)).size, 28);
  const s = game.setup({ target: 50, seed: 2 });
  assert.equal(s.hands[0].length, 7);
  assert.equal(s.hands[1].length, 7);
  assert.equal(s.boneyard.length, 14);
  assert.equal(s.turn, 0);
  assert.deepEqual(game.getTurn(s), { player: 0, private: true });
  assert.equal(ends([]), null);
  const line = [T(3, 5, 1), T(5, 5, 2), T(5, 1, 3)];
  assert.deepEqual(ends(line), [3, 1]);
  assert.deepEqual(sidesFor(T(1, 3, 9), line), ['L', 'R']);
  assert.deepEqual(sidesFor(T(2, 3, 9), line), ['L']);
  assert.deepEqual(sidesFor(T(1, 6, 9), line), ['R']);
  assert.deepEqual(sidesFor(T(2, 4, 9), line), []);
  assert.ok(hasPlay([T(2, 4, 9), T(6, 1, 8)], line) && !hasPlay([T(2, 4, 9)], line));
  assert.equal(pips([T(2, 4, 9), T(6, 1, 8)]), 13);
});

test('domino: oynama ve yön, çekme, pas, kilitlenme, bitiş ve puan', () => {
  let s = game.setup({ target: 50, seed: 2 });
  s = { ...s, hands: [[T(3, 5, 1), T(1, 3, 2), T(2, 2, 3)], [T(5, 1, 4), T(6, 6, 5), T(0, 4, 6)]], boneyard: [T(0, 0, 7), T(2, 6, 8)], line: [], turn: 0 };
  assert.throws(() => game.applyMove(s, 1, { type: 'play', tile: 4 }), 'Sıra sende değil');
  s = game.applyMove(s, 0, { type: 'play', tile: 1 }); // the first tile needs no side
  assert.deepEqual(ends(s.line), [3, 5]);
  assert.equal(s.turn, 1);
  assert.throws(() => game.applyMove(s, 1, { type: 'play', tile: 5 }), 'uymuyor');
  assert.throws(() => game.applyMove(s, 1, { type: 'draw' }), 'Oynayabileceğin taş var');
  s = game.applyMove(s, 1, { type: 'play', tile: 4 }); // 5-1 fits only the right end -> oriented 5|1
  assert.deepEqual(s.line.map((t) => [t.a, t.b]), [[3, 5], [5, 1]]);
  // player 0: 1-3 fits both ends (3 and 1): a side is required; left -> placed as [1|3]
  assert.throws(() => game.applyMove(s, 0, { type: 'play', tile: 2 }), 'Yön seç');
  s = game.applyMove(s, 0, { type: 'play', tile: 2, side: 'L' });
  assert.deepEqual(s.line.map((t) => [t.a, t.b]), [[1, 3], [3, 5], [5, 1]]);
  assert.deepEqual(ends(s.line), [1, 1]);
  // player 1 holds 6-6 and 0-4: nothing fits -> must draw; boneyard pops 2-6 then 0-0
  assert.throws(() => game.applyMove(s, 1, { type: 'pass' }), 'Önce taş çek');
  s = game.applyMove(s, 1, { type: 'draw' });
  assert.equal(s.hands[1].length, 3);
  assert.equal(s.boneyard.length, 1);
  assert.throws(() => game.applyMove(s, 1, { type: 'pass' }), 'Önce taş çek');
  s = game.applyMove(s, 1, { type: 'draw' });
  assert.equal(s.boneyard.length, 0);
  assert.throws(() => game.applyMove(s, 1, { type: 'draw' }), 'kalmadı');
  s = game.applyMove(s, 1, { type: 'pass' });
  assert.equal(s.turn, 0);
  assert.equal(s.passes, 1);
  // player 0 holds only 2-2: cannot play, boneyard empty -> pass -> blocked; pips 4 vs 12+4+8+0 = 24 -> player 0 wins 20
  s = game.applyMove(s, 0, { type: 'pass' });
  assert.equal(s.phase, 'handOver');
  assert.deepEqual(s.result, { winner: 0, points: 20, how: 'blocked' });
  assert.deepEqual(s.scores, [20, 0]);
  s = game.applyMove(s, 1, { type: 'next' });
  assert.equal(s.handNo, 1);
  assert.equal(s.turn, 1);
  assert.equal(s.hands[0].length, 7);
  // going out scores the opponent's pips; single-hand target ends the game
  let o = { ...game.setup({ target: 0, seed: 3 }), hands: [[T(2, 3, 1)], [T(6, 6, 5), T(0, 4, 6)]], line: [T(3, 3, 9)], turn: 0, boneyard: [] };
  o = game.applyMove(o, 0, { type: 'play', tile: 1 });
  assert.equal(o.phase, 'over');
  assert.deepEqual(o.result, { winner: 0, points: 16, how: 'out' });
  assert.deepEqual(game.getResult(o), { winner: 0 });
  assert.deepEqual(o.line.map((t) => [t.a, t.b]), [[3, 3], [3, 2]], 'tile flipped to match the end');
});
