import { test, assert } from './runner.js';
import game, { randomPool, MIN_LEN, MAX_LEN } from '../games/adam-asmaca.js';

const dict = new Set(['kitap', 'kalem', 'masa', 'ev', 'armut']);
const ctx = { dict };
const fresh = (opts = {}) => game.setup({ rounds: 2, lives: 6, seed: 2, ...opts }); // seed 2: player 0 sets first

/** Let the setter's device score the pending guess, as the Session does with autoMove. */
function settle(s) {
  const m = game.autoMove(s, s.setter, ctx);
  return m ? game.applyMove(s, s.setter, m, ctx) : s;
}

test('adam asmaca: kelime tutma — doğrulama, gizli alan, uzunluk', () => {
  let s = fresh();
  assert.equal(s.phase, 'secret');
  assert.deepEqual(game.getTurn(s), { player: 0, private: true });
  assert.throws(() => game.applyMove(s, 1, { type: 'setSecret', length: 5, secret: { word: 'kitap' } }, ctx), 'rakibin tutuyor');
  assert.throws(() => game.applyMove(s, 0, { type: 'setSecret', length: 2, secret: { word: 'ev' } }, ctx), 'harfli');
  assert.throws(() => game.applyMove(s, 0, { type: 'setSecret', length: 5, secret: { word: 'zzzzz' } }, ctx), 'listede yok');
  assert.throws(() => game.applyMove(s, 0, { type: 'setSecret', length: 5, secret: { word: 'kit4p' } }, ctx), 'Türkçe harfler');
  // the remote device only gets the public length
  const remote = game.applyMove(s, 0, { type: 'setSecret', length: 5 }, { ...ctx, remote: true });
  assert.equal(remote.secret, null);
  assert.equal(remote.length, 5);
  s = game.applyMove(s, 0, { type: 'setSecret', length: 5, secret: { word: 'KİTAP' } }, ctx);
  assert.equal(s.secret, 'kitap', 'normalized the Turkish way');
  assert.equal(s.phase, 'play');
  assert.deepEqual(s.revealed, [null, null, null, null, null]);
  assert.deepEqual(game.getTurn(s), { player: 1, private: false });
  assert.equal(game.autoMove(s, 0, ctx), null, 'nothing to score yet');
});

test('adam asmaca: harf tahmini, puanlama, yanlış harf can götürür, kelime bulunur', () => {
  let s = game.applyMove(fresh(), 0, { type: 'setSecret', length: 5, secret: { word: 'kitap' } }, ctx);
  assert.throws(() => game.applyMove(s, 0, { type: 'guess', kind: 'letter', value: 'a' }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 1, { type: 'guess', kind: 'letter', value: 'ab' }), 'Geçersiz harf');
  s = game.applyMove(s, 1, { type: 'guess', kind: 'letter', value: 'A' });
  assert.deepEqual(s.pending, { kind: 'letter', value: 'a' });
  assert.throws(() => game.applyMove(s, 1, { type: 'guess', kind: 'letter', value: 'e' }), 'değerlendiriliyor');
  assert.deepEqual(game.autoMove(s, 0, ctx), { type: 'score', kind: 'letter', value: 'a', positions: [3] });
  assert.equal(game.autoMove(s, 1, ctx), null, 'the guesser never scores');
  assert.throws(() => game.applyMove(s, 1, { type: 'score', kind: 'letter', value: 'a', positions: [3] }), 'kelimeyi tutan');
  assert.throws(() => game.applyMove(s, 0, { type: 'score', kind: 'letter', value: 'e', positions: [] }), 'Değerlendirilecek tahmin yok');
  assert.throws(() => game.applyMove(s, 0, { type: 'score', kind: 'letter', value: 'a', positions: [9] }), 'Geçersiz değerlendirme');
  s = settle(s);
  assert.deepEqual(s.revealed, [null, null, null, 'a', null]);
  assert.equal(s.wrong, 0);
  assert.throws(() => game.applyMove(s, 1, { type: 'guess', kind: 'letter', value: 'a' }), 'denedin');
  s = settle(game.applyMove(s, 1, { type: 'guess', kind: 'letter', value: 'z' }));
  assert.equal(s.wrong, 1);
  assert.deepEqual(s.tried, ['a', 'z']);
  for (const ch of ['k', 'i', 't']) s = settle(game.applyMove(s, 1, { type: 'guess', kind: 'letter', value: ch }));
  assert.equal(s.phase, 'play');
  // the last letter ends the word: the setter's device reveals it and the guesser keeps the lives left
  const last = game.applyMove(s, 1, { type: 'guess', kind: 'letter', value: 'p' });
  assert.deepEqual(game.autoMove(last, 0, ctx), { type: 'score', kind: 'letter', value: 'p', positions: [4], word: 'kitap' });
  s = settle(last);
  assert.equal(s.phase, 'result');
  assert.equal(s.solved, true);
  assert.equal(s.points, 5);
  assert.deepEqual(s.scores, [0, 5]);
  assert.equal(s.word, 'kitap');
  assert.deepEqual(game.getTurn(s), { player: 1, private: false }, 'the guesser keeps the phone through the result');
  assert.equal(game.getResult(s), null, 'not over: the second word is still to come');
});

