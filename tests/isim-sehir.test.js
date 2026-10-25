import { test, assert } from './runner.js';
import game, { pickLetters, LETTERS, SETS, scoreRound, roundTotals, normalize } from '../games/isim-sehir.js';

test('isim şehir: harfler tohuma göre aynı, izinli ve tur sayısınca farklı; kategoriler', () => {
  const l = pickLetters(7, 9);
  assert.equal(l.length, 7);
  assert.deepEqual(l, pickLetters(7, 9));
  assert.equal(new Set(l).size, 7, 'distinct letters');
  assert.ok(l.every((x) => LETTERS.includes(x)));
  assert.ok(!LETTERS.includes('ğ') && !LETTERS.includes('ı') && !LETTERS.includes('j'));
  const s = game.setup({ rounds: 3, seconds: 60, set: 'genis', seed: 4 });
  assert.equal(s.categories.length, 8);
  assert.deepEqual(game.setup({ seed: 4 }).categories, SETS.klasik);
  assert.equal(s.entries.length, 3);
  assert.equal(s.phase, 'write');
  assert.deepEqual(game.getTurn(s), { player: 0, private: true, simultaneous: true });
});

test('isim şehir: puanlama — farklı 10, aynı 5, boş/yanlış harf/geçersiz 0', () => {
  const entry = {
    answers: [['Kemal', 'Konya', 'kedi', 'Kiraz', '', 'Kalem'], ['Kaan', 'konya ', 'Kedi', 'Mango', 'Kova', 'Kutu']],
    vetoes: [[false, false, false, false, false, false], [false, false, false, false, false, true]],
  };
  assert.deepEqual(scoreRound(entry, 'k'), [[10, 5, 5, 10, 0, 10], [10, 5, 5, 0, 10, 0]]);
  assert.deepEqual(roundTotals(entry, 'k'), [40, 30]);
  assert.equal(normalize('  İzmir  '), 'izmir');
  assert.equal(normalize('ISPARTA'), 'ısparta', 'Turkish lowercasing');
});

test('isim şehir: akış — bitir, karşılaştır, itiraz, sonraki tur, bitiş', () => {
  let s = game.setup({ rounds: 3, seconds: 60, seed: 2 });
  const L = s.letters;
  const ans = (l) => [`${l}emal`, `${l}onya`, `${l}edi`, `${l}iraz`, `${l}alem`];
  assert.throws(() => game.applyMove(s, 0, { type: 'next' }), 'henüz bitmedi');
  assert.throws(() => game.applyMove(s, 0, { type: 'veto', category: 0, on: true }), 'Önce ikiniz');
  s = game.applyMove(s, 0, { type: 'finish', answers: ans(L[0]) });
  assert.equal(s.phase, 'write');
  assert.deepEqual(game.getTurn(s), { player: 1, private: true, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'finish', answers: [] }), 'zaten verdin');
  // player 1: one identical answer, one empty, one wrong letter, too long answer trimmed
  s = game.applyMove(s, 1, { type: 'finish', answers: [`${L[0]}emal`, '', 'xyz', `${L[0]}avun`, ' ' + `${L[0]}` + 'a'.repeat(60)] });
  assert.equal(s.phase, 'compare');
  assert.equal(game.getTurn(s), null);
  assert.equal(s.entries[0].answers[1][4].length, 40, 'answers are trimmed and capped');
  assert.deepEqual(roundTotals(s.entries[0], L[0]), [45, 25]);
  // the opponent vetoes player 0's object; the veto defaults to the other player's column
  s = game.applyMove(s, 1, { type: 'veto', category: 4, on: true });
  assert.equal(s.entries[0].vetoes[0][4], true);
  assert.deepEqual(roundTotals(s.entries[0], L[0]), [35, 25]);
  s = game.applyMove(s, 1, { type: 'veto', category: 4, on: false });
  s = game.applyMove(s, 0, { type: 'veto', target: 1, category: 0, on: true });
  assert.deepEqual(roundTotals(s.entries[0], L[0]), [50, 20], 'a vetoed shared answer leaves the other one alone at 10');
  // a 'next' carrying a veto snapshot scores from that snapshot (both phones agree even when a veto crossed it)
  const snap = game.applyMove(s, 0, { type: 'next', vetoes: [[false, false, false, false, true], [true, false, false, false, false]] });
  assert.deepEqual(snap.scores, [40, 20]);
  assert.equal(snap.entries[0].vetoes[0][4], true, 'the snapshot is stored');
  s = game.applyMove(s, 0, { type: 'next' });
  assert.deepEqual(s.scores, [50, 20]);
  assert.equal(s.round, 1);
  assert.equal(s.phase, 'write');
  // finish with no answers at all is allowed (time out)
  s = game.applyMove(s, 1, { type: 'finish' });
  s = game.applyMove(s, 0, { type: 'finish', answers: ans(L[1]) });
  s = game.applyMove(s, 1, { type: 'next' });
  assert.deepEqual(s.scores, [100, 20]);
  s = game.applyMove(s, 0, { type: 'finish', answers: ans(L[2]) });
  s = game.applyMove(s, 1, { type: 'finish', answers: ans(L[2]) });
  s = game.applyMove(s, 0, { type: 'next' });
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.scores, [125, 45]);
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.throws(() => game.applyMove(s, 0, { type: 'next' }), 'Oyun bitti');
});
