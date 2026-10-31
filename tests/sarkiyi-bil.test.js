import { test, assert } from './runner.js';
import game, { pointsFor, speedFactor, scoreOf, ARTIST_POINTS, SONG_POINTS } from '../games/sarkiyi-bil.js';

const fixture = {
  weights: {},
  catalog: ['Katatonia', 'Opeth', 'Tool'],
  tracks: [
    ...Array.from({ length: 10 }, (_, i) => ({ a: 'Katatonia', t: `Kata ${i}`, s: 200 + i, dz: 1 + i, g: 'fav' })),
    ...Array.from({ length: 10 }, (_, i) => ({ a: 'Opeth', t: `Opeth ${i}`, s: 400 + i, dz: 100 + i, g: 'fav' })),
    ...Array.from({ length: 10 }, (_, i) => ({ a: 'Tool', t: `Tool ${i}`, s: 500 + i, dz: 300 + i, g: 'top' })),
    { a: 'Quiet', t: 'Silent song', s: 100, dz: 999, np: 1, g: 'mix' },
  ],
};
const ctx = { songs: fixture, players: ['Ali', 'Ayşe'] };

test('şarkıyı bil: puanlar dinlenen süreyle 2 kattan 1 kata iner, şıklar yarıya, grup ve şarkı ayrı sayılır', () => {
  assert.equal(speedFactor(0, 20), 2);
  assert.equal(speedFactor(10, 20), 1.5);
  assert.equal(speedFactor(20, 20), 1);
  assert.equal(speedFactor(35, 20), 1, 'never below 1×');
  assert.deepEqual(pointsFor({ heard: 0, clipSec: 20, mode: 'typed', artistOk: true, songOk: true }), { artist: ARTIST_POINTS * 2, song: SONG_POINTS * 2, total: 30 });
  assert.deepEqual(pointsFor({ heard: 20, clipSec: 20, mode: 'typed', artistOk: true, songOk: true }), { artist: 5, song: 10, total: 15 });
  assert.deepEqual(pointsFor({ heard: 10, clipSec: 20, mode: 'typed', artistOk: true, songOk: false }), { artist: 8, song: 0, total: 8 });
  assert.deepEqual(pointsFor({ heard: 10, clipSec: 20, mode: 'options', artistOk: true, songOk: true }), { artist: 4, song: 8, total: 12 });
  assert.deepEqual(pointsFor({ heard: 3, clipSec: 20, mode: 'typed', artistOk: false, songOk: true }), { artist: 0, song: 19, total: 19 }, 'the song alone still scores');
});

