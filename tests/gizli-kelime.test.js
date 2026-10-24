import { test, assert } from './runner.js';
import game, { scoreWordle, scorePlusMinus, keyStates, randomNumberSecret } from '../games/gizli-kelime.js';
import sayi from '../games/gizli-sayi.js';
import { dictionaryFrom } from '../js/lib/words.js';

const dict = dictionaryFrom(['kalem', 'tahta', 'kitap', 'elmas', 'salam', 'masal', 'kaval', 'lamba', 'sabah', 'kalın', 'abla', 'kara', 'kedi', 'anne', 'aaaaa']);
const common = { 4: ['abla', 'kara'], 5: ['kalem', 'tahta'], 6: ['kardeş'] };
const ctx = { dict, common };

test('wordle puanlama: temel', () => {
  assert.deepEqual(scoreWordle('kalem', 'kalem'), ['correct', 'correct', 'correct', 'correct', 'correct']);
  assert.deepEqual(scoreWordle('kalem', 'tahta'), ['absent', 'correct', 'absent', 'absent', 'absent']);
  assert.deepEqual(scoreWordle('kalem', 'elmas'), ['present', 'present', 'present', 'present', 'absent']);
});

test('wordle puanlama: tekrar eden harflerde Wordle kuralı', () => {
  // secret has one "a": it is matched in place, the second "a" in the guess is grey
  assert.deepEqual(scoreWordle('kalem', 'salam'), ['absent', 'correct', 'correct', 'absent', 'correct']);
  assert.deepEqual(scoreWordle('kalem', 'aaaaa'), ['absent', 'correct', 'absent', 'absent', 'absent']);
  // in-place matches are claimed first, the leftover letters are yellow at most as many times as they occur
  assert.deepEqual(scoreWordle('masal', 'salam'), ['present', 'correct', 'present', 'correct', 'present']);
  assert.deepEqual(scoreWordle('masal', 'lasas'), ['present', 'correct', 'correct', 'correct', 'absent']);
  assert.deepEqual(scoreWordle('kaval', 'kalın'), ['correct', 'correct', 'present', 'absent', 'absent']);
  assert.deepEqual(scoreWordle('abla', 'aaaa'), ['correct', 'absent', 'absent', 'correct']);
  assert.deepEqual(scoreWordle('abla', 'laaa'), ['present', 'present', 'absent', 'correct']);
});

test('+/− puanlama', () => {
  assert.deepEqual(scorePlusMinus('4271', '4712'), { plus: 1, minus: 3 });
  assert.deepEqual(scorePlusMinus('kalem', 'elmas'), { plus: 0, minus: 4 });
  assert.deepEqual(scorePlusMinus('kalem', 'kalem'), { plus: 5, minus: 0 });
  assert.deepEqual(scorePlusMinus('1234', '5678'), { plus: 0, minus: 0 });
});

test('klavye renkleri: yeşil > sarı > gri', () => {
  const states = keyStates([
    { word: 'elmas', result: scoreWordle('kalem', 'elmas') }, // e l m a present, s absent
    { word: 'salam', result: scoreWordle('kalem', 'salam') }, // a l m correct
    { word: 'tahta', result: null },                          // unscored: ignored
  ]);
  assert.equal(states.a, 'correct');
  assert.equal(states.l, 'correct');
  assert.equal(states.m, 'correct');
  assert.equal(states.e, 'present');
  assert.equal(states.s, 'absent');
  assert.equal(states.t, undefined);
});

test('gizli sayı üretimi: 4 farklı rakam, 0 ile başlamaz', () => {
  for (let i = 0; i < 200; i++) {
    const n = randomNumberSecret(4);
    assert.equal(n.length, 4);
    assert.equal(new Set(n).size, 4);
    assert.notEqual(n[0], '0');
  }
});

function playReady(options = {}) {
  let s = game.setup({ length: 5, feedback: 'wordle', secretMode: 'manual', maxGuesses: 6, ...options });
  s = game.applyMove(s, 0, { type: 'setSecret', secret: { word: 'kalem' } }, ctx); // player 1 must find "kalem"
  assert.equal(s.phase, 'secret');
  assert.deepEqual(game.getTurn(s), { player: 1, private: true });
  s = game.applyMove(s, 1, { type: 'setSecret', secret: { word: 'tahta' } }, ctx); // player 0 must find "tahta"
  assert.equal(s.phase, 'play');
  return s;
}

