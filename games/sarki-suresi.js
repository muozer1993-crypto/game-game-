// Şarkı Süresi — a song comes up and both players guess how long it is (m:ss); the guess closer to
// the real length takes the round. Normal mode shows the title; hard mode hides it and plays a clip
// instead. The songs come from the personal list (favourite bands weighted) or from the bands the
// two players pick at the start (see js/lib/songs.js).
import { el, render as draw, toast } from '../js/ui/dom.js';
import { createKeyboard } from '../js/ui/keyboard.js';
import { createClipPlayer } from '../js/ui/clip.js';
import { renderArtistPick, rememberedPicks } from '../js/ui/artist-pick.js';
import { pickSongs, poolFor, catalogArtists, hasAudio, fmt, POOL_OPTIONS, POOL_VALUES } from '../js/lib/songs.js';

export { fmt, hasAudio, pickSongs };

const ROUND_OPTIONS = [5, 10, 15];
const CLIP_OPTIONS = [10, 15, 20, 30];
const FAVOR_OPTIONS = ['high', 'mid', 'none'];

export const meta = {
  group: 'tanisma',
  name: 'Şarkı Süresi',
  icon: '🎵',
  description: 'Bir şarkı gelir: kaç dakika sürüyor? Gerçek süreye yakın tahmin eden turu alır.',
  rules: [
    'Bir şarkı gelir. İkiniz de şarkının kaç dakika sürdüğünü tahmin edersiniz (ör. 4:32). Gerçek süreye daha yakın olan turu alır; eşitlikte kimse puan almaz.',
    'Normal: şarkının adı ve grubu yazar. Zor: ad gizlidir, ▶ düğmesi şarkıdan seçtiğiniz kadar saniye çalar (internet gerekir); ad ancak ikiniz de tahmin edince açıklanır.',
    'Tek telefonda önce biri tahminini gizlice girer ve telefonu verir, sonra öbürü girer; ardından ikiniz de sonucu görürsünüz. İlk tahmin eden her şarkıda değişir.',
    'Süreyi dakika ve saniye olarak art arda yazarsın: 4 3 2 → 4:32. Oyun sonunda çok tur alan kazanır; eşitlikte tahminlerinin gerçekten toplam sapması az olan.',
    'Şarkı havuzu: "Hazır liste" Spotify listesinden gelir ve favori ayarına göre Katatonia, Opeth, Anathema, Antimatter daha sık çıkar. "Dinlediğimiz gruplar"da oyun başında ikiniz de dinlediğiniz grupları işaretlersiniz; şarkılar onlardan gelir, ikinizin de seçtiği gruplar daha sık. "Yalnız ortak gruplar" ikinizin de seçtikleriyle sınırlı kalır.',
  ].join('\n'),
  data: ['songs'],
  handoffNote: 'Tahminler gizli: ekranı yalnızca sırası gelen görmeli.',
  settings: [
    {
      key: 'mode', label: 'Oyun türü', type: 'select', default: 'normal',
      options: [
        { value: 'normal', label: 'Normal: şarkının adı yazar' },
        { value: 'hard', label: 'Zor: ad gizli, şarkı çalar' },
      ],
    },
    { key: 'rounds', label: 'Şarkı sayısı', type: 'select', default: 10, options: ROUND_OPTIONS.map((n) => ({ value: n, label: String(n) })) },
    { key: 'clip', label: 'Zor modda çalma süresi', type: 'select', default: 20, options: CLIP_OPTIONS.map((n) => ({ value: n, label: `${n} saniye` })) },
    { key: 'pool', label: 'Şarkı havuzu', type: 'select', default: 'liste', options: POOL_OPTIONS },
    {
      key: 'favor', label: 'Favori gruplar (hazır listede)', type: 'select', default: 'high',
      options: [
        { value: 'high', label: 'Çok çıksın' },
        { value: 'mid', label: 'Biraz daha sık çıksın' },
        { value: 'none', label: 'Herkes eşit' },
      ],
      help: 'Katatonia, Opeth, Anathema, Antimatter ve benzerleri daha sık gelir.',
    },
  ],
};

