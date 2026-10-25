import { test, assert } from './runner.js';
import game, { roundWinner } from '../games/tas-kagit-makas.js';

function runAuto(s) {
  for (let guard = 0; guard < 10; guard++) {
    let did = false;
    for (const p of [0, 1]) { const m = game.autoMove(s, p); if (m) { s = game.applyMove(s, p, m); did = true; break; } }
    if (!did) break;
  }
  return s;
}

test('taş kağıt makas: el kazananı, gizli seçim, açılma, seri', () => {
  assert.equal(roundWinner('tas', 'makas'), 0);
  assert.equal(roundWinner('kagit', 'makas'), 1);
  assert.equal(roundWinner('tas', 'tas'), null);
  let s = game.setup({ rounds: 3 });
  assert.equal(s.target, 2);
  assert.deepEqual(game.getTurn(s), { player: 0, private: true });
  s = game.applyMove(s, 0, { type: 'pick', secret: { choice: 'tas' } });
  assert.throws(() => game.applyMove(s, 0, { type: 'pick', secret: { choice: 'tas' } }), 'zaten seçtin');
  assert.equal(game.autoMove(s, 0), null, 'nothing to show until both picked');
  s = game.applyMove(s, 1, { type: 'pick' }); // stripped (other device)
  assert.deepEqual(s.picked, [true, true]);
  assert.equal(game.getTurn(s), null);
  const show0 = game.autoMove(s, 0);
  assert.deepEqual(show0, { type: 'show', choice: 'tas' });
  s = game.applyMove(s, 0, show0);
  assert.equal(s.history.length, 0, 'waits for the other reveal');
  s = game.applyMove(s, 1, { type: 'show', choice: 'makas' });
  assert.deepEqual(s.scores, [1, 0]);
  assert.equal(s.phase, 'result', 'both look at the reveal before the next round');
  assert.equal(game.getTurn(s), null);
  assert.throws(() => game.applyMove(s, 0, { type: 'pick', secret: { choice: 'kagit' } }), 'sonraki ele');
  s = game.applyMove(s, 1, { type: 'next' });
  assert.deepEqual(s.picked, [false, false]);
  assert.deepEqual(game.getTurn(s), { player: 0, private: true });
  // second round: draw, third: player 0 wins -> over
  s = game.applyMove(s, 0, { type: 'pick', secret: { choice: 'kagit' } });
  s = game.applyMove(s, 1, { type: 'pick', secret: { choice: 'kagit' } });
  s = runAuto(s);
  assert.deepEqual(s.scores, [1, 0]);
  assert.equal(s.history[1].winner, null);
  s = game.applyMove(s, 0, { type: 'next' });
  s = game.applyMove(s, 0, { type: 'pick', secret: { choice: 'makas' } });
  s = game.applyMove(s, 1, { type: 'pick', secret: { choice: 'kagit' } });
  s = runAuto(s);
  assert.equal(s.over, true);
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.throws(() => game.applyMove(s, 0, { type: 'pick', secret: { choice: 'tas' } }), 'Oyun bitti');
});
