import { test, assert } from './runner.js';
import game, { makeSolution, makePuzzle, conflicts, isSolved, goodCount } from '../games/sudoku.js';

test('sudoku: üretilen çözüm geçerli, bulmaca tohuma göre aynı, ipucu sayısı', () => {
  for (const seed of [1, 2, 99]) {
    const g = makeSolution(seed);
    assert.equal(g.length, 81);
    assert.ok(isSolved(g), 'a valid full grid');
  }
  assert.deepEqual(makeSolution(5), makeSolution(5));
  assert.notEqual(makeSolution(5).join(''), makeSolution(6).join(''));
  const p = makePuzzle('medium', 5);
  assert.equal(p.filter(Boolean).length, 35);
  assert.equal(makePuzzle('easy', 5).filter(Boolean).length, 45);
  assert.equal(makePuzzle('hard', 5).filter(Boolean).length, 28);
  assert.deepEqual(makePuzzle('medium', 5), p);
  const sol = makeSolution(5);
  assert.ok(p.every((v, i) => !v || v === sol[i]), 'givens come from the solution');
  assert.equal(conflicts(sol).size, 0);
  const broken = sol.slice(); broken[0] = sol[1];
  assert.ok(conflicts(broken).has(0) && conflicts(broken).has(1), 'a duplicate marks both cells');
});

test('sudoku: girişler, ipucu koruması, çakışma sayımı, çözüm ve sonuç', () => {
  let s = game.setup({ level: 'easy', minutes: 0, seed: 7 });
  const sol = makeSolution(7);
  const empty = s.givens.findIndex((v) => !v);
  const given = s.givens.findIndex((v) => v);
  assert.deepEqual(game.getTurn(s), { player: 0, private: true, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'set', cell: given, value: 1 }), 'İpucu');
  assert.throws(() => game.applyMove(s, 0, { type: 'set', cell: empty, value: 12 }), '1–9');
  s = game.applyMove(s, 0, { type: 'set', cell: empty, value: sol[empty], ms: 100 });
  assert.equal(s.grids[0][empty], sol[empty]);
  assert.equal(s.grids[1][empty], 0, 'the other grid untouched');
  // a wrong value creates a conflict somewhere? not necessarily; clearing works
  s = game.applyMove(s, 0, { type: 'set', cell: empty, value: 0, ms: 150 });
  assert.equal(s.grids[0][empty], 0);
  // player 0 solves everything
  for (let i = 0; i < 81; i++) if (!s.givens[i] && s.phase === 'play') s = game.applyMove(s, 0, { type: 'set', cell: i, value: sol[i], ms: 1000 + i });
  assert.equal(s.status[0], 'solved');
  assert.equal(s.finished[0], true);
  assert.ok(s.ms[0] >= 1000 && s.ms[0] <= 1080, 'solve time taken from the finishing move');
  assert.throws(() => game.applyMove(s, 0, { type: 'set', cell: empty, value: 1 }), 'bulmacan bitti');
  // player 1 times out with a few cells filled
  s = game.applyMove(s, 1, { type: 'set', cell: empty, value: sol[empty], ms: 50 });
  s = game.applyMove(s, 1, { type: 'finish', ms: 600000 });
  assert.equal(s.phase, 'over');
  assert.equal(s.status[1], 'time');
  // a voluntary 'Bitir' is recorded as a quit, not a time-out
  {
    let q = game.setup({ level: 'easy', minutes: 0, seed: 5 });
    q = game.applyMove(q, 0, { type: 'finish', reason: 'quit', ms: 1500 });
    assert.equal(q.status[0], 'quit');
    assert.equal(q.finished[0], true);
  }
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.equal(goodCount(s.grids[1]), 46);
  // nobody solves: more conflict-free cells wins; equal -> draw
  let t = game.setup({ level: 'hard', minutes: 5, seed: 8 });
  const sol8 = makeSolution(8);
  const e8 = t.givens.findIndex((v) => !v);
  t = game.applyMove(t, 1, { type: 'set', cell: e8, value: sol8[e8], ms: 10 });
  t = game.applyMove(t, 0, { type: 'finish', ms: 300000 });
  t = game.applyMove(t, 1, { type: 'finish', ms: 300000 });
  assert.deepEqual(game.getResult(t), { winner: 1 });
  let d = game.setup({ level: 'hard', minutes: 5, seed: 8 });
  d = game.applyMove(d, 0, { type: 'finish', ms: 1 });
  d = game.applyMove(d, 1, { type: 'finish', ms: 1 });
  assert.deepEqual(game.getResult(d), { draw: true });
});

test('sudoku: tek telefonda önce bitiren sonucunu görür, "Tamam" deyince telefon geçer', () => {
  let s = game.setup({ level: 'easy', minutes: 0, seed: 5 });
  s = game.applyMove(s, 0, { type: 'finish', ms: 2000 });
  assert.equal(game.getTurn(s).player, 0);
  s = game.applyMove(s, 0, { type: 'seen' });
  assert.equal(game.getTurn(s).player, 1);
});
