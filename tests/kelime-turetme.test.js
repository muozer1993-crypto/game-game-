import { test, assert } from './runner.js';
import game, { makeRack, fitsRack, MIN_LEN } from '../games/kelime-turetme.js';

const dict = new Set(['kale', 'kal', 'elma', 'lale', 'ela', 'kelam']);
const ctx = { dict };
const fresh = () => ({ ...game.setup({ letters: 8, seconds: 60, seed: 3 }), rack: ['a', 'e', 'e', 'k', 'l', 'm', 'r', 't'] });

test('kelime türetme: raf tohuma göre aynı, ünlü var, harf tekrarı sınırlı; raf uyumu', () => {
  const r = makeRack(8, 11);
  assert.equal(r.length, 8);
  assert.deepEqual(r, makeRack(8, 11));
  assert.ok(r.filter((l) => 'aeıioöuü'.includes(l)).length >= 2, 'at least two vowels');
  const counts = {}; r.forEach((l) => { counts[l] = (counts[l] || 0) + 1; });
  assert.ok(Object.values(counts).every((c) => c <= 2));
  assert.equal(makeRack(7, 1).length, 7);
  assert.equal(makeRack(9, 1).length, 9);
  const rack = ['a', 'e', 'e', 'k', 'l', 'm', 'r', 't'];
  assert.ok(fitsRack(rack, 'kale') && fitsRack(rack, 'kelam') && fitsRack(rack, 'ele'));
  assert.ok(!fitsRack(rack, 'kaka'), 'only one k');
  assert.ok(!fitsRack(rack, 'kalem'.replace('m', 'z')));
  assert.ok(!fitsRack(rack, 'elmaa'), 'only one a');
  assert.equal(MIN_LEN, 3);
});

test('kelime türetme: başla, kelime, bitir, puanlama, ortak kelimeler', () => {
  let s = fresh();
  assert.deepEqual(game.getTurn(s), { player: 0, private: true, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'word', secret: { word: 'kal' } }, ctx), 'Önce başla');
  s = game.applyMove(s, 0, { type: 'start' });
  assert.throws(() => game.applyMove(s, 0, { type: 'word', secret: { word: 'ka' } }, ctx), 'En az 3');
  assert.throws(() => game.applyMove(s, 0, { type: 'word', secret: { word: 'lale' } }, ctx), 'raftaki harflerle');
  assert.throws(() => game.applyMove(s, 0, { type: 'word', secret: { word: 'tek' } }, ctx), 'listesinde yok');
  s = game.applyMove(s, 0, { type: 'word', secret: { word: 'KELAM' } }, ctx);
  s = game.applyMove(s, 0, { type: 'word', secret: { word: 'kale' } }, ctx);
  assert.deepEqual(s.words[0], ['kelam', 'kale']);
  assert.throws(() => game.applyMove(s, 0, { type: 'word', secret: { word: 'kale' } }, ctx), 'zaten buldun');
  const remote = game.applyMove({ ...s, words: [[], []] }, 0, { type: 'word' }, { remote: true });
  assert.deepEqual(remote.counts, [3, 0]);
  assert.deepEqual(remote.words[0], []);
  s = game.applyMove(s, 0, { type: 'finish', words: s.words[0] });
  assert.deepEqual(game.getTurn(s), { player: 1, private: true, simultaneous: true });
  s = game.applyMove(s, 1, { type: 'start' });
  s = game.applyMove(s, 1, { type: 'word', secret: { word: 'kale' } }, ctx);
  s = game.applyMove(s, 1, { type: 'word', secret: { word: 'elma' } }, ctx);
  s = game.applyMove(s, 1, { type: 'finish', words: ['kale', 'elma', 'KALE', 'zzzz', 'ka'] }); // bogus words a tampered client might send are dropped
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.result, { points: [2, 1], shared: ['kale'] }, 'kelam 2 vs elma 1; kale cancels');
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.throws(() => game.applyMove(s, 0, { type: 'start' }), 'Oyun bitti');
});
