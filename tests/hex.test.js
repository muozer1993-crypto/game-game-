import { test, assert } from './runner.js';
import game, { winningPath } from '../games/hex.js';

test('hex: kurulum, hamleler, dikey ve yatay bağlantı, altıgen komşuluğu', () => {
  let s = game.setup({ size: 5, seed: 2 }); // player 0 starts and takes top-bottom
  assert.equal(s.cells.length, 25);
  assert.equal(s.vertical, 0);
  assert.throws(() => game.applyMove(s, 1, { type: 'place', cell: 0 }), 'Sıra sende değil');
  // player 0 goes straight down column 2; player 1 fills row 4 from the left (never completes)
  for (let r = 0; r < 4; r++) {
    s = game.applyMove(s, 0, { type: 'place', cell: r * 5 + 2 });
    assert.throws(() => game.applyMove(s, 1, { type: 'place', cell: r * 5 + 2 }), 'dolu');
    s = game.applyMove(s, 1, { type: 'place', cell: 4 * 5 + [0, 1, 3, 4][r] });
  }
  assert.equal(s.over, false);
  s = game.applyMove(s, 0, { type: 'place', cell: 4 * 5 + 2 });
  assert.equal(s.over, true);
  assert.equal(s.winner, 0);
  assert.deepEqual(s.path, [2, 7, 12, 17, 22]);
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.throws(() => game.applyMove(s, 1, { type: 'place', cell: 1 }), 'Oyun bitti');
  // horizontal win for player 1 using the diagonal hex neighbour (r+1, c-1)
  let h = game.setup({ size: 5, seed: 2 });
  const cells = h.cells.slice();
  // a staircase from the left edge to the right edge: (0,0) (1,0) (1,1) (0,2)? no: use (2,0) (2,1) (1,2) (1,3) (0,4)
  [10, 11, 7, 8, 4].forEach((i) => { cells[i] = 1; });
  cells[4] = null;
  h = { ...h, cells, turn: 1 };
  assert.equal(winningPath(h, 1), null, 'not connected yet');
  h = game.applyMove(h, 1, { type: 'place', cell: 4 });
  assert.equal(h.winner, 1, '(1,3)->(0,4) is a hex neighbour, so the chain reaches the right edge');
  assert.ok(h.path.includes(10) && h.path.includes(4));
  // (r+1, c+1) is NOT a neighbour: a chain needing that step does not win
  let d = game.setup({ size: 5, seed: 2 });
  const c2 = d.cells.slice();
  [0, 6, 12, 18].forEach((i) => { c2[i] = 0; }); // main diagonal down-right
  d = { ...d, cells: c2, turn: 0 };
  d = game.applyMove(d, 0, { type: 'place', cell: 24 });
  assert.equal(d.over, false, 'down-right diagonal stones do not touch');
  assert.equal(game.setup({ size: 5, seed: 3 }).vertical, 1, 'odd seed: player 1 starts and takes top-bottom');
});
