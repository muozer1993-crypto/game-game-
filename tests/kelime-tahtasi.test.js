import { test, assert } from './runner.js';
import game, { makeBag, TILES, VALUES, SIZE, CENTER, PREMIUM, placementWords, scoreWords, wordThrough } from '../games/kelime-tahtasi.js';

const dict = new Set(['kal', 'kale', 'el', 'al', 'ela', 'ak', 'kalem', 'lale', 'ele', 'alem']);
const ctx = { dict };
const idx = (r, c) => r * SIZE + c;

test('kelime tahtası: torba, dağıtım, katlı kareler', () => {
  const bag = makeBag(3);
  assert.equal(bag.length, Object.values(TILES).reduce((a, b) => a + b, 0));
  assert.equal(bag.filter((l) => l === 'a').length, 12);
  assert.deepEqual(makeBag(3), bag);
  assert.ok(Object.keys(TILES).every((l) => VALUES[l] > 0));
  const s = game.setup({ seed: 3 });
  assert.equal(s.racks[0].length, 7);
  assert.equal(s.racks[1].length, 7);
  assert.equal(s.bag.length, bag.length - 14);
  assert.equal(PREMIUM[CENTER], 'W2');
  assert.equal(PREMIUM[0], 'W3');
  assert.equal(Object.values(PREMIUM).filter((p) => p === 'W3').length, 4);
});

test('kelime tahtası: yerleştirme kuralları ve oluşan kelimeler', () => {
  const empty = new Array(SIZE * SIZE).fill(null);
  const t = (r, c, letter) => ({ cell: idx(r, c), letter });
  assert.equal(placementWords(empty, [t(5, 4, 'k'), t(5, 5, 'a'), t(5, 6, 'l')], true).words[0].word, 'kal');
  assert.ok(placementWords(empty, [t(0, 0, 'k'), t(0, 1, 'a')], true).error.includes('yıldız'));
  assert.ok(placementWords(empty, [t(5, 5, 'k')], true).error.includes('iki harfli'));
  assert.ok(placementWords(empty, [t(5, 5, 'k'), t(6, 6, 'a')], true).error.includes('tek bir satıra'));
  assert.ok(placementWords(empty, [t(5, 4, 'k'), t(5, 6, 'l')], true).error.includes('boşluk'));
  // after KAL on row 5 (cols 4-6): EL down from the A? place E above? build "ELA" vertically through the A at (5,5)
  const board = empty.slice();
  board[idx(5, 4)] = 'k'; board[idx(5, 5)] = 'a'; board[idx(5, 6)] = 'l';
  const res = placementWords(board, [t(4, 5, 'l'), t(6, 5, 'e')], false);
  assert.ok(!res.error, res.error);
  assert.deepEqual(res.words.map((w) => w.word), ['lae'], 'only the vertical word through the A; single letters on rows 4 and 6 are not words');
  const vertical = placementWords(board, [t(4, 5, 'e'), t(6, 5, 'e')], false);
  assert.equal(vertical.words[0].word, 'eae', 'the main word runs through the existing A');
  assert.equal(vertical.horizontal, false);
  const detached = placementWords(board, [t(0, 0, 'e'), t(0, 1, 'l')], false);
  assert.ok(detached.error.includes('bitişik'));
  // a cross word: put E and L to the right under the row to form "EL" below "AL"? place "el" on row 6 cols 5-6 -> cross words "ae" and "ll"
  const cross = placementWords(board, [t(6, 5, 'e'), t(6, 6, 'l')], false);
  assert.deepEqual(cross.words.map((w) => w.word).sort(), ['ae', 'el', 'll'].sort());
  assert.equal(wordThrough(board, idx(5, 5), true).word, 'kal');
  assert.equal(wordThrough(board, idx(5, 5), false).word, 'a');
});

test('kelime tahtası: puanlama (katlı kareler yalnızca yeni harflerde), yedi harf bonusu', () => {
  const board = new Array(SIZE * SIZE).fill(null);
  const placed = [idx(5, 4), idx(5, 5), idx(5, 6)];
  board[idx(5, 4)] = 'k'; board[idx(5, 5)] = 'a'; board[idx(5, 6)] = 'l';
  const words = [{ word: 'kal', cells: placed }];
  const sc = scoreWords(words, placed, board);
  assert.equal(sc.total, (1 + 1 + 1) * 2, 'centre star doubles the word');
  // reuse: the same word scored again without placing the centre gets no multiplier
  assert.equal(scoreWords(words, [idx(5, 4)], board).total, 3);
  // L3 at (5,10): place "ğ" there? use (0,5) L3 with ğ (8) -> 24
  const b2 = board.slice(); b2[idx(0, 5)] = 'ğ'; b2[idx(0, 6)] = 'a';
  assert.equal(scoreWords([{ word: 'ğa', cells: [idx(0, 5), idx(0, 6)] }], [idx(0, 5), idx(0, 6)], b2).total, 8 * 3 + 1);
  const seven = [0, 1, 2, 3, 4, 5, 6].map((k) => idx(3, k));
  const b3 = board.slice(); seven.forEach((c) => { b3[c] = 'a'; });
  const s7 = scoreWords([{ word: 'aaaaaaa', cells: seven }], seven, b3);
  assert.equal(s7.bingo, true);
  assert.equal(s7.total, 7 * 2 + 50, 'seven A tiles (7) doubled by the W2 at (3,3), plus the bingo');
});

