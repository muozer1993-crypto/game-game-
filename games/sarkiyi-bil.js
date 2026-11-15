// Şarkıyı Bil — the same clip plays for both players; whoever knows it hits their own button
// first, takes the phone and types the band, then the song (spelling slips forgiven; four options
// can be asked for the song at half its points). The less of the clip was heard at the buzz, the
// more points: band 5, song 10, up to 2× for an instant answer. Both players answer every song; a
// round has a time limit that only runs while the clip screen is up. Songs whose sound cannot be
// loaded are swapped for a reserve song before they show.
// Each player has their own answer slot (answering[p]), so on two phones both may press at the same
// moment and every answer move still commutes; buzz and swap name the song they are about, and only
// the host's clock ends a round (its timeout says whose answers it had).
import { el, render as draw } from '../js/ui/dom.js';
import { nextButton } from '../js/ui/next.js';
import { createTimer } from '../js/ui/timer.js';
import { createClipPlayer, clipReady } from '../js/ui/clip.js';
import { keepArtistPick } from '../js/ui/artist-pick.js';
import { pickSongs, mixPool, topUp, pickGroups, songOptions, normKey, answerMatches, artistMatches, titleMatches, sourceSettings, sourcesFrom, needsPick, silentArtists } from '../js/lib/songs.js';

export const ARTIST_POINTS = 5;
export const SONG_POINTS = 10;
export const RESERVE = 6; // extra songs drawn, swapped in when a song's sound will not load
const ROUND_OPTIONS = [5, 8, 12];
const CLIP_OPTIONS = [15, 20, 30];
const LIMIT_OPTIONS = [60, 90, 120, 180];

export const meta = {
  group: 'tanisma',
  name: 'Şarkıyı Bil',
  icon: '🎧',
  description: 'Aynı şarkı ikinize çalar: bilen düğmesine basar, grubu ve şarkıyı yazar. Az dinleyen çok kazanır.',
  rules: [
    `Her şarkı ikinize birden çalar. Bilen kendi "Tahmin et" düğmesine basar: müzik durur, telefonu alır, önce grubu, sonra şarkının adını yazar; ardından öbürü de dinleyip kendi cevabını verir. Grup ${ARTIST_POINTS}, şarkı ${SONG_POINTS} puan; ikisi ayrı ayrı sayılır.`,
    'Puanlar düğmeye basıldığı andaki dinlenen süreye göre katlanır: hiç dinlemeden 2 katı, klibin tamamı 1 katı (arası orantılı). Tekrar dinlemek de süreye sayılır.',
    'Şarkı adında "Şıkları göster" dersen dört ad arasından seçersin; şarkı puanı yarıya iner (grup puanı değişmez). Küçük yazım hataları, fazla kelimeler ve ş/s, ı/i farkları sorun olmaz.',
    'Her şarkının süre sınırı vardır (ayarlardan) ve yalnız dinleme ekranındayken işler; biri tahmin ederken durur. Süre dolunca cevap vermeyen o şarkıdan puan alamaz. Oyun sonunda toplam puanı çok olan kazanır.',
    'Şarkı havuzu: işaretlediğin kaynaklar eşit pay alır (Mustafa\'nın listesi, Beyza\'nın listeleri, ortak liste, Türkçe bilinenler, oyun başında seçilen gruplar…). Sesi olmayan şarkı çıkmaz.',
  ].join('\n'),
  data: ['songs'],
  settings: [
    { key: 'rounds', label: 'Şarkı sayısı', type: 'select', default: 8, options: ROUND_OPTIONS.map((n) => ({ value: n, label: String(n) })) },
    { key: 'clip', label: 'Klip süresi', type: 'select', default: 20, options: CLIP_OPTIONS.map((n) => ({ value: n, label: `${n} saniye` })) },
    { key: 'limit', label: 'Şarkı başına süre sınırı', type: 'select', default: 120, options: LIMIT_OPTIONS.map((n) => ({ value: n, label: n >= 60 ? `${Math.floor(n / 60)} dakika${n % 60 ? ` ${n % 60} sn` : ''}` : `${n} sn` })) },
    ...sourceSettings(),
  ],
};

