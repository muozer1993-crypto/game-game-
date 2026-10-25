import { test, assert } from './runner.js';
import game, { simulate, W, H, R, aimFromPointer, predictContact, CANCEL_R, PULL_FULL, MIN_POWER, fullPull } from '../games/bilardo.js';

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

test('bilardo: güç parmağın konduğu yerden ölçülür — uzağa dokunup kaymak vurmaz; değmekte olan top çizgide', () => {
  const cue = { x: 100, y: 200 };
  const start = { x: 100, y: 315 }; // finger far behind the ball
  const still = aimFromPointer(cue, start, start);
  assert.equal(still.power, 0, 'no pull yet');
  assert.ok(Math.abs(still.dy + 1) < 1e-9, 'already aiming away from the finger');
  const slip = aimFromPointer(cue, { x: 104, y: 319 }, start);
  assert.ok(slip.power < MIN_POWER, 'a few units of slip is no shot');
  const pulled = aimFromPointer(cue, { x: 100, y: 315 + PULL_FULL / 2 }, start);
  assert.ok(Math.abs(pulled.power - 0.5) < 1e-9, 'half the full pull = half power');
  const toward = aimFromPointer(cue, { x: 100, y: 280 }, start);
  assert.equal(toward.power, 0, 'moving towards the ball never adds power');
  // the cue ball resting against ball 1 and aiming into it: contact at once; aiming away: not in the way
  const balls = [{ id: 0, x: 100, y: 128, pocketed: false }, { id: 1, x: 100, y: 112.001, pocketed: false }, { id: 2, x: 100, y: 60, pocketed: false }];
  const into = predictContact(balls, 100, 128, 0, -1);
  assert.equal(into.ball && into.ball.id, 1);
  assert.ok(Math.abs(into.y - 128) < 1e-9);
  const away = predictContact(balls, 100, 128, 0, 1);
  assert.equal(away.ball, null);
});

test('bilardo: kenara yakın topta tam güç, ekranda kalan alana sığar', () => {
  assert.equal(fullPull(500, CANCEL_R), PULL_FULL, 'open table: the normal pull');
  const near = fullPull(60, CANCEL_R);
  assert.ok(near < PULL_FULL && near >= 32, 'little room: a shorter full pull');
  const cue = { x: 8, y: 250 };
  const atEdge = aimFromPointer(cue, { x: 8 - 58, y: 250 }, cue, near);
  assert.equal(atEdge.power, 1, 'reaching the screen edge is full power');
  assert.ok(Math.abs(atEdge.dx - 1) < 1e-9);
  assert.equal(fullPull(10, 40), 32, 'never twitchier than the minimum');
});

// ---- classic 8-ball
import { targetsOf, canPlaceCue, groupOf, FOOT_SPOT } from '../games/bilardo.js';

/** An 8-ball position after the break: only the listed balls on the table (others pocketed). */
function eightState(on, extra = {}) {
  const s = game.setup({ mode: '8top', seed: 0 });
  const balls = s.balls.map((b) => (on[b.id] ? { ...b, x: on[b.id][0], y: on[b.id][1], pocketed: false } : { ...b, pocketed: b.id !== 0 }));
  return { ...s, balls, shots: 5, ...extra };
}
const DIAG = { dx: -0.7071, dy: -0.7071 }; // towards the top-left corner pocket

test('bilardo 8 top: diziliş, gruplar ve hedefler', () => {
  const s = game.setup({ mode: '8top', seed: 3 });
  assert.equal(s.mode, '8top');
  assert.equal(s.balls.length, 16);
  assert.deepEqual(s.balls.map((b) => b.id), [...Array(16).keys()], 'sorted by id');
  const eight = s.balls[8];
  const row3 = s.balls.filter((b) => Math.abs(b.y - eight.y) < 0.01);
  assert.equal(row3.length, 3, 'the 8 sits in the third row');
  assert.equal(eight.x, W / 2, 'in its middle');
  const back = s.balls.filter((b) => b.id && Math.abs(b.y - Math.min(...s.balls.map((x) => x.y))) < 0.01).sort((a, b) => a.x - b.x);
  assert.equal(back.length, 5);
  assert.notEqual(groupOf(back[0].id), groupOf(back[4].id), 'a solid and a stripe in the back corners');
  assert.equal(s.balls[1].y, FOOT_SPOT.y, 'apex on the foot spot');
  assert.deepEqual(game.setup({ mode: 'sayi', balls: 9 }).balls.length, 10, 'the old game is unchanged');
  assert.deepEqual(targetsOf(s, 0).includes(8), false, 'open table: anything but the 8');
  const g = { ...eightState({ 0: [100, 300], 3: [60, 60], 8: [150, 150], 11: [40, 300] }), groups: ['duz', 'cizgili'] };
  assert.deepEqual(targetsOf(g, 0), [3]);
  assert.deepEqual(targetsOf(g, 1), [11]);
  const cleared = { ...eightState({ 0: [100, 300], 8: [150, 150], 11: [40, 300] }), groups: ['duz', 'cizgili'] };
  assert.deepEqual(targetsOf(cleared, 0), [8], 'group cleared: the 8');
});

test('bilardo 8 top: masa açıkken ilk sokulan top grubu belirler, kendi topunu sokan devam eder', () => {
  let s = eightState({ 0: [60, 60], 3: [40, 40], 11: [150, 300], 8: [100, 200] });
  s = game.applyMove(s, 0, { type: 'shot', ...DIAG, power: 0.3 });
  assert.deepEqual(s.last.pocketed, [3]);
  assert.equal(s.last.firstHit, 3);
  assert.equal(s.last.foul, null);
  assert.equal(s.last.assigned, 'duz');
  assert.deepEqual(s.groups, ['duz', 'cizgili']);
  assert.equal(s.turn, 0, 'pocketed a ball of the new group: shoots again');
  assert.equal(s.ballInHand, false);
});

