import { test, assert } from './runner.js';
import game, { TRACK, START, SAFE, HOME, HOME_COL, absIndex, legalMoves, rollDie } from '../games/kizma-birader.js';

test('kızma birader: pist 52 kare, bitişik ve tek; başlangıç ve güvenli kareler', () => {
  assert.equal(TRACK.length, 52);
  assert.equal(new Set(TRACK.map((c) => c.join(','))).size, 52, 'no square twice');
  let diagonals = 0;
  for (let i = 0; i < 52; i++) {
    const [a, b] = [TRACK[i], TRACK[(i + 1) % 52]];
    const dx = Math.abs(a[0] - b[0]);
    const dy = Math.abs(a[1] - b[1]);
    assert.ok((dx + dy === 1) || (dx === 1 && dy === 1), `squares ${i} and ${i + 1} touch`);
    if (dx === 1 && dy === 1) diagonals += 1;
  }
  assert.equal(diagonals, 4, 'the loop turns diagonally only at the four inner corners of the cross');
  assert.deepEqual(TRACK[START[0]], [1, 6]);
  assert.deepEqual(TRACK[START[1]], [13, 8]);
  assert.ok(SAFE.includes(START[0]) && SAFE.includes(START[1]));
  assert.deepEqual(TRACK[absIndex(0, 50)], [0, 7], 'red leaves the loop next to its home column');
  assert.deepEqual(TRACK[absIndex(1, 50)], [14, 7]);
  assert.deepEqual(HOME_COL[0][0], [1, 7]);
  assert.equal(rollDie(5, 3), rollDie(5, 3));
  assert.ok(rollDie(5, 0) >= 1 && rollDie(5, 0) <= 6);
});

test('kızma birader: altıyla çıkış, ilerleme, ezme, tam giriş, üç altı, sıra', () => {
  let s = game.setup({ pieces: 2, seed: 7 });
  assert.deepEqual(s.pieces, [[-1, -1], [-1, -1]]);
  assert.deepEqual(game.getTurn(s), { player: 0, private: false });
  assert.throws(() => game.applyMove(s, 0, { type: 'move', piece: 0 }), 'Önce zar at');
  assert.deepEqual(legalMoves(s, 0, 5), [], 'nothing leaves the base without a six');
  assert.deepEqual(legalMoves(s, 0, 6), [0, 1]);
  // rig: red piece 0 at rel 3, yellow piece 0 just ahead on a plain square
  s = { ...s, pieces: [[3, -1], [absIndex(1, 0) === 27 ? 30 : 30, -1]], die: 1, turn: 0 };
  // yellow rel 30 -> abs (27+30)%52 = 5; red rel 3 -> abs 4; die 1 lands on abs 5 (not safe)
  assert.ok(!SAFE.includes(5));
  s = game.applyMove(s, 0, { type: 'move', piece: 0 });
  assert.equal(s.pieces[0][0], 4);
  assert.equal(s.pieces[1][0], -1, 'captured piece goes home');
  assert.equal(s.last.event, 'capture');
  assert.equal(s.turn, 0, 'a capture earns another roll');
  assert.equal(s.die, null);
  // no capture on a safe square: red at rel 7 (abs 8) moving 1 to abs 9 (safe) with yellow there (rel 34 -> abs 9)
  let t = { ...s, pieces: [[7, -1], [34, -1]], die: 1, turn: 0 };
  t = game.applyMove(t, 0, { type: 'move', piece: 0 });
  assert.equal(t.pieces[1][0], 34, 'safe square: no capture');
  assert.equal(t.turn, 1, 'plain move passes the turn');
  // exact roll into the centre; overshoot illegal
  let h = { ...s, pieces: [[54, HOME], [-1, -1]], die: 3, turn: 0 };
  assert.deepEqual(legalMoves(h, 0, 3), [], 'overshooting the centre is not allowed');
  h = { ...h, die: 2 };
  h = game.applyMove(h, 0, { type: 'move', piece: 0 });
  assert.equal(h.phase, 'over');
  assert.equal(h.winner, 0);
  assert.deepEqual(game.getResult(h), { winner: 0 });
  // a six gives another roll; entering from base lands on the start square
  let e = { ...s, pieces: [[-1, -1], [-1, -1]], die: 6, turn: 1 };
  e = game.applyMove(e, 1, { type: 'move', piece: 1 });
  assert.equal(e.pieces[1][1], 0);
  assert.equal(e.turn, 1, 'six: roll again');
  // rolling: deterministic; three sixes lose the turn; no legal move passes the turn
  let r = { ...s, pieces: [[-1, -1], [-1, -1]], die: null, turn: 0, sixes: 2, rollCount: 0 };
  let n = 0;
  while (rollDie(r.seed, n) !== 6) n++;
  r = { ...r, rollCount: n };
  r = game.applyMove(r, 0, { type: 'roll' });
  assert.equal(r.last.event, 'threeSixes');
  assert.equal(r.turn, 1);
  assert.equal(r.die, null);
  let m = 0;
  while (rollDie(s.seed, m) === 6) m++;
  let q = { ...s, pieces: [[-1, -1], [-1, -1]], die: null, turn: 0, sixes: 0, rollCount: m };
  q = game.applyMove(q, 0, { type: 'roll' });
  assert.equal(q.last.event, 'noMove', 'no six: nothing can leave the base');
  assert.equal(q.turn, 1);
  assert.throws(() => game.applyMove(q, 0, { type: 'roll' }), 'Sıra sende değil');
  // a playable roll keeps the die for the move
  let k = { ...s, pieces: [[10, -1], [-1, -1]], die: null, turn: 0, sixes: 0, rollCount: m };
  k = game.applyMove(k, 0, { type: 'roll' });
  assert.ok(k.die >= 1 && k.die <= 5);
  assert.throws(() => game.applyMove(k, 0, { type: 'roll' }), 'bir taş seç');
  assert.throws(() => game.applyMove(k, 0, { type: 'move', piece: 1 }), 'oynanamaz');
});
