import { test, assert } from './runner.js';
import game, { roundScore, firstDescriber, cardAt } from '../games/tabu.js';

const cards = Array.from({ length: 6 }, (_, i) => ({ word: `k${i}`, taboo: ['a', 'b', 'c', 'd', 'e'] }));
const ctx = { tabu: { cards } };
const fresh = (opts = {}) => game.setup({ rounds: 2, seconds: 45, seed: 2, ...opts }, ctx); // seed 2: player 0 describes first

test('tabu: kurulum — tohumlu deste, kart yoksa hata', () => {
  const s = fresh();
  assert.equal(s.deck.length, 6);
  assert.deepEqual(s.deck.slice().sort(), [0, 1, 2, 3, 4, 5], 'every card once');
  assert.deepEqual(fresh().deck, s.deck, 'same seed, same order');
  assert.notEqual(fresh({ seed: 9 }).deck.join(), s.deck.join());
  assert.equal(s.describer, 0);
  assert.equal(s.phase, 'ready');
  assert.deepEqual(game.getTurn(s), { player: 0, private: true });
  assert.throws(() => game.setup({ seed: 1 }, {}), 'kartları yüklenemedi');
  assert.equal(cardAt(s, ctx), cards[s.deck[0]]);
});

test('tabu: tur akışı — başla, kartlar, puan, bitir, roller değişir, sonuç', () => {
  let s = fresh();
  assert.throws(() => game.applyMove(s, 1, { type: 'start' }), 'anlatan sen değilsin');
  assert.throws(() => game.applyMove(s, 0, { type: 'card', card: s.deck[0], result: 'ok' }), 'Tur oynanmıyor');
  s = game.applyMove(s, 0, { type: 'start' });
  assert.equal(s.phase, 'play');
  assert.throws(() => game.applyMove(s, 0, { type: 'start' }), 'zaten başladı');
  assert.throws(() => game.applyMove(s, 1, { type: 'card', card: s.deck[0], result: 'ok' }), 'anlatan işaretler');
  assert.throws(() => game.applyMove(s, 0, { type: 'card', card: s.deck[1], result: 'ok' }), 'Kart uyuşmuyor');
  assert.throws(() => game.applyMove(s, 0, { type: 'card', card: s.deck[0], result: 'maybe' }), 'Geçersiz sonuç');
  s = game.applyMove(s, 0, { type: 'card', card: s.deck[0], result: 'ok' });
  s = game.applyMove(s, 0, { type: 'card', card: s.deck[1], result: 'pass' });
  s = game.applyMove(s, 0, { type: 'card', card: s.deck[2], result: 'taboo' });
  s = game.applyMove(s, 0, { type: 'card', card: s.deck[3], result: 'ok' });
  assert.equal(s.cursor, 4);
  assert.deepEqual(s.scores, [1, 0], '+1 0 -1 +1');
  assert.equal(roundScore(s.log[0]), 1);
  assert.equal(cardAt(s, ctx), cards[s.deck[4]], 'the next card is dealt');
  assert.throws(() => game.applyMove(s, 1, { type: 'end' }), 'anlatan bitirir');
  s = game.applyMove(s, 0, { type: 'end' });
  assert.equal(s.phase, 'summary');
  assert.equal(game.getTurn(s), null);
  assert.throws(() => game.applyMove(s, 0, { type: 'card', card: s.deck[4], result: 'ok' }), 'Tur oynanmıyor');
  s = game.applyMove(s, 1, { type: 'next' });
  assert.equal(s.round, 1);
  assert.equal(s.describer, 1, 'roles swap');
  assert.equal(s.phase, 'ready');
  assert.deepEqual(s.log, [[{ card: s.deck[0], result: 'ok' }, { card: s.deck[1], result: 'pass' }, { card: s.deck[2], result: 'taboo' }, { card: s.deck[3], result: 'ok' }], []]);
  assert.equal(firstDescriber(s), 0);
  s = game.applyMove(s, 1, { type: 'start' });
  s = game.applyMove(s, 1, { type: 'card', card: s.deck[4], result: 'ok' });
  s = game.applyMove(s, 1, { type: 'card', card: s.deck[5], result: 'ok' });
  s = game.applyMove(s, 1, { type: 'card', card: s.deck[0], result: 'ok' }); // the deck wraps around
  assert.equal(s.cursor, 7);
  s = game.applyMove(s, 1, { type: 'end' });
  s = game.applyMove(s, 0, { type: 'next' });
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.scores, [1, 3]);
  assert.deepEqual(game.getResult(s), { winner: 1 });
  assert.throws(() => game.applyMove(s, 0, { type: 'next' }), 'Oyun bitti');
  // a draw
  let t = fresh();
  t = game.applyMove(t, 0, { type: 'start' });
  t = game.applyMove(t, 0, { type: 'end' });
  t = game.applyMove(t, 0, { type: 'next' });
  t = game.applyMove(t, 1, { type: 'start' });
  t = game.applyMove(t, 1, { type: 'end' });
  t = game.applyMove(t, 1, { type: 'next' });
  assert.deepEqual(game.getResult(t), { draw: true });
});
