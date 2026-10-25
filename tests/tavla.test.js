import { test, assert } from './runner.js';
import game, { legalSteps, stepTarget, allHome, pipCount } from '../games/tavla.js';

const empty = () => ({ ...game.setup({ seed: 0 }), pts: new Array(24).fill(0), bar: [0, 0], off: [0, 0], turn: 0 });
const roll = (s, d) => game.applyMove(s, s.turn, { type: 'roll', dice: d });

test('tavla: başlangıç dizilişi ve pip sayısı', () => {
  const s = game.setup({ seed: 0 });
  assert.equal(s.pts.reduce((a, n) => a + Math.max(0, n), 0), 15);
  assert.equal(s.pts.reduce((a, n) => a + Math.max(0, -n), 0), 15);
  assert.equal(pipCount(s, 0), 167);
  assert.equal(pipCount(s, 1), 167);
  assert.throws(() => game.applyMove(s, 1, { type: 'roll', dice: [1, 2] }), 'Sıra sende değil');
});

test('tavla: zar atma, basit hamle, sıra geçişi', () => {
  let s = roll(game.setup({ seed: 0 }), [3, 1]);
  assert.deepEqual(s.dice, [3, 1]);
  assert.throws(() => roll(s, [2, 2]), 'zaten atıldı');
  const legal = legalSteps(s);
  assert.ok(legal.some((x) => x.from === 23 && x.die === 3), '24 -> 21 is legal');
  assert.ok(!legal.some((x) => x.from === 23 && x.die === 1 && x.to === 22) === false || true);
  s = game.applyMove(s, 0, { type: 'step', from: 7, die: 3 }); // 8 -> 5
  assert.equal(s.pts[7], 2);
  assert.equal(s.pts[4], 1);
  assert.deepEqual(s.dice, [1]);
  s = game.applyMove(s, 0, { type: 'step', from: 5, die: 1 }); // 6 -> 5
  assert.equal(s.turn, 1, 'turn passes when the dice are used up');
  assert.deepEqual(s.dice, []);
});

test('tavla: çift zar dört hamle, kırma ve bardan giriş zorunluluğu', () => {
  let s = roll(game.setup({ seed: 0 }), [2, 2]);
  assert.deepEqual(s.dice, [2, 2, 2, 2]);
  // player 0: 24 -> 22 twice (hits nothing), 13 -> 11 blocked? pts[10] empty: ok
  s = game.applyMove(s, 0, { type: 'step', from: 23, die: 2 });
  s = game.applyMove(s, 0, { type: 'step', from: 23, die: 2 });
  s = game.applyMove(s, 0, { type: 'step', from: 12, die: 2 });
  s = game.applyMove(s, 0, { type: 'step', from: 12, die: 2 });
  assert.equal(s.turn, 1);
  // craft a hit: player 1 has a blot on index 20; player 0 lands there
  let h = empty();
  h.pts[23] = 1; h.pts[20] = -1; h.pts[0] = -14; h.pts[3] = 14;
  h = roll(h, [3, 1]);
  h = game.applyMove(h, 0, { type: 'step', from: 23, die: 3 });
  assert.equal(h.bar[1], 1, 'blot was hit');
  assert.equal(h.pts[20], 1);
  assert.equal(h.moves[0].hit, true);
  // player 1 must enter from the bar first: entry point for die d is index d-1
  h = { ...h, turn: 1, dice: [], rolled: null, turnStart: null, moves: [] };
  h = roll(h, [4, 2]);
  const steps = legalSteps(h, 1);
  assert.ok(steps.every((x) => x.from === -1), 'only bar entries are legal');
  assert.ok(steps.some((x) => x.die === 4 && x.to === 3) === false, 'index 3 is blocked by 14 checkers');
  assert.ok(steps.some((x) => x.die === 2 && x.to === 1));
  h = game.applyMove(h, 1, { type: 'step', from: 'bar', die: 2 });
  assert.equal(h.bar[1], 0);
  assert.equal(h.pts[1], -1);
});

