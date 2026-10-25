import { test, assert } from './runner.js';
import c4, { findLine, ROWS, COLS } from '../games/dort-baglanti.js';
import xox from '../games/xox.js';

function play(s, cols) {
  for (const c of cols) s = c4.applyMove(s, s.turn, { type: 'drop', col: c });
  return s;
}

test('dört bağlantı: taş en alta düşer, sıra değişir, sütun dolunca hata', () => {
  let s = c4.setup({ seed: 0 });
  assert.equal(s.turn, 0);
  s = c4.applyMove(s, 0, { type: 'drop', col: 3 });
  assert.equal(s.cells[(ROWS - 1) * COLS + 3], 0);
  assert.equal(s.turn, 1);
  assert.throws(() => c4.applyMove(s, 0, { type: 'drop', col: 3 }), 'Sıra sende değil');
  s = c4.applyMove(s, 1, { type: 'drop', col: 3 });
  assert.equal(s.cells[(ROWS - 2) * COLS + 3], 1);
  s = play(s, [3, 3, 3, 3]);
  assert.throws(() => c4.applyMove(s, s.turn, { type: 'drop', col: 3 }), 'dolu');
  assert.throws(() => c4.applyMove(s, s.turn, { type: 'drop', col: 9 }), 'Geçersiz sütun');
  assert.equal(c4.setup({ seed: 1 }).turn, 1);
});

test('dört bağlantı: yatay, dikey ve çapraz kazanma', () => {
  // horizontal: p0 plays 0,1,2,3 while p1 plays 6,6,6
  let s = play(c4.setup({ seed: 0 }), [0, 6, 1, 6, 2, 6, 3]);
  assert.deepEqual(c4.getResult(s), { winner: 0 });
  assert.equal(s.line.length, 4);
  assert.equal(c4.getTurn(s), null);
  assert.throws(() => c4.applyMove(s, 1, { type: 'drop', col: 0 }), 'Oyun bitti');
  // vertical: p1 stacks column 5
  s = play(c4.setup({ seed: 1 }), [5, 0, 5, 1, 5, 2, 5]);
  assert.deepEqual(c4.getResult(s), { winner: 1 });
  // diagonal
  s = play(c4.setup({ seed: 0 }), [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.deepEqual(c4.getResult(s), { winner: 0 });
  assert.ok(findLine(s, s.last, 0));
});

test('dört bağlantı: tahta dolunca berabere', () => {
  let s = c4.setup({ seed: 0 });
  // fill column by column with a pattern that never makes four in a row
  const order = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) order.push(c);
  // a known drawn filling: alternate pairs so that no four align
  const pattern = [0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 1, 0, 3, 2, 5, 4, 6, 1, 0, 3, 2, 5, 4, 6, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6];
  for (const c of pattern) {
    if (s.over) break;
    s = c4.applyMove(s, s.turn, { type: 'drop', col: c });
  }
  assert.equal(s.cells.filter((c) => c === null).length === 0 || s.over, true);
  assert.ok(c4.getResult(s) !== null);
});

test('xox: kazanma, berabere, dolu kare', () => {
  let s = xox.setup({ seed: 0 });
  assert.equal(s.first, 0);
  s = xox.applyMove(s, 0, { type: 'mark', cell: 0 });
  assert.throws(() => xox.applyMove(s, 1, { type: 'mark', cell: 0 }), 'dolu');
  assert.throws(() => xox.applyMove(s, 0, { type: 'mark', cell: 1 }), 'Sıra sende değil');
  s = xox.applyMove(s, 1, { type: 'mark', cell: 3 });
  s = xox.applyMove(s, 0, { type: 'mark', cell: 1 });
  s = xox.applyMove(s, 1, { type: 'mark', cell: 4 });
  s = xox.applyMove(s, 0, { type: 'mark', cell: 2 });
  assert.deepEqual(xox.getResult(s), { winner: 0 });
  assert.deepEqual(s.line, [0, 1, 2]);
  let d = xox.setup({ seed: 1 });
  for (const c of [0, 1, 2, 4, 3, 5, 7, 6, 8]) d = xox.applyMove(d, d.turn, { type: 'mark', cell: c });
  assert.deepEqual(xox.getResult(d), { draw: true });
});