function fail(msg) {
  throw new Error(msg);
}

/** Signed difference guess − real: "+1:05", "−0:22" or "tam isabet". */
export function fmtDiff(guess, real) {
  const d = guess - real;
  if (d === 0) return 'tam isabet';
  return `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`;
}

/** Microwave-style entry: the digits typed so far ("432") shown as a clock ("4:32"). */
export function clockFromDigits(digits) {
  if (!digits) return '–:––';
  const n = digits.padStart(3, '0');
  return `${Number(n.slice(0, -2))}:${n.slice(-2)}`;
}

/** Typed digits → { seconds } or { error }. */
export function parseDigits(digits) {
  if (!digits) return { error: 'Önce bir süre yaz' };
  const n = digits.padStart(3, '0');
  const m = Number(n.slice(0, -2));
  const s = Number(n.slice(-2));
  if (s > 59) return { error: 'Saniye 59\'dan büyük olamaz' };
  const total = m * 60 + s;
  if (total < 1) return { error: 'Süre sıfır olamaz' };
  return { seconds: total };
}

/** Draw the game's songs from the pool the settings and picks describe. */
function drawSongs(state, data) {
  const pool = poolFor(data, { pool: state.pool, picks: state.picks });
  return pickSongs(pool, { count: state.count, favor: state.favor, seed: state.seed, needAudio: state.mode === 'hard' });
}

export function setup(options = {}, ctx = {}) {
  const mode = options.mode === 'hard' ? 'hard' : 'normal';
  const count = ROUND_OPTIONS.includes(Number(options.rounds)) ? Number(options.rounds) : 10;
  const clipSec = CLIP_OPTIONS.includes(Number(options.clip)) ? Number(options.clip) : 20;
  const pool = POOL_VALUES.includes(options.pool) ? options.pool : 'liste';
  const favor = FAVOR_OPTIONS.includes(options.favor) ? options.favor : 'high';
  const state = {
    mode, count, clipSec, pool, favor,
    seed: Number(options.seed) || 1,
    picks: [null, null],                     // bands each player picked ('secim' / 'ortak' pools)
    songs: [],                               // one per round: { a, t, s, p?, dz? }
    guesses: [],                             // guesses[round][player] in seconds
    index: 0,                                // current round
    phase: pool === 'liste' ? 'guess' : 'pick', // pick | guess | reveal | over
  };
  if (state.phase === 'guess') {
    state.songs = drawSongs(state, ctx.songs);
    state.guesses = state.songs.map(() => [null, null]);
  }
  return state;
}

/** The player who guesses first in round i (alternates). */
export const firstGuesser = (i) => i % 2;

/** 0 | 1 who took round i, -1 for a tie, null while the round is open. */
export function roundWinner(state, i) {
  const [g0, g1] = state.guesses[i];
  if (g0 == null || g1 == null) return null;
  const real = state.songs[i].s;
  const d0 = Math.abs(g0 - real);
  const d1 = Math.abs(g1 - real);
  if (d0 === d1) return -1;
  return d0 < d1 ? 0 : 1;
}

/** Rounds taken and the total distance of the guesses from the real lengths (seconds). */
export function scoreOf(state, p) {
  let points = 0;
  let error = 0;
  state.guesses.forEach((g, i) => {
    if (g[0] == null || g[1] == null) return;
    if (roundWinner(state, i) === p) points += 1;
    error += Math.abs(g[p] - state.songs[i].s);
  });
  return { points, error };
}

