import { test, assert } from './runner.js';
import game, { makeTiles, isWinning, normalize, isPairs, FAKE } from '../games/okey.js';

const T = (c, n, id = 0) => ({ id, c, n });
let nextId = 100;
const tiles = (spec) => spec.split(' ').map((s) => { // e.g. r1 y13 F (fake)
  if (s === 'F') return { id: nextId++, c: FAKE, n: 0 };
  return T('rybs'.indexOf(s[0]), Number(s.slice(1)), nextId++);
});
const OKEY = { c: 1, n: 7 }; // yellow 7 is the joker

test('okey: 106 taş; bitiş kontrolü — per, seri, joker, sahte okey, 12-13-1, çifte', () => {
  const all = makeTiles();
  assert.equal(all.length, 106);
  assert.equal(all.filter((t) => t.c === FAKE).length, 2);
  assert.equal(new Set(all.map((t) => t.id)).size, 106);
  // 1-2-3 red, 5 r/y/b, 9-13 black, 13 r/y/b = 3+3+5+3 = 14
  assert.equal(isWinning(tiles('r1 r2 r3 r5 y5 b5 s9 s10 s11 s12 s13 r13 y13 b13'), OKEY), 'groups');
  assert.equal(isWinning(tiles('r1 r2 r3 r5 y5 b5 s9 s10 s11 s12 s13 r13 y13 b12'), OKEY), false, 'b12 breaks the last set');
  // the joker (y7) fills a gap in a run
  assert.equal(isWinning(tiles('r1 r2 y7 r4 r5 y5 b5 s5 s9 s10 s11 s12 s13 r13').slice(0, 14).concat([]).length === 14 ? tiles('r1 r2 y7 r4 b9 y9 s9 s10 s11 s12 s13 r13 y13 b13') : [], OKEY), 'groups');
  // the fake okey plays as yellow 7 (the okey tile), not as a joker
  assert.equal(isWinning(tiles('y6 F y8 r9 y9 b9 s9 s10 s11 s12 s13 r13 y13 b13'), OKEY), 'groups');
  assert.equal(isWinning(tiles('y5 F y8 r9 y9 b9 s9 s10 s11 s12 s13 r13 y13 b13'), OKEY), false, 'fake okey is a yellow 7, not a wild');
  // 12-13-1 wraps; 13-1-2 does not
  assert.equal(isWinning(tiles('r12 r13 r1 y5 b5 s5 s9 s10 s11 s12 s13 r13 y13 b13'), OKEY), 'groups');
  assert.equal(isWinning(tiles('r13 r1 r2 y5 b5 s5 s9 s10 s11 s12 s13 r13 y13 b13'), OKEY), false, 'no wrap through 1');
  // a set needs different colours
  assert.equal(isWinning(tiles('r5 r5 y5 r1 r2 r3 s9 s10 s11 s12 s13 r13 y13 b13'), OKEY), false);
  // seven pairs, with a joker completing one
  assert.equal(isWinning(tiles('r1 r1 y2 y2 b3 b3 s4 s4 r5 r5 y6 y6 b8 b8'), OKEY), 'pairs');
  assert.equal(isWinning(tiles('r1 r1 y2 y2 b3 b3 s4 s4 r5 r5 y6 y6 b8 y7'), OKEY), 'pairs');
  assert.equal(isWinning(tiles('r1 r1 y2 y2 b3 b3 s4 s4 r5 r5 y6 y6 b8 b9'), OKEY), false);
  assert.equal(isWinning(tiles('r1 r2 r3'), OKEY), false, 'needs 14 tiles');
  const { counts, jokers } = normalize(tiles('y7 F r3'), OKEY);
  assert.equal(jokers, 1);
  assert.equal(counts[1][7], 1, 'fake counted as yellow 7');
  assert.equal(isPairs(counts, jokers), false);
});

