// Song pool helpers shared by Şarkı Süresi and Şarkıyı Bil (pure functions, no DOM).
//
// data/sarkilar.json: { weights: { artist: w }, catalog: [artist…], tracks: [{ a, t, s, dz?, p?, np?, g }] }
//   a artist, t title, s length in seconds, p Spotify preview url (does not expire), dz Deezer track id
//   (its preview url is fetched when a clip is played), np: no preview anywhere, g: where the song
//   comes from — 'sp' the Spotify list, 'mix' the exported mix list, 'fav' a favourite band's albums,
//   'fr' the friend's playlists, 'top' the broad catalog (an index band's most popular songs), 'tr'
//   well-known Turkish songs; catalog songs are only used when a pool asks for them. w: whose list
//   the song is on — bit 1 the first person (people[0]), bit 2 the second (people[1]); catalog songs
//   carry no w. people: the two names; catalog / catalogTR: the bands of the two catalogs.
import { createRng, shuffle } from './rng.js';
import { nameSuffix } from './tr.js';

export const normKey = (s) => String(s || '').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();

/** Can a clip be played for this song? */
export const hasAudio = (t) => !!(t && (t.p || (t.dz && !t.np)));

/** 257 → "4:17" */
export const fmt = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

/** The song sources a game can mix; each one ticked gets an equal share of the draws. */
export const SOURCES = [
  { key: 'srcMustafa', label: "Mustafa'nın listesi", default: true },
  { key: 'srcYakin', label: "Mustafa'nın listesinden Beyza'ya yakınlar (Türkçe, bilinenler)", default: false },
  { key: 'srcBeyza', label: "Beyza'nın listeleri", default: true },
  { key: 'srcOrtak', label: '"beyz ve mu" ortak listesi', default: false },
  { key: 'srcTurkce', label: "Bilinen Türkçe şarkılar (90'lar, 2000'ler)", default: false },
  { key: 'srcSecim', label: 'Dinlediğimiz gruplar (oyun başında seçilir)', default: false },
];
export const PICK_OPTIONS = [
  { value: 'birlesim', label: 'İkimizin seçtikleri (yarı yarıya)' },
  { value: 'ortak', label: 'Yalnız ikimizin de seçtiği gruplar' },
];
/** Settings entries both games show for the sources. */
export const sourceSettings = () => [
  ...SOURCES.map((s) => ({ key: s.key, label: s.label, type: 'toggle', default: s.default })),
  { key: 'pickMode', label: 'Grup seçimi nasıl birleşsin', type: 'select', default: 'birlesim', options: PICK_OPTIONS, help: 'Yalnız "Dinlediğimiz gruplar" işaretliyken.' },
  {
    key: 'favor', label: "Favori gruplar (Mustafa'nın listesinde)", type: 'select', default: 'high',
    options: [{ value: 'high', label: 'Çok çıksın' }, { value: 'mid', label: 'Biraz daha sık çıksın' }, { value: 'none', label: 'Herkes eşit' }],
    help: 'Katatonia, Opeth, Anathema, Antimatter ve benzerleri daha sık gelir.',
  },
];
/** The source flags out of a game's options (every flag off → the first person's list). */
export function sourcesFrom(options = {}) {
  const out = {};
  for (const s of SOURCES) out[s.key] = !!options[s.key];
  if (!Object.values(out).some(Boolean)) out.srcMustafa = true;
  return out;
}
export const needsPick = (sources) => !!(sources && sources.srcSecim);

const allTracks = (data) => (data && Array.isArray(data.tracks) ? data.tracks : []).filter((t) => t && t.a && t.t && Number(t.s) >= 30);

/** Whose list a song is on: bit 1 the first person, bit 2 the second. A song without w is the first person's unless it is a catalog song. */
export const whoHas = (t) => (t.w != null ? Number(t.w) : (t.g === 'top' || t.g === 'tr' ? 0 : 1));

/** Songs on person `who`'s list (bit 1 the first person, bit 2 the second); without `who`: anyone's list. */
export const listTracks = (data, who = 3) => allTracks(data).filter((t) => whoHas(t) & who);