test('bilardo 8 top: rakibin topuna önce değmek, hiçbir topa değmemek ve beyazı sokmak faul — rakip topu elle koyar', () => {
  // player 0 has solids but hits stripe 11 first
  let s = { ...eightState({ 0: [60, 60], 11: [40, 40], 3: [150, 300], 8: [100, 200] }), groups: ['duz', 'cizgili'] };
  s = game.applyMove(s, 0, { type: 'shot', ...DIAG, power: 0.3 });
  assert.equal(s.last.foul, 'wrong');
  assert.equal(s.turn, 1);
  assert.equal(s.ballInHand, true);
  assert.ok(s.balls[11].pocketed, 'the stripe stays down (it was the opponent\'s anyway)');
  // the opponent puts the cue ball down: a bad spot is refused, a free one is used for the shot
  assert.throws(() => game.applyMove(s, 1, { type: 'shot', dx: 0, dy: -1, power: 0.3, cue: { x: 150, y: 300 } }), 'Beyaz top oraya konamaz');
  assert.throws(() => game.applyMove(s, 1, { type: 'shot', dx: 0, dy: -1, power: 0.3, cue: { x: 3, y: 3 } }), 'Beyaz top oraya konamaz');
  assert.ok(!canPlaceCue(s.balls, 10, 12), 'not in a pocket mouth');
  const t = game.applyMove(s, 1, { type: 'shot', dx: 1, dy: 0, power: 0.2, cue: { x: 30, y: 350 } });
  assert.equal(t.last.before.find((b) => b.id === 0).x, 30, 'the shot starts from the placed spot');
  assert.equal(t.ballInHand, t.last.foul !== null);
  // no ball hit at all
  let n = { ...eightState({ 0: [100, 300], 3: [20, 100], 8: [180, 100], 11: [180, 380] }), groups: ['duz', 'cizgili'] };
  n = game.applyMove(n, 0, { type: 'shot', dx: 0, dy: -1, power: 0.05 });
  assert.equal(n.last.firstHit, null);
  assert.equal(n.last.foul, 'none');
  assert.equal(n.ballInHand, true);
  // cue ball into the pocket
  let c = { ...eightState({ 0: [40, 40], 3: [150, 300], 8: [100, 200], 11: [180, 380] }), groups: ['duz', 'cizgili'] };
  c = game.applyMove(c, 0, { type: 'shot', ...DIAG, power: 0.3 });
  assert.equal(c.last.foul, 'scratch');
  assert.equal(c.balls[0].pocketed, false, 'cue ball back on the table');
  assert.equal(c.turn, 1);
  assert.equal(c.ballInHand, true);
  // ball in hand only after a foul
  assert.throws(() => game.applyMove(eightState({ 0: [100, 300], 3: [60, 60], 8: [150, 150] }), 0, { type: 'shot', dx: 0, dy: -1, power: 0.3, cue: { x: 50, y: 300 } }), 'şimdi elle koyamazsın');
});

test('bilardo 8 top: 8 numara — grubu bitirip sokan kazanır, erken ya da faulle sokan kaybeder, açılışta yerine konur', () => {
  // group cleared, 8 straight in: win
  let w = { ...eightState({ 0: [60, 60], 8: [40, 40], 11: [150, 300] }), groups: ['duz', 'cizgili'] };
  w = game.applyMove(w, 0, { type: 'shot', ...DIAG, power: 0.3 });
  assert.equal(w.last.eight, 'win');
  assert.ok(w.over);
  assert.deepEqual(game.getResult(w), { winner: 0 });
  assert.equal(game.getTurn(w), null);
  // solids still on the table: the 8 goes in early (hitting it first is also a foul) — the opponent wins
  let e = { ...eightState({ 0: [60, 60], 8: [40, 40], 3: [150, 300], 11: [180, 380] }), groups: ['duz', 'cizgili'] };
  e = game.applyMove(e, 0, { type: 'shot', ...DIAG, power: 0.3 });
  assert.equal(e.last.eight, 'early');
  assert.deepEqual(game.getResult(e), { winner: 1 });
  // on the 8 but a stripe is hit first and knocks the 8 in: foul on the 8 — the opponent wins
  let f = { ...eightState({ 0: [76, 76], 11: [56, 56], 8: [34, 34], 12: [150, 300] }), groups: ['duz', 'cizgili'] };
  f = game.applyMove(f, 0, { type: 'shot', ...DIAG, power: 0.5 });
  assert.equal(f.last.firstHit, 11);
  assert.ok(f.last.pocketed.includes(8));
  assert.equal(f.last.eight, 'foul');
  assert.deepEqual(game.getResult(f), { winner: 1 });
  // the 8 on the break is spotted again and the game goes on
  let b = { ...eightState({ 0: [60, 60], 8: [40, 40], 3: [150, 300], 11: [180, 380] }), shots: 0 };
  b = game.applyMove(b, 0, { type: 'shot', ...DIAG, power: 0.3 });
  assert.equal(b.last.eight, 'break');
  assert.equal(b.over, false);
  assert.equal(b.balls[8].pocketed, false);
  assert.equal(b.balls[8].x, FOOT_SPOT.x);
  assert.deepEqual(b.groups, [null, null], 'groups are not decided on the break');
});