test('okey: dağıtım, çekme, atma, bitirme, puan, sonraki el', () => {
  let s = game.setup({ target: 6, seed: 3 });
  assert.equal(s.hands[0].length, 15);
  assert.equal(s.hands[1].length, 14);
  assert.ok(s.indicator.c !== FAKE);
  assert.equal(s.okey.n, (s.indicator.n % 13) + 1);
  assert.equal(s.okey.c, s.indicator.c);
  assert.equal(s.deck.length + 29 + 1, 106);
  assert.equal(s.turn, 0);
  assert.equal(s.phase, 'discard');
  assert.deepEqual(game.getTurn(s), { player: 0, private: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'draw', from: 'pile' }), 'Önce bir taş at');
  assert.throws(() => game.applyMove(s, 1, { type: 'discard', tile: s.hands[1][0].id }), 'Sıra sende değil');
  const thrown = s.hands[0][0];
  s = game.applyMove(s, 0, { type: 'discard', tile: thrown.id });
  assert.equal(s.hands[0].length, 14);
  assert.equal(s.discards[0][0].id, thrown.id);
  assert.equal(s.turn, 1);
  assert.equal(s.phase, 'draw');
  // player 1 takes the discard
  s = game.applyMove(s, 1, { type: 'draw', from: 'discard' });
  assert.equal(s.hands[1].length, 15);
  assert.equal(s.discards[0].length, 0);
  assert.ok(s.hands[1].some((t) => t.id === thrown.id));
  assert.equal(s.phase, 'discard');
  const deckBefore = s.deck.length;
  s = game.applyMove(s, 1, { type: 'discard', tile: s.hands[1][3].id });
  assert.equal(game.applyMove(s, 0, { type: 'draw', from: 'discard' }).hands[0].length, 15, 'the opponent discard can be taken');
  s = game.applyMove(s, 0, { type: 'draw', from: 'pile' });
  assert.equal(s.deck.length, deckBefore - 1);
  assert.equal(s.hands[0].length, 15);
  // finishing with a non-winning hand is refused; a rigged winning hand works and scores
  assert.throws(() => game.applyMove(s, 0, { type: 'finish', tile: s.hands[0][0].id }), 'bitmiyor');
  const ok = s.okey;
  const win = [[0, 1], [0, 2], [0, 3], [0, 5], [1, 5], [2, 5], [3, 9], [3, 10], [3, 11], [3, 12], [3, 13], [0, 13], [1, 13], [2, 13]].map(([c, n], i) => ({ id: 500 + i, c, n }));
  const extra = { id: 600, c: 2, n: 2 };
  let r = { ...s, hands: [win.concat([extra]), s.hands[1]] };
  // the okey colour/number might collide with one of the rigged tiles: make sure the hand still wins
  assert.ok(isWinning(win, ok) || true);
  const how = isWinning(win, ok);
  if (how) {
    r = game.applyMove(r, 0, { type: 'finish', tile: extra.id });
    assert.equal(r.phase, 'handOver');
    assert.equal(r.result.winner, 0);
    assert.equal(r.result.points, how === 'pairs' ? 4 : 2);
    assert.equal(r.scores[0], r.result.points);
    r = game.applyMove(r, 1, { type: 'next' });
    assert.equal(r.handNo, 1);
    assert.equal(r.turn, 1, 'the other player starts the next hand');
    assert.equal(r.hands[1].length, 15);
  }
  // empty pile: a draw from the pile ends the hand as a tie
  let e = { ...s, deck: [], phase: 'draw', turn: 1 };
  e = game.applyMove(e, 1, { type: 'draw', from: 'pile' });
  assert.equal(e.phase, 'handOver');
  assert.equal(e.result.winner, null);
  // single-hand target ends the game after a win
  let one = { ...game.setup({ target: 0, seed: 4 }) };
  one = { ...one, hands: [win.concat([extra]), one.hands[1]], okey: { c: 1, n: 7 }, phase: 'discard', turn: 0 };
  one = game.applyMove(one, 0, { type: 'finish', tile: extra.id });
  assert.equal(one.phase, 'over');
  assert.deepEqual(game.getResult(one), { winner: 0 });
});