function fail(msg) {
  throw new Error(msg);
}

/** Speed factor: 2× for an instant answer, falling to 1× once the whole clip was heard. */
export function speedFactor(heard, clipSec) {
  const h = Math.max(0, Number(heard) || 0);
  return 1 + Math.max(0, clipSec - h) / clipSec;
}

/** Points for an answer. The band is always typed; mode 'options' means the song was picked from four names (half its points). */
export function pointsFor({ heard, clipSec, mode, artistOk, songOk }) {
  const f = speedFactor(heard, clipSec);
  const artist = artistOk ? Math.round(ARTIST_POINTS * f) : 0;
  const song = songOk ? Math.round(SONG_POINTS * f * (mode === 'options' ? 0.5 : 1)) : 0;
  return { artist, song, total: artist + song };
}

function drawSongs(state, data) {
  const pool = mixPool(data, { sources: state.sources, favor: state.favor, picks: state.picks, pickMode: state.pickMode, needAudio: true });
  const all = topUp(pickSongs(pool, { count: state.count + RESERVE, favor: 'high', seed: state.seed, needAudio: true }), data, state, state.count + RESERVE, true);
  return { songs: all.slice(0, state.count), reserve: all.slice(state.count) };
}

// typed answers: with the song list at hand, a name closer to another band or another song of the band is not taken
const bandOk = (ctx, song, typed) => (ctx.songs ? artistMatches(ctx.songs, song, typed) : answerMatches(typed, song.a));
const titleOk = (ctx, song, typed) => (ctx.songs ? titleMatches(ctx.songs, song, typed) : answerMatches(typed, song.t));

export function setup(options = {}, ctx = {}) {
  const count = ROUND_OPTIONS.includes(Number(options.rounds)) ? Number(options.rounds) : 8;
  const clipSec = CLIP_OPTIONS.includes(Number(options.clip)) ? Number(options.clip) : 20;
  const limitSec = LIMIT_OPTIONS.includes(Number(options.limit)) ? Number(options.limit) : 120;
  const sources = sourcesFrom(options);
  const state = {
    count, clipSec, limitSec, sources,
    pickMode: options.pickMode === 'ortak' ? 'ortak' : 'birlesim',
    favor: ['high', 'mid', 'none'].includes(options.favor) ? options.favor : 'high',
    seed: Number(options.seed) || 1,
    picks: [null, null],
    songs: [],          // songs[round]
    reserve: [],        // swapped in when a song's sound will not load
    answers: [],        // answers[round][player] = null | { mode, heard, typed?, artistOk, songOk, points }
    index: 0,
    answering: [null, null], // a player answering now: { heard, step: 'band' | 'song' | 'options', typedArtist?, artistOk? }
    phase: needsPick(sources) ? 'pick' : 'listen', // pick | listen | reveal | over
  };
  if (state.phase === 'listen') Object.assign(state, drawSongs(state, ctx.songs), { answers: [] });
  if (state.songs.length) state.answers = state.songs.map(() => [null, null]);
  return state;
}

export function scoreOf(state, p) {
  return state.answers.reduce((sum, round) => sum + (round && round[p] ? round[p].points.total : 0), 0);
}

const heardOf = (move) => {
  const h = Number(move.heard);
  return Number.isFinite(h) && h >= 0 ? Math.round(h * 10) / 10 : 0;
};
const bothIn = (round) => round[0] != null && round[1] != null;
export const songKeyOf = (song) => (song ? `${song.a}|${song.t}` : '');
const blank = (mode) => ({ mode, heard: 0, artistOk: false, songOk: false, points: { artist: 0, song: 0, total: 0 } });

