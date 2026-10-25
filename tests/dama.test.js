import { test, assert } from './runner.js';
import game, { legalMoves } from '../games/dama.js';

const N = 8;
const empty = () => ({ ...game.setup({ seed: 0 }), cells: new Array(64).fill(null), turn: 0 });
const put = (s, r, c, p, k = false) => { s.cells[r * N + c] = { p, k }; return s; };

test('dama: başlangıç, ileri/yan hamle, geri yok', () => {
  const s = game.setup({ seed: 0 });
  assert.equal(s.cells.filter((c) => c && c.p === 0).length, 16);
  const moves = legalMoves(s);
  // player 0's front row is row 5: each piece can move up (row 4); sideways is blocked by neighbours except none at the edges? sideways squares occupied
  assert.ok(moves.every((m) => m.captured.length === 0));
  assert.ok(moves.some((m) => m.from === 5 * N + 3 && m.path[1] === 4 * N + 3), 'forward move exists');
  assert.ok(!moves.some((m) => m.from === 6 * N + 3), 'back row pieces blocked');
  let e = empty(); put(e, 4, 4, 0);
  const em = legalMoves(e).map((m) => m.path[1]).sort((a, b) => a - b);
  assert.deepEqual(em, [3 * N + 4, 4 * N + 3, 4 * N + 5], 'man moves forward or sideways only');
});

test('dama: alma zorunlu, en çok alan dizi, çoklu atlama', () => {
  let s = empty();
  put(s, 5, 2, 0); put(s, 4, 2, 1); put(s, 2, 2, 1); put(s, 5, 6, 0); put(s, 4, 6, 1);
  // from (5,2): jump (4,2) -> (3,2), then (2,2) -> (1,2): 2 captures. From (5,6): one capture. Max rule -> only the double.
  const moves = legalMoves(s);
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0].captured, [4 * N + 2, 2 * N + 2]);
  assert.deepEqual(moves[0].path, [5 * N + 2, 3 * N + 2, 1 * N + 2]);
  assert.throws(() => game.applyMove(s, 0, { type: 'move', from: 5 * N + 6, path: [3 * N + 6] }), 'kurallara uymuyor');
  s = game.applyMove(s, 0, { type: 'move', from: 5 * N + 2, path: [3 * N + 2, 1 * N + 2] });
  assert.equal(s.cells[4 * N + 2], null);
  assert.equal(s.cells[2 * N + 2], null);
  assert.ok(s.cells[1 * N + 2] && s.cells[1 * N + 2].p === 0);
  assert.equal(s.turn, 1);
});

test('dama: dama olma, dama uzaktan alır, tek taşa karşı dama kazanır', () => {
  let s = empty();
  put(s, 1, 0, 0); put(s, 5, 5, 1); put(s, 6, 6, 1);
  s = game.applyMove(s, 0, { type: 'move', from: 1 * N + 0, path: [0 * N + 0] });
  assert.equal(s.cells[0].k, true, 'promoted on the last row');
  // player 1 moves something harmless
  s = game.applyMove(s, 1, { type: 'move', from: 6 * N + 6, path: [7 * N + 6] });
  assert.equal(s.cells[7 * N + 6].k, true);
  // king at (0,0); enemy at (0,5): king captures from distance along the row, landing on (0,6) or (0,7)
  let k = empty(); put(k, 0, 0, 0, true); put(k, 0, 5, 1); put(k, 7, 7, 1);
  const km = legalMoves(k);
  assert.ok(km.every((m) => m.captured.length === 1), 'capture mandatory for the king');
  assert.deepEqual(km.map((m) => m.path[1]).sort((a, b) => a - b), [6, 7]);
  // lone man vs king -> game over for the man's side
  let l = empty(); put(l, 0, 0, 0, true); put(l, 7, 7, 1); l.turn = 0;
  l = game.applyMove(l, 0, { type: 'move', from: 0, path: [1] });
  assert.equal(l.over, true);
  assert.deepEqual(game.getResult(l), { winner: 0 });
});

test('dama: hamlesi olmayan kaybeder, taşı bitince kaybeder', () => {
  let s = empty();
  put(s, 4, 4, 0); put(s, 3, 4, 1); put(s, 0, 0, 0, true);
  // player 0 captures the only enemy piece -> wins
  const m = legalMoves(s).find((x) => x.captured.length);
  s = game.applyMove(s, 0, { type: 'move', from: m.from, path: m.path.slice(1) });
  assert.equal(s.over, true);
  assert.equal(s.winner, 0);
});