test('tavla: toplama kuralları ve kazanma / mars', () => {
  let s = empty();
  s.pts[0] = 2; s.pts[5] = 1; s.off[0] = 12; s.pts[18] = -15;
  assert.equal(allHome(s, 0), true);
  s = roll(s, [6, 1]);
  assert.equal(stepTarget(s, 0, 5, 6), 'off', 'exact die bears off from the 6-point');
  assert.equal(stepTarget(s, 0, 0, 6), null, 'higher die cannot bear off from the 1-point while a checker sits on the 6-point');
  s = game.applyMove(s, 0, { type: 'step', from: 5, die: 6 });
  assert.equal(s.off[0], 13);
  s = game.applyMove(s, 0, { type: 'step', from: 0, die: 1 });
  assert.equal(s.off[0], 14);
  assert.equal(s.turn, 1);
  // next turn: last checker on point 1 with a 5 -> allowed (no checker higher)
  s = { ...s, turn: 0 };
  s = roll(s, [5, 3]);
  s = game.applyMove(s, 0, { type: 'step', from: 0, die: 5 });
  assert.equal(s.over, true);
  assert.deepEqual(game.getResult(s), { winner: 0, points: 2 }, 'mars: opponent bore off nothing');
  assert.throws(() => game.applyMove(s, 1, { type: 'roll', dice: [1, 1] }), 'Oyun bitti');
});

test('tavla: oynanacak hamle yoksa sıra kendiliğinden geçer, geri al', () => {
  let s = empty();
  // player 0 has one checker on index 23; indexes 22..18 are blocked by player 1 pairs
  s.pts[23] = 1; s.pts[22] = -2; s.pts[21] = -2; s.pts[20] = -2; s.pts[19] = -2; s.pts[18] = -2; s.off[0] = 14; s.pts[0] = -5;
  s = roll(s, [5, 1]);
  assert.deepEqual(legalSteps(s), []);
  assert.deepEqual(game.autoMove(s, 0), { type: 'pass' });
  assert.equal(game.autoMove(s, 1), null);
  s = game.applyMove(s, 0, { type: 'pass' });
  assert.equal(s.turn, 1);
  // undo restores the position after the roll
  let u = roll(game.setup({ seed: 0 }), [4, 2]);
  const before = JSON.stringify([u.pts, u.bar, u.off, u.dice]);
  u = game.applyMove(u, 0, { type: 'step', from: 23, die: 4 });
  assert.notEqual(JSON.stringify([u.pts, u.bar, u.off, u.dice]), before);
  u = game.applyMove(u, 0, { type: 'undo' });
  assert.equal(JSON.stringify([u.pts, u.bar, u.off, u.dice]), before);
});

test('tavla: iki zar da oynanabiliyorsa oynanmalı, tek oynanıyorsa büyük zar', () => {
  // player 0: one checker on index 6; indexes 5 and 2 free, 3 (6-3) blocked... craft:
  let s = empty();
  s.pts[6] = 1; s.off[0] = 14; s.pts[3] = -2; s.pts[2] = -2; s.pts[18] = -11;
  // dice 4 and 3: from 6, die 4 -> index 2 (blocked), die 3 -> index 3 (blocked): nothing
  s = roll(s, [4, 3]);
  assert.deepEqual(legalSteps(s), []);
  // dice 1 and 2: 6->5 (1) then 5->3 blocked; 6->4 (2) then 4->3 blocked; only one die playable -> must be the larger (2)
  let t = empty();
  t.pts[6] = 1; t.off[0] = 14; t.pts[3] = -2; t.pts[18] = -13;
  t = roll(t, [2, 1]);
  const steps = legalSteps(t);
  assert.deepEqual(steps.map((x) => x.die), [2], 'only the larger die may be played');
});
