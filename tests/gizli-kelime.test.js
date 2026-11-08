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

test('gizli kelime: ortak kelime modu — tek kelime, ev sahibi puanlar', () => {
  let s = game.setup({ length: 5, secretMode: 'shared' });
  assert.equal(s.shared, true);
  assert.equal(game.autoMove(s, 1, ctx), null, 'the guest never picks the shared word');
  assert.throws(() => game.applyMove(s, 1, { type: 'setSecret', secret: { word: 'kalem' } }, ctx), 'oyunu kuran');
  s = runAuto(game, s, [0]);
  assert.equal(s.phase, 'play');
  assert.deepEqual(s.ready, [true, true]);
  assert.ok(s.secrets[0] && !s.secrets[1]);
  // the guest device sees only the stripped move
  let g = game.setup({ length: 5, secretMode: 'shared' });
  g = game.applyMove(g, 0, { type: 'setSecret' }, ctx);
  assert.equal(g.phase, 'play');
  // player 0 guesses and scores its own guess; player 1's guess is scored by player 0 too
  s = game.applyMove(s, 0, { type: 'guess', word: 'kitap' }, ctx);
  const fb0 = game.autoMove(s, 0, ctx);
  assert.equal(fb0.guesser, 0);
  assert.throws(() => game.applyMove(s, 1, fb0, ctx), 'kelimenin sahibi');
  s = game.applyMove(s, 0, fb0, ctx);
  s = game.applyMove(s, 1, { type: 'guess', word: 'kitap' }, ctx);
  assert.equal(game.autoMove(s, 1, ctx), null);
  const fb1 = game.autoMove(s, 0, ctx);
  assert.equal(fb1.guesser, 1);
  s = game.applyMove(s, 0, fb1, ctx);
  assert.deepEqual(s.guesses[0][0].result, s.guesses[1][0].result, 'same word, same feedback');
  // the first to find the shared word wins at once: the other cannot copy it off the screen for a draw
  const before = s;
  s = game.applyMove(s, 0, { type: 'guess', word: s.secrets[0] }, ctx);
  s = runAuto(game, s, [0]);
  assert.equal(s.phase, 'over');
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.equal(s.revealed[0], s.secrets[0]);
  assert.throws(() => game.applyMove(s, 1, { type: 'guess', word: s.secrets[0] }, ctx), 'tahmin yapılamaz');
  // player 0 misses, player 1 finds it: player 1 wins
  let t = game.applyMove(before, 0, { type: 'guess', word: ['kalem', 'tahta', 'elmas'].find((w) => w !== before.secrets[0]) }, ctx);
  t = runAuto(game, t, [0]);
  t = game.applyMove(t, 1, { type: 'guess', word: before.secrets[0] }, ctx);
  t = runAuto(game, t, [0]);
  assert.equal(t.phase, 'over');
  assert.deepEqual(game.getResult(t), { winner: 1 });
});