/** Bands on both people's lists (normalised names). */
export function commonArtists(data) {
  const on = (bit) => new Set(listTracks(data, bit).map((t) => normKey(t.a)));
  const a = on(1);
  return new Set([...on(2)].filter((x) => a.has(x)));
}

const sortNames = (names) => [...new Set(names)].sort((x, y) => x.localeCompare(y, 'tr'));

/**
 * The bands the players pick from, in sections: the second person's list, the first person's list
 * (bands with a few songs or a favourite weight), well-known Turkish names, then the broad catalog.
 * A band appears once, in the first section it belongs to.
 * @returns {{ title: string, artists: string[] }[]}
 */
export function pickGroups(data) {
  const people = (data && Array.isArray(data.people) && data.people.length === 2) ? data.people : ['1. oyuncu', '2. oyuncu'];
  const count = (bit) => { const m = new Map(); for (const t of listTracks(data, bit)) m.set(t.a, (m.get(t.a) || 0) + 1); return m; };
  const mine = count(1);
  const theirs = count(2);
  const weighted = new Set(Object.keys((data && data.weights) || {}).map(normKey));
  const seen = new Set();
  const groups = [];
  const add = (title, names) => {
    const list = sortNames(names).filter((a) => !seen.has(normKey(a)));
    if (!list.length) return;
    list.forEach((a) => seen.add(normKey(a)));
    groups.push({ title, artists: list });
  };
  add(`${nameSuffix(people[1], 'in')} listesi`, [...theirs.keys()]);
  add(`${nameSuffix(people[0], 'in')} listesi`, [...mine].filter(([a, n]) => n >= 5 || weighted.has(normKey(a))).map(([a]) => a));
  add('Türkçe (bilinenler)', (data && Array.isArray(data.catalogTR)) ? data.catalogTR.map(String) : []);
  add('Katalog', (data && Array.isArray(data.catalog)) ? data.catalog.map(String) : []);
  // the long tail of the first list (2–4 songs) is there for the search box only
  const tail = [...mine].filter(([a, n]) => n >= 2 && !seen.has(normKey(a))).map(([a]) => a);
  if (tail.length) { tail.forEach((a) => seen.add(normKey(a))); groups.push({ title: 'Diğer (ara)', artists: sortNames(tail), searchOnly: true }); }
  if (!groups.length) { // no lists at all: any band with a few songs
    const counts = new Map();
    for (const t of allTracks(data)) counts.set(t.a, (counts.get(t.a) || 0) + 1);
    add('Gruplar', [...counts].filter(([, n]) => n >= 5).map(([a]) => a));
  }
  return groups;
}

/** Every band the players can pick, flat and sorted. */
export const catalogArtists = (data) => sortNames(pickGroups(data).flatMap((g) => g.artists));

/**
 * The songs a game draws from, mixed from the ticked sources: each source gets an equal share of
 * the draws whatever its size; within a source songs are equal (the first person's list keeps its
 * favourite weights, picked bands their per-player balance). A song in several sources adds up.
 * @param {object} data
 * @param {{ sources?: object, favor?: string, picks?: string[][], pickMode?: string }} opts
 * @returns {{ tracks: object[], weights: object, perSong: true }}
 */
export function mixPool(data, { sources = {}, favor = 'high', picks = [[], []], pickMode = 'birlesim' } = {}) {
  const parts = [];
  const favTable = new Map();
  for (const [k, v] of Object.entries((data && data.weights) || {})) if (Number(v) > 0) favTable.set(normKey(k), Number(v));
  const favOf = (t) => { const w = favTable.get(normKey(t.a)) || 1; return favor === 'none' ? 1 : favor === 'mid' ? Math.sqrt(w) : w; };
  if (sources.srcMustafa) parts.push({ tracks: listTracks(data, 1), weightOf: favOf });
  if (sources.srcYakin) parts.push({ tracks: listTracks(data, 1).filter((t) => t.y), weightOf: () => 1 });
  if (sources.srcBeyza) parts.push({ tracks: listTracks(data, 2), weightOf: () => 1 });
  if (sources.srcOrtak) parts.push({ tracks: allTracks(data).filter((t) => t.j), weightOf: () => 1 });
  if (sources.srcTurkce) parts.push({ tracks: poolFor(data, { pool: 'turkce' }).tracks, weightOf: () => 1 });
  if (sources.srcSecim) {
    const p = poolFor(data, { pool: pickMode === 'ortak' ? 'ortak' : 'secim', picks });
    if (p.tracks.length) parts.push({ tracks: p.tracks, weightOf: (t) => p.weights[t.a] || 1 });
  }
  const live = parts.filter((p) => p.tracks.length);
  if (!live.length) return { tracks: listTracks(data, 1), weights: {}, perSong: true };
  const byKey = new Map();
  const weights = {};
  for (const part of live) {
    let total = 0;
    for (const t of part.tracks) total += part.weightOf(t);
    for (const t of part.tracks) {
      const k = `${t.a}|${t.t}`;
      if (!byKey.has(k)) byKey.set(k, t);
      weights[k] = (weights[k] || 0) + (1000 / live.length) * (part.weightOf(t) / total);
    }
  }
  return { tracks: [...byKey.values()], weights, perSong: true };
}

