// Şarkıyı Bil — a clip plays; stop it as soon as you know the song. The less you listened, the more
// points: the band is worth 5, the song 10 more, both scaled by up to 2× for a quick answer. Say the
// answer out loud and let your opponent confirm it, or ask for multiple-choice options for half the
// points. Each player gets their own songs in turn; most points wins.
import { el, render as draw } from '../js/ui/dom.js';
import { createClipPlayer } from '../js/ui/clip.js';
import { renderArtistPick } from '../js/ui/artist-pick.js';
import { pickSongs, poolFor, catalogArtists, artistOptions, songOptions, normKey, POOL_OPTIONS, POOL_VALUES } from '../js/lib/songs.js';

export const ARTIST_POINTS = 5;
export const SONG_POINTS = 10;
const ROUND_OPTIONS = [3, 5, 8];
const CLIP_OPTIONS = [15, 20, 30];
const FAVOR_OPTIONS = ['high', 'mid', 'none'];

export const meta = {
  group: 'tanisma',
  name: 'Şarkıyı Bil',
  icon: '🎧',
  description: 'Şarkı çalar, bildiğin an durdur: ne kadar az dinlediysen o kadar çok puan. Grubu bil, şarkıyı da bil.',
  rules: [
    `Sırayla herkese kendi şarkıları gelir. ▶ ile çalmaya başla, bildiğin an ⏸ ile durdur ve cevabı söyle. Grup ${ARTIST_POINTS} puan, şarkının adı ${SONG_POINTS} puan daha.`,
    'Puanlar dinlediğin süreye göre katlanır: hiç dinlemeden bilsen 2 katı, klibin tamamını dinlersen 1 katı (arası orantılı). Tekrar dinlemek de dinlenen süreye sayılır.',
    'Cevabı söyleyince "Cevabı göster" de; gerçek cevap çıkar, rakibin "Grubu bildi", "Grubu ve şarkıyı bildi" ya da "Bilemedi" diye onaylar.',
    'Emin değilsen "Şıkları göster": dört grup, sonra dört şarkı adı arasından seçersin; bu yolda puanlar yarıya iner. Grup yanlışsa şarkı sorulmaz.',
    'Şarkı havuzu: hazır liste (favori gruplar sık) ya da oyun başında ikinizin işaretlediği gruplar. Oyun sonunda toplam puanı çok olan kazanır.',
  ].join('\n'),
  data: ['songs'],
  handoffNote: 'Şarkı yalnızca sırası gelene çalar; cevabı rakibin onaylayacak.',
  settings: [
    { key: 'rounds', label: 'Herkese kaç şarkı', type: 'select', default: 5, options: ROUND_OPTIONS.map((n) => ({ value: n, label: String(n) })) },
    { key: 'clip', label: 'Klip süresi', type: 'select', default: 20, options: CLIP_OPTIONS.map((n) => ({ value: n, label: `${n} saniye` })) },
    { key: 'pool', label: 'Şarkı havuzu', type: 'select', default: 'liste', options: POOL_OPTIONS },
    {
      key: 'favor', label: 'Favori gruplar (hazır listede)', type: 'select', default: 'high',
      options: [
        { value: 'high', label: 'Çok çıksın' },
        { value: 'mid', label: 'Biraz daha sık çıksın' },
        { value: 'none', label: 'Herkes eşit' },
      ],
    },
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

/** Points for an answer. mode 'honor' (said out loud) or 'options' (multiple choice, half points). */
export function pointsFor({ heard, clipSec, mode, artistOk, songOk }) {
  const f = speedFactor(heard, clipSec);
  const half = mode === 'options' ? 0.5 : 1;
  const artist = artistOk ? Math.round(ARTIST_POINTS * f * half) : 0;
  const song = artistOk && songOk ? Math.round(SONG_POINTS * f * half) : 0;
  return { artist, song, total: artist + song };
}

function drawSongs(state, data) {
  const pool = poolFor(data, { pool: state.pool, picks: state.picks });
  return pickSongs(pool, { count: state.perPlayer * 2, favor: state.favor, seed: state.seed, needAudio: true });
}

export function setup(options = {}, ctx = {}) {
  const perPlayer = ROUND_OPTIONS.includes(Number(options.rounds)) ? Number(options.rounds) : 5;
  const clipSec = CLIP_OPTIONS.includes(Number(options.clip)) ? Number(options.clip) : 20;
  const pool = POOL_VALUES.includes(options.pool) ? options.pool : 'liste';
  const favor = FAVOR_OPTIONS.includes(options.favor) ? options.favor : 'high';
  const state = {
    perPlayer, clipSec, pool, favor,
    seed: Number(options.seed) || 1,
    picks: [null, null],
    songs: [],          // songs[turn]; turn t belongs to player t % 2
    results: [],        // results[turn] = { mode, heard, artistOk, songOk, points: { artist, song, total } }
    turn: 0,
    current: null,      // the open turn's progress: { mode, heard?, artistOk? }
    phase: pool === 'liste' ? 'listen' : 'pick', // pick | listen | judge | options | options2 | result | over
  };
  if (state.phase === 'listen') state.songs = drawSongs(state, ctx.songs);
  return state;
}

export const turnPlayer = (state) => state.turn % 2;

export function scoreOf(state, p) {
  return state.results.reduce((sum, r, t) => (r && t % 2 === p ? sum + r.points.total : sum), 0);
}

const heardOf = (move) => {
  const h = Number(move.heard);
  return Number.isFinite(h) && h >= 0 ? Math.round(h * 10) / 10 : 0;
};

export function applyMove(state, player, move, ctx = {}) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (move.type === 'pick') {
    if (state.phase !== 'pick') fail('Grup seçimi bitti');
    if (state.picks[player] != null) fail('Seçimini yaptın');
    const picks = state.picks.slice();
    picks[player] = Array.isArray(move.artists) ? move.artists.filter((a) => typeof a === 'string').slice(0, 300) : [];
    const next = { ...state, picks };
    if (picks[0] != null && picks[1] != null) {
      next.songs = drawSongs(next, ctx.songs);
      next.phase = 'listen';
    }
    return next;
  }
  if (state.phase === 'pick' || state.phase === 'over') fail('Şu an bu hamle yapılamaz');
  if (player !== turnPlayer(state)) fail('Sıra sende değil');
  const song = state.songs[state.turn];
  const finish = (mode, heard, artistOk, songOk) => {
    const points = pointsFor({ heard, clipSec: state.clipSec, mode, artistOk, songOk });
    const results = state.results.slice();
    results[state.turn] = { mode, heard, artistOk: !!artistOk, songOk: !!(artistOk && songOk), points };
    return { ...state, results, current: null, phase: 'result' };
  };
  switch (move.type) {
    case 'reveal': // said out loud: the answer appears, the opponent judges
      if (state.phase !== 'listen') fail('Önce dinle');
      return { ...state, current: { mode: 'honor', heard: heardOf(move) }, phase: 'judge' };
    case 'judge': {
      if (state.phase !== 'judge') fail('Cevap henüz açılmadı');
      const level = Number(move.level);
      if (![0, 1, 2].includes(level)) fail('Geçersiz karar');
      return finish('honor', state.current.heard, level >= 1, level === 2);
    }
    case 'options': // multiple choice, half the points; the clock keeps running until the choice
      if (state.phase !== 'listen') fail('Önce dinle');
      return { ...state, current: { mode: 'options' }, phase: 'options' };
    case 'choose': {
      if (state.phase !== 'options') fail('Şıklar açık değil');
      const ok = normKey(move.artist) === normKey(song.a);
      const heard = heardOf(move);
      if (!ok) return finish('options', heard, false, false);
      return { ...state, current: { mode: 'options', heard, artistOk: true }, phase: 'options2' };
    }
    case 'choose2': {
      if (state.phase !== 'options2') fail('Şarkı şıkları açık değil');
      const ok = normKey(move.title) === normKey(song.t);
      return finish('options', heardOf(move), true, ok);
    }
    case 'next': {
      if (state.phase !== 'result') fail('Önce bu şarkı bitsin');
      const turn = state.turn + 1;
      if (turn >= state.songs.length) return { ...state, phase: 'over' };
      return { ...state, turn, phase: 'listen' };
    }
    default:
      return fail('Geçersiz hamle');
  }
}

export function getTurn(state) {
  if (state.phase === 'pick') return { player: state.picks[0] == null ? 0 : 1, private: false, note: 'Önce dinlediğin grupları seçeceksin.' };
  if (state.phase === 'over') return null;
  return { player: turnPlayer(state), private: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const a = scoreOf(state, 0);
  const b = scoreOf(state, 1);
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
const heardByTurn = new WeakMap(); // container -> { turn, heard }  (listening continues across phases)

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];

  if (state.phase === 'pick') {
    const turn = getTurn(state);
    if (turn.player !== viewer) {
      draw(container, el('p', { class: 'hint' }, `${players[turn.player]} dinlediği grupları seçiyor…`), el('div', { class: 'spinner', 'aria-hidden': 'true' }));
      return null;
    }
    renderArtistPick(container, {
      artists: catalogArtists(ctx.songs),
      playerName: players[viewer],
      otherPicks: state.picks[1 - viewer],
      onDone: (artists) => sendMove({ type: 'pick', artists }),
    });
    return null;
  }

  const scores = [scoreOf(state, 0), scoreOf(state, 1)];
  const t = state.turn;
  const p = turnPlayer(state);
  const song = state.songs[t];
  const no = Math.floor(t / 2) + 1;
  const status = (extra) => el('div', { class: 'status-line' },
    el('div', {}, el('strong', {}, `${players[0]} ${scores[0]} – ${scores[1]} ${players[1]}`)),
    el('div', { class: 'muted' }, extra),
  );

  if (state.phase === 'over') {
    const rows = state.songs.map((s, k) => {
      const r = state.results[k] || { points: { total: 0 }, heard: 0, mode: 'honor' };
      const what = r.points.total === 0 ? 'bilemedi' : r.songOk ? 'grup + şarkı' : 'grup';
      return el('div', { class: 'compare-item card' },
        el('div', { class: 'q' }, `${k + 1}. ${s.a} — ${s.t}`),
        el('div', { class: 'ans' }, `${players[k % 2]}: ${what}${r.mode === 'options' ? ' (şıklarla)' : ''} · ${Math.round(r.heard)} sn dinledi`),
        el('span', { class: `badge ${r.points.total ? 'match' : 'miss'}` }, `+${r.points.total}`),
      );
    });
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[0]} ${scores[0]} – ${scores[1]} ${players[1]}`)),
      el('div', { class: 'compare-list' }, rows),
    );
    return null;
  }

  if (p !== viewer) { // two phones: the other player's turn
    draw(container, status(`${players[p]} ${no}. şarkısında…`), el('div', { class: 'spinner', 'aria-hidden': 'true' }));
    return null;
  }

  let mem = heardByTurn.get(container);
  if (!mem || mem.turn !== t || mem.songs !== state.songs) { mem = { turn: t, songs: state.songs, heard: 0 }; heardByTurn.set(container, mem); }
  const preview = el('div', { class: 'sb-preview' });
  const showPreview = (heard, mode) => {
    const pts = pointsFor({ heard, clipSec: state.clipSec, mode, artistOk: true, songOk: true });
    preview.textContent = `${Math.round(heard)} sn dinledin · şimdi bilirsen grup ${pts.artist}, şarkı +${pts.song} puan`;
  };

  if (state.phase === 'listen' || state.phase === 'options' || state.phase === 'options2') {
    const mode = state.phase === 'listen' ? 'honor' : 'options';
    const fallback = el('p', { class: 'hint rejected-note', hidden: true }, 'Bu şarkının sesi yüklenemedi; "Şıkları göster" ile yine de deneyebilir ya da pas geçebilirsin.');
    const clip = createClipPlayer(song, {
      seconds: state.clipSec,
      pausable: true,
      heard: mem.heard,
      note: 'Bildiğin an durdur: az dinleyen çok kazanır.',
      onTick: (heard) => { mem.heard = heard; showPreview(heard, mode); },
      onFail: () => { fallback.hidden = false; },
    });
    showPreview(mem.heard, mode);
    const children = [
      status(`${players[p]} · ${no}. şarkın`),
      el('div', { class: 'card ss-card' }, el('div', { class: 'ss-secret' }, `🎧 ${no}. şarkı`), clip.root, fallback, preview),
    ];
    if (state.phase === 'listen') {
      children.push(
        el('div', { class: 'row sb-actions' },
          el('button', { type: 'button', class: 'btn btn-primary btn-big', onClick: () => sendMove({ type: 'reveal', heard: clip.heard() }) }, 'Biliyorum, cevabı göster'),
          el('button', { type: 'button', class: 'btn btn-secondary btn-big', onClick: () => sendMove({ type: 'options' }) }, 'Şıkları göster (yarı puan)'),
        ),
        el('p', { class: 'hint' }, 'Cevabı yüksek sesle söyle, rakibin onaylasın. Pas geçmek için de "cevabı göster" de.'),
      );
    } else if (state.phase === 'options') {
      const pool = poolFor(ctx.songs, { pool: state.pool, picks: state.picks });
      children.push(
        el('p', { class: 'hint' }, 'Hangi grup? (şıklar puanı yarıya indirdi)'),
        el('div', { class: 'options' }, artistOptions(pool, song, state.seed + t * 7 + 1, 4, ctx.songs).map((a) =>
          el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => sendMove({ type: 'choose', artist: a, heard: clip.heard() }) }, a))),
      );
    } else {
      children.push(
        el('p', { class: 'hint' }, `Grup doğru: ${song.a}. Peki hangi şarkı?`),
        el('div', { class: 'options' }, songOptions(ctx.songs, song, state.seed + t * 7 + 2).map((title) =>
          el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => sendMove({ type: 'choose2', title, heard: clip.heard() }) }, title))),
      );
    }
    draw(container, children);
    return () => clip.destroy();
  }

  if (state.phase === 'judge') {
    const heard = state.current.heard;
    const one = pointsFor({ heard, clipSec: state.clipSec, mode: 'honor', artistOk: true, songOk: false });
    const two = pointsFor({ heard, clipSec: state.clipSec, mode: 'honor', artistOk: true, songOk: true });
    draw(container,
      status(`${players[p]} · ${no}. şarkın · ${Math.round(heard)} sn dinledi`),
      el('div', { class: 'card ss-card' },
        el('div', { class: 'ss-artist' }, song.a),
        el('div', { class: 'ss-title' }, song.t),
      ),
      el('p', { class: 'hint' }, `${players[1 - p]}, cevabı onayla:`),
      el('div', { class: 'options' },
        el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => sendMove({ type: 'judge', level: 2 }) }, `Grubu ve şarkıyı bildi (+${two.total})`),
        el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => sendMove({ type: 'judge', level: 1 }) }, `Yalnız grubu bildi (+${one.total})`),
        el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => sendMove({ type: 'judge', level: 0 }) }, 'Bilemedi (0)'),
      ),
    );
    return null;
  }

  // result
  const r = state.results[t];
  const last = t + 1 >= state.songs.length;
  const verdict = r.points.total === 0 ? 'Bu sefer olmadı.' : r.songOk ? 'Grup ve şarkı doğru!' : 'Grup doğru, şarkı değil.';
  draw(container,
    status(`${players[p]} · ${no}. şarkın`),
    el('div', { class: 'card ss-card' },
      el('div', { class: 'ss-artist' }, song.a),
      el('div', { class: 'ss-title' }, song.t),
      el('div', { class: 'ss-real' }, `+${r.points.total}`),
      el('div', { class: 'muted' }, `${verdict} ${Math.round(r.heard)} sn dinleme${r.mode === 'options' ? ', şıklarla (yarı puan)' : ''} · grup ${r.points.artist} + şarkı ${r.points.song}`),
    ),
    el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', onClick: () => sendMove({ type: 'next' }) }, last ? 'Sonucu gör' : `Sıradaki: ${players[1 - p]}`),
  );
  return null;
}

export default { id: 'sarkiyi-bil', meta, setup, applyMove, render, getTurn, getResult };
