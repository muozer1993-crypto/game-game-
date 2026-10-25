import { test, assert } from './runner.js';
import game, { calc, solve, makePuzzle, replay, closest, points } from '../games/hedef-sayi.js';

test('hedef sayı: işlemler, çözücü, bulmaca üretimi', () => {
  assert.equal(calc(7, '+', 3), 10);
  assert.equal(calc(7, '−', 3), 4);
  assert.equal(calc(3, '−', 7), null, 'no negative results');
  assert.equal(calc(7, '×', 3), 21);
  assert.equal(calc(9, '÷', 3), 3);
  assert.equal(calc(9, '÷', 2), null, 'no fractions');
  const s = solve([100, 7, 3, 2, 9, 5], 735);
  assert.equal(s.value, 735);
  // every step is legal and reaches the value
  const rp = replay([100, 7, 3, 2, 9, 5], s.steps);
  assert.ok(rp && rp.pool.includes(735));
  assert.equal(solve([1, 2, 3], 999).value, 9, 'closest when unreachable: (1+2)×3');
  const p = makePuzzle(42, 1);
  assert.equal(p.numbers.length, 6);
  assert.equal(p.numbers.filter((n) => n >= 25).length, 1);
  assert.ok(p.target >= 101 && p.target <= 999);
  assert.deepEqual(makePuzzle(42, 1), p, 'deterministic');
  const r = replay(p.numbers, p.solution);
  assert.ok(r && r.pool.includes(p.target), 'the stored solution really hits the target');
  assert.equal(makePuzzle(43, 2).numbers.filter((n) => n >= 25).length, 2);
  assert.equal(points(0), 10); assert.equal(points(5), 7); assert.equal(points(10), 5); assert.equal(points(11), 0);
  assert.equal(closest([3, 90, 110], 100), 90);
});

test('hedef sayı: akış — gönder, puan, karşılaştır, sonraki tur, bitiş; geçersiz adımlar', () => {
  let s = game.setup({ rounds: 3, seconds: 60, large: 1, seed: 5 });
  const pz = s.puzzles[0];
  assert.deepEqual(game.getTurn(s), { player: 0, private: true, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'next' }), 'henüz bitmedi');
  // player 0 submits the real solution
  s = game.applyMove(s, 0, { type: 'submit', steps: pz.solution });
  assert.equal(s.answers[0][0].value, pz.target);
  assert.equal(s.answers[0][0].diff, 0);
  assert.equal(s.phase, 'play');
  assert.throws(() => game.applyMove(s, 0, { type: 'submit', steps: [] }), 'zaten verdin');
  // player 1 sends illegal steps (a number not in the pool): treated as no steps -> closest raw number
  s = game.applyMove(s, 1, { type: 'submit', steps: [{ a: 999, op: '+', b: 1 }] });
  assert.equal(s.answers[0][1].value, closest(pz.numbers, pz.target));
  assert.equal(s.phase, 'compare');
  assert.equal(s.scores[0], 10);
  assert.equal(s.scores[1], points(s.answers[0][1].diff));
  assert.equal(game.getTurn(s), null);
  s = game.applyMove(s, 1, { type: 'next' });
  assert.equal(s.round, 1);
  assert.equal(s.phase, 'play');
  // a partial but legal path is replayed and the closest pool number counts
  const q = s.puzzles[1];
  const first = q.solution[0];
  s = game.applyMove(s, 1, { type: 'submit', steps: [first] });
  assert.ok(s.answers[1][1].steps.length === 1 && s.answers[1][1].steps[0].r === first.r);
  s = game.applyMove(s, 0, { type: 'submit' });
  s = game.applyMove(s, 0, { type: 'next' });
  s = game.applyMove(s, 0, { type: 'submit', steps: s.puzzles[2].solution });
  s = game.applyMove(s, 1, { type: 'submit', steps: s.puzzles[2].solution });
  s = game.applyMove(s, 1, { type: 'next' });
  assert.equal(s.phase, 'over');
  const r = game.getResult(s);
  assert.ok(r && (r.draw || r.winner === 0 || r.winner === 1));
  assert.throws(() => game.applyMove(s, 0, { type: 'next' }), 'Oyun bitti');
});
