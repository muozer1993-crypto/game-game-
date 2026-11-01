import { test, assert } from './runner.js';
import game, { pointsFor, speedFactor, scoreOf, ARTIST_POINTS, SONG_POINTS, RESERVE } from '../games/sarkiyi-bil.js';

const fixture = {
  people: ['Mustafa', 'Beyza'], weights: {}, catalog: ['Katatonia', 'Opeth', 'Tool'],
  tracks: [
    ...Array.from({ length: 10 }, (_, i) => ({ a: 'Katatonia', t: `Kata ${i}`, s: 200 + i, dz: 1 + i, g: 'sp', w: 1 })),
    ...Array.from({ length: 10 }, (_, i) => ({ a: 'Opeth', t: `Opeth ${i}`, s: 400 + i, dz: 100 + i, g: 'sp', w: 1 })),
    ...Array.from({ length: 10 }, (_, i) => ({ a: 'Tool', t: `Tool ${i}`, s: 500 + i, dz: 300 + i, g: 'top' })),
    ...Array.from({ length: 6 }, (_, i) => ({ a: 'Zara', t: `Zara ${i}`, s: 210 + i, p: 'https://p/z', g: 'fr', w: 2 })),
    { a: 'Quiet', t: 'Silent song', s: 100, dz: 999, np: 1, g: 'sp', w: 1 },
  ],
};
const ctx = { songs: fixture, players: ['Ali', 'Ayşe'] };

test('şarkıyı bil: puanlar dinlenen süreyle 2 kattan 1 kata iner, şık yalnız şarkı puanını yarılar', () => {
  assert.equal(speedFactor(0, 20), 2);
  assert.equal(speedFactor(10, 20), 1.5);
  assert.equal(speedFactor(35, 20), 1, 'never below 1×');
  assert.deepEqual(pointsFor({ heard: 0, clipSec: 20, mode: 'typed', artistOk: true, songOk: true }), { artist: ARTIST_POINTS * 2, song: SONG_POINTS * 2, total: 30 });
  assert.deepEqual(pointsFor({ heard: 20, clipSec: 20, mode: 'typed', artistOk: true, songOk: true }), { artist: 5, song: 10, total: 15 });
  assert.deepEqual(pointsFor({ heard: 10, clipSec: 20, mode: 'options', artistOk: true, songOk: true }), { artist: 8, song: 8, total: 16 }, 'the band keeps full points');
  assert.deepEqual(pointsFor({ heard: 3, clipSec: 20, mode: 'typed', artistOk: false, songOk: true }), { artist: 0, song: 19, total: 19 });
});

test('şarkıyı bil: aynı şarkı ikisine, önce basan grubu sonra şarkıyı yazar, öbürü de cevaplar, şıklar, süre dolması, sonuç', () => {
  let s = game.setup({ rounds: 5, clip: 20, limit: 60, srcMustafa: true, srcBeyza: true, seed: 5 }, ctx);
  assert.equal(s.songs.length, 5);
  assert.equal(s.reserve.length, RESERVE);
  assert.ok(s.songs.concat(s.reserve).every((x) => x.a !== 'Quiet' && x.a !== 'Tool'), 'only songs with a clip, only the ticked sources');
  assert.equal(s.limitSec, 60);
  assert.deepEqual(game.getTurn(s), { player: 0, private: false, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'check1', artist: 'x' }), 'Önce düğmene bas');
  assert.throws(() => game.applyMove(s, 0, { type: 'next' }), 'Önce bu şarkı');
  // song 1: Ayşe buzzes first after 3 s, band with a slip and song in capitals; Ali later, band only
  const song0 = s.songs[0];
  s = game.applyMove(s, 0, { type: 'buzz', who: 1, heard: 3 });
  assert.equal(s.phase, 'answer');
  assert.deepEqual(s.current, { who: 1, heard: 3 });
  assert.deepEqual(game.getTurn(s), { player: 1, private: false, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'buzz', who: 0, heard: 4 }), 'Şu an basılamaz');
  assert.throws(() => game.applyMove(s, 1, { type: 'check2', title: 'x' }), 'Önce grubu yaz');
  s = game.applyMove(s, 1, { type: 'check1', artist: `${song0.a.slice(0, -1)}x` });
  assert.equal(s.phase, 'answer2');
  assert.equal(s.current.artistOk, song0.a.length >= 5, 'a slip is forgiven in a name of five letters or more');
  s = game.applyMove(s, 1, { type: 'check2', title: song0.t.toUpperCase() });
  assert.equal(s.phase, 'listen', 'the other player still has to answer');
  assert.equal(s.answers[0][1].songOk, true);
  assert.deepEqual(s.answers[0][1].typed, { a: `${song0.a.slice(0, -1)}x`, t: song0.t.toUpperCase() });
  assert.throws(() => game.applyMove(s, 0, { type: 'buzz', who: 1, heard: 9 }), 'cevap verdin');
  s = game.applyMove(s, 0, { type: 'buzz', who: 0, heard: 12 });
  s = game.applyMove(s, 0, { type: 'check1', artist: song0.a });
  s = game.applyMove(s, 0, { type: 'check2', title: '' });
  assert.equal(s.phase, 'reveal');
  assert.deepEqual(s.answers[0][0].points, { artist: 7, song: 0, total: 7 });
  s = game.applyMove(s, 0, { type: 'next' });
  assert.equal(s.index, 1);
  // song 2: Ali types the band, takes the options for the song (half its points); Ayşe runs out of time
  const song1 = s.songs[1];
  s = game.applyMove(s, 0, { type: 'buzz', who: 0, heard: 10 });
  assert.throws(() => game.applyMove(s, 0, { type: 'options' }), 'Önce grubu yaz');
  s = game.applyMove(s, 0, { type: 'check1', artist: song1.a.toLowerCase() });
  s = game.applyMove(s, 0, { type: 'options' });
  assert.equal(s.phase, 'options2');
  s = game.applyMove(s, 0, { type: 'choose2', title: song1.t });
  assert.deepEqual(s.answers[1][0].points, { artist: 8, song: 8, total: 16 });
  assert.equal(s.answers[1][0].mode, 'options');
  assert.equal(s.phase, 'listen');
  s = game.applyMove(s, 0, { type: 'timeout' });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.answers[1][1].mode, 'timeout');
  assert.equal(s.answers[1][1].points.total, 0);
  s = game.applyMove(s, 0, { type: 'next' });
  // song 3: wrong band but the song picked right from the options still scores the song; the other passes
  const song2 = s.songs[2];
  s = game.applyMove(s, 0, { type: 'buzz', who: 1, heard: 20 });
  s = game.applyMove(s, 1, { type: 'check1', artist: 'Bilmemkim' });
  s = game.applyMove(s, 1, { type: 'options' });
  s = game.applyMove(s, 1, { type: 'choose2', title: song2.t });
  assert.deepEqual(s.answers[2][1].points, { artist: 0, song: 5, total: 5 });
  s = game.applyMove(s, 0, { type: 'buzz', who: 0, heard: 20 });
  s = game.applyMove(s, 0, { type: 'check1' });
  s = game.applyMove(s, 0, { type: 'check2' });
  assert.equal(s.answers[2][0].points.total, 0);
  s = game.applyMove(s, 0, { type: 'next' });
  // songs 4 and 5: time runs out at once
  s = game.applyMove(s, 0, { type: 'timeout' }); s = game.applyMove(s, 0, { type: 'next' });
  s = game.applyMove(s, 0, { type: 'timeout' }); s = game.applyMove(s, 0, { type: 'next' });
  assert.equal(s.phase, 'over');
  assert.equal(game.getTurn(s), null);
  assert.equal(scoreOf(s, 0), 7 + 16);
  assert.equal(scoreOf(s, 1), s.answers[0][1].points.total + 5);
  assert.deepEqual(game.getResult(s), { winner: scoreOf(s, 1) > 23 ? 1 : 0 });
  assert.throws(() => game.applyMove(s, 0, { type: 'buzz', who: 0, heard: 1 }), 'yapılamaz');
});