test('adam asmaca: bütün kelime tahmini ve asılma; roller değişir; sonuç', () => {
  let s = game.applyMove(fresh({ lives: 4 }), 0, { type: 'setSecret', length: 5, secret: { word: 'kitap' } }, ctx);
  assert.throws(() => game.applyMove(s, 1, { type: 'guess', kind: 'word', value: 'masa' }), '5 harfli');
  s = settle(game.applyMove(s, 1, { type: 'guess', kind: 'word', value: 'kalem' }));
  assert.equal(s.wrong, 1);
  assert.deepEqual(s.wrongWords, ['kalem']);
  assert.throws(() => game.applyMove(s, 1, { type: 'guess', kind: 'word', value: 'kalem' }), 'Bunu denedin');
  for (const ch of ['x', 'z']) s = settle(game.applyMove(s, 1, { type: 'guess', kind: 'letter', value: ch === 'x' ? 'ö' : 'z' }));
  assert.equal(s.wrong, 3);
  assert.equal(s.phase, 'play');
  const lastMiss = game.applyMove(s, 1, { type: 'guess', kind: 'letter', value: 'ü' });
  assert.deepEqual(game.autoMove(lastMiss, 0, ctx), { type: 'score', kind: 'letter', value: 'ü', positions: [], word: 'kitap' }, 'the hanging reveals the word');
  s = settle(lastMiss);
  assert.equal(s.phase, 'result');
  assert.equal(s.solved, false);
  assert.deepEqual(s.scores, [0, 0]);
  assert.equal(s.word, 'kitap');
  assert.deepEqual(s.history, [{ setter: 0, word: 'kitap', solved: false, wrong: 4 }]);
  // next word: roles swap, the former guesser now holds the word
  assert.throws(() => game.applyMove(s, 1, { type: 'guess', kind: 'letter', value: 'a' }), 'bu aşamada değil');
  s = game.applyMove(s, 1, { type: 'next' });
  assert.equal(s.phase, 'secret');
  assert.equal(s.setter, 1);
  assert.equal(s.round, 1);
  assert.equal(s.secret, null);
  assert.deepEqual(game.getTurn(s), { player: 1, private: true });
  s = game.applyMove(s, 1, { type: 'setSecret', length: 4, secret: { word: 'masa' } }, ctx);
  // a right whole-word guess solves it at once
  const guess = game.applyMove(s, 0, { type: 'guess', kind: 'word', value: 'masa' });
  assert.deepEqual(game.autoMove(guess, 1, ctx), { type: 'score', kind: 'word', value: 'masa', hit: true, word: 'masa' });
  s = settle(guess);
  assert.equal(s.solved, true);
  assert.deepEqual(s.revealed, ['m', 'a', 's', 'a']);
  assert.deepEqual(s.scores, [4, 0]);
  s = game.applyMove(s, 0, { type: 'next' });
  assert.equal(s.phase, 'over');
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.throws(() => game.applyMove(s, 0, { type: 'next' }), 'henüz bitmedi');
});

test('adam asmaca: rastgele mod havuzu ve otomatik kelime; berabere', () => {
  const pool = randomPool({ 4: ['masa', 'ev'], 5: ['kitap', 7], 6: ['armutx'] });
  assert.deepEqual(pool, ['masa', 'kitap', 'armutx'], 'only strings within the length range');
  assert.deepEqual(randomPool(null), []);
  const s = fresh({ secretMode: 'random' });
  assert.deepEqual(game.getTurn(s), { player: 0, private: false }, 'no handoff: nobody types the word');
  assert.equal(game.autoMove(s, 1, { common: { 5: ['kitap'] } }), null);
  const m = game.autoMove(s, 0, { common: { 5: ['kitap'] } });
  assert.deepEqual(m, { type: 'setSecret', length: 5, secret: { word: 'kitap' } });
  assert.equal(game.autoMove(s, 0, { common: {} }), null, 'no list, no word');
  const played = game.applyMove(s, 0, m, {});
  assert.equal(played.phase, 'play');
  assert.equal(played.secret, 'kitap');
  // a draw: both hang
  let d = { ...played, lives: 4 };
  for (const ch of ['z', 'ö', 'ü', 'ç']) d = settle(game.applyMove(d, 1, { type: 'guess', kind: 'letter', value: ch }));
  d = game.applyMove(d, 0, { type: 'next' });
  d = game.applyMove(d, 1, { type: 'setSecret', length: 4, secret: { word: 'masa' } }, ctx);
  for (const ch of ['z', 'ö', 'ü', 'ç']) d = settle(game.applyMove(d, 0, { type: 'guess', kind: 'letter', value: ch }));
  d = game.applyMove(d, 1, { type: 'next' });
  assert.deepEqual(game.getResult(d), { draw: true });
  assert.ok(MIN_LEN < MAX_LEN);
});
