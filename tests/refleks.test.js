import { test, assert } from './runner.js';
import game, { roundWinner } from '../games/refleks.js';

test('refleks: kurulum ve el kazananı', () => {
  const s = game.setup({ rounds: 3, seed: 4 });
  assert.equal(s.delays.length, 3);
  assert.ok(s.delays.every((d) => d >= 1500 && d < 5000));
  assert.deepEqual(game.setup({ rounds: 3, seed: 4 }).delays, s.delays, 'shared by seed');
  assert.deepEqual(game.getTurn(s), { player: 0, private: false, simultaneous: true });
  assert.equal(roundWinner([200, 300]), 0);
  assert.equal(roundWinner([300, 200]), 1);
  assert.equal(roundWinner([250, 250]), null);
  assert.equal(roundWinner(['early', 400]), 1);
  assert.equal(roundWinner([400, 'none']), 0);
  assert.equal(roundWinner(['early', 'none']), 1, 'the early tap loses even against no tap');
  assert.equal(roundWinner(['none', 'none']), null);
  assert.equal(roundWinner(['early', 'early']), null);
});

test('refleks: tek telefonda bölgeler, erken dokunma, çoğunluk alan kazanır', () => {
  let s = game.setup({ rounds: 3, seed: 4 });
  assert.throws(() => game.applyMove(s, 0, { type: 'tap', who: 0, time: 100 }), 'Bu el bitti');
  s = game.applyMove(s, 0, { type: 'start' });
  assert.equal(s.phase, 'wait');
  // one phone: the zone decides who tapped, whatever player the session dispatches for
  let r = game.applyMove(s, 0, { type: 'tap', who: 1, time: 180 });
  assert.deepEqual(r.times, [null, 180]);
  assert.equal(r.phase, 'wait', 'waits for the other report');
  r = game.applyMove(r, 0, { type: 'tap', who: 0, time: 250 });
  assert.equal(r.phase, 'result');
  assert.deepEqual(r.scores, [0, 1]);
  assert.deepEqual(r.history, [{ times: [250, 180], winner: 1 }]);
  assert.equal(game.applyMove(r, 0, { type: 'next' }).round, 1);
  // an early tap ends the round at once for the other player
  let e = game.applyMove(s, 0, { type: 'tap', who: 0, time: 'early' });
  assert.equal(e.phase, 'result');
  assert.deepEqual(e.scores, [0, 1]);
  // online: a device may only report for its own player
  assert.throws(() => game.applyMove(s, 0, { type: 'tap', who: 1, time: 100 }, { mode: 'online' }), 'Başkası adına');
  const o = game.applyMove(s, 1, { type: 'tap', who: 1, time: 100 }, { mode: 'online' });
  assert.deepEqual(o.times, [null, 100]);
  // play to the end: 2 wins of 3 ends early
  let g = game.applyMove(game.applyMove(s, 0, { type: 'tap', who: 0, time: 100 }), 0, { type: 'tap', who: 1, time: 200 });
  g = game.applyMove(g, 0, { type: 'next' });
  g = game.applyMove(g, 0, { type: 'start' });
  g = game.applyMove(game.applyMove(g, 0, { type: 'tap', who: 0, time: 150 }), 0, { type: 'tap', who: 1, time: 'none' });
  assert.equal(g.phase, 'over', 'two of three rounds won');
  assert.deepEqual(game.getResult(g), { winner: 0 });
  assert.throws(() => game.applyMove(g, 0, { type: 'next' }), 'Oyun bitti');
});