test('şarkıyı bil: sesi yüklenmeyen şarkı yedekle değişir, iki telefonda herkes kendi adına basar', () => {
  let s = game.setup({ rounds: 5, srcMustafa: true, seed: 7 }, ctx);
  const first = s.songs[0];
  const reserve0 = s.reserve[0];
  s = game.applyMove(s, 0, { type: 'swap', round: 0 });
  assert.deepEqual(s.songs[0], reserve0);
  assert.equal(s.reserve.length, RESERVE - 1);
  assert.notEqual(JSON.stringify(s.songs[0]), JSON.stringify(first));
  assert.throws(() => game.applyMove(s, 0, { type: 'swap', round: 3 }), 'sırası geçti');
  s = game.applyMove(s, 0, { type: 'buzz', who: 0, heard: 1 });
  assert.throws(() => game.applyMove(s, 0, { type: 'swap', round: 0 }), 'değiştirilemez');
  // online: the device's own player buzzes, never the other
  const online = { ...ctx, mode: 'online' };
  let o = game.setup({ rounds: 5, srcMustafa: true, seed: 8 }, online);
  assert.throws(() => game.applyMove(o, 0, { type: 'buzz', who: 1, heard: 1 }, online), 'Başkası adına');
  o = game.applyMove(o, 1, { type: 'buzz', heard: 5 }, online);
  assert.equal(o.current.who, 1);
  assert.throws(() => game.applyMove(o, 0, { type: 'check1', artist: 'x' }, online), 'Sıra sende değil');
  o = game.applyMove(o, 1, { type: 'check1', artist: o.songs[0].a }, online);
  o = game.applyMove(o, 1, { type: 'check2', title: o.songs[0].t }, online);
  assert.equal(o.answers[0][1].artistOk, true);
  assert.equal(o.answers[0][1].songOk, true);
});

test('şarkıyı bil: grup seçimi havuzu, berabere', () => {
  let s = game.setup({ rounds: 5, srcSecim: true, seed: 2 }, ctx);
  assert.equal(s.phase, 'pick');
  assert.equal(s.songs.length, 0);
  assert.throws(() => game.applyMove(s, 0, { type: 'buzz', who: 0, heard: 1 }), 'yapılamaz');
  s = game.applyMove(s, 0, { type: 'pick', artists: ['Tool', 'Katatonia'] }, ctx);
  assert.deepEqual(game.getTurn(s).player, 1);
  s = game.applyMove(s, 1, { type: 'pick', artists: ['Tool'] }, ctx);
  assert.equal(s.phase, 'listen');
  assert.equal(s.songs.length, 5);
  assert.ok(s.songs.every((x) => x.a === 'Tool' || x.a === 'Katatonia'));
  let d = game.setup({ rounds: 5, srcMustafa: true, seed: 9 }, ctx);
  for (let k = 0; k < 5; k++) { d = game.applyMove(d, 0, { type: 'timeout' }); d = game.applyMove(d, 0, { type: 'next' }); }
  assert.deepEqual(game.getResult(d), { draw: true });
});
