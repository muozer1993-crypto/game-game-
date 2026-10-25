import { test, assert } from './runner.js';
import game, { simulate, W, H, R } from '../games/bilardo.js';

test('bilardo: diziliş ve deterministik simülasyon', () => {
  const s = game.setup({ balls: 9, seed: 0 });
  assert.equal(s.balls.length, 10);
  assert.ok(s.balls.every((b) => b.x >= R && b.x <= W - R && b.y >= R && b.y <= H - R));
  // no overlaps in the rack
  for (let i = 0; i < s.balls.length; i++) for (let j = i + 1; j < s.balls.length; j++) {
    const a = s.balls[i]; const b = s.balls[j];
    assert.ok((a.x - b.x) ** 2 + (a.y - b.y) ** 2 >= (2 * R) ** 2 - 1e-6, `balls ${a.id},${b.id} overlap`);
  }
  const shot = { dx: 0, dy: -1, power: 0.9 };
  const a = simulate(s.balls, shot);
  const b = simulate(s.balls, shot);
  assert.deepEqual(a.balls, b.balls, 'same input, same output');
  assert.ok(a.balls.some((x) => x.id !== 0 && (x.x !== s.balls[x.id].x || x.y !== s.balls[x.id].y)), 'the rack was hit');
  assert.ok(a.balls.every((x) => x.pocketed || (x.x >= R - 1e-6 && x.x <= W - R + 1e-6 && x.y >= R - 1e-6 && x.y <= H - R + 1e-6)), 'balls stay on the table');
  assert.equal(game.setup({ balls: 15 }).balls.length, 16);
});

test('bilardo: vuruş, sıra, puan ve beyaz top cebe düşünce', () => {
  let s = game.setup({ balls: 9, seed: 0 });
  assert.throws(() => game.applyMove(s, 1, { type: 'shot', dx: 0, dy: -1, power: 0.5 }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'shot', dx: 0, dy: -1, power: 2 }), 'Geçersiz vuruş');
  assert.throws(() => game.applyMove(s, 0, { type: 'shot', dx: 3, dy: 4, power: 0.5 }), 'Geçersiz yön');
  // a gentle shot sideways: cue rolls, nothing pocketed -> turn passes
  s = game.applyMove(s, 0, { type: 'shot', dx: 1, dy: 0, power: 0.2 });
  assert.equal(s.shots, 1);
  assert.equal(s.last.pocketed.length, 0);
  assert.equal(s.turn, 1);
  assert.deepEqual(s.scores, [0, 0]);
  // scratch: shoot the cue straight into the bottom-left pocket from near it
  let t = game.setup({ balls: 9, seed: 0 });
  t = { ...t, balls: t.balls.map((b) => (b.id === 0 ? { ...b, x: 30, y: H - 30 } : b)) };
  t = game.applyMove(t, 0, { type: 'shot', dx: -0.7071, dy: 0.7071, power: 0.6 });
  assert.equal(t.last.scratch, true);
  assert.equal(t.balls[0].pocketed, false, 'cue ball is respotted');
  assert.equal(t.balls[0].x, W / 2);
  assert.equal(t.turn, 1);
  // pocket an object ball: place ball 1 next to a pocket and shoot it in
  let u = game.setup({ balls: 9, seed: 0 });
  u = { ...u, balls: u.balls.map((b) => (b.id === 0 ? { ...b, x: W / 2, y: 60 } : b.id === 1 ? { ...b, x: W / 2, y: 30 } : b)) };
  // ball 1 sits above the cue; shoot straight up: ball 1 heads to the top cushion, not a pocket. Use a corner instead:
  u = { ...u, balls: u.balls.map((b) => (b.id === 0 ? { ...b, x: 60, y: 60 } : b.id === 1 ? { ...b, x: 40, y: 40 } : b)) };
  u = game.applyMove(u, 0, { type: 'shot', dx: -0.7071, dy: -0.7071, power: 0.5 });
  assert.ok(u.last.pocketed.includes(1), 'ball 1 pocketed: ' + JSON.stringify(u.last.pocketed));
  assert.equal(u.scores[0] >= 1, true);
  if (!u.last.scratch) assert.equal(u.turn, 0, 'pocketing keeps the turn');
});

test('bilardo: bütün toplar girince oyun biter', () => {
  let s = game.setup({ balls: 9, seed: 0 });
  s = { ...s, balls: s.balls.map((b) => (b.id === 0 ? b : b.id === 1 ? { ...b, x: 40, y: 40, pocketed: false } : { ...b, pocketed: true })), scores: [4, 4] };
  s = { ...s, balls: s.balls.map((b) => (b.id === 0 ? { ...b, x: 60, y: 60 } : b)) };
  s = game.applyMove(s, 0, { type: 'shot', dx: -0.7071, dy: -0.7071, power: 0.5 });
  assert.equal(s.over, true);
  assert.deepEqual(game.getResult(s), { winner: 0 });
});
