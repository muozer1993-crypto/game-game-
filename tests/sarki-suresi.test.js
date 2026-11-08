import { test, assert } from './runner.js';
import game, { fmt, fmtDiff, clockFromDigits, parseDigits, pickSongs, roundWinner, scoreOf } from '../games/sarki-suresi.js';

// 20 favourite songs (Deezer id only) + 80 others (Spotify preview) + 5 without any audio
const fixture = {
  weights: { Katatonia: 6 },
  tracks: [
    ...Array.from({ length: 20 }, (_, i) => ({ a: 'Katatonia', t: `Kata ${i}`, s: 200 + i, dz: 1000 + i })),
    ...Array.from({ length: 80 }, (_, i) => ({ a: `Grup ${i}`, t: `Şarkı ${i}`, s: 150 + i, p: `https://p.scdn.co/mp3-preview/${i}` })),
    ...Array.from({ length: 5 }, (_, i) => ({ a: `Sessiz ${i}`, t: `Sessiz ${i}`, s: 300 + i, dz: 5000 + i, np: 1 })),
  ],
};
const ctx = { songs: fixture, players: ['Ali', 'Ayşe'] };

test('şarkı süresi: saat biçimi, mikrodalga tarzı giriş ve fark', () => {
  assert.equal(fmt(257), '4:17');
  assert.equal(fmt(0), '0:00');
  assert.equal(fmt(3599), '59:59');
  assert.equal(fmt(3723), '62:03', 'totals over an hour keep counting minutes');
  assert.equal(clockFromDigits(''), '–:––');
  assert.equal(clockFromDigits('4'), '0:04');
  assert.equal(clockFromDigits('43'), '0:43');
  assert.equal(clockFromDigits('432'), '4:32');
  assert.equal(clockFromDigits('1432'), '14:32');
  assert.deepEqual(parseDigits('432'), { seconds: 272 });
  assert.deepEqual(parseDigits('1005'), { seconds: 605 });
  assert.ok(parseDigits('475').error.includes('59'), 'seconds above 59 are refused');
  assert.ok(parseDigits('').error, 'nothing typed');
  assert.ok(parseDigits('000').error, 'zero length');
  assert.equal(fmtDiff(272, 272), 'tam isabet');
  assert.equal(fmtDiff(300, 272), '+0:28');
  assert.equal(fmtDiff(250, 272), '−0:22');
});

test('şarkı süresi: seçim tohuma göre aynı, tekrarsız, favoriler sık, sessizler zor modda yok', () => {
  const a = pickSongs(fixture, { count: 10, favor: 'high', seed: 5 });
  assert.equal(a.length, 10);
  assert.deepEqual(a, pickSongs(fixture, { count: 10, favor: 'high', seed: 5 }), 'same seed, same songs');
  assert.notEqual(JSON.stringify(a), JSON.stringify(pickSongs(fixture, { count: 10, favor: 'high', seed: 6 })));
  assert.equal(new Set(a.map((s) => `${s.a}|${s.t}`)).size, 10, 'no song twice');
  for (let seed = 1; seed <= 40; seed++) {
    const picked = pickSongs(fixture, { count: 10, favor: 'high', seed });
    const perArtist = {};
    picked.forEach((s) => { perArtist[s.a] = (perArtist[s.a] || 0) + 1; });
    assert.ok(Object.values(perArtist).every((c) => c <= 3), `at most 3 per artist (seed ${seed})`);
    for (let k = 1; k < picked.length; k++) assert.notEqual(picked[k].a, picked[k - 1].a, 'no artist twice in a row');
    for (const s of picked) assert.ok(s.p || s.dz, 'audio info travels with the song');
  }
  const count = (favor) => {
    let fav = 0;
    for (let seed = 1; seed <= 60; seed++) fav += pickSongs(fixture, { count: 10, favor, seed }).filter((s) => s.a === 'Katatonia').length;
    return fav;
  };
  const high = count('high');
  const mid = count('mid');
  const none = count('none');
  assert.ok(high > mid && mid > none, `favourites: high ${high} > mid ${mid} > none ${none}`);
  assert.ok(none > 0, 'favourites still appear with equal weights');
  const hard = pickSongs(fixture, { count: 15, favor: 'none', seed: 9, needAudio: true });
  assert.ok(hard.every((s) => !s.a.startsWith('Sessiz')), 'songs without a preview are skipped in hard mode');
  assert.throws(() => pickSongs({ tracks: [] }, { count: 5 }), 'boş');
  const few = pickSongs({ tracks: [{ a: 'A', t: 'x', s: 100 }, { a: 'A', t: 'y', s: 110 }, { a: 'A', t: 'z', s: 120 }] }, { count: 10, seed: 1 });
  assert.equal(few.length, 3, 'a tiny list gives what it has, same artist allowed when there is nothing else');
});

