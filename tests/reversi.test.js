import { test, assert } from './runner.js';
import game, { flips, legalMoves, counts, N } from '../games/reversi.js';

test('reversi: başlangıç dizilişi, siyah başlar, dört açılış hamlesi', () => {
  const s = game.setup({ seed: 2 }); // player 0 is black
  assert.equal(s.black, 0);
  assert.equal(s.turn, 0);
  assert.deepEqual(counts(s.cells), [2, 2]);
  assert.deepEqual(legalMoves(s.cells, 0), [19, 26, 37, 44]);
  assert.deepEqual(legalMoves(s.cells, 1), [20, 29, 34, 43]);
  const t = game.setup({ seed: 3 });
  assert.equal(t.black, 1, 'odd seed: player 1 plays black');
  assert.equal(t.turn, 1);
  assert.deepEqual(game.getTurn(s), { player: 0, private: false });
});

test('reversi: taş çevirme, geçersiz hamleler, sıra', () => {
  let s = game.setup({ seed: 2 });
  assert.throws(() => game.applyMove(s, 1, { type: 'place', cell: 20 }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'place', cell: 27 }), 'dolu');
  assert.throws(() => game.applyMove(s, 0, { type: 'place', cell: 0 }), 'hiç taş çevirmiyor');
  assert.throws(() => game.applyMove(s, 0, { type: 'place', cell: 99 }), 'Geçersiz kare');
  assert.deepEqual(flips(s.cells, 19, 0), [27]);
  s = game.applyMove(s, 0, { type: 'place', cell: 19 });
  assert.equal(s.cells[19], 0);
  assert.equal(s.cells[27], 0, 'd4 flipped to black');
  assert.deepEqual(counts(s.cells), [4, 1]);
  assert.equal(s.turn, 1);
  assert.equal(s.last, 19);
  assert.deepEqual(s.flipped, [27]);
  assert.equal(s.passed, null);
  // white answers c3 (18): flips d4 back? no — c3 sandwiches d4 (27) with e5 (36)
  assert.deepEqual(flips(s.cells, 18, 1), [27]);
  s = game.applyMove(s, 1, { type: 'place', cell: 18 });
  assert.deepEqual(counts(s.cells), [3, 3]);
  assert.equal(game.getResult(s), null);
});

test('reversi: oynayamayan geçer, ikisi de oynayamazsa biter ve çok taşı olan kazanır', () => {
  const cells = new Array(N * N).fill(null);
  cells[0] = 0; cells[1] = 1; cells[2] = 1;  // black can play 3
  cells[16] = 0; cells[17] = 1;              // black can later play 18
  let s = { ...game.setup({ seed: 2 }), cells };
  s = game.applyMove(s, 0, { type: 'place', cell: 3 });
  assert.deepEqual(s.cells.slice(0, 4), [0, 0, 0, 0]);
  assert.equal(s.passed, 1, 'white has no move and passes');
  assert.equal(s.turn, 0, 'black moves again');
  assert.equal(s.over, false);
  s = game.applyMove(s, 0, { type: 'place', cell: 18 });
  assert.equal(s.over, true, 'no white discs left: nobody can move');
  assert.deepEqual(counts(s.cells), [7, 0]);
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.equal(game.getTurn(s), null);
  assert.throws(() => game.applyMove(s, 0, { type: 'place', cell: 30 }), 'Oyun bitti');
  // a draw: the board locks with equal discs (three isolated white discs nobody can reach)
  const d = new Array(N * N).fill(null);
  d[0] = 0; d[1] = 1; d[56] = 1; d[57] = 1; d[58] = 1;
  let t = { ...game.setup({ seed: 2 }), cells: d };
  t = game.applyMove(t, 0, { type: 'place', cell: 2 });
  assert.equal(t.over, true);
  assert.deepEqual(counts(t.cells), [3, 3]);
  assert.deepEqual(game.getResult(t), { draw: true });
});