export function applyMove(state, player, move, ctx = {}) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (move.type === 'pick') {
    if (state.phase !== 'pick') fail('Grup seçimi bitti');
    if (state.picks[player] != null) fail('Seçimini yaptın');
    const list = Array.isArray(move.artists) ? move.artists.filter((a) => typeof a === 'string').slice(0, 300) : [];
    const picks = state.picks.slice();
    picks[player] = list;
    const next = { ...state, picks };
    if (picks[0] != null && picks[1] != null) {
      next.songs = drawSongs(next, ctx.songs);
      next.guesses = next.songs.map(() => [null, null]);
      next.phase = 'guess';
    }
    return next;
  }
  if (move.type === 'guess') {
    if (state.phase !== 'guess') fail('Şu an tahmin sırası değil');
    if (Number(move.round) !== state.index) fail('Bu şarkının sırası geçti');
    const turn = getTurn(state);
    if (!turn || turn.player !== player) fail('Sıra sende değil');
    const secs = Number(move.seconds);
    if (!Number.isInteger(secs) || secs < 1 || secs > 3599) fail('Geçersiz süre');
    const guesses = state.guesses.map((g) => g.slice());
    guesses[state.index][player] = secs;
    const both = guesses[state.index][0] != null && guesses[state.index][1] != null;
    return { ...state, guesses, phase: both ? 'reveal' : 'guess' };
  }
  if (move.type === 'next') {
    if (state.phase !== 'reveal') fail('Önce ikiniz de tahmin edin');
    const index = state.index + 1;
    if (index >= state.songs.length) return { ...state, phase: 'over' };
    return { ...state, index, phase: 'guess' };
  }
  return fail('Geçersiz hamle');
}

export function getTurn(state) {
  if (state.phase === 'pick') return { player: state.picks[0] == null ? 0 : 1, private: false, note: 'Önce dinlediğin grupları seçeceksin.' };
  if (state.phase === 'guess') {
    const f = firstGuesser(state.index);
    const g = state.guesses[state.index];
    return { player: g[f] == null ? f : 1 - f, private: true };
  }
  if (state.phase === 'reveal') return { player: 1 - firstGuesser(state.index), private: false };
  return null;
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const a = scoreOf(state, 0);
  const b = scoreOf(state, 1);
  if (a.points !== b.points) return { winner: a.points > b.points ? 0 : 1 };
  if (a.error !== b.error) return { winner: a.error < b.error ? 0 : 1 };
  return { draw: true };
}

