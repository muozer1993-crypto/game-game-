// Song pool helpers shared by Şarkı Süresi and Şarkıyı Bil (pure functions, no DOM).
//
// data/sarkilar.json: { weights: { artist: w }, catalog: [artist…], tracks: [{ a, t, s, dz?, p?, np?, g }] }
//   a artist, t title, s length in seconds, p Spotify preview url (does not expire), dz Deezer track id
//   (its preview url is fetched when a clip is played), np: no preview anywhere, g: where the song
//   comes from — 'sp' the Spotify list, 'mix' the exported mix list, 'fav' a favourite band's albums,
//   'top' the broad catalog (an index band's most popular songs; only used when players pick bands).
import { createRng, shuffle } from './rng.js';

export const normKey = (s) => String(s || '').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();

/** Can a clip be played for this song? */
export const hasAudio = (t) => !!(t && (t.p || (t.dz && !t.np)));

/** 257 → "4:17" */
export const fmt = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

export const POOL_OPTIONS = [
  { value: 'liste', label: 'Hazır liste (favori gruplar sık)' },
  { value: 'secim', label: 'Dinlediğimiz gruplar (oyunda seçilir)' },
  { value: 'ortak', label: 'Yalnız ortak gruplar (ikimizin de seçtiği)' },
];
export const POOL_VALUES = POOL_OPTIONS.map((o) => o.value);

const allTracks = (data) => (data && Array.isArray(data.tracks) ? data.tracks : []).filter((t) => t && t.a && t.t && Number(t.s) >= 30);

/** The personal list: everything but the broad catalog. */
export const listTracks = (data) => allTracks(data).filter((t) => t.g !== 'top');

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
  if (pool !== 'secim' && pool !== 'ortak') return { tracks: listTracks(data), weights: (data && data.weights) || {} };
  const sets = [0, 1].map((i) => new Set((Array.isArray(picks[i]) ? picks[i] : []).map(normKey)));
  const union = new Set([...sets[0], ...sets[1]]);
  const both = new Set([...sets[0]].filter((a) => sets[1].has(a)));
  const chosen = pool === 'ortak' && both.size ? both : union;
  if (!chosen.size) return { tracks: listTracks(data), weights: (data && data.weights) || {} };
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
  const weightOf = (t) => {
    const w = table.get(normKey(t.a)) || 1;
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