test('kelime tahtası: hamleler — oynama, sözlük, raf yenileme, pas, değiştirme ve bitiş', () => {
  let s = game.setup({ seed: 3 });
  const p = s.turn;
  // give the mover a known rack
  s = { ...s, racks: s.racks.map((r, i) => (i === p ? ['k', 'a', 'l', 'e', 'm', 'z', 'ş'] : r)) };
  assert.throws(() => game.applyMove(s, 1 - p, { type: 'pass' }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, p, { type: 'play', tiles: [{ cell: CENTER, letter: 'k' }, { cell: CENTER + 1, letter: 'z' }] }, ctx), 'listesinde yok');
  assert.throws(() => game.applyMove(s, p, { type: 'play', tiles: [{ cell: CENTER, letter: 'k' }, { cell: CENTER + 1, letter: 'ğ' }] }, ctx), 'Rafında Ğ yok');
  s = game.applyMove(s, p, { type: 'play', tiles: [{ cell: CENTER - 1, letter: 'k' }, { cell: CENTER, letter: 'a' }, { cell: CENTER + 1, letter: 'l' }] }, ctx);
  assert.equal(s.scores[p], 6);
  assert.equal(s.racks[p].length, 7, 'rack refilled');
  assert.equal(s.turn, 1 - p);
  assert.deepEqual(s.last, [CENTER - 1, CENTER, CENTER + 1]);
  assert.deepEqual(s.lastWords, [{ word: 'kal', points: 6 }]);
  assert.equal(s.passes, 0);
  // the remote device does not re-check the dictionary
  const remote = game.applyMove({ ...s, turn: 1 - p, racks: s.racks.map((r, i) => (i === 1 - p ? ['z', 'z', 'a', 'a', 'a', 'a', 'a'] : r)) }, 1 - p, { type: 'play', tiles: [{ cell: CENTER + SIZE, letter: 'z' }] }, { ...ctx, remote: true });
  assert.equal(remote.board[CENTER + SIZE], 'z');
  // exchange needs a full bag's worth, returns tiles to the bag
  const bagBefore = s.bag.length;
  const ex = game.applyMove(s, 1 - p, { type: 'exchange', letters: [s.racks[1 - p][0], s.racks[1 - p][1]] }, ctx);
  assert.equal(ex.racks[1 - p].length, 7);
  assert.equal(ex.bag.length, bagBefore, 'two out, two in');
  assert.equal(ex.passes, 1);
  assert.throws(() => game.applyMove({ ...s, bag: s.bag.slice(0, 3) }, 1 - p, { type: 'exchange', letters: [s.racks[1 - p][0]] }, ctx), 'yeterli harf yok');
  // four passes in a row end the game with rack deductions
  let q = s;
  for (let i = 0; i < 4; i++) q = game.applyMove(q, q.turn, { type: 'pass' }, ctx);
  assert.equal(q.over, true);
  assert.equal(q.reason, 'passes');
  const left = (st, i) => st.racks[i].reduce((a, l) => a + VALUES[l], 0);
  assert.equal(q.scores[p], 6 - left(q, p));
  assert.equal(q.scores[1 - p], -left(q, 1 - p));
  assert.ok(game.getResult(q));
  // emptying the rack with an empty bag ends the game and transfers the opponent's tile values
  let e = { ...s, bag: [], turn: p, racks: s.racks.map((r, i) => (i === p ? ['e', 'l'] : ['j', 'a'])), board: s.board.slice() };
  e = game.applyMove(e, p, { type: 'play', tiles: [{ cell: CENTER + SIZE, letter: 'l' }, { cell: CENTER + 2 * SIZE, letter: 'e' }] }, { dict: new Set(['ale']) });
  assert.equal(e.over, true);
  assert.equal(e.reason, 'empty');
  assert.equal(e.scores[p], 6 + 3 + (10 + 1), 'ALE 3 points + opponent tiles J+A');
  assert.equal(e.scores[1 - p], -(10 + 1));
  assert.deepEqual(game.getResult(e), { winner: p });
  assert.throws(() => game.applyMove(e, 1 - p, { type: 'pass' }), 'Oyun bitti');
});

