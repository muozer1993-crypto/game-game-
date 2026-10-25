import { test, assert } from './runner.js';
import game from '../games/noktalar-kutular.js';

test('noktalar-kutular: çizgi çekme, kutu kapatınca tekrar oynama, sonuç', () => {
  let s = game.setup({ size: 3, seed: 0 });
  assert.equal(s.h.length, 12);
  assert.equal(s.v.length, 12);
  assert.throws(() => game.applyMove(s, 1, { type: 'line', kind: 'h', index: 0 }), 'Sıra sende değil');
  s = game.applyMove(s, 0, { type: 'line', kind: 'h', index: 0 }); // top of box (0,0)
  assert.equal(s.turn, 1);
  assert.throws(() => game.applyMove(s, 1, { type: 'line', kind: 'h', index: 0 }), 'zaten çekilmiş');
  s = game.applyMove(s, 1, { type: 'line', kind: 'h', index: 3 }); // bottom of box (0,0) (row 1, col 0)
  s = game.applyMove(s, 0, { type: 'line', kind: 'v', index: 0 }); // left of box (0,0)
  assert.equal(s.turn, 1);
  s = game.applyMove(s, 1, { type: 'line', kind: 'v', index: 1 }); // right of box (0,0): closes it
  assert.equal(s.boxes[0], 1);
  assert.deepEqual(s.scores, [0, 1]);
  assert.equal(s.turn, 1, 'closing a box grants another move');
  assert.equal(game.getResult(s), null);
});

test('noktalar-kutular: tüm kutular dolunca kazanan / berabere', () => {
  let s = game.setup({ size: 3, seed: 0 });
  // draw every line in order; whoever closes boxes gets points; game must end
  for (let guard = 0; guard < 100 && !s.over; guard++) {
    const kind = s.h.includes(null) ? 'h' : 'v';
    const index = s[kind].indexOf(null);
    s = game.applyMove(s, s.turn, { type: 'line', kind, index });
  }
  assert.equal(s.over, true);
  assert.equal(s.scores[0] + s.scores[1], 9);
  assert.ok(game.getResult(s) !== null);
  assert.throws(() => game.applyMove(s, s.turn, { type: 'line', kind: 'h', index: 0 }), 'Oyun bitti');
  const draw = { ...s, scores: [4, 4] };
  assert.deepEqual(game.getResult(draw), { draw: true });
});
