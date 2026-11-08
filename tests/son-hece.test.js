import { test, assert } from './runner.js';
import game, { nextRequired } from '../games/son-hece.js';
import { dictionaryFrom } from '../js/lib/words.js';

const dict = dictionaryFrom(['kitap', 'tapınak', 'nakış', 'kışla', 'kağıt', 'yoğurt', 'ıtır', 'anne', 'nehir', 'at', 'ata', 'saat']);
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

test('son hece: hecenin kendisi sözlükte bir kelimeyse kabul edilir (sa-at → at)', () => {
  let s = start();
  s = game.applyMove(s, 0, { type: 'word', word: 'saat', at: T }, ctx);
  assert.equal(s.required, 'at');
  s = game.applyMove(s, 1, { type: 'word', word: 'at', at: T }, ctx); // "at" is in the dictionary
  assert.equal(s.words[1].word, 'at');
  assert.equal(s.required, 'at');
  // a bare syllable that is not a word is treated as "finish the word"
  let r = start();
  r = game.applyMove(r, 0, { type: 'word', word: 'kitap', at: T }, ctx);
  assert.throws(() => game.applyMove(r, 1, { type: 'word', word: 'tap', at: T }, ctx), 'tamamla');
});

test('son hece: ünlüsüz "kelime" reddedilir, gönderenin known kararı geçerlidir', () => {
  let s = start();
  assert.throws(() => game.applyMove(s, 0, { type: 'word', word: 'kdv', at: T }, ctx), 'ünlü');
  // the sender's device says the word is unknown although our list has it: it goes in marked
  const c = game.applyMove(s, 0, { type: 'word', word: 'kitap', at: T, known: false }, ctx);
  assert.equal(c.phase, 'play');
  assert.equal(c.words[0].unlisted, true);
  // and the other way round: the sender vouches for a word our list lacks
  const k = game.applyMove(s, 0, { type: 'word', word: 'zebra', at: T, known: true }, ctx);
  assert.equal(k.phase, 'play');
  assert.equal(k.required, 'ra');
  assert.equal(k.words[0].unlisted, undefined);
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

test('son hece: listede olmayan kelime işaretli kabul edilir, oyun akar; itiraz sonda yapılır', () => {
  let s = start();
  s = game.applyMove(s, 0, { type: 'word', word: 'kitap', at: T }, ctx);
  s = game.applyMove(s, 1, { type: 'word', word: 'tapir', at: T + 3000 }, ctx); // not in the list
  assert.equal(s.phase, 'play', 'no stop for a decision');
  assert.equal(s.turn, 0);
  assert.equal(s.required, 'pir');
  assert.equal(s.deadline, T + 3000 + 20000);
  assert.deepEqual(s.words[1], { player: 1, word: 'tapir', syllables: ['ta', 'pir'], unlisted: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'object', id: 'w1', on: true }, ctx), 'oyun bitince');
  s = game.applyMove(s, 0, { type: 'word', word: 'pirinç', at: T + 5000 }, ctx); // also unlisted
  s = game.applyMove(s, 1, { type: 'giveup', at: T + 6000 }, ctx);
  assert.equal(s.phase, 'review', 'unlisted words in the chain: objections before the result');
  assert.equal(game.getResult(s), null);
  assert.equal(game.getTurn(s), null);
  const on = { ...ctx, mode: 'online' };
  assert.throws(() => game.applyMove(s, 1, { type: 'object', id: 'w1', on: true }, on), 'Kendi kelimene');
  assert.throws(() => game.applyMove(s, 0, { type: 'object', id: 'w0', on: true }, on), 'itiraz edilemez');
  // no objection: the normal result (player 1 gave up)
  const none = game.applyMove(s, 0, { type: 'next', objected: [] }, ctx);
  assert.equal(none.phase, 'over');
  assert.deepEqual(game.getResult(none), { winner: 0 });
  // both words objected: the earlier one decides — player 1 said tapir first, so player 1 loses
  let both = game.applyMove(s, 0, { type: 'object', id: 'w1', on: true }, on);
  both = game.applyMove(both, 1, { type: 'object', id: 'w2', on: true }, on);
  both = game.applyMove(both, 0, { type: 'next', objected: both.objected });
  assert.equal(both.reason, 'objection');
  assert.equal(both.objectedWord, 'tapir');
  assert.deepEqual(game.getResult(both), { winner: 0 });
  // only pirinç objected: player 0 broke the chain, so player 0 loses although player 1 gave up
  const late = game.applyMove(s, 0, { type: 'next', objected: ['w2'] });
  assert.equal(late.loser, 0);
  assert.deepEqual(game.getResult(late), { winner: 1 });
});

test('son hece: listede olmayan kelime yoksa itiraz adımı olmadan biter', () => {
  let s = start();
  s = game.applyMove(s, 0, { type: 'word', word: 'kitap', at: T }, ctx);
  s = game.applyMove(s, 1, { type: 'timeout', at: T + 99999 }, ctx);
  assert.equal(s.phase, 'over');
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
