import { test, assert } from './runner.js';
import game, { group, tryPlace, score, KOMI } from '../games/go.js';

const at = (s, r, c) => r * s.size + c;
const place = (s, p, r, c) => game.applyMove(s, p, { type: 'place', cell: at(s, r, c) });

test('go: taş koyma, esir alma, intihar, ko', () => {
  let s = game.setup({ size: 9, seed: 1 });
  assert.deepEqual(game.getTurn(s), { player: 0, private: false });
  assert.throws(() => place(s, 1, 0, 0), 'Sıra sende değil');
  s = place(s, 0, 4, 4);
  assert.equal(s.board[at(s, 4, 4)], 0);
  assert.equal(s.turn, 1);
  assert.throws(() => place(s, 1, 4, 4), 'dolu');
  // white stone at (0,0) captured by black at (0,1) and (1,0)
  s = { ...s, turn: 1 };
  s = place(s, 1, 0, 0);
  s = place(s, 0, 0, 1);
  s = { ...s, turn: 0 };
  s = place(s, 0, 1, 0);
  assert.equal(s.board[at(s, 0, 0)], null, 'captured');
  assert.equal(s.captures[0], 1);
  // suicide: white into the empty corner surrounded by black
  assert.throws(() => place({ ...s, turn: 1 }, 1, 0, 0), 'İntihar');
  // a capturing move into a last liberty is allowed: build a black stone at (8,8) with white around
  let t = game.setup({ size: 9, seed: 1 });
  t = { ...t, board: t.board.slice() };
  t.board[at(t, 8, 8)] = 0; t.board[at(t, 7, 8)] = 1;
  const r = tryPlace({ ...t, turn: 1 }, 1, at(t, 8, 7));
  assert.ok(typeof r !== 'string' && r.captured.length === 1, 'white captures the corner stone');
  // ko: black (0,1),(1,0),(2,1) around a white stone at (1,1) whose only liberty is (1,2);
  // white (0,2),(2,2),(1,3) around (1,2). Black takes at (1,2); white may not retake at once.
  let k = game.setup({ size: 9, seed: 1 });
  k = { ...k, board: k.board.slice() };
  [[0, 1], [1, 0], [2, 1]].forEach(([r, c]) => { k.board[at(k, r, c)] = 0; });
  [[0, 2], [2, 2], [1, 3], [1, 1]].forEach(([r, c]) => { k.board[at(k, r, c)] = 1; });
  k = place(k, 0, 1, 2);
  assert.equal(k.board[at(k, 1, 1)], null, 'white stone captured');
  assert.equal(k.captures[0], 1);
  assert.equal(k.ko, at(k, 1, 1), 'ko point recorded');
  assert.throws(() => place(k, 1, 1, 1), 'Ko');
  k = place(k, 1, 8, 8); // elsewhere
  assert.equal(k.ko, null);
  k = place(k, 0, 8, 0);
  k = place(k, 1, 1, 1); // now legal: retakes
  assert.equal(k.board[at(k, 1, 2)], null);
  assert.equal(group(k.board, k.size, at(k, 1, 1)).stones.length, 1);
});

test('go: pas, sayım, ölü taş, onay, alan puanı ve komi', () => {
  let s = game.setup({ size: 9, seed: 1 });
  s = { ...s, board: s.board.slice() };
  // black wall on column 4 splits the board; white stone at (0,0) will be marked dead
  for (let r = 0; r < 9; r++) s.board[at(s, r, 4)] = 0;
  s.board[at(s, 0, 0)] = 1;
  for (let r = 0; r < 9; r++) s.board[at(s, r, 6)] = 1;
  s = game.applyMove(s, 0, { type: 'pass' });
  assert.equal(s.passes, 1);
  assert.equal(s.phase, 'play');
  s = game.applyMove(s, 1, { type: 'pass' });
  assert.equal(s.phase, 'count');
  assert.deepEqual(game.getTurn(s), { player: 0, private: false, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'place', cell: 1 }), 'Sayım');
  const before = score(s);
  // left region (cols 0-3) borders black and the white stone -> neutral; mark the white stone dead
  s = game.applyMove(s, 1, { type: 'dead', cell: at(s, 0, 0) });
  assert.deepEqual(s.dead, [0]);
  const est = score(s);
  assert.equal(est.area[0], 9 + 36, 'black: wall + the left 36 points (column 5 touches both colours: neutral)');
  assert.equal(est.area[1], 9 + 18, 'white: wall + right two columns');
  assert.ok(est.area[0] > before.area[0]);
  assert.equal(est.total[1], 27 + KOMI);
  assert.equal(est.winner, 0);
  s = game.applyMove(s, 0, { type: 'agree' });
  assert.equal(s.phase, 'count');
  assert.deepEqual(s.agree, [true, false]);
  // toggling a mark resets the agreement
  const t = game.applyMove(s, 1, { type: 'dead', cell: at(s, 0, 0) });
  assert.deepEqual(t.dead, []);
  assert.deepEqual(t.agree, [false, false]);
  s = game.applyMove(s, 1, { type: 'agree' });
  assert.equal(s.phase, 'over');
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.deepEqual(s.result.total, [45, 27 + KOMI]);
  // resume returns to play
  let u = game.applyMove(game.applyMove(game.setup({ size: 9, seed: 2 }), 0, { type: 'pass' }), 1, { type: 'pass' });
  u = game.applyMove(u, 1, { type: 'resume' });
  assert.equal(u.phase, 'play');
  assert.equal(u.turn, 0, 'the player to move after the two passes, not whoever asked to resume');
  assert.equal(u.passes, 0);
  assert.throws(() => game.applyMove(u, 1, { type: 'place', cell: 0 }), 'Sıra sende değil');
});
