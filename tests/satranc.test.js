import { test, assert } from './runner.js';
import game, { fromFen, legalMoves, perft, index, name, inCheck, colOf } from '../games/satranc.js';

const mv = (s, from, to, promo) => game.applyMove(s, s.white === 0 ? (s.turn === 'w' ? 0 : 1) : (s.turn === 'w' ? 1 : 0), { type: 'move', from: index(from), to: index(to), promo });

test('satranç: açılış hamleleri ve perft (rok, geçerken alma, terfi dahil)', () => {
  const s = game.setup({ seed: 2 });
  assert.equal(s.white, 0);
  assert.deepEqual(game.getTurn(s), { player: 0, private: false });
  assert.equal(legalMoves(s).length, 20);
  assert.equal(perft(s, 2), 400);
  assert.equal(perft(fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', { seed: 2 }), 2), 2039, 'kiwipete depth 2');
  assert.equal(perft(fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', { seed: 2 }), 3), 2812, 'en passant pins');
  assert.equal(perft(fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', { seed: 2 }), 2), 264, 'promotions');
  assert.equal(game.setup({ seed: 3 }).white, 1, 'odd seed: player 1 is white');
});

test('satranç: geçersiz hamleler, şah, rok, geçerken alma, terfi', () => {
  let s = game.setup({ seed: 2 });
  assert.throws(() => mv(s, 'e2', 'e5'), 'gidemez');
  assert.throws(() => game.applyMove(s, 1, { type: 'move', from: index('e7'), to: index('e5') }), 'Sıra sende değil');
  assert.throws(() => mv(s, 'e7', 'e5'), 'Kendi taşını');
  s = mv(s, 'e2', 'e4');
  assert.equal(s.ep, null, 'no enemy pawn beside e4: no en passant square recorded');
  assert.equal(s.turn, 'b');
  s = mv(s, 'd7', 'd5');
  s = mv(s, 'e4', 'e5');
  s = mv(s, 'f7', 'f5');
  assert.equal(s.ep, index('f6'), 'white pawn on e5 can capture: square recorded');
  const ep = mv(s, 'e5', 'f6');
  assert.equal(ep.cells[index('f5')], null, 'the pawn passed over is taken');
  assert.equal(ep.cells[index('f6')], 'wp');
  assert.deepEqual(ep.captured.w, ['p']);
  // castling: clear the king side and castle
  let c = fromFen('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', { seed: 2 });
  c = mv(c, 'e1', 'g1');
  assert.equal(c.cells[index('g1')], 'wk');
  assert.equal(c.cells[index('f1')], 'wr');
  assert.equal(c.castling, 'kq', 'white rights gone');
  c = mv(c, 'e8', 'c8');
  assert.equal(c.cells[index('d8')], 'br');
  assert.equal(c.castling, '-');
  // no castling through check
  const thr = fromFen('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1', { seed: 2 });
  assert.ok(!legalMoves(thr).some((m) => m.from === index('e1') && m.to === index('g1')), 'f1 attacked: no king-side castling');
  assert.ok(legalMoves(thr).some((m) => m.from === index('e1') && m.to === index('c1')), 'queen side is fine');
  // promotion requires a piece choice
  let p = fromFen('8/P6k/8/8/8/8/8/K7 w - - 0 1', { seed: 2 });
  assert.throws(() => mv(p, 'a7', 'a8'), 'Terfi taşını seç');
  p = mv(p, 'a7', 'a8', 'n');
  assert.equal(p.cells[index('a8')], 'wn');
  // the king may not walk into check
  const k = fromFen('4k3/8/8/8/8/4r3/8/4K3 w - - 0 1', { seed: 2 });
  assert.ok(inCheck(k.cells, 'w'));
  assert.throws(() => mv(k, 'e1', 'e2'), 'Şah tehdit altında');
  assert.ok(legalMoves(k).length === 4 && legalMoves(k).every((m) => colOf(m.to) !== 4), 'only steps off the e-file');
  assert.equal(name(index('h8')), 'h8');
});

test('satranç: mat, pat, yetersiz materyal, elli hamle, tekrar, pes', () => {
  let s = game.setup({ seed: 2 });
  s = mv(s, 'f2', 'f3'); s = mv(s, 'e7', 'e5'); s = mv(s, 'g2', 'g4');
  s = mv(s, 'd8', 'h4');
  assert.equal(s.over, true);
  assert.equal(s.reason, 'mate');
  assert.deepEqual(game.getResult(s), { winner: 1 }, "fool's mate: black (player 1) wins");
  assert.throws(() => mv(s, 'a2', 'a3'), 'Oyun bitti');
  const stale = fromFen('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1', { seed: 2 });
  assert.equal(legalMoves(stale).length, 0, 'black has no legal move');
  const pre = fromFen('7k/5K2/8/6Q1/8/8/8/8 w - - 0 1', { seed: 2 });
  const after = mv(pre, 'g5', 'g6');
  assert.equal(after.reason, 'stalemate');
  assert.deepEqual(game.getResult(after), { draw: true });
  const lone = mv(fromFen('7k/8/8/8/8/8/6n1/K5B1 w - - 0 1', { seed: 2 }), 'g1', 'f2');
  assert.equal(lone.over, false, 'B vs N stays on');
  const bxn = mv(fromFen('7k/8/8/8/8/8/5n2/K5B1 w - - 0 1', { seed: 2 }), 'g1', 'f2');
  assert.equal(bxn.reason, 'material', 'K+B vs K cannot mate');
  const fifty = mv(fromFen('7k/8/8/8/8/8/8/K5R1 w - - 99 80', { seed: 2 }), 'g1', 'g2');
  assert.equal(fifty.reason, 'fifty');
  // threefold repetition by shuffling kings
  let r = fromFen('7k/8/8/8/8/8/8/K5R1 w - - 0 1', { seed: 2 });
  for (let i = 0; i < 2; i++) { r = mv(r, 'a1', 'a2'); r = mv(r, 'h8', 'h7'); r = mv(r, 'a2', 'a1'); r = mv(r, 'h7', 'h8'); }
  assert.equal(r.reason, 'repetition');
  assert.deepEqual(game.getResult(r), { draw: true });
  const res = game.applyMove(game.setup({ seed: 2 }), 1, { type: 'resign' });
  assert.equal(res.reason, 'resign');
  assert.deepEqual(game.getResult(res), { winner: 0 });
});
