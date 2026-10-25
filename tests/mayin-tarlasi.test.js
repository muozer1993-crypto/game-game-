import { test, assert } from './runner.js';
import game, { makeField, flood, neighbours, safeCount } from '../games/mayin-tarlasi.js';

test('mayın tarlası: tarla tohuma göre aynı, başlangıç bölgesi güvenli, sayılar doğru', () => {
  const f = makeField(9, 7);
  assert.equal(f.mines.length, 10);
  assert.deepEqual(makeField(9, 7), f);
  assert.notEqual(makeField(9, 8).mines.join(), f.mines.join());
  const safe = new Set([f.start, ...neighbours(9, f.start)]);
  assert.ok(f.mines.every((m) => !safe.has(m)), 'no mine next to the start');
  assert.equal(f.numbers[f.start], 0);
  const region = flood(9, f.numbers, [], f.start).length;
  assert.ok(region >= 3 && region <= 16, 'the opening region is modest: ' + region);
  for (const seed of [1, 2, 3, 4, 5]) for (const size of [8, 9, 12]) {
    const g = makeField(size, seed);
    const n = flood(size, g.numbers, [], g.start).length;
    assert.ok(n >= 3 && n <= Math.max(4, Math.round(size * size / 10)) * 2, `${size}x${size} seed ${seed}: region ${n}`);
  }
  f.numbers.forEach((n, i) => {
    if (n === -1) assert.ok(f.mines.includes(i));
    else assert.equal(n, neighbours(9, i).filter((k) => f.mines.includes(k)).length);
  });
  assert.equal(neighbours(9, 0).length, 3);
  assert.equal(neighbours(9, 40).length, 8);
  assert.equal(makeField(12, 1).mines.length, 22);
});

test('mayın tarlası: açma, taşma, bayrak, mayın, temizleme ve sonuç', () => {
  let s = game.setup({ size: 8, seconds: 0, seed: 3 });
  assert.equal(s.mines.length, 8);
  assert.ok(s.boards[0].revealed.length >= 4, 'the start region is open for both');
  assert.deepEqual(s.boards[0].revealed, s.boards[1].revealed);
  assert.deepEqual(game.getTurn(s), { player: 0, private: true, simultaneous: true });
  const closedSafe = [...Array(64).keys()].filter((i) => s.numbers[i] !== -1 && !s.boards[0].revealed.includes(i));
  const mine = s.mines[0];
  assert.throws(() => game.applyMove(s, 0, { type: 'reveal', cell: s.boards[0].revealed[0] }), 'zaten açık');
  s = game.applyMove(s, 0, { type: 'flag', cell: closedSafe[0] });
  assert.deepEqual(s.boards[0].flags, [closedSafe[0]]);
  assert.throws(() => game.applyMove(s, 0, { type: 'reveal', cell: closedSafe[0] }), 'Bayraklı');
  s = game.applyMove(s, 0, { type: 'flag', cell: closedSafe[0] });
  assert.deepEqual(s.boards[0].flags, []);
  assert.throws(() => game.applyMove(s, 0, { type: 'flag', cell: s.boards[0].revealed[0] }), 'Açık kareye');
  const before = s.boards[0].revealed.length;
  s = game.applyMove(s, 0, { type: 'reveal', cell: closedSafe[0], ms: 500 });
  assert.ok(s.boards[0].revealed.length > before, 'cell opened');
  assert.equal(s.boards[1].revealed.length, before, 'the other board untouched');
  // player 1 hits a mine
  s = game.applyMove(s, 1, { type: 'reveal', cell: mine, ms: 900 });
  assert.equal(s.boards[1].status, 'dead');
  assert.equal(s.finished[1], true);
  assert.throws(() => game.applyMove(s, 1, { type: 'reveal', cell: closedSafe[1] }), 'tarlan bitti');
  assert.deepEqual(game.getTurn(s), { player: 0, private: true, simultaneous: true });
  // player 0 clears everything
  for (let i = 0; i < 64; i++) {
    if (s.phase !== 'play' || s.numbers[i] === -1 || s.boards[0].revealed.includes(i)) continue;
    s = game.applyMove(s, 0, { type: 'reveal', cell: i, ms: 1000 + i });
  }
  assert.equal(s.boards[0].status, 'cleared');
  assert.equal(s.boards[0].revealed.length, safeCount(s));
  assert.equal(s.phase, 'over');
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.throws(() => game.applyMove(s, 0, { type: 'flag', cell: 0 }), 'Oyun bitti');
  // nobody clears: more cells wins; both time out equal -> draw
  let t = game.setup({ size: 8, seconds: 120, seed: 3 });
  t = game.applyMove(t, 0, { type: 'reveal', cell: closedSafe[0], ms: 100 });
  t = game.applyMove(t, 0, { type: 'finish', ms: 120000 });
  t = game.applyMove(t, 1, { type: 'finish', ms: 120000 });
  assert.equal(t.boards[0].status, 'time');
  {
    let q = game.setup({ size: 8, seconds: 120, seed: 3 });
    q = game.applyMove(q, 1, { type: 'finish', reason: 'quit', ms: 700 });
    assert.equal(q.boards[1].status, 'quit', 'a voluntary Bitir is a quit, not a time-out');
  }
  assert.deepEqual(game.getResult(t), { winner: 0 });
  let d = game.setup({ size: 8, seconds: 120, seed: 3 });
  d = game.applyMove(d, 0, { type: 'finish', ms: 1 });
  d = game.applyMove(d, 1, { type: 'finish', ms: 1 });
  assert.deepEqual(game.getResult(d), { draw: true });
  // flood opens a whole zero region
  const f = makeField(8, 3);
  const region = flood(8, f.numbers, [], f.start);
  assert.ok(region.length >= 4 && region.includes(f.start));
  assert.ok(region.every((i) => f.numbers[i] !== -1));
});