test('gizli kelime: varsayılan mod herkes kendi seçer', () => {
  const s = game.setup({});
  assert.equal(s.secretMode, 'manual');
  assert.deepEqual(game.getTurn(s), { player: 0, private: true });
  assert.equal(sayi.setup({}).secretMode, 'manual');
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

test('gizli kelime: pes eden kaybeder, yalnızca sırası gelen pes edebilir', () => {
  let s = playReady();
  assert.throws(() => game.applyMove(s, 1, { type: 'giveup' }, ctx), 'Sıra sende değil');
  s = game.applyMove(s, 0, { type: 'giveup' }, ctx);
  assert.deepEqual(game.getResult(s), { winner: 1 });
});

test('gizli kelime: rakibin tahmini puanlanmadan tahmin yapılamaz, hak bitince tahmin yok', () => {
  let s = playReady({ maxGuesses: 1 });
  s = game.applyMove(s, 0, { type: 'guess', word: 'kitap' }, ctx);
  assert.throws(() => game.applyMove(s, 1, { type: 'guess', word: 'kitap' }, ctx), 'Rakibin tahmini puanlanıyor');
  s = runAuto(game, s, [1]);
  s = game.applyMove(s, 1, { type: 'guess', word: 'kitap' }, ctx);
  s = runAuto(game, s, [0]);
  assert.equal(s.phase, 'over');
  // remote moves are not re-validated against the local list
  const t = playReady();
  const r = game.applyMove(t, 0, { type: 'guess', word: 'zebra' }, { ...ctx, remote: true });
  assert.equal(r.guesses[0][0].word, 'zebra');
  assert.throws(() => game.applyMove(t, 0, { type: 'guess', word: 'zebra' }, ctx), 'listesinde yok');
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

test('gizli kelime: listede olmayan gizli kelime ve tahmin onayla kullanılır; itiraz edilen kelimeyi kullanan kaybeder', () => {
  const play = (state, player, move) => {
    let s = game.applyMove(state, player, move, ctx);
    for (const p of [0, 1]) { const m = game.autoMove(s, p, ctx); if (m) s = game.applyMove(s, p, m, ctx); }
    return s;
  };
  let s = game.setup({ length: 5, secretMode: 'manual', feedback: 'wordle', maxGuesses: 2, seed: 4 });
  assert.throws(() => game.applyMove(s, 0, { type: 'setSecret', secret: { word: 'pizza' } }, ctx), 'listede yok');
  s = game.applyMove(s, 0, { type: 'setSecret', unlisted: true, secret: { word: 'pizza' } }, ctx);
  s = game.applyMove(s, 1, { type: 'setSecret', secret: { word: 'kalem' } }, ctx);
  assert.deepEqual(s.unlistedSecret, [true, false]);
  assert.equal(s.phase, 'play');
  const first = game.whoseTurn(s);
  // the guesser types the unlisted word itself: refused without the flag, marked with it
  const g0 = s.guesses;
  assert.throws(() => game.applyMove(s, first, { type: 'guess', word: 'zzzzz' }, ctx), 'listesinde yok');
  s = play(s, first, first === 1 ? { type: 'guess', word: 'pizza', unlisted: true } : { type: 'guess', word: 'kitap' });
  assert.notEqual(s.guesses, g0);
  s = play(s, 1 - first, 1 - first === 1 ? { type: 'guess', word: 'pizza', unlisted: true } : { type: 'guess', word: 'kitap' });
  assert.equal(s.phase, 'over', 'player 1 found pizza');
  assert.equal(s.review, true, 'unlisted words were used: objections first');
  assert.equal(game.getResult(s), null);
  assert.deepEqual(s.guesses[1][0].unlisted, true);
  const on = { ...ctx, mode: 'online' };
  assert.throws(() => game.applyMove(s, 0, { type: 'object', id: 's0', on: true }, on), 'Kendi kelimene');
  // no objection: player 1 found the word, player 0 did not
  const fair = game.applyMove(s, 0, { type: 'next', objected: [] }, ctx);
  assert.deepEqual(game.getResult(fair), { winner: 1 });
  // player 1 objects to the secret pizza: player 0 used an objected word and loses anyway
  const one = game.applyMove(game.applyMove(s, 1, { type: 'object', id: 's0', on: true }, on), 0, { type: 'next', objected: ['s0'] }, ctx);
  assert.deepEqual(game.getResult(one), { winner: 1 });
  // player 0 objects to player 1's guess pizza: player 1 used an objected word and loses
  const other = game.applyMove(s, 0, { type: 'next', objected: ['g1:0'] }, ctx);
  assert.deepEqual(game.getResult(other), { winner: 0 });
  // both objected: a draw
  const both = game.applyMove(s, 0, { type: 'next', objected: ['g1:0', 's0', 'x9'] }, ctx);
  assert.deepEqual(both.objected, ['g1:0', 's0']);
  assert.deepEqual(game.getResult(both), { draw: true });
});

test('gizli kelime: listede olmayan kelime yoksa oyun itirazsız biter; sayı oyununda işaret olmaz', () => {
  let s = game.setup({ length: 5, secretMode: 'manual', feedback: 'wordle', maxGuesses: 6, seed: 2 });
  s = game.applyMove(s, 0, { type: 'setSecret', secret: { word: 'kalem' } }, ctx);
  s = game.applyMove(s, 1, { type: 'setSecret', secret: { word: 'kitap' } }, ctx);
  s = game.applyMove(s, game.whoseTurn(s), { type: 'giveup' }, ctx);
  assert.equal(s.phase, 'over');
  assert.equal(s.review, false);
  assert.ok(game.getResult(s));
  let n = sayi.setup({ secretMode: 'manual', seed: 1 });
  n = sayi.applyMove(n, 0, { type: 'setSecret', unlisted: true, secret: { word: '1234' } }, {});
  assert.deepEqual(n.unlistedSecret, [false, false], 'numbers have no word list');
});
