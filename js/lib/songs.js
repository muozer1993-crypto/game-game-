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

/** Bands (normKey) none of whose songs can play a clip: marked in the picker of a game that needs the sound. */
export function silentArtists(data) {
  const sound = new Set();
  const all = new Set();
  for (const t of allTracks(data)) { const k = normKey(t.a); all.add(k); if (hasAudio(t)) sound.add(k); }
  return new Set([...all].filter((k) => !sound.has(k)));
}

/** Every band the players can pick, flat and sorted. */
export const catalogArtists = (data) => sortNames(pickGroups(data).flatMap((g) => g.artists));

/**
 * The songs a game draws from, mixed from the ticked sources: each source gets an equal share of
 * the draws whatever its size; within a source songs are equal (the first person's list keeps its
 * favourite weights, picked bands their per-player balance). A song in several sources adds up.
 * @param {object} data
 * With `needAudio` songs without a clip are left out first, so a source that has none (bands picked
 * whose songs have no sound) falls back like an empty one instead of leaving nothing to draw.
 * @param {{ sources?: object, favor?: string, picks?: string[][], pickMode?: string, needAudio?: boolean }} opts
 * @returns {{ tracks: object[], weights: object, perSong: true, shares: object }}
 */
export function mixPool(data, { sources = {}, favor = 'high', picks = [[], []], pickMode = 'birlesim', needAudio = false } = {}) {
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
    const p = poolFor(data, { pool: pickMode === 'ortak' ? 'ortak' : 'secim', picks, needAudio });
    if (p.tracks.length) parts.push({ tracks: p.tracks, weightOf: (t) => p.weights[t.a] || 1, shares: p.shares });
  }
  if (needAudio) for (const p of parts) p.tracks = p.tracks.filter(hasAudio);
  const live = parts.filter((p) => p.tracks.length);
  if (!live.length) return { tracks: listTracks(data, 1).filter((t) => !needAudio || hasAudio(t)), weights: {}, perSong: true, shares: {} };
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
  const shares = {}; // picked bands: each one's part of all the draws (pickSongs lets a big part come up often)
  for (const part of live) for (const [a, x] of Object.entries(part.shares || {})) shares[a] = (shares[a] || 0) + x / live.length;
  return { tracks: [...byKey.values()], weights, perSong: true, shares };
}

/**
 * One named pool (used by mixPool and the tests). pool 'liste': the personal list with its
 * favourite weights. 'secim': every song of a band either player picked. 'ortak': only bands both
 * picked. Empty picks fall back to the wider choice, then to the list. With `needAudio` ('secim',
 * 'ortak') only songs with a clip count, and a picked band none of whose songs can play counts as
 * not picked: its player's other bands share that player's half, a shared one is no shared band.
 * @returns {{ tracks: object[], weights: object }}
 */
export function poolFor(data, { pool = 'liste', picks = [[], []], needAudio = false } = {}) {
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
  const sound = needAudio ? new Set(allTracks(data).filter(hasAudio).map((t) => normKey(t.a))) : null;
  const sets = [0, 1].map((i) => new Set((Array.isArray(picks[i]) ? picks[i] : []).map(normKey).filter((a) => !sound || sound.has(a))));
  const union = new Set([...sets[0], ...sets[1]]);
  const both = new Set([...sets[0]].filter((a) => sets[1].has(a)));
  const chosen = pool === 'ortak' && both.size ? both : union;
  if (!chosen.size) return { tracks: listTracks(data, 1), weights: (data && data.weights) || {} };
  const tracks = allTracks(data).filter((t) => chosen.has(normKey(t.a)) && (!needAudio || hasAudio(t)));
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
  const shares = {}; // each band's part of the draws (0–1): a player's only band holds half
  for (const [a, x] of share) shares[a] = x / 2;
  return { tracks, weights, shares };
}

/**
 * 'Yalnız ikimizin de seçtiği gruplar' found no band both picked (with sound, when the game needs
 * it), so every picked band plays: the games say so when the first song comes up.
 */