export function applyMove(state, player, move, ctx = {}) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (move.type === 'pick') {
    if (state.phase !== 'pick') fail('Grup seçimi bitti');
    if (state.picks[player] != null) fail('Seçimini yaptın');
    const picks = state.picks.slice();
    picks[player] = Array.isArray(move.artists) ? move.artists.filter((a) => typeof a === 'string').slice(0, 300) : [];
    const next = { ...state, picks };
    if (picks[0] != null && picks[1] != null) {
      Object.assign(next, drawSongs(next, ctx.songs));
      next.answers = next.songs.map(() => [null, null]);
      next.phase = 'listen';
    }
    return next;
  }
  if (state.phase === 'pick' || state.phase === 'over') fail('Şu an bu hamle yapılamaz');
  const online = ctx.mode === 'online';
  const i = state.index;
  const song = state.songs[i];
  const round = state.answers[i].slice();
  const answering = state.answering.slice();
  // whose answer a move continues: online the sender's own, on one phone the one answering now
  const slotOf = () => {
    const me = online ? player : answering.findIndex(Boolean);
    if (me < 0 || !answering[me]) fail('Önce düğmene bas');
    return me;
  };
  const finish = (me, mode, songOk, typedTitle = null) => {
    const { heard, typedArtist, artistOk } = answering[me];
    const points = pointsFor({ heard, clipSec: state.clipSec, mode, artistOk, songOk });
    round[me] = { mode, heard, artistOk: !!artistOk, songOk: !!songOk, points, typed: { a: typedArtist, t: typedTitle == null ? '' : typedTitle } };
    answering[me] = null;
    const answers = state.answers.slice();
    answers[i] = round;
    return { ...state, answers, answering, phase: bothIn(round) ? 'reveal' : 'listen' };
  };
  switch (move.type) {
    case 'buzz': { // "Tahmin et": on one phone the button says who, online each device buzzes for itself
      if (state.phase !== 'listen') fail('Şu an basılamaz');
      const who = online ? player : (move.who === 1 ? 1 : 0);
      if (online && move.who != null && move.who !== player) fail('Başkası adına basılamaz');
      if (move.song != null && move.song !== songKeyOf(song)) fail('Şarkı değişti; yeni şarkıyı dinle');
      if (round[who] != null) fail('Bu şarkıya cevap verdin');
      if (answering[who]) fail('Zaten cevaplıyorsun');
      if (!online && answering[1 - who]) fail('Şu an basılamaz'); // one phone: one answer at a time
      answering[who] = { heard: heardOf(move), step: 'band' };
      return { ...state, answering };
    }
    case 'check1': { // the band, typed
      if (state.phase !== 'listen') fail('Önce düğmene bas');
      const me = slotOf();
      if (answering[me].step !== 'band') fail('Grubu yazdın');
      const typedArtist = String(move.artist || '').trim().slice(0, 80);
      answering[me] = { ...answering[me], typedArtist, artistOk: bandOk(ctx, song, typedArtist), step: 'song' };
      return { ...state, answering };
    }
    case 'check2': { // the song, typed
      if (state.phase !== 'listen') fail('Önce düğmene bas');
      const me = slotOf();
      if (answering[me].step !== 'song') fail(answering[me].step === 'band' ? 'Önce grubu yaz' : 'Şıklardan birini seç');
      const typedTitle = String(move.title || '').trim().slice(0, 120);
      return finish(me, 'typed', titleOk(ctx, song, typedTitle), typedTitle);
    }
    case 'options': { // four names for the song instead of typing it: half the song points
      if (state.phase !== 'listen') fail('Önce düğmene bas');
      const me = slotOf();
      if (answering[me].step !== 'song') fail('Önce grubu yaz');
      answering[me] = { ...answering[me], step: 'options' };
      return { ...state, answering };
    }
    case 'choose2': {
      if (state.phase !== 'listen') fail('Önce düğmene bas');
      const me = slotOf();
      if (answering[me].step !== 'options') fail('Şarkı şıkları açık değil');
      return finish(me, 'options', normKey(move.title) === normKey(song.t), String(move.title || ''));
    }
    case 'timeout': { // the round's time is up: whoever has not answered gets nothing
      // online the host's clock decides and says whose answers it had: an answer still on its way
      // when the time ran out counts on neither phone (the guest may even have reached the reveal)
      const had = Array.isArray(move.had) ? move.had.map(Boolean) : null;
      if (state.phase !== 'listen' && !(had && state.phase === 'reveal')) fail('Süre işlemiyor');
      // a phone's clock that ran out on the previous song must not end the next one
      if (move.round != null && Number(move.round) !== i) fail('Bu şarkının süresi değil');
      for (const p of [0, 1]) if (round[p] == null || (had && !had[p])) round[p] = blank('timeout');
      const answers = state.answers.slice();
      answers[i] = round;
      return { ...state, answers, answering: [null, null], phase: 'reveal' };
    }
    case 'swap': { // this song's sound will not load: the next reserve song takes its place
      if (state.phase !== 'listen') fail('Şarkı değiştirilemez');
      if (Number(move.round) !== i) fail('Bu şarkının sırası geçti');
      if (move.song != null && move.song !== songKeyOf(song)) fail('Bu şarkı zaten değişti'); // both phones found it silent
      // the other phone swapped before our press reached it: the press was for a song it never played,
      // so it is dropped here too (that phone rejects it, the song key no longer matches)
      const crossed = online && ctx.remote;
      if (!crossed && (round[0] != null || round[1] != null || answering.some(Boolean))) fail('Cevap verildi, şarkı değiştirilemez');
      const answers = state.answers.slice();
      if (!state.reserve.length) { // nothing left to swap in: the song is shown and nobody scores
        answers[i] = [blank('nosound'), blank('nosound')];
        return { ...state, answers, answering: [null, null], phase: 'reveal' };
      }
      const songs = state.songs.slice();
      const reserve = state.reserve.slice();
      songs[i] = reserve.shift();
      answers[i] = [null, null];
      return { ...state, songs, reserve, answers, answering: [null, null] };
    }
    case 'next': {
      if (state.phase !== 'reveal') fail('Önce bu şarkı bitsin');
      const index = i + 1;
      if (index >= state.songs.length) return { ...state, phase: 'over' };
      return { ...state, index, answering: [null, null], phase: 'listen' };
    }
    default:
      return fail('Geçersiz hamle');
  }
}

