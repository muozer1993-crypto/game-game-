import { test, assert } from './runner.js';
import game, { findLine } from '../games/bes-tas.js';

test('beş taş: kurulum, hamleler, beş yapma, çapraz, berabere', () => {
  let s = game.setup({ size: 11, seed: 4 });
  assert.equal(s.cells.length, 121);
  assert.equal(s.turn, 0);
  assert.equal(s.black, 0);
  assert.equal(game.setup({ size: 11, seed: 5 }).turn, 1);
  assert.throws(() => game.applyMove(s, 1, { type: 'place', cell: 0 }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'place', cell: 999 }), 'Geçersiz kare');
  // player 0 builds a row on row 5 (cols 0..4), player 1 drops stones on row 6
  for (let i = 0; i < 4; i++) {
    s = game.applyMove(s, 0, { type: 'place', cell: 5 * 11 + i });
    assert.throws(() => game.applyMove(s, 1, { type: 'place', cell: 5 * 11 + i }), 'dolu');
    s = game.applyMove(s, 1, { type: 'place', cell: 6 * 11 + i });
  }
  assert.equal(s.over, false);
  s = game.applyMove(s, 0, { type: 'place', cell: 5 * 11 + 4 });
  assert.equal(s.over, true);
  assert.equal(s.winner, 0);
  assert.deepEqual(s.line, [55, 56, 57, 58, 59]);
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.throws(() => game.applyMove(s, 1, { type: 'place', cell: 0 }), 'Oyun bitti');
  // diagonal and six-in-a-row
  let d = game.setup({ size: 11, seed: 4 });
  const cells = d.cells.slice();
  [0, 12, 24, 48, 60].forEach((i) => { cells[i] = 0; }); // diagonal with a gap at 36
  d = { ...d, cells };
  d = game.applyMove(d, 0, { type: 'place', cell: 36 });
  assert.equal(d.winner, 0);
  assert.equal(d.line.length, 6, 'six in a row also wins');
  assert.ok(findLine(d, 36, 0));
  // a full board without five: draw
  let f = game.setup({ size: 11, seed: 4 });
  const full = f.cells.map((_, i) => { const r = Math.floor(i / 11); const c = i % 11; return (Math.floor(c / 3) + r) % 2; }); // 3-wide stripes shifted per row
  full[120] = null;
  f = { ...f, cells: full, turn: (Math.floor(10 / 3) + 10) % 2 };
  f = game.applyMove(f, f.turn, { type: 'place', cell: 120 });
  assert.equal(f.over, true);
  assert.equal(f.winner, null, 'no five anywhere: draw');
  assert.deepEqual(game.getResult(f), { draw: true });
});
