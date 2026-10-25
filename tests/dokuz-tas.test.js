import { test, assert } from './runner.js';
import game, { legalMoves, inMill, removable, count, ADJ, MILLS } from '../games/dokuz-tas.js';

const place = (s, p, i) => game.applyMove(s, p, { type: 'place', point: i });

test('dokuz taş: tahta tutarlı, koyma aşaması, üçlü ve taş alma', () => {
  // every adjacency is symmetric and every mill is a straight line of three
  ADJ.forEach((ns, i) => ns.forEach((n) => assert.ok(ADJ[n].includes(i), `adjacency ${i}-${n} symmetric`)));
  assert.equal(MILLS.length, 16);
  let s = game.setup({ seed: 2 });
  assert.equal(s.turn, 0);
  assert.deepEqual(s.hand, [9, 9]);
  assert.equal(legalMoves(s, 0).length, 24);
  assert.throws(() => place(s, 1, 0), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'move', from: 0, to: 1 }), 'Önce elindeki taşları koy');
  s = place(s, 0, 0);
  assert.equal(s.hand[0], 8);
  assert.equal(s.turn, 1);
  assert.throws(() => place(s, 1, 0), 'dolu');
  s = place(s, 1, 3);
  s = place(s, 0, 1);
  s = place(s, 1, 4);
  s = place(s, 0, 2); // mill 0-1-2
  assert.equal(s.mustRemove, true);
  assert.equal(s.turn, 0, 'the mill maker stays on turn to take a piece');
  assert.ok(inMill(s.points, 1, 0));
  assert.throws(() => place(s, 0, 5), 'Önce rakibin bir taşını al');
  assert.throws(() => game.applyMove(s, 0, { type: 'remove', point: 0 }), 'Rakibin bir taşını');
  assert.throws(() => game.applyMove(s, 1, { type: 'remove', point: 0 }), 'Sıra sende değil');
  assert.deepEqual(removable(s.points, 1), [3, 4]);
  s = game.applyMove(s, 0, { type: 'remove', point: 3 });
  assert.equal(s.points[3], null);
  assert.equal(s.mustRemove, false);
  assert.equal(s.turn, 1);
  assert.equal(s.last.removed, 3);
  assert.equal(count(s.points, 1), 1);
  assert.equal(game.getResult(s), null);
});

test('dokuz taş: üçlüdeki taş korunur, hepsi üçlüdeyse alınabilir', () => {
  const s = game.setup({ seed: 2 });
  const points = s.points.slice();
  [21, 22, 23].forEach((i) => { points[i] = 1; });
  points[9] = 1;
  [0, 1].forEach((i) => { points[i] = 0; });
  let t = { ...s, points, hand: [7, 5] };
  t = place(t, 0, 2); // mill
  assert.equal(t.mustRemove, true);
  assert.deepEqual(removable(t.points, 1), [9], 'only the piece outside the mill');
  assert.throws(() => game.applyMove(t, 0, { type: 'remove', point: 21 }), 'Üçlüdeki taş alınamaz');
  t = game.applyMove(t, 0, { type: 'remove', point: 9 });
  assert.equal(t.turn, 1);
  // now every white piece sits in a mill: any of them may be taken after the next mill
  const u = { ...t, turn: 0, points: t.points.map((v, i) => (i === 2 ? null : v)) };
  const v = place(u, 0, 2);
  assert.deepEqual(removable(v.points, 1), [21, 22, 23]);
});

test('dokuz taş: sürme, komşuluk, uçma, kilitlenme ve iki taş kalınca kaybetme', () => {
  const base = game.setup({ seed: 2 });
  const pts = () => base.points.slice();
  // moving phase: player 0 at 0, 2, 4; player 1 at 3, 7, 22, 13; no flying
  let p = pts();
  [0, 2, 4].forEach((i) => { p[i] = 0; });
  [3, 7, 22, 13].forEach((i) => { p[i] = 1; });
  let s = { ...base, points: p, hand: [0, 0], flying: false };
  assert.throws(() => game.applyMove(s, 0, { type: 'place', point: 1 }), 'Elinde taş kalmadı');
  assert.throws(() => game.applyMove(s, 0, { type: 'move', from: 3, to: 1 }), 'Kendi taşını');
  assert.throws(() => game.applyMove(s, 0, { type: 'move', from: 4, to: 20 }), 'komşu noktaya');
  assert.throws(() => game.applyMove(s, 0, { type: 'move', from: 4, to: 3 }), 'dolu');
  s = game.applyMove(s, 0, { type: 'move', from: 4, to: 1 }); // mill 0-1-2
  assert.equal(s.points[4], null);
  assert.equal(s.mustRemove, true);
  assert.deepEqual(s.last, { from: 4, to: 1 });
  // flying: with three pieces and the setting on, any empty point is reachable
  const f = { ...base, points: p, hand: [0, 0], flying: true };
  assert.ok(legalMoves(f, 0).some((m) => m.from === 4 && m.to === 20), 'can fly');
  const moved = game.applyMove(f, 0, { type: 'move', from: 4, to: 20 });
  assert.equal(moved.points[20], 0);
  // blocked: player 1's pieces 0, 21, 23 have no free neighbour after player 0 moves 4 -> 5
  p = pts();
  [1, 9, 22, 14, 4].forEach((i) => { p[i] = 0; });
  [0, 21, 23].forEach((i) => { p[i] = 1; });
  let b = { ...base, points: p, hand: [0, 0], flying: false };
  b = game.applyMove(b, 0, { type: 'move', from: 4, to: 5 });
  assert.equal(b.over, true);
  assert.deepEqual(game.getResult(b), { winner: 0 });
  assert.equal(b.reason, 'blocked');
  assert.equal(game.getTurn(b), null);
  // two pieces left: taking the third piece ends the game
  p = pts();
  [0, 1, 9].forEach((i) => { p[i] = 0; });
  [6, 15, 20].forEach((i) => { p[i] = 1; });
  let c = { ...base, points: p, hand: [0, 0], flying: true };
  c = game.applyMove(c, 0, { type: 'move', from: 9, to: 2 }); // flying (3 pieces) into a mill
  assert.equal(c.mustRemove, true);
  c = game.applyMove(c, 0, { type: 'remove', point: 20 });
  assert.equal(c.over, true);
  assert.equal(c.reason, 'pieces');
  assert.deepEqual(game.getResult(c), { winner: 0 });
  assert.throws(() => game.applyMove(c, 1, { type: 'move', from: 6, to: 7 }), 'Oyun bitti');
});