test('şarkı süresi: sıra, gizli tahminler, açıklama ve sonuç', () => {
  let s = game.setup({ rounds: 5, mode: 'normal', favor: 'none', seed: 3 }, ctx);
  assert.equal(s.songs.length, 5);
  assert.equal(s.mode, 'normal');
  assert.deepEqual(game.getTurn(s), { player: 0, private: true, simultaneous: true }, 'player 0 guesses first in round 1 (one phone); two phones guess at once');
  assert.throws(() => game.applyMove(s, 1, { type: 'guess', round: 0, seconds: 200 }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'guess', round: 1, seconds: 200 }), 'sırası geçti');
  assert.throws(() => game.applyMove(s, 0, { type: 'guess', round: 0, seconds: 0 }), 'Geçersiz süre');
  assert.throws(() => game.applyMove(s, 0, { type: 'guess', round: 0, seconds: 3600 }), 'Geçersiz süre');
  assert.throws(() => game.applyMove(s, 0, { type: 'guess', round: 0, seconds: 200.5 }), 'Geçersiz süre');
  assert.throws(() => game.applyMove(s, 0, { type: 'next' }), 'Önce ikiniz de');
  const real = s.songs[0].s;
  s = game.applyMove(s, 0, { type: 'guess', round: 0, seconds: real + 10 });
  assert.equal(s.phase, 'guess');
  assert.deepEqual(game.getTurn(s), { player: 1, private: true, simultaneous: true }, 'then player 1, still hidden');
  assert.equal(roundWinner(s, 0), null, 'round open');
  s = game.applyMove(s, 1, { type: 'guess', round: 0, seconds: real - 3 });
  assert.equal(s.phase, 'reveal');
  assert.deepEqual(game.getTurn(s), { player: 1, private: false }, 'the second guesser holds the phone on the reveal');
  assert.equal(roundWinner(s, 0), 1, 'closer guess takes the round');
  assert.deepEqual(scoreOf(s, 1), { points: 1, error: 3 });
  assert.deepEqual(scoreOf(s, 0), { points: 0, error: 10 });
  assert.equal(game.getResult(s), null);
  s = game.applyMove(s, 0, { type: 'next' }); // either player may continue
  assert.equal(s.index, 1);
  assert.equal(s.phase, 'guess');
  assert.deepEqual(game.getTurn(s), { player: 1, private: true, simultaneous: true }, 'the first guesser alternates');
  // round 2: a tie gives nobody a point
  const r1 = s.songs[1].s;
  s = game.applyMove(s, 1, { type: 'guess', round: 1, seconds: r1 + 5 });
  s = game.applyMove(s, 0, { type: 'guess', round: 1, seconds: r1 - 5 });
  assert.equal(roundWinner(s, 1), -1);
  s = game.applyMove(s, 1, { type: 'next' });
  // rounds 3-5: player 0 takes two, player 1 one → 2-2, player 0 closer overall
  const play = (state, k, g0, g1) => {
    const f = k % 2;
    const first = f === 0 ? g0 : g1;
    const second = f === 0 ? g1 : g0;
    let t = game.applyMove(state, f, { type: 'guess', round: k, seconds: state.songs[k].s + first });
    t = game.applyMove(t, 1 - f, { type: 'guess', round: k, seconds: state.songs[k].s + second });
    return game.applyMove(t, f, { type: 'next' });
  };
  s = play(s, 2, 1, 20);
  s = play(s, 3, 30, 2);
  assert.equal(s.phase, 'guess');
  s = play(s, 4, 0, 7); // exact hit
  assert.equal(s.phase, 'over');
  assert.equal(game.getTurn(s), null);
  assert.deepEqual(scoreOf(s, 0), { points: 2, error: 10 + 5 + 1 + 30 + 0 });
  assert.deepEqual(scoreOf(s, 1), { points: 2, error: 3 + 5 + 20 + 2 + 7 });
  assert.deepEqual(game.getResult(s), { winner: 1 }, '2-2 on rounds: the smaller total error (37 < 46) wins');
  assert.throws(() => game.applyMove(s, 0, { type: 'guess', round: 4, seconds: 100 }), 'tahmin sırası değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'next' }), 'Önce ikiniz de');
});