// ----------------------------------------------------------------- render
export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];

  if (state.phase === 'pick') {
    const turn = getTurn(state);
    if (turn.player !== viewer) {
      draw(container, el('p', { class: 'hint' }, `${players[turn.player]} dinlediği grupları seçiyor…`), el('div', { class: 'spinner', 'aria-hidden': 'true' }));
      return null;
    }
    const other = state.picks[1 - viewer];
    renderArtistPick(container, {
      artists: catalogArtists(ctx.songs),
      playerName: players[viewer],
      otherPicks: other,
      onDone: (artists) => sendMove({ type: 'pick', artists }),
    });
    return null;
  }

  const n = state.songs.length;
  const i = state.index;
  const song = state.songs[i];
  const scores = [scoreOf(state, 0), scoreOf(state, 1)];
  const status = (extra) => el('div', { class: 'status-line' },
    el('div', {}, el('strong', {}, `${players[0]} ${scores[0].points} – ${scores[1].points} ${players[1]}`)),
    el('div', { class: 'muted' }, extra),
  );

  if (state.phase === 'guess') {
    const turn = getTurn(state);
    const first = firstGuesser(i);
    if (turn.player !== viewer) { // two phones: the other player is typing
      draw(container,
        status(`Şarkı ${i + 1}/${n}`),
        el('p', { class: 'hint' }, `${players[turn.player]} tahmin ediyor…`),
        el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      );
      return null;
    }
    let clip = null;
    let card;
    if (state.mode === 'hard') {
      const fallback = el('div', { class: 'ss-fallback', hidden: true },
        el('div', { class: 'ss-artist' }, song.a), el('div', { class: 'ss-title' }, song.t));
      clip = createClipPlayer(song, {
        seconds: state.clipSec,
        note: 'Dinle, süresini tahmin et. İstersen tekrar çalabilirsin.',
        onFail: () => { fallback.hidden = false; },
      });
      card = el('div', { class: 'card ss-card' }, el('div', { class: 'ss-secret' }, '🎧 Gizli şarkı'), clip.root, fallback);
    } else {
      card = el('div', { class: 'card ss-card' }, el('div', { class: 'ss-artist' }, song.a), el('div', { class: 'ss-title' }, song.t));
    }
    let typed = '';
    let sent = false;
    const display = el('div', { class: 'ss-time empty' }, clockFromDigits(''));
    const update = () => { display.textContent = clockFromDigits(typed); display.classList.toggle('empty', !typed); };
    const kbBox = el('div');
    const kb = createKeyboard(kbBox, {
      layout: 'digits',
      onKey: (k) => { if (!sent && typed.length < 4) { typed += k; update(); } },
      onBackspace: () => { if (!sent) { typed = typed.slice(0, -1); update(); } },
      onEnter: () => {
        if (sent) return;
        const parsed = parseDigits(typed);
        if (parsed.error) { toast(parsed.error, { kind: 'error' }); return; }
        sent = true;
        kb.setDisabled(true);
        sendMove({ type: 'guess', round: i, seconds: parsed.seconds });
      },
    });
    const order = viewer === first
      ? `Önce sen tahmin ediyorsun, sonra ${players[1 - viewer]}.`
      : `${players[first]} tahminini yaptı; şimdi sen.`;
    draw(container,
      status(`Şarkı ${i + 1}/${n} · ${order}`),
      card,
      el('p', { class: 'hint' }, 'Kaç dakika sürüyor? Dakika ve saniyeyi art arda yaz: 4 3 2 → 4:32'),
      display,
      kbBox,
    );
    return () => { kb.destroy(); if (clip) clip.destroy(); };
  }

  if (state.phase === 'reveal') {
    const g = state.guesses[i];
    const w = roundWinner(state, i);
    const last = i + 1 >= n;
    draw(container,
      status(`Şarkı ${i + 1}/${n}`),
      el('div', { class: 'card ss-card' },
        el('div', { class: 'ss-artist' }, song.a),
        el('div', { class: 'ss-title' }, song.t),
        el('div', { class: 'ss-real' }, fmt(song.s)),
        el('div', { class: 'muted' }, 'gerçek süre'),
        el('div', { class: 'ss-guesses' }, [0, 1].map((p) => el('div', { class: `ss-guess ${w === p ? 'win' : ''}` },
          el('span', { class: 'ss-who' }, players[p]),
          el('strong', {}, fmt(g[p])),
          el('span', { class: 'ss-diff' }, fmtDiff(g[p], song.s)),
        ))),
        el('div', { class: 'ss-verdict' }, w === -1 ? 'Berabere: bu turda kimse puan almadı.' : `Turu ${players[w]} aldı!`),
      ),
      el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', onClick: () => sendMove({ type: 'next' }) }, last ? 'Sonucu gör' : 'Sonraki şarkı'),
    );
    return null;
  }

  // over
  const rows = state.songs.map((s, k) => {
    const g = state.guesses[k];
    const w = roundWinner(state, k);
    return el('div', { class: 'compare-item card' },
      el('div', { class: 'q' }, `${k + 1}. ${s.a} — ${s.t} · ${fmt(s.s)}`),
      el('div', { class: 'ans' }, `${players[0]}: ${fmt(g[0])} (${fmtDiff(g[0], s.s)}) · ${players[1]}: ${fmt(g[1])} (${fmtDiff(g[1], s.s)})`),
      el('span', { class: `badge ${w === -1 ? 'close' : 'match'}` }, w === -1 ? 'berabere' : players[w]),
    );
  });
  draw(container,
    el('div', { class: 'status-line' },
      el('div', {}, el('strong', {}, `${players[0]}: ${scores[0].points} tur · toplam sapma ${fmt(scores[0].error)}`)),
      el('div', {}, el('strong', {}, `${players[1]}: ${scores[1].points} tur · toplam sapma ${fmt(scores[1].error)}`)),
    ),
    el('div', { class: 'compare-list' }, rows),
  );
  return null;
}

export default { id: 'sarki-suresi', meta, setup, applyMove, render, getTurn, getResult };
// the remembered picks helper is re-exported for the standalone page and tests
export { rememberedPicks };
