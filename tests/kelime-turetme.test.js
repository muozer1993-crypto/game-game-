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

test('kelime türetme: listede olmayan kelime "yine de" eklenir, işaretlenir; itiraz edilen puan getirmez', () => {
  let s = fresh();
  s = game.applyMove(s, 0, { type: 'start' });
  assert.throws(() => game.applyMove(s, 0, { type: 'word', secret: { word: 'tek' } }, ctx), 'listesinde yok');
  s = game.applyMove(s, 0, { type: 'word', secret: { word: 'tek', unlisted: true } }, ctx);
  s = game.applyMove(s, 0, { type: 'word', secret: { word: 'kale', unlisted: true } }, ctx); // listed after all: no mark
  assert.deepEqual(s.words[0], ['tek', 'kale']);
  assert.deepEqual(s.unlisted[0], ['tek']);
  s = game.applyMove(s, 0, { type: 'finish', words: s.words[0], unlisted: s.unlisted[0] });
  assert.equal(s.phase, 'play');
  s = game.applyMove(s, 1, { type: 'start' });
  s = game.applyMove(s, 1, { type: 'word', secret: { word: 'elma' } }, ctx);
  // the other phone's list: its marks travel with it, words it does not hold are dropped
  s = game.applyMove(s, 1, { type: 'finish', words: ['elma', 'mert'], unlisted: ['mert', 'zzz', 'kale'] }, { remote: true });
  assert.deepEqual(s.unlisted[1], ['mert']);
  assert.equal(s.phase, 'review', 'an unlisted word: objections before the result');
  assert.equal(game.getResult(s), null);
  assert.equal(game.getTurn(s), null, 'both look at the same screen');
  const on = { mode: 'online' };
  assert.throws(() => game.applyMove(s, 0, { type: 'object', id: '0:tek', on: true }, on), 'Kendi kelimene');
  assert.throws(() => game.applyMove(s, 1, { type: 'object', id: '0:kale', on: true }, on), 'itiraz edilemez');
  s = game.applyMove(s, 1, { type: 'object', id: '0:tek', on: true }, on);
  assert.deepEqual(s.objected, ['0:tek']);
  s = game.applyMove(s, 0, { type: 'object', id: '1:mert', on: true }, {}); // one phone: the button acts for the owner's opponent
  s = game.applyMove(s, 0, { type: 'object', id: '1:mert', on: false }, {});
  assert.deepEqual(s.objected, ['0:tek']);
  assert.throws(() => game.applyMove(s, 0, { type: 'word', secret: { word: 'kal' } }, ctx), 'itirazlar');
  // the finishing 'next' carries the objections as the host saw them; unknown ids are dropped
  s = game.applyMove(s, 0, { type: 'next', objected: ['0:tek', '9:bogus'] });
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.result.points, [1, 2], 'tek (objected) scores nothing: kale 1 against elma 1 + mert 1');
  assert.deepEqual(s.result.objected, ['0:tek']);
  assert.deepEqual(game.getResult(s), { winner: 1 });
});

test('kelime türetme: kimse listede olmayan kelime oynamadıysa itiraz adımı yok', () => {
  let s = fresh();
  for (const p of [0, 1]) {
    s = game.applyMove(s, p, { type: 'start' });
    s = game.applyMove(s, p, { type: 'word', secret: { word: 'kale' } }, ctx);
    s = game.applyMove(s, p, { type: 'finish', words: s.words[p], unlisted: s.unlisted[p] });
  }
  assert.equal(s.phase, 'over');
  assert.deepEqual(game.getResult(s), { draw: true });
});