test('şarkı süresi: puan farkı kazandırır, her şey eşitse berabere; zor mod sessiz şarkı seçmez', () => {
  let s = game.setup({ rounds: 5, favor: 'none', seed: 11 }, ctx);
  const run = (state, k, d0, d1) => {
    const f = k % 2;
    let t = game.applyMove(state, f, { type: 'guess', round: k, seconds: state.songs[k].s + (f === 0 ? d0 : d1) });
    t = game.applyMove(t, 1 - f, { type: 'guess', round: k, seconds: state.songs[k].s + (f === 0 ? d1 : d0) });
    return game.applyMove(t, 1 - f, { type: 'next' });
  };
  s = run(s, 0, 1, 9); s = run(s, 1, 1, 9); s = run(s, 2, 1, 9); s = run(s, 3, 9, 1); s = run(s, 4, 9, 1);
  assert.deepEqual(game.getResult(s), { winner: 0 }, '3-2 on rounds');
  let d = game.setup({ rounds: 5, favor: 'none', seed: 12 }, ctx);
  d = run(d, 0, 2, 4); d = run(d, 1, 4, 2); d = run(d, 2, 3, 3); d = run(d, 3, 2, 4); d = run(d, 4, 4, 2);
  assert.deepEqual(game.getResult(d), { draw: true }, 'same rounds, same total error');
  const h = game.setup({ rounds: 15, mode: 'hard', favor: 'none', seed: 2 }, ctx);
  assert.equal(h.mode, 'hard');
  assert.equal(h.clipSec, 20);
  assert.ok(h.songs.every((x) => x.p || x.dz), 'every hard-mode song can play a clip');
  assert.ok(h.songs.every((x) => !x.a.startsWith('Sessiz')));
  assert.throws(() => game.setup({ rounds: 5 }, { songs: { tracks: [] } }), 'boş');
});

