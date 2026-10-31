// Song pool helpers shared by Şarkı Süresi and Şarkıyı Bil (pure functions, no DOM).
//
// data/sarkilar.json: { weights: { artist: w }, catalog: [artist…], tracks: [{ a, t, s, dz?, p?, np?, g }] }
//   a artist, t title, s length in seconds, p Spotify preview url (does not expire), dz Deezer track id
//   (its preview url is fetched when a clip is played), np: no preview anywhere, g: where the song
//   comes from — 'sp' the Spotify list, 'mix' the exported mix list, 'fav' a favourite band's albums,
//   'fr' the friend's playlists, 'top' the broad catalog (an index band's most popular songs; only
//   used when players pick bands). w: whose list the song is on — bit 1 the first person (people[0]),
//   bit 2 the second (people[1]); catalog songs carry no w.
import { createRng, shuffle } from './rng.js';

export const normKey = (s) => String(s || '').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();

/** Can a clip be played for this song? */
export const hasAudio = (t) => !!(t && (t.p || (t.dz && !t.np)));

/** 257 → "4:17" */
export const fmt = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

export const POOL_OPTIONS = [
  { value: 'liste', label: "Mustafa'nın listesi (favori gruplar sık)" },
  { value: 'arkadas', label: "beyz'in listeleri" },
  { value: 'ikisi', label: 'İki listenin ortak grupları' },
  { value: 'secim', label: 'Dinlediğimiz gruplar (oyunda seçilir)' },
  { value: 'ortak', label: 'Yalnız ortak gruplar (ikimizin de seçtiği)' },
];
export const POOL_VALUES = POOL_OPTIONS.map((o) => o.value);

const allTracks = (data) => (data && Array.isArray(data.tracks) ? data.tracks : []).filter((t) => t && t.a && t.t && Number(t.s) >= 30);

/** Whose list a song is on: bit 1 the first person, bit 2 the second. A song without w is the first person's unless it is a catalog song. */
export const whoHas = (t) => (t.w != null ? Number(t.w) : (t.g === 'top' ? 0 : 1));

/** Songs on person `who`'s list (bit 1 the first person, bit 2 the second); without `who`: anyone's list. */
export const listTracks = (data, who = 3) => allTracks(data).filter((t) => whoHas(t) & who);

/** Bands on both people's lists (normalised names). */
export function commonArtists(data) {
  const on = (bit) => new Set(listTracks(data, bit).map((t) => normKey(t.a)));
  const a = on(1);
  return new Set([...on(2)].filter((x) => a.has(x)));
}

/** Bands the players can pick from, alphabetically (the catalog list, else any band with 5+ songs). */
export function catalogArtists(data) {
  let names = data && Array.isArray(data.catalog) ? data.catalog.map(String) : [];
  if (!names.length) {
    const counts = new Map();
    for (const t of allTracks(data)) counts.set(t.a, (counts.get(t.a) || 0) + 1);
    names = [...counts].filter(([, n]) => n >= 5).map(([a]) => a);
  }
  return [...new Set(names)].sort((x, y) => x.localeCompare(y, 'en'));
}

/**
 * The songs a game draws from. pool 'liste': the personal list with its favourite weights.
 * 'secim': every song of a band either player picked (bands both picked weigh 3×).
 * 'ortak': only bands both picked. Empty picks fall back to the wider choice, then to the list.
 * @returns {{ tracks: object[], weights: object }}
 */
export function poolFor(data, { pool = 'liste', picks = [[], []] } = {}) {
  if (pool === 'arkadas') return { tracks: listTracks(data, 2), weights: {} };
  if (pool === 'ikisi') {
    // every song (both lists and the catalog) by a band on both lists; a song on both lists weighs 3×
    const common = commonArtists(data);
    const tracks = allTracks(data).filter((t) => common.has(normKey(t.a)));
    if (tracks.length < 10) return { tracks: listTracks(data, 3), weights: {} }; // too little in common: both lists together
    const weights = {};
    for (const t of tracks) if (whoHas(t) === 3) weights[`${t.a}|${t.t}`] = 3;
    return { tracks, weights, perSong: true };
  }
  if (pool !== 'secim' && pool !== 'ortak') return { tracks: listTracks(data, 1), weights: (data && data.weights) || {} };
  const sets = [0, 1].map((i) => new Set((Array.isArray(picks[i]) ? picks[i] : []).map(normKey)));
  const union = new Set([...sets[0], ...sets[1]]);
  const both = new Set([...sets[0]].filter((a) => sets[1].has(a)));
  const chosen = pool === 'ortak' && both.size ? both : union;
  if (!chosen.size) return { tracks: listTracks(data, 1), weights: (data && data.weights) || {} };
  const tracks = allTracks(data).filter((t) => chosen.has(normKey(t.a)));
  const weights = {};
  if (pool === 'secim') for (const t of tracks) if (both.has(normKey(t.a))) weights[t.a] = 3;
  return { tracks, weights };
}

/**
 * Pick `count` songs, deterministic from the seed. Weighted bands (the weights table) come up more
 * often: favor 'high' uses the weights as they are, 'mid' their square root, 'none' ignores them.
 * No song twice, at most a few songs per band, and no band in two rounds in a row while the pool
 * allows it. With `needAudio` only songs that can play a clip are used.
 */