export function getTurn(state) {
  // one phone takes the band lists in turn, two phones choose at the same time
  if (state.phase === 'pick') return { player: state.picks[0] == null ? 0 : 1, private: false, simultaneous: true, note: 'Önce dinlediğin grupları seçeceksin.' };
  if (state.phase === 'over') return null;
  // both players sit at the same screen; the answering player is only shown their boxes behind a cover
  const who = state.answering ? state.answering.findIndex(Boolean) : -1;
  return { player: who < 0 ? 0 : who, private: false, simultaneous: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const a = scoreOf(state, 0);
  const b = scoreOf(state, 1);
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
// per round, on this device: listened seconds and the clip's position, the time left (it only runs
// on the clip screen), the privacy cover, and the newest state drawn (a late sound check reads it)
const roundMem = new WeakMap(); // container -> { key, heard, pos, leftMs, runningSince, covered, swapping, state }
const songKey = (state) => `${state.index}:${songKeyOf(state.songs[state.index])}`;
const blankPoints = (r) => r.mode === 'timeout' || r.mode === 'nosound';
const blankLabel = (r) => (r.mode === 'nosound' ? 'ses yüklenemedi' : 'süre doldu');

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';

  if (state.phase === 'pick') {
    if (state.picks[viewer] != null) { // two phones: this list is in, the other phone is still choosing
      draw(container, el('p', { class: 'hint' }, `Seçimin alındı. ${players[1 - viewer]} dinlediği grupları seçiyor…`), el('div', { class: 'spinner', 'aria-hidden': 'true' }));
      return null;
    }
    keepArtistPick(container, `${state.seed}:${viewer}`, {
      groups: pickGroups(ctx.songs),
      playerName: players[viewer],
      otherPicks: state.picks[1 - viewer],
      pickMode: state.pickMode,
      otherSources: Object.values(state.sources || {}).filter(Boolean).length - 1,
      silent: silentArtists(ctx.songs), // every song here needs its clip
      onDone: (artists) => sendMove({ type: 'pick', artists }),
    });
    return null;
  }

  const i = state.index;
  const n = state.songs.length;
  const song = state.songs[i];
  // the open song's answers stay hidden until its reveal: the score line counts finished songs only
  const open = state.phase === 'listen' ? state.answers[i] : null;
  const scores = [0, 1].map((p) => scoreOf(state, p) - (open && open[p] ? open[p].points.total : 0));
  const status = (extra) => el('div', { class: 'status-line' },
    el('div', {}, el('strong', {}, `${players[0]} ${scores[0]} – ${scores[1]} ${players[1]}`)),
    el('div', { class: 'muted' }, extra),
  );

  if (state.phase === 'over') {
    const rows = state.songs.map((s, k) => {
      const cell = (p) => {
        const r = state.answers[k][p];
        const what = !r ? '—' : blankPoints(r) ? blankLabel(r) : r.artistOk && r.songOk ? 'grup + şarkı' : r.artistOk ? 'grup' : r.songOk ? 'şarkı' : 'bilemedi';
        return el('span', {}, `${players[p]}: ${what}${r && r.mode === 'options' ? ' (şıklarla)' : ''} `, el('span', { class: `badge ${r && r.points.total ? 'match' : 'miss'}` }, `+${r ? r.points.total : 0}`));
      };
      return el('div', { class: 'compare-item card' }, el('div', { class: 'q' }, `${k + 1}. ${s.a} — ${s.t}`), el('div', { class: 'ans' }, cell(0), ' · ', cell(1)));
    });
    draw(container, el('div', { class: 'status-line' }, el('strong', {}, `${players[0]} ${scores[0]} – ${scores[1]} ${players[1]}`)), el('div', { class: 'compare-list' }, rows));
    return null;
  }

  // ---- the round's clock, heard time and cover state live on this device
  let mem = roundMem.get(container);
  const key = songKey(state);
  if (!mem || mem.key !== key) { mem = { key, heard: 0, pos: 0, leftMs: state.limitSec * 1000, runningSince: null, covered: true, swapping: false }; roundMem.set(container, mem); }
  mem.state = state;
  const answering = state.answering || [null, null];
  const busy = answering.findIndex(Boolean); // someone is answering: the clock stops
  const timerBox = el('div');
  let timer = null;
  const total = state.limitSec * 1000;
  if (state.phase === 'listen' && busy < 0) { // the clock runs only here; it pauses while someone answers
    if (!mem.runningSince) mem.runningSince = Date.now();
    // two phones: the host's clock ends the round, the guest's is for show (it started a moment later)
    const onExpire = !online ? () => sendMove({ type: 'timeout', round: i })
      : ctx.isHost ? () => sendMove({ type: 'timeout', round: i, had: state.answers[i].map((a) => a != null) }) : undefined;
    timer = createTimer(timerBox, { deadline: mem.runningSince + mem.leftMs, total, onExpire });
  } else if (state.phase !== 'reveal') {
    if (mem.runningSince) { mem.leftMs = Math.max(0, mem.leftMs - (Date.now() - mem.runningSince)); mem.runningSince = null; }
    timer = createTimer(timerBox, { deadline: 0, total, paused: true, remaining: mem.leftMs });
  }
  const stopTimer = () => { if (timer) timer.stop(); };

  if (state.phase === 'reveal') {
    const round = state.answers[i];
    const last = i + 1 >= n;
    const mark = (ok) => el('span', { class: `badge ${ok ? 'match' : 'miss'}` }, ok ? '✓' : '✗');
    const rowFor = (p) => {
      const r = round[p];
      const head = el('div', { class: 'sb-row-head' }, el('strong', {}, players[p]), el('span', { class: `badge ${r.points.total ? 'match' : 'miss'}` }, `+${r.points.total}`));
      if (blankPoints(r)) return el('div', { class: 'ss-guess sb-row' }, head, el('span', { class: 'muted' }, blankLabel(r)));
      return el('div', { class: 'ss-guess sb-row' }, head,
        el('span', { class: 'sb-typed' }, el('span', {}, `Grup: ${r.typed && r.typed.a ? r.typed.a : '—'}`), mark(r.artistOk)),
        el('span', { class: 'sb-typed' }, el('span', {}, `Şarkı: ${r.typed && r.typed.t ? r.typed.t : '—'}${r.mode === 'options' ? ' (şıklarla)' : ''}`), mark(r.songOk)),
        el('span', { class: 'muted' }, `${Math.round(r.heard)} sn dinleyip bastı`));
    };
    draw(container,
      status(`Şarkı ${i + 1}/${n}`),
      el('div', { class: 'card ss-card' },
        el('div', { class: 'ss-artist' }, song.a),
        el('div', { class: 'ss-title' }, song.t),
        el('div', { class: 'ss-guesses' }, rowFor(0), rowFor(1)),
      ),
      nextButton(ctx, sendMove, last ? 'Sonucu gör' : 'Sonraki şarkı', { style: null }),
    );
    return null;
  }

  // ---- whose screen is this: one phone shows the answering player's, two phones each their own
  const who = online ? (answering[viewer] ? viewer : -1) : busy;
  if (who < 0) {
    if (online && busy >= 0) { // the other player is answering; the music stops here too
      draw(container, status(`Şarkı ${i + 1}/${n}`), timerBox, el('p', { class: 'hint' }, `${players[busy]} cevaplıyor…`), el('div', { class: 'spinner', 'aria-hidden': 'true' }));
      return stopTimer;
    }
    const round = state.answers[i];
    // a song whose sound will not load is swapped before anyone hears about it; the next one warms up meanwhile
    if (!mem.swapping) {
      clipReady(song).then((ok) => {
        const now = mem.state; // the newest state: by now someone may have pressed, or the song changed
        if (ok || mem.swapping || roundMem.get(container) !== mem || now.phase !== 'listen'
          || now.answers[now.index].some((r) => r != null) || (now.answering || []).some(Boolean)) return;
        mem.swapping = true;
        sendMove({ type: 'swap', round: i, song: songKeyOf(song) });
      });
      if (state.songs[i + 1]) clipReady(state.songs[i + 1]).catch(() => {});
    }
    const preview = el('div', { class: 'sb-preview' });
    const showPreview = (heard) => {
      const pts = pointsFor({ heard, clipSec: state.clipSec, mode: 'typed', artistOk: true, songOk: true });
      preview.textContent = `${Math.round(heard)} sn dinlendi · şimdi basan: grup +${pts.artist}, şarkı +${pts.song}`;
    };
    const clip = createClipPlayer(song, {
      seconds: state.clipSec, pausable: true, heard: mem.heard, at: mem.pos,
      note: 'Bilen kendi "Tahmin et" düğmesine bassın: az dinleyen çok kazanır. Sayaç tahmin sırasında durur.',
      onTick: (heard) => { mem.heard = heard; showPreview(heard); },
    });
    showPreview(mem.heard);
    const buzzers = (online ? [viewer] : [0, 1]).map((p) => {
      const done = round[p] != null;
      return el('button', {
        type: 'button', class: `btn btn-big sb-buzz ${done ? 'btn-secondary' : 'btn-primary'}`, disabled: done,
        onClick: () => sendMove({ type: 'buzz', who: p, heard: clip.heard(), song: songKeyOf(song) }),
      }, done ? `${players[p]} cevapladı` : `${players[p]} · Tahmin et`);
    });
    const waiting = online && round[1 - viewer] == null && round[viewer] != null ? el('p', { class: 'hint' }, `${players[1 - viewer]} bekleniyor…`) : null;
    draw(container,
      status(`Şarkı ${i + 1}/${n}`),
      timerBox,
      el('div', { class: 'card ss-card' }, el('div', { class: 'ss-secret' }, `🎧 ${i + 1}. şarkı`), clip.root, preview),
      el('div', { class: 'row sb-buzzers' }, buzzers),
      waiting,
    );
    return () => { mem.pos = clip.position(); clip.destroy(); stopTimer(); };
  }

  // ---- the answering player's screens (band, then song typed or from four names)
  if (!online && mem.covered) { // the other player must not watch the typing
    draw(container,
      status(`Şarkı ${i + 1}/${n}`),
      timerBox,
      el('div', { class: 'handoff' },
        el('div', { class: 'handoff-icon', 'aria-hidden': 'true' }, '🤫'),
        el('h2', {}, `${players[who]}, telefonu al`),
        el('p', {}, `${players[1 - who]} bakmasın; cevabını gizlice yazacaksın.`),
        el('button', { type: 'button', class: 'btn btn-primary btn-big', onClick: () => { mem.covered = false; render(state, viewer, container, sendMove, ctx); } }, 'Hazırım'),
      ),
    );
    return stopTimer;
  }
  const slot = answering[who];
  const heard = slot.heard;
  const pts = pointsFor({ heard, clipSec: state.clipSec, mode: 'typed', artistOk: true, songOk: true });
  const typedBox = (id, placeholder) => el('input', { type: 'text', class: 'input', id, autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', placeholder, 'aria-label': placeholder });
  if (slot.step === 'band') { // step 1: the band
    let sent = false;
    const artistIn = typedBox('sb-artist', 'Grup');
    const submit = () => { if (sent) return; sent = true; sendMove({ type: 'check1', artist: artistIn.value }); };
    artistIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    draw(container,
      status(`${players[who]} · ${i + 1}. şarkı · ${Math.round(heard)} sn dinleyip bastın`),
      timerBox,
      el('div', { class: 'card ss-card sb-answer' },
        el('p', { class: 'sb-preview' }, `1/2 · Grup doğruysa +${pts.artist}`),
        el('div', { class: 'field' }, el('label', { for: 'sb-artist' }, 'Hangi grup?'), artistIn),
        el('p', { class: 'hint' }, 'Bilmiyorsan boş bırak. Küçük yazım hataları ve ş/s, ı/i farkları sorun olmaz.'),
      ),
      el('div', { class: 'row sb-actions' },
        el('button', { type: 'button', class: 'btn btn-primary btn-big', onClick: submit }, 'Devam: şarkının adı'),
      ),
    );
    setTimeout(() => { try { artistIn.focus(); } catch { /* ignore */ } }, 50);
    return stopTimer;
  }
  if (slot.step === 'song') { // step 2: the song, typed or from four names
    let sent = false;
    const titleIn = typedBox('sb-title', 'Şarkının adı');
    const submit = () => { if (sent) return; sent = true; mem.covered = true; sendMove({ type: 'check2', title: titleIn.value }); };
    titleIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    const half = pointsFor({ heard, clipSec: state.clipSec, mode: 'options', artistOk: true, songOk: true }).song;
    draw(container,
      status(`${players[who]} · ${i + 1}. şarkı · ${Math.round(heard)} sn dinleyip bastın`),
      timerBox,
      el('div', { class: 'card ss-card sb-answer' },
        el('p', { class: 'sb-preview' }, `2/2 · Şarkı doğruysa +${pts.song} (şıklarla +${half})`),
        el('p', { class: 'muted' }, `Grup cevabın: ${slot.typedArtist || '—'}`),
        el('div', { class: 'field' }, el('label', { for: 'sb-title' }, 'Şarkının adı ne?'), titleIn),
        el('p', { class: 'hint' }, 'Bilmiyorsan boş bırak ya da şıkları iste.'),
      ),
      el('div', { class: 'row sb-actions' },
        el('button', { type: 'button', class: 'btn btn-primary btn-big', onClick: submit }, 'Kontrol et'),
        el('button', { type: 'button', class: 'btn btn-secondary btn-big', onClick: () => { if (!sent) { sent = true; sendMove({ type: 'options' }); } } }, 'Şıkları göster (yarı puan)'),
      ),
    );
    setTimeout(() => { try { titleIn.focus(); } catch { /* ignore */ } }, 50);
    return stopTimer;
  }
  // step 'options': four song names
  let chosen = false;
  draw(container,
    status(`${players[who]} · ${i + 1}. şarkı · şıklarla (şarkı puanı yarım)`),
    timerBox,
    el('p', { class: 'hint' }, `Grup cevabın: ${slot.typedArtist || '—'}. Hangi şarkı?`),
    el('div', { class: 'options' }, songOptions(ctx.songs, song, state.seed + i * 7 + 2).map((title) =>
      el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => { if (chosen) return; chosen = true; mem.covered = true; sendMove({ type: 'choose2', title }); } }, title))),
  );
  return stopTimer;
}

export default { id: 'sarkiyi-bil', meta, setup, applyMove, render, getTurn, getResult };
