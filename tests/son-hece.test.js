import { test, assert } from './runner.js';
import game, { nextRequired } from '../games/son-hece.js';
import { dictionaryFrom } from '../js/lib/words.js';

const dict = dictionaryFrom(['kitap', 'tapınak', 'nakış', 'kışla', 'kağıt', 'yoğurt', 'ıtır', 'anne', 'nehir', 'at', 'ata']);
const ctx = { dict };
const T = 1000;

function start(options = {}) {
  let s = game.setup({ turnSeconds: 20, ...options });
  s = game.applyMove(s, 0, { type: 'start', at: T }, ctx);
  return s;
}

test('son hece: başlangıç durumu', () => {
  const s = game.setup({ turnSeconds: 15 });
  assert.equal(s.phase, 'ready');
  assert.equal(s.turnMs, 15000);
  assert.equal(game.getResult(s), null);
  assert.deepEqual(game.getTurn(s), { player: 0, private: false });
});

test('son hece: ilk kelime serbest, sonrakiler son heceyle başlar', () => {
  let s = start();
  assert.equal(s.deadline, T + 20000);
  s = game.applyMove(s, 0, { type: 'word', word: 'Kitap', at: T + 1000 }, ctx);
  assert.equal(s.required, 'tap');
  assert.equal(s.turn, 1);
  assert.equal(s.deadline, T + 1000 + 20000);
  s = game.applyMove(s, 1, { type: 'word', word: 'tapınak', at: T + 2000 }, ctx);
  assert.equal(s.required, 'nak');
  s = game.applyMove(s, 0, { type: 'word', word: 'nakış', at: T + 3000 }, ctx);
  assert.equal(s.required, 'kış');
  assert.equal(s.words.length, 3);
});

test('son hece: yanlış hece, tekrar, sıra dışı hamle reddedilir', () => {
  let s = start();
  s = game.applyMove(s, 0, { type: 'word', word: 'kitap', at: T }, ctx);
  assert.throws(() => game.applyMove(s, 1, { type: 'word', word: 'anne', at: T }, ctx), 'ile başlamalı');
  assert.throws(() => game.applyMove(s, 0, { type: 'word', word: 'tapınak', at: T }, ctx), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 1, { type: 'word', word: 'tap', at: T }, ctx), 'tamamla');
  s = game.applyMove(s, 1, { type: 'word', word: 'tapınak', at: T }, ctx);
  s = game.applyMove(s, 0, { type: 'word', word: 'nakış', at: T }, ctx);
  s = game.applyMove(s, 1, { type: 'word', word: 'kışla', at: T }, ctx);
  // "la" -> no repeats: say a used word (needs to start with la) — build a chain back to kitap is impossible,
  // so test repeat on a fresh game instead.
  let r = start();
  r = game.applyMove(r, 0, { type: 'word', word: 'at', at: T }, ctx);
  assert.equal(r.required, 'at');
  r = game.applyMove(r, 1, { type: 'word', word: 'ata', at: T }, ctx);
  assert.equal(r.required, 'ta');
  assert.throws(() => game.applyMove(r, 0, { type: 'word', word: 'at', at: T }, ctx), 'ile başlamalı');
});

test('son hece: aynı kelime iki kez kullanılamaz', () => {
  let s = start();
  s = game.applyMove(s, 0, { type: 'word', word: 'anne', at: T }, ctx);
  s = game.applyMove(s, 1, { type: 'word', word: 'nehir', at: T }, ctx);
  assert.equal(s.required, 'hir');
  // player 0 must say a word starting with "hir"; pretend the chain allows "anne" again by crafting state
  const crafted = { ...s, required: 'an' };
  assert.throws(() => game.applyMove(crafted, 0, { type: 'word', word: 'anne', at: T }, ctx), 'daha önce söylendi');
});

test('son hece: ğ kuralı — atla', () => {
  assert.equal(nextRequired('kağıt', 'skip'), 'ıt');
  assert.equal(nextRequired('yoğurt', 'skip'), 'urt');
  assert.equal(nextRequired('kitap', 'skip'), 'tap');
  let s = start({ ghRule: 'skip' });
  s = game.applyMove(s, 0, { type: 'word', word: 'kağıt', at: T }, ctx);
  assert.equal(s.required, 'ıt');
  s = game.applyMove(s, 1, { type: 'word', word: 'ıtır', at: T }, ctx);
  assert.equal(s.required, 'tır');
});

test('son hece: ğ kuralı — yasak', () => {
  assert.equal(nextRequired('kağıt', 'forbid'), null);
  const s = start({ ghRule: 'forbid' });
  assert.throws(() => game.applyMove(s, 0, { type: 'word', word: 'kağıt', at: T }, ctx), 'yasak');
});

test('son hece: listede olmayan kelime itiraz/kabul akışı', () => {
  let s = start();
  s = game.applyMove(s, 0, { type: 'word', word: 'kitap', at: T }, ctx);
  // player 1 says an unknown word with 12s left on the clock
  const sayAt = s.deadline - 12000;
  s = game.applyMove(s, 1, { type: 'word', word: 'tapir', at: sayAt }, ctx);
  assert.equal(s.phase, 'challenge');
  assert.equal(s.deadline, null);
  assert.deepEqual(s.challenge, { player: 1, word: 'tapir', remainingMs: 12000 });
  assert.deepEqual(game.getTurn(s), { player: 0, private: false }); // opponent decides
  assert.throws(() => game.applyMove(s, 1, { type: 'accept', at: T }, ctx), 'rakip karar verir');
  // reject: same player continues with the remaining time
  const rejected = game.applyMove(s, 0, { type: 'reject', at: 5000 }, ctx);
  assert.equal(rejected.phase, 'play');
  assert.equal(rejected.turn, 1);
  assert.equal(rejected.deadline, 5000 + 12000);
  assert.equal(rejected.words.length, 1);
  // accept: word counts, turn passes
  const accepted = game.applyMove(s, 0, { type: 'accept', at: 5000 }, ctx);
  assert.equal(accepted.phase, 'play');
  assert.equal(accepted.turn, 0);
  assert.equal(accepted.required, 'pir');
  assert.equal(accepted.words[1].word, 'tapir');
  assert.equal(accepted.words[1].challenged, true);
  assert.equal(accepted.deadline, 5000 + 20000);
});

test('son hece: süre dolunca ve pes edince kaybeder', () => {
  let s = start();
  s = game.applyMove(s, 0, { type: 'word', word: 'kitap', at: T }, ctx);
  const t = game.applyMove(s, 1, { type: 'timeout', at: T + 99999 }, ctx);
  assert.equal(t.phase, 'over');
  assert.deepEqual(game.getResult(t), { winner: 0 });
  assert.equal(game.getTurn(t), null);
  const g = game.applyMove(s, 1, { type: 'giveup', at: T }, ctx);
  assert.deepEqual(game.getResult(g), { winner: 0 });
  assert.equal(g.reason, 'giveup');
  // a late timeout after the game is over is ignored (state unchanged)
  assert.equal(game.applyMove(g, 1, { type: 'timeout', at: T }, ctx), g);
  assert.throws(() => game.applyMove(s, 0, { type: 'timeout', at: T }, ctx), 'Sıra sende değil');
});

test('son hece: applyMove girdiyi değiştirmez', () => {
  const s = start();
  const snapshot = JSON.stringify(s);
  game.applyMove(s, 0, { type: 'word', word: 'kitap', at: T }, ctx);
  assert.equal(JSON.stringify(s), snapshot);
});
