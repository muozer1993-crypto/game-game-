import { test, assert } from './runner.js';
import game, { START_LEN, MAX_LEN } from '../games/hafiza-dizisi.js';

test('hafıza dizisi: dizi tohuma göre aynı; doğru dokunuşlar uzatır, yanlış bitirir; sonuç', () => {
  let s = game.setup({ seed: 6 });
  assert.equal(s.sequence.length, MAX_LEN);
  assert.deepEqual(s.sequence, game.setup({ seed: 6 }).sequence);
  assert.deepEqual(s.length, [START_LEN, START_LEN]);
  assert.deepEqual(game.getTurn(s), { player: 0, private: true, simultaneous: true });
  const seq = s.sequence;
  // player 0 repeats rounds of 3 and 4 correctly, then fails in round 5
  for (let i = 0; i < 3; i++) s = game.applyMove(s, 0, { type: 'tap', pad: seq[i] });
  assert.equal(s.reached[0], 3);
  assert.equal(s.length[0], 4);
  assert.equal(s.pos[0], 0);
  for (let i = 0; i < 4; i++) s = game.applyMove(s, 0, { type: 'tap', pad: seq[i] });
  assert.equal(s.reached[0], 4);
  s = game.applyMove(s, 0, { type: 'tap', pad: seq[0] });
  assert.equal(s.pos[0], 1);
  s = game.applyMove(s, 0, { type: 'tap', pad: (seq[1] + 1) % 4 }); // mistake
  assert.equal(s.done[0], true);
  assert.equal(s.reached[0], 4);
  assert.throws(() => game.applyMove(s, 0, { type: 'tap', pad: 0 }), 'turun bitti');
  assert.deepEqual(game.getTurn(s), { player: 1, private: true, simultaneous: true });
  // player 1 fails at once: 2 (rounds completed before the mistake = START_LEN - 1)
  const quick = game.applyMove(s, 1, { type: 'tap', pad: (seq[0] + 1) % 4 });
  assert.equal(quick.reached[1], 0, 'a mistake before completing any round credits nothing');
  assert.equal(quick.phase, 'over');
  assert.deepEqual(game.getResult(quick), { winner: 0 });
  // a draw when both reach the same
  let d = s;
  for (let i = 0; i < 3; i++) d = game.applyMove(d, 1, { type: 'tap', pad: seq[i] });
  for (let i = 0; i < 4; i++) d = game.applyMove(d, 1, { type: 'tap', pad: seq[i] });
  d = game.applyMove(d, 1, { type: 'tap', pad: (seq[0] + 2) % 4 });
  assert.deepEqual(game.getResult(d), { draw: true });
  assert.throws(() => game.applyMove(d, 1, { type: 'tap', pad: 0 }), 'Oyun bitti');
  assert.throws(() => game.applyMove(s, 1, { type: 'tap', pad: 7 }), 'Geçersiz düğme');
});