test('şarkı süresi: grup seçimi havuzu, seçim bitince şarkılar çekilir', () => {
  const data = {
    weights: {}, catalog: ['Katatonia', 'Tool', 'Zed'],
    tracks: [
      ...Array.from({ length: 16 }, (_, i) => ({ a: 'Katatonia', t: `K${i}`, s: 200 + i, dz: 1 + i, g: 'fav' })),
      ...Array.from({ length: 8 }, (_, i) => ({ a: 'Tool', t: `T${i}`, s: 300 + i, dz: 50 + i, g: 'top' })),
      ...Array.from({ length: 8 }, (_, i) => ({ a: 'Zed', t: `Z${i}`, s: 100 + i, dz: 90 + i, g: 'top' })),
    ],
  };
  const c = { songs: data };
  let s = game.setup({ rounds: 5, srcSecim: true, seed: 3 }, c);
  assert.equal(s.phase, 'pick');
  assert.deepEqual(game.getTurn(s).player, 0);
  assert.throws(() => game.applyMove(s, 0, { type: 'guess', round: 0, seconds: 100 }, c), 'tahmin sırası değil');
  s = game.applyMove(s, 0, { type: 'pick', artists: ['Tool'] }, c);
  assert.deepEqual(game.getTurn(s).player, 1);
  s = game.applyMove(s, 1, { type: 'pick', artists: ['Zed'] }, c);
  assert.equal(s.phase, 'guess');
  assert.equal(s.songs.length, 5);
  assert.ok(s.songs.every((x) => x.a === 'Tool' || x.a === 'Zed'));
  assert.deepEqual(game.getTurn(s), { player: 0, private: true, simultaneous: true });
  const plain = game.setup({ rounds: 5, srcMustafa: true, seed: 3 }, c);
  assert.ok(plain.songs.every((x) => x.a === 'Katatonia'), 'the personal list leaves the broad catalog out');
  assert.equal(game.setup({ rounds: 5, seed: 3 }, c).songs.length, 5, 'no source ticked: the first list');
  // hard mode draws a reserve and swaps a song whose sound will not load
  let h = game.setup({ rounds: 5, mode: 'hard', srcMustafa: true, seed: 4 }, c);
  assert.equal(h.reserve.length, 6);
  const first = h.songs[0];
  const reserve0 = h.reserve[0];
  h = game.applyMove(h, 0, { type: 'swap', round: 0 }, c);
  assert.deepEqual(h.songs[0], reserve0);
  assert.equal(h.reserve.length, 5);
  assert.notEqual(JSON.stringify(h.songs[0]), JSON.stringify(first));
  assert.throws(() => game.applyMove(h, 0, { type: 'swap', round: 1 }, c), 'sırası geçti');
  h = game.applyMove(h, 0, { type: 'guess', round: 0, seconds: 100 }, c);
  assert.throws(() => game.applyMove(h, 0, { type: 'swap', round: 0 }, c), 'Tahmin verildi');
  assert.equal(game.setup({ rounds: 5, mode: 'normal', seed: 4 }, c).reserve.length, 0, 'no reserve without audio');
  assert.equal(game.setup({ rounds: 5, clip: 30, seed: 1 }, c).clipSec, 30);
  assert.equal(game.setup({ rounds: 5, seed: 1 }, c).clipSec, 20, 'default clip length');
});

// ---- two phones: both guess at the same time
import { songKeyOf } from '../games/sarki-suresi.js';
import { Session } from '../js/session.js';

test('şarkı süresi (iki telefon): ikisi aynı anda tahmin eder, sıra beklenmez', () => {
  const on = { ...ctx, mode: 'online' };
  let s = game.setup({ rounds: 5, mode: 'normal', favor: 'none', seed: 3 }, on);
  const key = songKeyOf(s.songs[0]);
  s = game.applyMove(s, 1, { type: 'guess', round: 0, seconds: 200, song: key }, on); // the "second" guesser first
  assert.equal(s.phase, 'guess');
  assert.throws(() => game.applyMove(s, 1, { type: 'guess', round: 0, seconds: 201, song: key }, on), 'Tahminini verdin');
  assert.throws(() => game.applyMove(s, 0, { type: 'guess', round: 0, seconds: 201, song: 'Başka|Şarkı' }, on), 'Şarkı değişti');
  s = game.applyMove(s, 0, { type: 'guess', round: 0, seconds: 190, song: key }, on);
  assert.equal(s.phase, 'reveal');
  assert.deepEqual(s.guesses[0], [190, 200]);
  // one phone keeps the order
  const local = game.setup({ rounds: 5, mode: 'normal', favor: 'none', seed: 3 }, ctx);
  assert.throws(() => game.applyMove(local, 1, { type: 'guess', round: 0, seconds: 200 }, ctx), 'Sıra sende değil');
});

test('şarkı süresi (iki telefon): sessiz şarkının değişimi, onu görmeden verilen tahmini geçersiz kılar; ikinci değişim düşer', () => {
  const data = { weights: {}, tracks: Array.from({ length: 30 }, (_, i) => ({ a: `G${i}`, t: `Ş${i}`, s: 150 + i, dz: 100 + i })) };
  const on = { songs: data, mode: 'online' };
  let s = game.setup({ rounds: 5, mode: 'hard', seed: 8 }, on);
  const silent = songKeyOf(s.songs[0]);
  const withGuess = game.applyMove(s, 1, { type: 'guess', round: 0, seconds: 222, song: silent }, on);
  const swapped = game.applyMove(withGuess, 0, { type: 'swap', round: 0, song: silent }, on);
  assert.notEqual(songKeyOf(swapped.songs[0]), silent);
  assert.deepEqual(swapped.guesses[0], [null, null], 'the guess was for the silent song');
  assert.throws(() => game.applyMove(swapped, 1, { type: 'swap', round: 0, song: silent }, on), 'zaten değişti');
  assert.throws(() => game.applyMove(swapped, 1, { type: 'guess', round: 0, seconds: 222, song: silent }, on), 'Şarkı değişti');
});