export function noSharedPick(data, picks = [[], []], needAudio = false) {
  const sound = needAudio ? new Set(allTracks(data).filter(hasAudio).map((t) => normKey(t.a))) : null;
  const sets = [0, 1].map((i) => new Set((Array.isArray(picks[i]) ? picks[i] : []).map(normKey).filter((a) => !sound || sound.has(a))));
  if (!sets[0].size && !sets[1].size) return false; // nobody picked: the lists play, nothing to explain
  return ![...sets[0]].some((a) => sets[1].has(a));
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
  // a picked band that holds a big part of the draws (a player's only band) may come up as often as
  // its part asks for, and back to back
  const shareOf = (a) => Number((data && data.shares && data.shares[a]) || 0);
  const capOf = (a) => Math.max(cap, Math.ceil(count * shareOf(a)));
  const perArtist = new Map();
  const used = new Set();
  const picked = [];
  const n = Math.min(count, tracks.length);
  while (picked.length < n) {
    const last = picked.length ? normKey(picked[picked.length - 1].a) : null;
    const free = tracks.filter((t) => !used.has(t));
    let pool = free.filter((t) => (perArtist.get(normKey(t.a)) || 0) < capOf(normKey(t.a)) && (normKey(t.a) !== last || shareOf(last) * 3 >= 1));
    if (!pool.length) pool = free.filter((t) => (perArtist.get(normKey(t.a)) || 0) < capOf(normKey(t.a)));
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

/**
 * Too few songs in the ticked sources (a couple of small bands picked): fill `all` up to `want` from
 * both lists, so the game has its full length and its reserve. Deterministic from the seed.
 */
export function topUp(all, data, { favor = 'high', seed = 1 } = {}, want, needAudio = false) {
  if (all.length >= want) return all;
  const have = new Set(all.map((x) => normKey(`${x.a}|${x.t}`)));
  const wide = mixPool(data, { sources: { srcMustafa: true, srcBeyza: true }, favor, needAudio });
  const tracks = wide.tracks.filter((t) => !have.has(normKey(`${t.a}|${t.t}`)) && (!needAudio || hasAudio(t)));
  if (tracks.length) all.push(...pickSongs({ ...wide, tracks }, { count: want - all.length, favor: 'high', seed: seed + 1, needAudio }));
  return all;
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
const trCache = new WeakMap(); // data -> { bands: Set of Turkish bands (normKey), titles: Map title key -> bool }
// common Turkish words: a title with one of them is Turkish even without ğ, ı or ş
// (only words other languages hardly use: no "her", "son", "de", "mi", "once", "gun", "ask")
const TR_WORDS = new Set(('bir sen biz siz bu şu gibi için icin değil degil yok beni seni bana sana aşk gönül gonul '
  + 'yarim olmaz olsun oldu kadar gece gün dünya dunya hayat sevda canım canim kalp yalan zaman neden hep hiç hic çok cok '
  + 'sonra önce şimdi simdi benim senin bizim yine artık artik güzel guzel yalnız yalniz ağla agla ölüm ölmeden olmeden '
  + 'gönlümü verdim sevgilim seviyorum sevdim gitme kal kimse hadi vur merhaba gurbet').split(' '));
/** Turkish verb and plural endings on a word of five letters or more ("Bilmez", "Gidiyorum", "Yolları"). */
const TR_SUFFIX = /[a-zçğıöşü]{2,}(?:iyor|ıyor|uyor|üyor|iyorum|ıyorum|uyorum|üyorum|mez|maz|ları|leri|ların|lerin|lerim|larım)(?![a-zçğıöşü])/;
/** Letter groups and words Turkish does not use: an English, German, Nordic or Portuguese title. */
// (not "ll", "tt" or "ee": Turkish has "Telli", "Gitti", "Teessüf")
const FOREIGN = /th|w|x|q|ä|å|ø|æ|ß|ñ|ã|õ|é|è|à|á|í|ó|ú|sch|ch|ck|ff|ph|uo|ei|ou|ea|oo|oe|ae|au|ung(?!\p{L})|heit|keit|heten(?!\p{L})/iu;
// (word edges are any letter, Turkish ones too: "Paramparça" has no English "a" in it)
const EN_WORD = /(^|[^\p{L}])(the|you|your|my|me|love|of|and|to|in|is|it|on|all|not|we|be|for|with|this|that|i|a|an)(?!\p{L})/iu;
const EN_LONG = /(^|[^\p{L}])(the|you|your|love|and|all|not|for|with|this|that)(?!\p{L})/iu;
// common Swedish, Norwegian and German words: "Försök till Förstörelse" has ö but is not Turkish
const NORDIC_WORD = /(^|[^\p{L}])(till|och|att|det|som|med|för|är|på|og|av|af|und|der|die|das|ein|eine|mit|von|zu|ist|nicht|auf|aus|für|über|im)(?!\p{L})/iu;
const STRONG_FOREIGN = /th|w|x|q|ä|å|ø|æ|ß|ñ|ã|õ|é|è|à|á|í|ó|ú/i;
const clearlyTurkish = (title) => /[ğışĞİŞ]/.test(title)
  || String(title).toLocaleLowerCase('tr-TR').split(/[^a-zçğıöşüâîû]+/).some((w) => TR_WORDS.has(w));

/**
 * Is this song sung in Turkish? Its title uses ğ, ı, ş or İ, or a common Turkish word. Otherwise a
 * title with a foreign mark (th, w, ou, ä, "the", "you"…) is not; a plain one is when it has ç, ö or
 * ü, or when its band is Turkish (the Turkish catalog, another clearly Turkish title, or Turkish
 * letters ğ ı ş İ in the band's name). So "Gökhan Kırdar — Pleasure" is English and "Hüseyin Altın —
 * Merhaba Gurbet" Turkish, while "Kall — Försök till Förstörelse" is not.
 */
function turkishSong(data, t) {
  if (!data || typeof data !== 'object') return false;
  let c = trCache.get(data);
  if (!c) {
    // a Turkish band: the Turkish catalog, ğ ı ş İ in its name (not ö/ü/ç: "Örnatorpet"), or at least
    // half of its titles clearly Turkish (one Romanian "şi" does not make Rotting Christ Turkish)
    const catalog = new Set(((data.catalogTR) || []).map(normKey));
    const bands = new Set(catalog);
    const tally = new Map(); // band -> [clearly Turkish titles, titles]
    for (const x of allTracks(data)) {
      const k = normKey(x.a);
      if (/[ğışİĞŞ]/.test(x.a)) bands.add(k);
      const n = tally.get(k) || [0, 0];
      n[0] += clearlyTurkish(x.t) ? 1 : 0;
      n[1] += 1;
      tally.set(k, n);
    }
    for (const [k, [tr, all]] of tally) if (tr * 2 >= all) bands.add(k);
    c = { catalog, bands, titles: new Map() };
    trCache.set(data, c);
  }
  const key = `${normKey(t.a)}|${t.t}`;
  let hit = c.titles.get(key);
  if (hit === undefined) {
    const title = String(t.t || '');
    if (clearlyTurkish(title)) hit = true;
    // a band of the Turkish catalog: its plain titles are Turkish ("Of", "Vay Be", "Yolla")
    else if (c.catalog.has(normKey(t.a)) && !STRONG_FOREIGN.test(title) && !EN_LONG.test(title)) hit = true;
    else if (FOREIGN.test(title) || EN_WORD.test(title) || NORDIC_WORD.test(title) || !/[a-zçöü]/i.test(title)) hit = false; // (Greek, Cyrillic…: not Turkish)
    else hit = /[çöüÇÖÜ]/.test(title) || TR_SUFFIX.test(title.toLocaleLowerCase('tr-TR')) || c.bands.has(normKey(t.a));
    c.titles.set(key, hit);
  }
  return hit;
}

export function songOptions(data, song, seed, n = 4) {
  const rng = createRng(seed);
  const all = allTracks(data);
  const same = shuffle(rng, [...new Set(all.filter((t) => normKey(t.a) === normKey(song.a) && normKey(t.t) !== normKey(song.t)).map((t) => t.t))]);
  let picked = same.slice(0, n - 1);
  if (picked.length < n - 1) {
    // a band with few songs: the other names come from bands of the same language first, so a
    // Turkish title among English ones does not give the answer away
    const turkish = (t) => turkishSong(data, t);
    const mine = turkish(song);
    const others = all.filter((t) => normKey(t.a) !== normKey(song.a) && normKey(t.t) !== normKey(song.t));
    const titles = (list) => [...new Set(list.map((t) => t.t))];
    const near = shuffle(rng, titles(others.filter((t) => turkish(t) === mine)));
    const far = shuffle(rng, titles(others.filter((t) => turkish(t) !== mine)));
    const rest = [...new Set([...near, ...far])].filter((t) => !picked.includes(t));
    picked = picked.concat(rest.slice(0, n - 1 - picked.length));
  }
  return shuffle(rng, [song.t, ...picked]);
}

// ----------------------------------------------------------------- typed answers (Şarkıyı Bil)
// (µ is the micro sign of "µ-Ziq", not Greek mu: a Greek name keeps its letters)
const LETTER_MAP = { 'ı': 'i', 'ø': 'o', 'æ': 'ae', 'ß': 'ss', 'ł': 'l', 'đ': 'd', 'þ': 'th', 'ð': 'd', 'œ': 'oe', 'ə': 'e', 'µ': 'mu' };
// Russian/Ukrainian band and song names: typed in Latin letters (or as written) they still match
const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
  ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', // Kazakh
};

const normCache = new Map(); // the same few thousand names are compared again and again

/** Lower-case ASCII skeleton of a band or song name: accents, punctuation, "(…)" and " - …" tails dropped, a leading "the" too. */
export function normalizeAnswer(s) {
  const raw = String(s || '');
  let hit = normCache.get(raw);
  if (hit === undefined) {
    if (normCache.size > 50000) normCache.clear();
    hit = normalizeRaw(raw);
    normCache.set(raw, hit);
  }
  return hit;
}

function normalizeRaw(s) {
  let x = String(s || '').replace(/İ/g, 'i').replace(/I/g, 'i').toLowerCase();
  x = x.replace(/[ıøæßłđþðœəµ]/g, (c) => LETTER_MAP[c] || c);
  x = x.replace(/[а-яёіїєґәғқңөұүһ]/g, (c) => CYRILLIC[c] ?? c);
  x = x.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  x = x.replace(/\s+-\s+.*$/, '');
  const bare = x.replace(/[([].*?[)\]]/g, ' ');
  if (bare.trim()) x = bare; // a title that is all "(…)" ("(A)") keeps what is inside
  x = x.replace(/&/g, ' and ').replace(/['’`´]/g, '');
  const ascii = x.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  if (ascii) return ascii.replace(/^the /, '');
  // a name in another script (Greek…) or of symbols only ("!!!"): compare it as written
  return x.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ') || x.replace(/\s+/g, '');
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

const ROMAN = /^(?:x{0,3})(?:ix|iv|v?i{0,3})$/;
const ROMAN_VALUE = { i: 1, v: 5, x: 10 };
const romanValue = (r) => [...r].reduce((n, c, k) => n + (ROMAN_VALUE[r[k + 1]] > ROMAN_VALUE[c] ? -1 : 1) * ROMAN_VALUE[c], 0);
const numCache = new Map();
/** normalizeAnswer with a closing Roman numeral as digits: "Unforgiven II" and "Unforgiven 2" are one song. */
const norm = (s) => {
  const n = normalizeAnswer(s);
  let hit = numCache.get(n);
  if (hit === undefined) {
    if (numCache.size > 50000) numCache.clear();
    // a numeral of two letters or more anywhere ("Ruun II The Epitaph"), a single i/v/x only at the
    // end (so the pronoun "I" inside a title stays a word)
    hit = n.replace(/(^| )([ivx]{2,})(?= |$)/g, (m, sp, r) => (ROMAN.test(r) ? `${sp}${romanValue(r)}` : m))
      .replace(/ ([ivx])$/, (m, r) => ` ${romanValue(r)}`);
    numCache.set(n, hit);
  }
  return hit;
};
const numbersOf = (x) => (x.match(/\d+/g) || []).map(Number);
/** "II", "ii" or "2" as a number (other letters as written, lower case). */
const numeralValue = (tok) => {
  const t = String(tok).toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  return ROMAN.test(t) && t ? romanValue(t) : t;
};
/**
 * A different number never matches: the answer's own numbers must be typed ("Unforgiven II" is not
 * "Unforgiven"), and a typed number must be in the full title, "(…)" and " - …" parts included
 * ("Eternity Part 2" is "Eternity (Part 2)", "Eternity Part 1" is not).
 */
const numbersAgree = (a, b, answer) => {
  const typed = numbersOf(a);
  if (!numbersOf(b).every((n) => typed.includes(n))) return false;
  if (!typed.length) return true;
  // each part of the full title on its own, so that a numeral closing any part counts
  // ("Ruun II - The Epitaph", "Devour Me, Colossus - Part I - Blackholes")
  const raw = String(answer || '');
  const whole = [
    ...numbersOf(b),
    ...numbersOf(norm(raw.replace(/[()[\]]/g, ' ').replace(/\s+-\s+/g, ' '))), // the title flattened: "Clutch of Oblivion (I)"
    ...raw.split(/\s+-\s+|[()[\]]/).flatMap((part) => numbersOf(norm(part))),
  ];
  return typed.every((n) => whole.includes(n));
};

/**
 * Does a typed answer name the band or song? Spelling slips are forgiven in proportion to the
 * length (none under 5 letters, up to 3 for long names); extra words around the answer are fine,
 * and the start of a long title counts when it covers most of it. A different number never matches.
 */
export function answerMatches(typed, answer) {
  return numberedMatch(typed, answer) || plainMatch(typed, answer);
}

/**
 * The comparison as it was before Roman numerals were read as numbers: a slip that happens to make a
 * Roman word ("İi Yabancı", "Since I'v Been…", "Xi Xiu"), the band typed in front ("The xx Intro") or
 * a short title with a closing numeral ("Revlot III") is still forgiven. A different number still
 * never matches (the digits and a closing Roman word must be the same).
 */
const plainNumbers = (x) => {
  const w = x.split(' ');
  const last = w.length > 1 && ROMAN.test(w[w.length - 1]) ? w[w.length - 1] : '';
  return `${(x.match(/\d+/g) || []).map(Number).join(',')}|${last}`;
};
/** The Roman words of a name, as norm() reads them: two letters or more anywhere, one at the end. */
const romanWords = (x) => {
  const w = x.split(' ');
  return w.filter((t, k) => t && ROMAN.test(t) && (t.length >= 2 || (k === w.length - 1 && w.length > 1))).join(',');
};
/**
 * A title with a track number in front ("II - Bloodbirds"): a numeral typed in front that is not the
 * title's own first word must be that number ("III Bloodbirds" is another track; "I Fly Among the
 * Stars" for "II - I Fly Among the Stars" keeps its "I").
 */
function sameLead(typed, numeral, title) {
  const lead = String(typed || '').match(/^\s*([ivxlc]+|\d+)(?=[\s.:-])/i);
  if (!lead || normalizeAnswer(lead[1]) === normalizeAnswer(title).split(' ')[0]) return true;
  return numeralValue(lead[1]) === numeralValue(numeral);
}

function plainMatch(typed, answer) {
  const a = normalizeAnswer(typed);
  const b = normalizeAnswer(answer);
  if (!a || !b) return false;
  if (a === b) return true;
  const dash = String(answer || '').match(/^\s*([ivxlc]+|\d+)\s+-\s+(.+)$/i);
  if (dash) {
    if (sameLead(typed, dash[1], dash[2]) && plainMatch(typed, dash[2])) return true;
  }
  // a track number with "." or ":" ("v. Sverddans"): a numeral typed in front must be the same one
  const dotted = String(answer || '').match(/^\s*([ivx]+|\d+)\s*[.:]\s+(.+)$/i);
  if (dotted && !sameLead(typed, dotted[1], dotted[2])) return false;
  if (plainNumbers(a) !== plainNumbers(b)) return false;
  // an answer with Roman numbers of its own ("VI Coactus", "Libera, Pt. Ii") takes no other ones here:
  // only a title without them forgives a slip that happens to make one ("İi Yabancı")
  const rb = romanWords(b);
  if (rb && romanWords(a) !== rb) return false;
  const tol = b.length < 5 ? 0 : b.length < 9 ? 1 : b.length < 13 ? 2 : 3;
  if (editDistance(a, b) <= tol) return true;
  if (b.length >= 4 && ` ${a} `.includes(` ${b} `)) return true;
  if (a.length >= 4 && b.startsWith(a) && a.length >= Math.ceil(b.length * 0.6)) return true;
  return false;
}

/** Roman numerals read as numbers: "Unforgiven 2" is "The Unforgiven II", "Ruun 2 The Epitaph" counts. */
function numberedMatch(typed, answer) {
  const a = norm(typed);
  const b = norm(answer);
  if (!a || !b) return false;
  if (a === b) return true;
  // "II - I Fly Among the Stars": the part after a leading numeral is the title people know
  // a leading track number: "II - X", "ii. X", "IV: X" (the title people know is X)
  // (with "." or ":" only i/v/x or digits, and a space after it: "C. F. Bundy", "L.A. Woman" stay as they are)
  const dash = String(answer || '').match(/^\s*([ivxlc]+|\d+)\s+-\s+(.+)$/i)
    || String(answer || '').match(/^\s*([ivx]+|\d+)\s*[.:]\s+(.+)$/i);
  if (dash) {
    if (sameLead(typed, dash[1], dash[2]) && answerMatches(typed, dash[2])) return true;
    // typed with its numeral too ("II Bloodbirds", "2 - Bloodbirds"): the same number, then the title
    const lead = String(typed || '').match(/^\s*([ivxlc]+|\d+)\s*(?:[-.:]\s*|\s+)(.+)$/i);
    if (lead && numeralValue(lead[1]) === numeralValue(dash[1]) && answerMatches(lead[2], dash[2])) return true;
  }
  if (!numbersAgree(a, b, answer)) return false;
  const tol = b.length < 5 ? 0 : b.length < 9 ? 1 : b.length < 13 ? 2 : 3;
  if (editDistance(a, b) <= tol) return true;
  if (b.length >= 4 && ` ${a} `.includes(` ${b} `)) return true; // whole words: "Shed" is not in "Vanished"
  if (a.length >= 4 && b.startsWith(a) && a.length >= Math.ceil(b.length * 0.6)) return true;
  return false;
}

/**
 * answerMatches, but an answer that names another candidate better is not taken: "Liberation" is
 * Katatonia's other song, not a slip for "Deliberation"; "Death Cab for Cutie" is not "Death".
 */
function bestMatch(typed, answer, others) {
  if (!answerMatches(typed, answer)) return false;
  const a = norm(typed);
  const b = norm(answer);
  if (a === b) return true;
  const flat = (x) => x.replace(/ /g, '');
  const d = editDistance(a, b);
  return !others.some((o) => {
    const c = norm(o);
    if (!c || flat(c) === flat(b) || Math.abs(c.length - a.length) >= d) return false; // cannot be closer
    return answerMatches(typed, o) && editDistance(a, c) < d;
  });
}

/** Does the typed song title name this song (and not another song by the same band)? */
export function titleMatches(data, song, typed) {
  const same = allTracks(data).filter((t) => normKey(t.a) === normKey(song.a)).map((t) => t.t);
  return bestMatch(typed, song.t, same);
}

/** Does the typed band name this song's band (and not another band in the data)? */
export function artistMatches(data, song, typed) {
  return bestMatch(typed, song.a, [...new Set(allTracks(data).map((t) => t.a))]);
}
