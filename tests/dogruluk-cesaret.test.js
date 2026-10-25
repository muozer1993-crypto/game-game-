import { test, assert } from './runner.js';
import game, { SCORE } from '../games/dogruluk-cesaret.js';

const ctx = { dogruluk: { truths: ['t0', 't1', 't2'], dares: ['d0', 'd1'] } };

test('doğruluk mu cesaret mi: seçim, kart sırası, değiştirme, hakem, puan, bitiş', () => {
  let s = game.setup({ rounds: 3, seed: 4 }, ctx);
  assert.equal(s.order.truth.length, 3);
  assert.equal(s.order.dare.length, 2);
  assert.deepEqual(game.setup({ rounds: 3, seed: 4 }, ctx).order, s.order, 'same order on both phones');
  assert.deepEqual(game.getTurn(s), { player: 0, private: false });
  assert.throws(() => game.applyMove(s, 1, { type: 'pick', kind: 'dare' }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'resolve', done: true }), 'Sonuçlanacak kart yok');
  s = game.applyMove(s, 0, { type: 'pick', kind: 'dare' });
  assert.equal(s.phase, 'prompt');
  assert.equal(s.current.kind, 'dare');
  assert.equal(s.current.index, s.order.dare[0]);
  assert.deepEqual(game.getTurn(s), { player: 1, private: false }, 'the judge is on turn');
  assert.throws(() => game.applyMove(s, 0, { type: 'resolve', done: true }, { mode: 'online' }), 'Hakem diğer oyuncu');
  assert.equal(game.applyMove(s, 1, { type: 'resolve', done: true }, { mode: 'online' }).scores[0], 2, 'online: the judge resolves');
  // swap once
  s = game.applyMove(s, 0, { type: 'swap' });
  assert.equal(s.current.index, s.order.dare[1]);
  assert.equal(s.current.swapped, true);
  assert.throws(() => game.applyMove(s, 0, { type: 'swap' }), 'bir kez');
  assert.throws(() => game.applyMove(s, 1, { type: 'swap' }, { mode: 'online' }), 'yalnızca sırası gelen');
  s = game.applyMove(s, 1, { type: 'resolve', done: true });
  assert.deepEqual(s.scores, [SCORE.dare, 0]);
  assert.equal(s.turn, 1);
  assert.equal(s.phase, 'choose');
  assert.equal(s.history.length, 1);
  // the dare pool wraps around when exhausted
  let t = game.applyMove(s, 1, { type: 'pick', kind: 'dare' });
  assert.equal(t.current.index, s.order.dare[0], 'wraps to the first card again');
  s = game.applyMove(s, 1, { type: 'pick', kind: 'truth' });
  s = game.applyMove(s, 0, { type: 'resolve', done: false });
  assert.deepEqual(s.scores, [2, 0]);
  // play out the remaining rounds
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 20) {
    s = game.applyMove(s, s.turn, { type: 'pick', kind: 'truth' });
    s = game.applyMove(s, 1 - s.turn, { type: 'resolve', done: true });
  }
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.played, [3, 3]);
  assert.deepEqual(s.scores, [4, 2]);
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.throws(() => game.applyMove(s, 0, { type: 'pick', kind: 'truth' }), 'Oyun bitti');
});
