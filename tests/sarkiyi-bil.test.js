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
  assert.equal(s.phase, 'listen');
  assert.deepEqual(s.answering, [null, { heard: 3, step: 'band' }]);
  assert.deepEqual(game.getTurn(s), { player: 1, private: false, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'buzz', who: 0, heard: 4 }), 'Şu an basılamaz');
  assert.throws(() => game.applyMove(s, 1, { type: 'buzz', who: 1, heard: 4 }), 'Zaten cevaplıyorsun');
  assert.throws(() => game.applyMove(s, 1, { type: 'check2', title: 'x' }), 'Önce grubu yaz');
  s = game.applyMove(s, 1, { type: 'check1', artist: `${song0.a.slice(0, -1)}x` });
  assert.equal(s.answering[1].step, 'song');
  assert.equal(s.answering[1].artistOk, song0.a.length >= 5, 'a slip is forgiven in a name of five letters or more');
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
  assert.equal(s.answering[0].step, 'options');
  assert.throws(() => game.applyMove(s, 0, { type: 'check2', title: 'x' }), 'Şıklardan');
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
  // the reserve runs out: the silent song is shown and nobody scores it
  let r = game.setup({ rounds: 5, srcMustafa: true, seed: 7 }, ctx);
  for (let k = 0; k < RESERVE; k++) r = game.applyMove(r, 0, { type: 'swap', round: 0 });
  assert.equal(r.reserve.length, 0);
  r = game.applyMove(r, 0, { type: 'swap', round: 0 });
  assert.equal(r.phase, 'reveal');
  assert.deepEqual(r.answers[0].map((x) => [x.mode, x.points.total]), [['nosound', 0], ['nosound', 0]]);
  // online: the device's own player buzzes, never the other
  const online = { ...ctx, mode: 'online' };
  let o = game.setup({ rounds: 5, srcMustafa: true, seed: 8 }, online);
  assert.throws(() => game.applyMove(o, 0, { type: 'buzz', who: 1, heard: 1 }, online), 'Başkası adına');
  o = game.applyMove(o, 1, { type: 'buzz', heard: 5 }, online);
  assert.deepEqual(o.answering, [null, { heard: 5, step: 'band' }]);
  assert.throws(() => game.applyMove(o, 0, { type: 'check1', artist: 'x' }, online), 'Önce düğmene bas');
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

const online = { ...ctx, mode: 'online' };
const remote = { ...online, remote: true };
/** Two phones: each applies its own moves first, then the other's (as js/session.js does online). */
function both(start, mine0, mine1) {
  const run = (own, theirs, ownP) => {
    let st = start;
    for (const m of own) st = game.applyMove(st, ownP, m, online);
    for (const m of theirs) { try { st = game.applyMove(st, 1 - ownP, m, remote); } catch { /* rejected, as Session drops it */ } }
    return st;
  };
  return [run(mine0, mine1, 0), run(mine1, mine0, 1)];
}

test('şarkıyı bil iki telefonda: aynı anda basmak, ikisi de cevaplar, iki telefon aynı yere varır', () => {
  const s = game.setup({ rounds: 5, srcMustafa: true, seed: 11 }, online);
  const song = s.songs[0];
  const key = `${song.a}|${song.t}`;
  const a0 = [{ type: 'buzz', heard: 2, song: key }, { type: 'check1', artist: song.a }, { type: 'check2', title: song.t }];
  const a1 = [{ type: 'buzz', heard: 3, song: key }, { type: 'check1', artist: 'yok' }, { type: 'check2', title: '' }];
  const [h, g] = both(s, a0, a1);
  assert.deepEqual(h, g, 'the same state on both phones');
  assert.equal(h.phase, 'reveal');
  assert.equal(h.answers[0][0].points.total, pointsFor({ heard: 2, clipSec: h.clipSec, mode: 'typed', artistOk: true, songOk: true }).total);
  assert.equal(h.answers[0][1].points.total, 0);
  // only half way through: each phone answering for itself
  const [h2, g2] = both(s, a0.slice(0, 2), a1.slice(0, 1));
  assert.deepEqual(h2, g2);
  assert.equal(h2.answering[0].step, 'song');
  assert.equal(h2.answering[1].step, 'band');
});

