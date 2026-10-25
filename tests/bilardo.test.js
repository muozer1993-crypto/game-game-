import { test, assert } from './runner.js';
import game, { simulate, W, H, R, aimFromPointer, predictContact, CANCEL_R, PULL_FULL } from '../games/bilardo.js';

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

test('bilardo: ıstakayı geri çekme — top parmağın tersine gider, uzaklık güç, topun üstü iptal', () => {
  const cue = { x: 100, y: 300 };
  // finger below the ball: the shot goes up
  const a = aimFromPointer(cue, { x: 100, y: 300 + CANCEL_R + PULL_FULL / 2 });
  assert.ok(Math.abs(a.dx) < 1e-9 && Math.abs(a.dy + 1) < 1e-9, 'straight up');
  assert.ok(Math.abs(a.power - 0.5) < 1e-9, 'half power');
  // finger to the left: the shot goes right, full power when pulled far enough
  const b = aimFromPointer(cue, { x: 100 - CANCEL_R - PULL_FULL * 2, y: 300 });
  assert.ok(Math.abs(b.dx - 1) < 1e-9 && Math.abs(b.dy) < 1e-9);
  assert.equal(b.power, 1);
  // diagonal pull: unit direction pointing away from the finger
  const c = aimFromPointer(cue, { x: 140, y: 340 });
  assert.ok(Math.abs(c.dx * c.dx + c.dy * c.dy - 1) < 1e-9 && c.dx < 0 && c.dy < 0);
  // finger back on the ball: cancelled
  assert.equal(aimFromPointer(cue, { x: 103, y: 302 }), null);
});

test('bilardo: nişan çizgisi ilk değilen topu ve banda çarpmayı bulur', () => {
  const balls = [{ id: 0, x: 100, y: 300, pocketed: false }, { id: 1, x: 100, y: 150, pocketed: false }, { id: 2, x: 40, y: 300, pocketed: false }, { id: 3, x: 100, y: 100, pocketed: true }];
  const up = predictContact(balls, 100, 300, 0, -1);
  assert.equal(up.ball && up.ball.id, 1);
  assert.ok(Math.abs(up.y - (150 + 2 * R)) < 1e-9 && Math.abs(up.x - 100) < 1e-9, 'touches ball 1 two radii before its centre');
  const left = predictContact(balls, 100, 300, -1, 0);
  assert.equal(left.ball && left.ball.id, 2);
  const right = predictContact(balls, 100, 300, 1, 0);
  assert.equal(right.ball, null, 'nothing that way: the cushion');
  assert.ok(Math.abs(right.x - (W - R)) < 1e-9);
  const down = predictContact(balls, 100, 300, 0, 1);
  assert.equal(down.ball, null);
  assert.ok(Math.abs(down.y - (H - R)) < 1e-9);
  // a glancing line that misses ball 1 by more than two radii goes on to the cushion
  const miss = predictContact(balls, 100 + 2 * R + 1, 300, 0, -1);
  assert.equal(miss.ball, null);
  // pocketed balls are ignored: the path continues past where ball 3 was
  assert.ok(predictContact([balls[0], balls[3]], 100, 300, 0, -1).y < 100);
});