/**
 * One named pool (used by mixPool and the tests). pool 'liste': the personal list with its
 * favourite weights. 'secim': every song of a band either player picked. 'ortak': only bands both
 * picked. Empty picks fall back to the wider choice, then to the list.
 * @returns {{ tracks: object[], weights: object }}
 */
export function poolFor(data, { pool = 'liste', picks = [[], []] } = {}) {
  if (pool === 'arkadas') return { tracks: listTracks(data, 2), weights: {} };
  if (pool === 'ikisi') {
    // every song (both lists and the catalogs) by a band on both lists; the bands share the draws
    // equally whatever their song counts, and a song on both lists weighs 3× within its band
    const common = commonArtists(data);
    const tracks = allTracks(data).filter((t) => common.has(normKey(t.a)));
    if (tracks.length < 10) return { tracks: listTracks(data, 3), weights: {} }; // too little in common: both lists together
    const counts = new Map();
    for (const t of tracks) counts.set(normKey(t.a), (counts.get(normKey(t.a)) || 0) + 1);
    const weights = {};
    for (const t of tracks) weights[`${t.a}|${t.t}`] = (1000 / counts.get(normKey(t.a))) * (whoHas(t) === 3 ? 3 : 1);
    return { tracks, weights, perSong: true };
  }
  if (pool === 'yakin') { // songs of the first list flagged y at build time (Turkish, popular, the second person's taste)
    const tracks = listTracks(data, 1).filter((t) => t.y);
    return { tracks: tracks.length ? tracks : listTracks(data, 1), weights: {} };
  }
  if (pool === 'turkce') {
    const names = new Set(((data && data.catalogTR) || []).map(normKey));
    const tracks = allTracks(data).filter((t) => names.has(normKey(t.a)));
    return { tracks: tracks.length ? tracks : listTracks(data, 3), weights: {} };
  }
  if (pool !== 'secim' && pool !== 'ortak') return { tracks: listTracks(data, 1), weights: (data && data.weights) || {} };
  const sets = [0, 1].map((i) => new Set((Array.isArray(picks[i]) ? picks[i] : []).map(normKey)));
  const union = new Set([...sets[0], ...sets[1]]);
  const both = new Set([...sets[0]].filter((a) => sets[1].has(a)));
  const chosen = pool === 'ortak' && both.size ? both : union;
  if (!chosen.size) return { tracks: listTracks(data, 1), weights: (data && data.weights) || {} };
  const tracks = allTracks(data).filter((t) => chosen.has(normKey(t.a)));
  // each player's picks get half of the draws, split equally between their bands whatever their
  // song counts; a band both picked collects a share from both sides, so it comes up more
  const counts = new Map();
  for (const t of tracks) counts.set(normKey(t.a), (counts.get(normKey(t.a)) || 0) + 1);
  const share = new Map();
  for (const set of sets) {
    const bands = [...set].filter((a) => counts.has(a));
    for (const a of bands) share.set(a, (share.get(a) || 0) + 1 / bands.length);
  }
  const weights = {};
  for (const t of tracks) weights[t.a] = (1000 * (share.get(normKey(t.a)) || 0)) / counts.get(normKey(t.a));
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
