import { test, assert } from './runner.js';
import game, { makeGrid, findPath, points, score, MIN_LEN } from '../games/harf-avi.js';

const dict = new Set(['kal', 'kale', 'kalem', 'elma', 'lale', 'ela', 'kel']);
const ctx = { dict };
// a fixed grid the tests can reason about (row-major 4×4)
const GRID = [
  'k', 'a', 'l', 'e',
  'm', 'e', 'l', 'a',
  'z', 'ğ', 'ö', 'ş',
  'ç', 'j', 'p', 'v',
];
const fresh = () => ({ ...game.setup({ seed: 5, seconds: 60 }), cells: GRID });

test('harf avı: tablo tohuma göre aynı, ünlü oranı makul; puanlar', () => {
  const a = makeGrid(4, 42);
  assert.deepEqual(a, makeGrid(4, 42));
  assert.notEqual(a.join(''), makeGrid(4, 43).join(''));
  assert.equal(makeGrid(5, 7).length, 25);
  const vowels = a.filter((c) => 'aeıioöuü'.includes(c)).length / 16;
  assert.ok(vowels >= 0.3 && vowels <= 0.5, 'vowel ratio ' + vowels);
  assert.deepEqual([points('ab'), points('kal'), points('kale'), points('kalem'), points('kalemi'), points('kalemin'), points('kalemine')], [0, 1, 1, 2, 3, 5, 11]);
  assert.equal(MIN_LEN, 3);
});

test('harf avı: yol bulma — komşuluk, çapraz, aynı hücre iki kez kullanılmaz', () => {
  assert.deepEqual(findPath(GRID, 4, 'kal'), [0, 1, 2]);
  assert.ok(findPath(GRID, 4, 'kalem'), 'k-a-l-e-m runs along the top row and down');
  const kel = findPath(GRID, 4, 'kel');
  assert.deepEqual(kel.map((i) => GRID[i]), ['k', 'e', 'l'], 'k(0,0) -> e(1,1) is a diagonal step');
  assert.equal(kel[1], 5);
  assert.equal(findPath(GRID, 4, 'elma'), null, 'm is not next to any l');
  assert.equal(findPath(GRID, 4, 'kaz'), null, 'z is not next to a');
  assert.equal(findPath(GRID, 4, 'kak'), null, 'k would be reused');
  assert.equal(findPath(GRID, 4, ''), null);
});

test('harf avı: başla, kelime (gizli), bitir; iki taraf bitince puanlama ve ortak kelimeler', () => {
  let s = fresh();
  assert.deepEqual(game.getTurn(s), { player: 0, private: true, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'word', secret: { word: 'kal' } }, ctx), 'Önce başla');
  s = game.applyMove(s, 0, { type: 'start' });
  assert.throws(() => game.applyMove(s, 0, { type: 'start' }), 'Zaten başladın');
  assert.throws(() => game.applyMove(s, 0, { type: 'word', secret: { word: 'ka' } }, ctx), 'En az 3');
  assert.throws(() => game.applyMove(s, 0, { type: 'word', secret: { word: 'kaz' } }, ctx), 'komşu harflerle çıkmıyor');
  assert.throws(() => game.applyMove(s, 0, { type: 'word', secret: { word: 'lel' } }, ctx), 'listesinde yok');
  s = game.applyMove(s, 0, { type: 'word', secret: { word: 'KALEM' } }, ctx);
  assert.deepEqual(s.words[0], ['kalem']);
  assert.deepEqual(s.counts, [1, 0]);
  assert.throws(() => game.applyMove(s, 0, { type: 'word', secret: { word: 'kalem' } }, ctx), 'zaten buldun');
  // the other device only gets the public part: the count moves, the word stays unknown
  const remote = game.applyMove({ ...s, words: [[], []] }, 0, { type: 'word' }, { ...ctx, remote: true });
  assert.deepEqual(remote.counts, [2, 0]);
  assert.deepEqual(remote.words[0], []);
  s = game.applyMove(s, 0, { type: 'word', secret: { word: 'kale' } }, ctx);
  s = game.applyMove(s, 0, { type: 'word', secret: { word: 'kal' } }, ctx);
  s = game.applyMove(s, 0, { type: 'finish', words: s.words[0] });
  assert.equal(s.finished[0], true);
  assert.equal(s.phase, 'play');
  assert.deepEqual(game.getTurn(s), { player: 1, private: true, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'word', secret: { word: 'lale' } }, ctx), 'Süren doldu');
  // player 1: finds kale (shared) and lale
  s = game.applyMove(s, 1, { type: 'start' });
  s = game.applyMove(s, 1, { type: 'word', secret: { word: 'kale' } }, ctx);
  s = game.applyMove(s, 1, { type: 'word', secret: { word: 'lale' } }, ctx);
  // the finish move carries the list publicly (the remote device never saw the words)
  const fromRemote = game.applyMove({ ...s, words: [s.words[0], []] }, 1, { type: 'finish', words: ['kale', 'lale', 'KALE', 'x1', 'kaz', 'ka'] }, { remote: true }); // 'kaz' has no path, 'ka' is too short
  assert.deepEqual(fromRemote.words[1], ['kale', 'lale'], 'cleaned: normalized, deduplicated, letters only');
  assert.equal(fromRemote.phase, 'over');
  assert.deepEqual(fromRemote.result, { points: [2 + 1, 1], shared: ['kale'] }, 'kalem 2 + kal 1 vs lale 1; kale cancels');
  assert.deepEqual(game.getResult(fromRemote), { winner: 0 });
  assert.equal(game.getTurn(fromRemote), null);
  assert.throws(() => game.applyMove(fromRemote, 1, { type: 'start' }), 'Oyun bitti');
  assert.deepEqual(score(['kal'], ['kal']), { points: [0, 0], shared: ['kal'] });
});