import { finalScores } from '../games/kelime-tahtasi.js';

test('kelime tahtası: listede olmayan kelime "yine de" oynanır, işaretlenir; oyun sonunda itiraz edilirse hamlenin puanı silinir', () => {
  let s = game.setup({ seed: 3 });
  const p = s.turn;
  s = { ...s, racks: s.racks.map((r, i) => (i === p ? ['k', 'a', 'l', 'e', 'm', 'z', 'ş'] : r)) };
  const kaz = [{ cell: CENTER - 1, letter: 'k' }, { cell: CENTER, letter: 'a' }, { cell: CENTER + 1, letter: 'z' }];
  assert.throws(() => game.applyMove(s, p, { type: 'play', tiles: kaz }, ctx), 'listesinde yok');
  assert.throws(() => game.applyMove(s, p, { type: 'play', tiles: kaz, unlisted: ['kar'] }, ctx), 'listesinde yok', 'naming another word does not let it through');
  const before = s;
  s = game.applyMove(s, p, { type: 'play', tiles: kaz, unlisted: ['kaz', 'xyz'] }, ctx);
  const pts = s.scores[p];
  assert.ok(pts > 0);
  assert.equal(s.disputes.length, 1);
  assert.deepEqual(s.disputes[0], { id: 'd0', player: p, words: ['kaz'], points: pts, cells: [CENTER - 1, CENTER, CENTER + 1] });
  assert.deepEqual(s.lastWords, [{ word: 'kaz', points: pts, unlisted: true }]);
  // the other phone takes the move's word for it
  const there = game.applyMove(before, p, { type: 'play', tiles: kaz, unlisted: ['kaz'] }, { remote: true });
  assert.deepEqual(there.disputes, s.disputes, 'the same mark on both phones');
  // four passes end the game: objections come before the result
  for (let i = 0; i < 4; i++) s = game.applyMove(s, s.turn, { type: 'pass' }, ctx);
  assert.equal(s.review, true);
  assert.equal(s.over, false);
  assert.equal(game.getResult(s), null);
  assert.equal(game.getTurn(s), null);
  assert.throws(() => game.applyMove(s, s.turn, { type: 'pass' }, ctx), 'itirazlar');
  const on = { mode: 'online' };
  assert.throws(() => game.applyMove(s, p, { type: 'object', id: 'd0', on: true }, on), 'Kendi kelimene');
  assert.throws(() => game.applyMove(s, 1 - p, { type: 'object', id: 'd9', on: true }, on), 'itiraz edilemez');
  s = game.applyMove(s, 1 - p, { type: 'object', id: 'd0', on: true }, on);
  assert.deepEqual(s.objected, ['d0']);
  const raw = s.scores.slice();
  s = game.applyMove(s, 0, { type: 'next', objected: s.objected });
  assert.equal(s.over, true);
  assert.equal(s.review, false);
  assert.deepEqual(finalScores(s), [p === 0 ? raw[0] - pts : raw[0], p === 1 ? raw[1] - pts : raw[1]]);
  const [a, b] = finalScores(s);
  assert.deepEqual(game.getResult(s), a === b ? { draw: true } : { winner: a > b ? 0 : 1 });
});

test('kelime tahtası: çapraz giden itiraz ve "sonucu gör" iki telefonda aynı sonucu verir', () => {
  let s = game.setup({ seed: 5 });
  const p = s.turn;
  s = { ...s, racks: s.racks.map((r, i) => (i === p ? ['k', 'a', 'z', 'e', 'm', 'l', 'ş'] : r)) };
  s = game.applyMove(s, p, { type: 'play', tiles: [{ cell: CENTER - 1, letter: 'k' }, { cell: CENTER, letter: 'a' }, { cell: CENTER + 1, letter: 'z' }], unlisted: ['kaz'] }, ctx);
  for (let i = 0; i < 4; i++) s = game.applyMove(s, s.turn, { type: 'pass' }, ctx);
  // the host closes the review while the guest's objection is on its way
  const host = game.applyMove(s, 0, { type: 'next', objected: [] });
  const guest = game.applyMove(game.applyMove(s, 1 - p, { type: 'object', id: 'd0', on: true }, { mode: 'online' }), 0, { type: 'next', objected: [] }, { remote: true });
  assert.deepEqual(finalScores(host), finalScores(guest), 'the closing move decides on both phones');
  assert.throws(() => game.applyMove(host, 1 - p, { type: 'object', id: 'd0', on: true }, { mode: 'online', remote: true }), 'Oyun bitti');
});