/** Simulate a device that controls both players: apply auto moves until none are left. */
function runAuto(g, s, players = [0, 1]) {
  for (let guard = 0; guard < 20; guard++) {
    let did = false;
    for (const p of players) {
      const m = g.autoMove(s, p, ctx);
      if (m) { s = g.applyMove(s, p, m, ctx); did = true; break; }
    }
    if (!did) break;
  }
  return s;
}

test('gizli kelime: gizli kelime doğrulanır', () => {
  const s = game.setup({ length: 5, secretMode: 'manual' });
  assert.throws(() => game.applyMove(s, 0, { type: 'setSecret', secret: { word: 'kedi' } }, ctx), '5 harfli');
  assert.throws(() => game.applyMove(s, 0, { type: 'setSecret', secret: { word: 'xyzab' } }, ctx), 'Türkçe harfler');
  assert.throws(() => game.applyMove(s, 0, { type: 'setSecret', secret: { word: 'zzzzz' } }, ctx), 'listede yok');
  // the stripped move (no secret field) marks the opponent as ready without a word
  const t = game.applyMove(s, 1, { type: 'setSecret' }, ctx);
  assert.equal(t.ready[1], true);
  assert.equal(t.secrets[1], null);
});

test('gizli kelime: rastgele gizli kelime autoMove ile seçilir', () => {
  let s = game.setup({ length: 5, secretMode: 'random' });
  assert.equal(game.getTurn(s).private, false);
  const m = game.autoMove(s, 0, ctx);
  assert.equal(m.type, 'setSecret');
  assert.ok(common[5].includes(m.secret.word));
  s = runAuto(game, s);
  assert.equal(s.phase, 'play');
  assert.ok(s.secrets[0] && s.secrets[1]);
});

test('gizli kelime: sıra, puanlama ve kazanan', () => {
  let s = playReady();
  assert.deepEqual(game.getTurn(s), { player: 0, private: false });
  assert.throws(() => game.applyMove(s, 1, { type: 'guess', word: 'kitap' }, ctx), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'guess', word: 'zzzzz' }, ctx), 'listesinde yok');
  s = game.applyMove(s, 0, { type: 'guess', word: 'KİTAP' }, ctx);
  assert.equal(s.guesses[0][0].word, 'kitap');
  assert.equal(s.guesses[0][0].result, null);
  assert.deepEqual(game.getTurn(s), { player: 1, private: false });
  // player 1's device scores the guess automatically
  const fb = game.autoMove(s, 1, ctx);
  assert.equal(fb.type, 'feedback');
  assert.equal(fb.guesser, 0);
  assert.deepEqual(fb.result, scoreWordle('tahta', 'kitap'));
  assert.equal(game.autoMove(s, 0, ctx), null); // the guesser's device has nothing to do
  assert.throws(() => game.applyMove(s, 0, fb, ctx), 'kelimenin sahibi');
  s = game.applyMove(s, 1, fb, ctx);
  assert.deepEqual(s.guesses[0][0].result, scoreWordle('tahta', 'kitap'));
  // player 1 guesses and finds it in one
  s = game.applyMove(s, 1, { type: 'guess', word: 'kalem' }, ctx);
  s = runAuto(game, s);
  assert.equal(s.phase, 'over');
  assert.equal(s.solved[1], 1);
  assert.deepEqual(game.getResult(s), { winner: 1 });
  assert.deepEqual(s.revealed, ['kalem', 'tahta']);
});

test('gizli kelime: ilk oyuncu bulunca ikinci aynı turda hakkını kullanır (berabere)', () => {
  let s = playReady();
  s = game.applyMove(s, 0, { type: 'guess', word: 'tahta' }, ctx);
  s = runAuto(game, s);
  assert.equal(s.phase, 'play', 'player 1 still gets the same round');
  assert.equal(s.solved[0], 1);
  assert.deepEqual(game.getTurn(s), { player: 1, private: false });
  s = game.applyMove(s, 1, { type: 'guess', word: 'kalem' }, ctx);
  s = runAuto(game, s);
  assert.equal(s.phase, 'over');
  assert.deepEqual(game.getResult(s), { draw: true });
});