test('şarkıyı bil iki telefonda: süre ev sahibinin saatiyle biter; yolda kalan cevap iki telefonda da sayılmaz', () => {
  let s = game.setup({ rounds: 5, srcMustafa: true, seed: 12 }, online);
  const song = s.songs[0];
  const key = `${song.a}|${song.t}`;
  // the guest answered right, but its moves were still on the way when the host's time ran out
  let guest = s;
  for (const m of [{ type: 'buzz', heard: 2, song: key }, { type: 'check1', artist: song.a }, { type: 'check2', title: song.t }]) guest = game.applyMove(guest, 1, m, online);
  assert.equal(guest.answers[0][1].mode, 'typed');
  const timeout = { type: 'timeout', round: 0, had: [false, false] };
  const host = game.applyMove(s, 0, timeout, online);
  guest = game.applyMove(guest, 0, timeout, remote);
  assert.deepEqual(guest, host);
  assert.deepEqual(host.answers[0].map((x) => x.mode), ['timeout', 'timeout']);
  // the guest even reached the reveal on its own (the host's answer had arrived): its late answer is dropped
  let h = game.applyMove(s, 0, { type: 'buzz', heard: 1, song: key }, online);
  h = game.applyMove(h, 0, { type: 'check1', artist: 'x' }, online);
  h = game.applyMove(h, 0, { type: 'check2', title: 'y' }, online);
  let g = h;
  for (const m of [{ type: 'buzz', heard: 2, song: key }, { type: 'check1', artist: song.a }, { type: 'check2', title: song.t }]) g = game.applyMove(g, 1, m, online);
  assert.equal(g.phase, 'reveal');
  const t2 = { type: 'timeout', round: 0, had: [true, false] };
  h = game.applyMove(h, 0, t2, online);
  g = game.applyMove(g, 0, t2, remote);
  assert.deepEqual(g, h);
  assert.equal(h.answers[0][1].mode, 'timeout');
  assert.throws(() => game.applyMove(h, 0, { type: 'timeout', round: 0 }, online), 'Süre işlemiyor', 'a plain timeout cannot end a revealed song');
  s = game.applyMove(h, 0, { type: 'next' }, online);
  assert.throws(() => game.applyMove(s, 0, { type: 'timeout', round: 0, had: [false, false] }, remote), 'süresi değil');
});

test('şarkıyı bil iki telefonda: şarkı değişimi bir basışla çaprazlanırsa da iki telefon aynı şarkıda kalır; iki değişim tek yedek harcar', () => {
  const s = game.setup({ rounds: 5, srcMustafa: true, seed: 13 }, online);
  const key = `${s.songs[0].a}|${s.songs[0].t}`;
  // the host finds the song silent while the guest presses
  const [h, g] = both(s, [{ type: 'swap', round: 0, song: key }], [{ type: 'buzz', heard: 1, song: key }, { type: 'check1', artist: s.songs[0].a }]);
  assert.deepEqual(h, g);
  assert.deepEqual(h.songs[0], s.reserve[0]);
  assert.deepEqual(h.answering, [null, null]);
  assert.deepEqual(h.answers[0], [null, null]);
  // both phones find it silent
  const [h2, g2] = both(s, [{ type: 'swap', round: 0, song: key }], [{ type: 'swap', round: 0, song: key }]);
  assert.deepEqual(h2, g2);
  assert.deepEqual(h2.songs[0], s.reserve[0]);
  assert.equal(h2.reserve.length, RESERVE - 1, 'one reserve song used, not two');
  // a press for the old song after the swap is refused
  assert.throws(() => game.applyMove(h2, 1, { type: 'buzz', heard: 1, song: key }, remote), 'Şarkı değişti');
});