export function pickSongs(data, { count, favor = 'high', seed = 1, needAudio = false }) {
  const tracks = allTracks(data).filter((t) => !needAudio || hasAudio(t));
  if (!tracks.length) throw new Error('Şarkı listesi boş');
  const table = new Map();
  for (const [k, v] of Object.entries((data && data.weights) || {})) if (Number(v) > 0) table.set(normKey(k), Number(v));
  const keyOf = data && data.perSong ? (t) => normKey(`${t.a}|${t.t}`) : (t) => normKey(t.a); // weights per song or per band
  const weightOf = (t) => {
    const w = table.get(keyOf(t)) || 1;
    return favor === 'none' ? 1 : favor === 'mid' ? Math.sqrt(w) : w;
  };
  const rng = createRng(seed);
  const cap = Math.max(2, Math.ceil(count / 4));
  const perArtist = new Map();
  const used = new Set();
  const picked = [];
  const n = Math.min(count, tracks.length);
  while (picked.length < n) {
    const last = picked.length ? normKey(picked[picked.length - 1].a) : null;
    const free = tracks.filter((t) => !used.has(t));
    let pool = free.filter((t) => (perArtist.get(normKey(t.a)) || 0) < cap && normKey(t.a) !== last);
    if (!pool.length) pool = free.filter((t) => (perArtist.get(normKey(t.a)) || 0) < cap);
    if (!pool.length) pool = free;
    let total = 0;
    for (const t of pool) total += weightOf(t);
    let r = rng() * total;
    let chosen = pool[pool.length - 1];
    for (const t of pool) {
      r -= weightOf(t);
      if (r <= 0) { chosen = t; break; }
    }
    used.add(chosen);
    perArtist.set(normKey(chosen.a), (perArtist.get(normKey(chosen.a)) || 0) + 1);
    picked.push(chosen);
  }
  return picked.map(compact);
}

/** The fields a game state keeps for a song. */
export function compact(t) {
  const song = { a: String(t.a), t: String(t.t), s: Math.round(Number(t.s)) };
  if (t.p) song.p = String(t.p);
  if (t.dz) song.dz = Number(t.dz);
  return song;
}

/**
 * Four band names for a multiple-choice question: the right one and three others from the pool,
 * filled up from the whole data when the pool has too few bands, shuffled.
 */
export function artistOptions(pool, song, seed, n = 4, data = null) {
  const rng = createRng(seed);
  const notIt = (a) => normKey(a) !== normKey(song.a);
  let others = shuffle(rng, [...new Set((pool.tracks || []).map((t) => t.a))].filter(notIt)).slice(0, n - 1);
  if (others.length < n - 1 && data) {
    const have = new Set(others.map(normKey));
    const more = shuffle(rng, [...new Set(allTracks(data).map((t) => t.a))].filter((a) => notIt(a) && !have.has(normKey(a))));
    others = others.concat(more.slice(0, n - 1 - others.length));
  }
  return shuffle(rng, [song.a, ...others]);
}

/** Four song titles: the right one and others by the same band (filled up from other bands), shuffled. */
export function songOptions(data, song, seed, n = 4) {
  const rng = createRng(seed);
  const all = allTracks(data);
  const same = shuffle(rng, [...new Set(all.filter((t) => normKey(t.a) === normKey(song.a) && normKey(t.t) !== normKey(song.t)).map((t) => t.t))]);
  let picked = same.slice(0, n - 1);
  if (picked.length < n - 1) {
    const rest = shuffle(rng, [...new Set(all.filter((t) => normKey(t.a) !== normKey(song.a)).map((t) => t.t))]);
    picked = picked.concat(rest.slice(0, n - 1 - picked.length));
  }
  return shuffle(rng, [song.t, ...picked]);
}

// ----------------------------------------------------------------- typed answers (Şarkıyı Bil)
const LETTER_MAP = { 'ı': 'i', 'ø': 'o', 'æ': 'ae', 'ß': 'ss', 'ł': 'l', 'đ': 'd', 'þ': 'th', 'ð': 'd', 'œ': 'oe' };

/** Lower-case ASCII skeleton of a band or song name: accents, punctuation, "(…)" and " - …" tails dropped, a leading "the" too. */
export function normalizeAnswer(s) {
  let x = String(s || '').replace(/İ/g, 'i').replace(/I/g, 'i').toLowerCase();
  x = x.replace(/[ıøæßłđþðœ]/g, (c) => LETTER_MAP[c] || c);
  x = x.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  x = x.replace(/\s+-\s+.*$/, '').replace(/[([].*?[)\]]/g, ' ');
  x = x.replace(/&/g, ' and ').replace(/['’`´]/g, '');
  x = x.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  return x.replace(/^the /, '');
}

/** Levenshtein distance. */
export function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Does a typed answer name the band or song? Spelling slips are forgiven in proportion to the
 * length (none under 5 letters, up to 3 for long names); extra words around the answer are fine,
 * and the start of a long title counts when it covers most of it.
 */
export function answerMatches(typed, answer) {
  const a = normalizeAnswer(typed);
  const b = normalizeAnswer(answer);
  if (!a || !b) return false;
  if (a === b) return true;
  const tol = b.length < 5 ? 0 : b.length < 9 ? 1 : b.length < 13 ? 2 : 3;
  if (editDistance(a, b) <= tol) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  if (a.length >= 4 && b.startsWith(a) && a.length >= Math.ceil(b.length * 0.6)) return true;
  return false;
}