test('gizli kelime: ilk oyuncu bulur, ikinci bulamaz → ilk kazanır', () => {
  let s = playReady();
  s = game.applyMove(s, 0, { type: 'guess', word: 'tahta' }, ctx);
  s = runAuto(game, s);
  s = game.applyMove(s, 1, { type: 'guess', word: 'kitap' }, ctx);
  s = runAuto(game, s);
  assert.deepEqual(game.getResult(s), { winner: 0 });
});

test('gizli kelime: tahmin hakkı bitince berabere', () => {
  let s = playReady({ maxGuesses: 2 });
  const words = ['kitap', 'elmas'];
  for (const w of words) {
    s = game.applyMove(s, 0, { type: 'guess', word: w }, ctx); s = runAuto(game, s);
    s = game.applyMove(s, 1, { type: 'guess', word: w }, ctx); s = runAuto(game, s);
  }
  assert.equal(s.phase, 'over');
  assert.deepEqual(game.getResult(s), { draw: true });
});

test('gizli kelime: +/− modunda sonuç sayıdır ve tekrar tahmin yasak', () => {
  let s = playReady({ feedback: 'plusminus' });
  s = game.applyMove(s, 0, { type: 'guess', word: 'kitap' }, ctx);
  const fb = game.autoMove(s, 1, ctx);
  assert.deepEqual(fb.result, scorePlusMinus('tahta', 'kitap'));
  s = game.applyMove(s, 1, fb, ctx);
  s = game.applyMove(s, 1, { type: 'guess', word: 'kitap' }, ctx);
  s = runAuto(game, s);
  assert.throws(() => game.applyMove(s, 0, { type: 'guess', word: 'kitap' }, ctx), 'zaten denedin');
});

test('gizli kelime: pes eden kaybeder', () => {
  let s = playReady();
  s = game.applyMove(s, 0, { type: 'giveup' }, ctx);
  assert.deepEqual(game.getResult(s), { winner: 1 });
});

test('gizli kelime: geçersiz puan reddedilir', () => {
  let s = playReady();
  s = game.applyMove(s, 0, { type: 'guess', word: 'kitap' }, ctx);
  assert.throws(() => game.applyMove(s, 1, { type: 'feedback', guesser: 0, index: 0, result: ['correct'] }, ctx), 'Geçersiz puan');
  assert.throws(() => game.applyMove(s, 1, { type: 'feedback', guesser: 0, index: 1, result: scoreWordle('tahta', 'kitap') }, ctx), 'Puanlanacak tahmin yok');
});

test('gizli sayı: doğrulama ve akış', () => {
  let s = sayi.setup({ secretMode: 'manual', maxGuesses: 10 });
  assert.equal(s.length, 4);
  assert.equal(s.feedback, 'plusminus');
  assert.throws(() => sayi.applyMove(s, 0, { type: 'setSecret', secret: { word: '1123' } }, {}), 'farklı');
  assert.throws(() => sayi.applyMove(s, 0, { type: 'setSecret', secret: { word: '0123' } }, {}), '0 ile');
  assert.throws(() => sayi.applyMove(s, 0, { type: 'setSecret', secret: { word: '12a4' } }, {}), 'rakam');
  s = sayi.applyMove(s, 0, { type: 'setSecret', secret: { word: '4271' } }, {});
  s = sayi.applyMove(s, 1, { type: 'setSecret', secret: { word: '9385' } }, {});
  s = sayi.applyMove(s, 0, { type: 'guess', word: '9358' }, {});
  const fb = sayi.autoMove(s, 1, {});
  assert.deepEqual(fb.result, { plus: 2, minus: 2 });
  s = sayi.applyMove(s, 1, fb, {});
  s = sayi.applyMove(s, 1, { type: 'guess', word: '4712' }, {});
  s = runAuto(sayi, s);
  assert.deepEqual(s.guesses[1][0].result, { plus: 1, minus: 3 });
  assert.equal(s.phase, 'play');
});