/** Two online sessions of the game, back to back, with an in-memory ordered link. */
function phones(options, data) {
  const inbox = [[], []];
  const sessions = [0, 1].map((self) => new Session({
    game: { ...game, render: () => null }, options, players: ['Ali', 'Ayşe'], mode: 'online', self,
    container: { style: {}, classList: { add() {}, remove() {} }, firstChild: null, append() {}, removeChild() {} },
    transport: { send: (msg) => inbox[1 - self].push(JSON.parse(JSON.stringify(msg))) },
    ctx: { songs: data },
  }));
  const deliver = () => {
    for (let moved = true; moved;) {
      moved = false;
      for (const p of [0, 1]) while (inbox[p].length) { const m = inbox[p].shift(); if (m.t === 'move') sessions[p].receive(m); else sessions[p].receiveAsk(m); moved = true; }
    }
  };
  const s0 = game.setup(options, { songs: data, mode: 'online' });
  sessions[0].start(s0);
  sessions[1].start(JSON.parse(JSON.stringify(s0)));
  return { sessions, deliver, inbox };
}

test('şarkı süresi (iki telefon): eşzamanlı seçim, tahmin ve çapraz değişimde iki telefon aynı durumda kalır', () => {
  const data = {
    weights: {}, catalog: ['A', 'B'],
    tracks: [
      ...Array.from({ length: 12 }, (_, i) => ({ a: 'A', t: `a${i}`, s: 200 + i, dz: 10 + i, g: 'top' })),
      ...Array.from({ length: 12 }, (_, i) => ({ a: 'B', t: `b${i}`, s: 300 + i, dz: 40 + i, g: 'top' })),
    ],
  };
  const { sessions, deliver } = phones({ rounds: 5, mode: 'hard', srcSecim: true, seed: 6 }, data);
  // both pick at the same time; the songs are drawn the same way whichever list arrives first
  sessions[0].dispatch(0, { type: 'pick', artists: ['A'] });
  sessions[1].dispatch(1, { type: 'pick', artists: ['B'] });
  deliver();
  assert.equal(sessions[0].state.phase, 'guess');
  assert.deepEqual(sessions[0].state.songs, sessions[1].state.songs);
  // round 1: both guess at once
  const k0 = songKeyOf(sessions[0].state.songs[0]);
  sessions[0].dispatch(0, { type: 'guess', round: 0, seconds: 100, song: k0 });
  sessions[1].dispatch(1, { type: 'guess', round: 0, seconds: 120, song: k0 });
  deliver();
  assert.equal(sessions[0].state.phase, 'reveal');
  assert.deepEqual(sessions[0].state.guesses[0], sessions[1].state.guesses[0]);
  // the guest asks, the host moves on
  sessions[1].dispatch(1, { type: 'next' });
  assert.equal(sessions[1].state.phase, 'reveal', 'the guest only asks');
  deliver();
  assert.ok(sessions[0].ask.peerAsked);
  sessions[0].dispatch(0, { type: 'next' });
  deliver();
  assert.equal(sessions[1].state.index, 1);
  // round 2: the host finds the song silent and swaps it while the guest's guess is on its way
  const k1 = songKeyOf(sessions[0].state.songs[1]);
  sessions[1].dispatch(1, { type: 'guess', round: 1, seconds: 333, song: k1 });
  sessions[0].dispatch(0, { type: 'swap', round: 1, song: k1 });
  sessions[1].dispatch(1, { type: 'swap', round: 1, song: k1 }); // the guest's own check also failed (it had guessed, so its UI would not send this; the game still keeps the phones equal)
  deliver();
  assert.equal(JSON.stringify(sessions[0].state), JSON.stringify(sessions[1].state), 'both phones agree');
  assert.notEqual(songKeyOf(sessions[0].state.songs[1]), k1);
  assert.deepEqual(sessions[0].state.guesses[1], [null, null], 'the guess for the silent song is void on both phones');
});
