import { test, assert } from './runner.js';
import game, { rollDice, countFace, isRaise, minRaise } from '../games/yalanci-zar.js';

test('yalancı zar: zarlar tohuma göre aynı, 1–6 arası, sıralı; sayım ve joker', () => {
  const d = rollDice(7, 0, [5, 5]);
  assert.deepEqual(d, rollDice(7, 0, [5, 5]));
  assert.ok(d[0].length === 5 && d[1].length === 5);
  assert.ok(d.flat().every((x) => x >= 1 && x <= 6));
  assert.ok(JSON.stringify(rollDice(7, 1, [5, 5])) !== JSON.stringify(d), 'new round, new dice');
  assert.deepEqual(rollDice(7, 0, [2, 0])[1], []);
  assert.equal(countFace([[1, 3, 5], [5, 5, 2]], 5, true), 4);
  assert.equal(countFace([[1, 3, 5], [5, 5, 2]], 5, false), 3);
  assert.ok(isRaise(null, 1, 2, 10) && !isRaise(null, 0, 2, 10) && !isRaise(null, 11, 2, 10) && !isRaise(null, 1, 1, 10) && !isRaise(null, 1, 7, 10));
  assert.ok(isRaise({ q: 2, f: 4 }, 2, 5, 10) && isRaise({ q: 2, f: 4 }, 3, 2, 10));
  assert.ok(!isRaise({ q: 2, f: 4 }, 2, 4, 10) && !isRaise({ q: 2, f: 4 }, 1, 6, 10) && !isRaise({ q: 2, f: 4 }, 2, 3, 10));
  assert.deepEqual(minRaise(null, 10), { q: 1, f: 2 });
  // ones not wild: ones are a face like any other (the lowest)
  assert.ok(isRaise(null, 1, 1, 10, false) && !isRaise(null, 1, 1, 10, true));
  assert.deepEqual(minRaise(null, 10, false), { q: 1, f: 1 });
  assert.deepEqual(minRaise({ q: 2, f: 6 }, 10, false), { q: 3, f: 1 });
  assert.ok(isRaise({ q: 2, f: 1 }, 2, 2, 10, false));
  assert.deepEqual(minRaise({ q: 2, f: 4 }, 10), { q: 2, f: 5 });
  assert.deepEqual(minRaise({ q: 2, f: 6 }, 10), { q: 3, f: 2 });
  assert.equal(minRaise({ q: 10, f: 6 }, 10), null);
});

test('yalancı zar: teklif, yalan, zar kaybı, yeni el, bitiş', () => {
  let s = game.setup({ dice: 3, wild: true, seed: 5 });
  assert.deepEqual(s.counts, [3, 3]);
  assert.deepEqual(game.getTurn(s), { player: 0, private: true });
  assert.throws(() => game.applyMove(s, 1, { type: 'bid', q: 1, f: 2 }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'challenge' }), 'Henüz teklif yok');
  assert.throws(() => game.applyMove(s, 0, { type: 'bid', q: 7, f: 2 }), 'yüksek olmalı');
  // a bid that cannot hold: 6 sixes on 6 dice unless every die is a six or a one
  const sixes = countFace(s.dice, 6, true);
  s = game.applyMove(s, 0, { type: 'bid', q: 1, f: 2 });
  assert.deepEqual(s.bid, { q: 1, f: 2, by: 0 });
  assert.equal(s.turn, 1);
  assert.throws(() => game.applyMove(s, 1, { type: 'bid', q: 1, f: 2 }), 'yüksek olmalı');
  s = game.applyMove(s, 1, { type: 'bid', q: 6, f: 6 });
  s = game.applyMove(s, 0, { type: 'challenge' });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.last.count, sixes);
  const loser = sixes >= 6 ? 0 : 1;
  assert.equal(s.last.loser, loser);
  assert.deepEqual(s.counts, loser === 1 ? [3, 2] : [2, 3]);
  assert.equal(game.getTurn(s), null, 'reveal is looked at together');
  assert.throws(() => game.applyMove(s, 0, { type: 'bid', q: 1, f: 2 }), 'zarlar açılsın');
  s = game.applyMove(s, 0, { type: 'next' });
  assert.equal(s.round, 1);
  assert.equal(s.turn, loser, 'the loser starts the next round');
  assert.equal(s.bid, null);
  assert.equal(s.dice[loser].length, 2);
  // a sure bid: one of the bidder's own faces (or a one as wild) always holds -> challenger loses
  const own = s.dice[loser].find((d) => d !== 1) || 2;
  s = game.applyMove(s, loser, { type: 'bid', q: 1, f: own });
  s = game.applyMove(s, 1 - loser, { type: 'challenge' });
  assert.equal(s.last.holds, true);
  assert.equal(s.last.loser, 1 - loser);
  // play on until someone runs out
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 50) {
    if (s.phase === 'reveal') { s = game.applyMove(s, 0, { type: 'next' }); continue; }
    const t = s.turn;
    const total = s.counts[0] + s.counts[1];
    s = game.applyMove(s, t, { type: 'bid', q: total, f: 6 });
    s = game.applyMove(s, 1 - t, { type: 'challenge' });
  }
  assert.equal(s.phase, 'over');
  const r = game.getResult(s);
  assert.ok(r && (r.winner === 0 || r.winner === 1));
  assert.equal(s.counts[1 - r.winner], 0);
  assert.throws(() => game.applyMove(s, 0, { type: 'next' }), 'Oyun bitti');
  // wild off
  const w = game.setup({ dice: 3, wild: false, seed: 5 });
  assert.equal(w.wild, false);
});