test('şarkıyı bil: sıra, yazılı cevap, şık yolu, sonuç', () => {
  let s = game.setup({ rounds: 3, clip: 20, favor: 'none', seed: 5 }, ctx);
  assert.equal(s.songs.length, 6, 'three songs each');
  assert.ok(s.songs.every((x) => x.a !== 'Quiet'), 'only songs with a clip');
  assert.deepEqual(game.getTurn(s), { player: 0, private: true });
  assert.throws(() => game.applyMove(s, 1, { type: 'answer', heard: 2 }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'check', artist: 'x', title: 'y' }), 'Biliyorum');
  assert.throws(() => game.applyMove(s, 0, { type: 'next' }), 'Önce bu şarkı');
  // turn 1 (Ali): "I know it" after 4 s, both typed right with a slip
  const song0 = s.songs[0];
  s = game.applyMove(s, 0, { type: 'answer', heard: 4 });
  assert.equal(s.phase, 'answer');
  assert.throws(() => game.applyMove(s, 0, { type: 'answer', heard: 4 }), 'Önce dinle');
  s = game.applyMove(s, 0, { type: 'check', artist: song0.a.toUpperCase(), title: ` ${song0.t.slice(0, -1)}x ` });
  assert.equal(s.phase, 'result');
  assert.ok(s.results[0].artistOk && s.results[0].songOk, 'case and one slip do not matter');
  assert.deepEqual(s.results[0].typed, { a: song0.a.toUpperCase(), t: `${song0.t.slice(0, -1)}x` });
  assert.deepEqual(s.results[0].points, pointsFor({ heard: 4, clipSec: 20, mode: 'typed', artistOk: true, songOk: true }));
  assert.equal(scoreOf(s, 0), 27);
  s = game.applyMove(s, 0, { type: 'next' });
  assert.deepEqual(game.getTurn(s), { player: 1, private: true }, 'then the other player');
  // turn 2 (Ayşe): options, wrong band → nothing, song not asked
  const song1 = s.songs[1];
  s = game.applyMove(s, 1, { type: 'options' });
  assert.equal(s.phase, 'options');
  s = game.applyMove(s, 1, { type: 'choose', artist: song1.a === 'Tool' ? 'Opeth' : 'Tool', heard: 6 });
  assert.equal(s.phase, 'result');
  assert.equal(s.results[1].points.total, 0);
  s = game.applyMove(s, 1, { type: 'next' });
  // turn 3 (Ali): options, band right, song right after 10 s → half points
  const song2 = s.songs[2];
  s = game.applyMove(s, 0, { type: 'options' });
  s = game.applyMove(s, 0, { type: 'choose', artist: song2.a.toUpperCase(), heard: 8 });
  assert.equal(s.phase, 'options2', 'band right (case does not matter): now the song');
  s = game.applyMove(s, 0, { type: 'choose2', title: song2.t, heard: 10 });
  assert.deepEqual(s.results[2].points, { artist: 4, song: 8, total: 12 });
  s = game.applyMove(s, 0, { type: 'next' });
  // turn 4 (Ayşe): band only, song box empty
  const song3 = s.songs[3];
  s = game.applyMove(s, 1, { type: 'answer', heard: 20 });
  s = game.applyMove(s, 1, { type: 'check', artist: song3.a, title: '' });
  assert.deepEqual(s.results[3].points, { artist: 5, song: 0, total: 5 });
  s = game.applyMove(s, 1, { type: 'next' });
  // turn 5 (Ali): passes with empty boxes
  s = game.applyMove(s, 0, { type: 'answer', heard: 20 });
  s = game.applyMove(s, 0, { type: 'check' });
  assert.equal(s.results[4].points.total, 0);
  s = game.applyMove(s, 0, { type: 'next' });
  // turn 6 (Ayşe): wrong band, right song typed → song points only
  const song5 = s.songs[5];
  s = game.applyMove(s, 1, { type: 'answer', heard: 25 });
  s = game.applyMove(s, 1, { type: 'check', artist: 'Bilmemkim', title: song5.t });
  assert.deepEqual(s.results[5].points, { artist: 0, song: 10, total: 10 });
  s = game.applyMove(s, 1, { type: 'next' });
  assert.equal(s.phase, 'over');
  assert.equal(game.getTurn(s), null);
  assert.equal(scoreOf(s, 0), 27 + 12);
  assert.equal(scoreOf(s, 1), 0 + 5 + 10);
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.throws(() => game.applyMove(s, 0, { type: 'answer', heard: 1 }), 'yapılamaz');
});

test('şarkıyı bil: grup seçimi havuzu belirler, berabere mümkün', () => {
  let s = game.setup({ rounds: 3, pool: 'secim', favor: 'none', seed: 2 }, ctx);
  assert.equal(s.phase, 'pick');
  assert.equal(s.songs.length, 0);
  assert.deepEqual(game.getTurn(s).player, 0);
  assert.throws(() => game.applyMove(s, 0, { type: 'answer', heard: 1 }), 'yapılamaz');
  s = game.applyMove(s, 0, { type: 'pick', artists: ['Tool', 'Katatonia'] }, ctx);
  assert.equal(s.phase, 'pick');
  assert.deepEqual(game.getTurn(s).player, 1);
  assert.throws(() => game.applyMove(s, 0, { type: 'pick', artists: [] }, ctx), 'Seçimini yaptın');
  s = game.applyMove(s, 1, { type: 'pick', artists: ['Tool'] }, ctx);
  assert.equal(s.phase, 'listen');
  assert.equal(s.songs.length, 6);
  assert.ok(s.songs.every((x) => x.a === 'Tool' || x.a === 'Katatonia'), 'songs come from the picked bands');
  assert.ok(s.songs.filter((x) => x.a === 'Tool').length >= 3, 'the band both picked comes up more');
  let o = game.setup({ pool: 'ortak', rounds: 3, seed: 3 }, ctx);
  o = game.applyMove(o, 0, { type: 'pick', artists: ['Tool', 'Opeth'] }, ctx);
  o = game.applyMove(o, 1, { type: 'pick', artists: ['Opeth', 'Katatonia'] }, ctx);
  assert.ok(o.songs.every((x) => x.a === 'Opeth'), 'only the common band');
  // a draw
  let d = game.setup({ rounds: 3, seed: 9, favor: 'none' }, ctx);
  for (let k = 0; k < 6; k++) {
    d = game.applyMove(d, k % 2, { type: 'answer', heard: 20 });
    d = game.applyMove(d, k % 2, { type: 'check', artist: d.songs[k].a, title: '' });
    d = game.applyMove(d, k % 2, { type: 'next' });
  }
  assert.deepEqual(game.getResult(d), { draw: true });
});
