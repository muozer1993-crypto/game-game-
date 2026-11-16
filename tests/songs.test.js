import { test, assert } from './runner.js';
import { poolFor, mixPool, sourcesFrom, needsPick, pickSongs, catalogArtists, pickGroups, artistOptions, songOptions, listTracks, hasAudio, commonArtists, normalizeAnswer, editDistance, answerMatches, titleMatches, artistMatches, topUp, silentArtists, noSharedPick } from '../js/lib/songs.js';

const data = {
  weights: { Katatonia: 3 },
  catalog: ['Katatonia', 'Metallica', 'Opeth', 'Tool'],
  tracks: [
    ...Array.from({ length: 6 }, (_, i) => ({ a: 'Katatonia', t: `Kata ${i}`, s: 200 + i, dz: 1 + i, g: 'fav' })),
    ...Array.from({ length: 6 }, (_, i) => ({ a: 'Opeth', t: `Opeth ${i}`, s: 400 + i, dz: 100 + i, g: 'fav' })),
    ...Array.from({ length: 5 }, (_, i) => ({ a: 'Mix Band', t: `Mix ${i}`, s: 180 + i, p: 'https://p.scdn.co/x', g: 'mix' })),
    ...Array.from({ length: 8 }, (_, i) => ({ a: 'Metallica', t: `Met ${i}`, s: 300 + i, dz: 200 + i, g: 'top' })),
    ...Array.from({ length: 8 }, (_, i) => ({ a: 'Tool', t: `Tool ${i}`, s: 500 + i, dz: 300 + i, g: 'top' })),
    { a: 'Silent', t: 'No audio', s: 100, dz: 999, np: 1, g: 'mix' },
  ],
};

test('şarkı havuzu: hazır liste katalog şarkılarını almaz, seçim birleşim, ortak kesişim', () => {
  const liste = poolFor(data, { pool: 'liste' });
  assert.ok(liste.tracks.every((t) => t.g !== 'top'), 'the broad catalog stays out of the personal list');
  assert.equal(liste.tracks.length, 18);
  assert.deepEqual(liste.weights, { Katatonia: 3 });
  const secim = poolFor(data, { pool: 'secim', picks: [['Metallica', 'tool'], ['Tool', 'Katatonia']] });
  assert.deepEqual([...new Set(secim.tracks.map((t) => t.a))].sort(), ['Katatonia', 'Metallica', 'Tool']);
  // each player's picks get half of the draws, split equally between their bands: A = Metallica + Tool, B = Tool + Katatonia
  const bandTotal = (pool, a) => pool.weights[a] * pool.tracks.filter((t) => t.a === a).length;
  assert.equal(Math.round(bandTotal(secim, 'Metallica')), 500);
  assert.equal(Math.round(bandTotal(secim, 'Katatonia')), 500);
  assert.equal(Math.round(bandTotal(secim, 'Tool')), 1000, 'a band both picked collects a share from both sides (case-insensitive)');
  const ortak = poolFor(data, { pool: 'ortak', picks: [['Metallica', 'Tool'], ['Tool', 'Katatonia']] });
  assert.deepEqual([...new Set(ortak.tracks.map((t) => t.a))], ['Tool']);
  assert.deepEqual(Object.keys(ortak.weights), ['Tool'], 'equal shares per band, here a single band');
  const noCommon = poolFor(data, { pool: 'ortak', picks: [['Metallica'], ['Tool']] });
  assert.deepEqual([...new Set(noCommon.tracks.map((t) => t.a))].sort(), ['Metallica', 'Tool'], 'no common band: the union is used');
  const nothing = poolFor(data, { pool: 'secim', picks: [[], null] });
  assert.equal(nothing.tracks.length, 18, 'nobody picked: back to the personal list');
  assert.deepEqual(catalogArtists(data), ['Katatonia', 'Metallica', 'Mix Band', 'Opeth', 'Tool']);
  assert.deepEqual(catalogArtists({ tracks: data.tracks }), ['Katatonia', 'Mix Band', 'Opeth'], 'without a catalog list: the list bands with 5+ songs; catalog songs are not pickable');
  assert.equal(listTracks(data).length, 18);
  assert.ok(!hasAudio({ a: 'x', t: 'y', s: 1, dz: 5, np: 1 }) && hasAudio({ dz: 5 }) && hasAudio({ p: 'u' }));
});

test('şarkı havuzu: seçim tohumla aynı, ses gerekince sessizler elenir, şıklar doğru ve karışık', () => {
  const a = pickSongs(poolFor(data, { pool: 'secim', picks: [['Metallica'], ['Tool']] }), { count: 6, seed: 4, favor: 'none' });
  assert.deepEqual(a, pickSongs(poolFor(data, { pool: 'secim', picks: [['Metallica'], ['Tool']] }), { count: 6, seed: 4, favor: 'none' }));
  assert.ok(a.every((s) => s.a === 'Metallica' || s.a === 'Tool'));
  const quiet = pickSongs(data, { count: 25, seed: 1, needAudio: true });
  assert.ok(quiet.every((s) => s.a !== 'Silent'));
  for (let seed = 1; seed <= 20; seed++) {
    const song = { a: 'Tool', t: 'Tool 3' };
    const arts = artistOptions(poolFor(data, { pool: 'secim', picks: [['Metallica', 'Tool'], ['Katatonia']] }), song, seed, 4, data);
    assert.equal(arts.length, 4);
    assert.equal(new Set(arts).size, 4, 'four different bands');
    assert.ok(arts.includes('Tool'));
    assert.deepEqual(arts, artistOptions(poolFor(data, { pool: 'secim', picks: [['Metallica', 'Tool'], ['Katatonia']] }), song, seed, 4, data), 'same seed, same order');
    assert.ok(arts.includes('Metallica') && arts.includes('Katatonia'), 'the pool\'s own bands come first, the fourth is filled from the rest');
    const titles = songOptions(data, song, seed);
    assert.equal(titles.length, 4);
    assert.equal(new Set(titles).size, 4);
    assert.ok(titles.includes('Tool 3'));
    assert.ok(titles.every((x) => x.startsWith('Tool')), 'titles by the same band when it has enough songs');
  }
  const few = songOptions(data, { a: 'Silent', t: 'No audio' }, 2);
  assert.equal(few.length, 4, 'a band with one song is filled up from the others');
  assert.ok(few.includes('No audio'));
  // a Turkish song of a band with one song: the other names are Turkish ones first
  const mixed = { catalogTR: ['Duman', 'Mor ve Ötesi'], tracks: [
    { a: 'Yalnız Grup', t: 'Gönül Dağı', s: 200 },
    ...['Bu Akşam', 'Senden Daha Güzel', 'Haberin Yok Ölüyorum'].map((t) => ({ a: 'Duman', t, s: 200 })),
    ...['Bir Derdim Var', 'Cambaz'].map((t) => ({ a: 'Mor ve Ötesi', t, s: 200 })),
    ...Array.from({ length: 8 }, (_, i) => ({ a: 'Tool', t: `Tool ${i}`, s: 200 })),
  ] };
  for (let seed = 1; seed <= 10; seed++) {
    const opts = songOptions(mixed, { a: 'Yalnız Grup', t: 'Gönül Dağı' }, seed);
    assert.equal(opts.length, 4);
    assert.ok(opts.every((x) => !x.startsWith('Tool')), `same language first: ${opts}`);
  }
  // language per song: a Swedish title with ö, an English title by a band with ı, a plain Turkish title
  const langs = { catalogTR: [], tracks: [
    ...['Senden Önce', 'Bir Gün', 'Gece Yarısı'].map((t) => ({ a: 'Türk Grup', t, s: 200 })),
    ...['Sweet Home', 'The River', 'Night Owl'].map((t) => ({ a: 'Eng Band', t, s: 200 })),
    { a: 'Kall', t: 'Försök till Förstörelse', s: 200 },
    { a: 'Gökhan Kırdar', t: 'Pleasure', s: 200 },
    { a: 'Hüseyin Altın', t: 'Merhaba Gurbet', s: 200 },
  ] };
  const english = (o) => ['Sweet Home', 'The River', 'Night Owl', 'Pleasure', 'Försök till Förstörelse'].includes(o); // not Turkish
  for (let seed = 1; seed <= 6; seed++) {
    const kall = songOptions(langs, { a: 'Kall', t: 'Försök till Förstörelse' }, seed).filter((o) => o !== 'Försök till Förstörelse');
    assert.ok(kall.every(english), `Swedish with ö is not Turkish: ${kall}`);
    const pleasure = songOptions(langs, { a: 'Gökhan Kırdar', t: 'Pleasure' }, seed).filter((o) => o !== 'Pleasure');
    assert.ok(pleasure.every(english), `an English title by a band with ı: ${pleasure}`);
    const gurbet = songOptions(langs, { a: 'Hüseyin Altın', t: 'Merhaba Gurbet' }, seed).filter((o) => o !== 'Merhaba Gurbet');
    assert.ok(gurbet.every((o) => !english(o)), `a plain Turkish title: ${gurbet}`);
  }
  const small = artistOptions({ tracks: [{ a: 'Only' }] }, { a: 'Only', t: 'x' }, 1);
  assert.deepEqual(small, ['Only'], 'a pool with one band and no data to fill from gives one option');
});

test('şarkı havuzu: iki kişinin listeleri, ortak gruplar ve ortak şarkıların ağırlığı', () => {
  const two = {
    weights: {}, catalog: ['Katatonia', 'Metallica', 'Hayko Cepkin'],
    tracks: [
      ...Array.from({ length: 6 }, (_, i) => ({ a: 'Katatonia', t: `Kata ${i}`, s: 200 + i, dz: 1 + i, g: 'fav', w: i === 0 ? 3 : 1 })),
      ...Array.from({ length: 4 }, (_, i) => ({ a: 'Hayko Cepkin', t: `Hayko ${i}`, s: 210 + i, p: 'https://p/x', g: 'mix', w: i < 2 ? 3 : 1 })),
      ...Array.from({ length: 5 }, (_, i) => ({ a: 'Zara', t: `Zara ${i}`, s: 220 + i, p: 'https://p/y', g: 'fr', w: 2 })),
      { a: 'Hayko Cepkin', t: 'Sadece beyz', s: 230, p: 'https://p/z', g: 'fr', w: 2 },
      ...Array.from({ length: 6 }, (_, i) => ({ a: 'Metallica', t: `Met ${i}`, s: 300 + i, dz: 200 + i, g: 'top' })),
      ...Array.from({ length: 6 }, (_, i) => ({ a: 'Katatonia', t: `Kata top ${i}`, s: 240 + i, dz: 400 + i, g: 'top' })),
      { a: 'Old', t: 'no w field', s: 100, dz: 999, g: 'mix' },
    ],
  };
  assert.equal(listTracks(two, 1).length, 6 + 4 + 1, 'first person: w bit 1, plus a legacy song without w');
  assert.equal(listTracks(two, 2).length, 1 + 2 + 5 + 1, 'second person: w bit 2');
  assert.deepEqual([...commonArtists(two)].sort(), ['hayko cepkin', 'katatonia']);
  const mine = poolFor(two, { pool: 'liste' });
  assert.ok(mine.tracks.every((t) => (t.w || 1) & 1) && mine.tracks.every((t) => t.g !== 'top'));
  const theirs = poolFor(two, { pool: 'arkadas' });
  assert.equal(theirs.tracks.length, 9);
  assert.ok(theirs.tracks.every((t) => t.w & 2));
  const both = poolFor(two, { pool: 'ikisi' });
  assert.ok(both.tracks.every((t) => t.a === 'Katatonia' || t.a === 'Hayko Cepkin'), 'only bands on both lists');
  assert.equal(both.tracks.length, 6 + 4 + 1 + 6, 'both lists and the catalog songs of those bands');
  assert.equal(both.weights['Hayko Cepkin|Hayko 0'], 3 * both.weights['Hayko Cepkin|Hayko 2'], 'a song on both lists weighs 3× within its band');
  assert.equal(both.weights['Katatonia|Kata 0'], 3 * both.weights['Katatonia|Kata top 1']);
  assert.ok(Math.abs(both.weights['Hayko Cepkin|Hayko 2'] * 5 - both.weights['Katatonia|Kata 1'] * 12) < 1e-6, 'bands share the draws equally whatever their song counts');
  let shared = 0;
  for (let seed = 1; seed <= 40; seed++) shared += pickSongs(both, { count: 5, seed }).filter((s) => /^(Kata 0|Hayko [01])$/.test(s.t)).length;
  assert.ok(shared > 40 * 5 * (3 / 17) * 1.5, `the three shared songs come up more than their share (${shared})`);
  const little = poolFor({ tracks: [{ a: 'A', t: 'x', s: 100, w: 3 }, { a: 'B', t: 'y', s: 100, w: 1 }, { a: 'C', t: 'z', s: 100, w: 2 }] }, { pool: 'ikisi' });
  assert.equal(little.tracks.length, 3, 'under ten songs in common: both lists together');
});

test('yazılı cevap: Türkçe harfler, yazım hatası, fazladan kelime ve kısa adlar', () => {
  assert.equal(normalizeAnswer('Yol Gözümü Dağlıyor'), 'yol gozumu dagliyor');
  assert.equal(normalizeAnswer('İSTANBUL ışık'), 'istanbul isik');
  assert.equal(normalizeAnswer('The One You Are Looking for Is Not Here (with Silje Wergeland)'), 'one you are looking for is not here');
  assert.equal(normalizeAnswer('New Dawn Fades - 2007 Remaster'), 'new dawn fades');
  assert.equal(normalizeAnswer("Don't Cry"), 'dont cry');
  assert.equal(normalizeAnswer('Mgła'), 'mgla');
  assert.equal(normalizeAnswer('MØL'), 'mol');
  assert.equal(editDistance('katatonia', 'katatonya'), 1);
  assert.equal(editDistance('', 'abc'), 3);
  assert.ok(answerMatches('katatonya', 'Katatonia'), 'one slip in a 9-letter name');
  assert.ok(answerMatches('Metalica', 'Metallica'));
  assert.ok(answerMatches('hayko cepkin', 'Hayko Cepkin'));
  assert.ok(answerMatches('yol gozumu dagliyor', 'Yol Gözümü Dağlıyor'), 'no Turkish letters needed');
  assert.ok(answerMatches('Fear Inoculum (Tool)', 'Fear Inoculum'), 'extra words around the answer are fine');
  assert.ok(answerMatches('the one you are looking for', 'The One You Are Looking for Is Not Here (with Silje Wergeland)'), 'the start of a long title counts');
  assert.ok(answerMatches('Tool', 'Tool') && answerMatches('TOOL ', 'Tool'));
  assert.ok(!answerMatches('Pool', 'Tool'), 'no slips allowed in very short names');
  assert.ok(!answerMatches('Opeth', 'Katatonia'));
  assert.ok(!answerMatches('Lion', 'Lions in a Cage'), 'a short fragment is not enough');
  assert.ok(!answerMatches('', 'Tool') && !answerMatches('   ', 'Tool'));
  assert.ok(answerMatches('Son Kez', 'Son Kez') && !answerMatches('Son', 'Son Kez'));
  assert.ok(answerMatches('mor ve otesi', 'mor ve ötesi'));
  assert.ok(answerMatches('Go', 'Go') && !answerMatches('Got', 'Go'));
});

test('şarkı havuzu: Beyza\'ya yakınlar bayrağı, bölümlü seçim listesi ve yalnız aramayla gelen kuyruk', () => {
  const d = {
    people: ['Mustafa', 'Beyza'], weights: { Katatonia: 3 }, catalog: ['Metallica'], catalogTR: ['Tarkan'],
    tracks: [
      ...Array.from({ length: 6 }, (_, i) => ({ a: 'Katatonia', t: `K${i}`, s: 200, dz: 1 + i, g: 'sp', w: 1, y: i < 2 ? 1 : 0 })),
      ...Array.from({ length: 3 }, (_, i) => ({ a: 'Mode XL', t: `M${i}`, s: 200, dz: 10 + i, g: 'sp', w: 1, y: 1 })),
      { a: 'Tek Şarkı', t: 'bir', s: 200, dz: 20, g: 'sp', w: 1 },
      { a: 'İki Şarkı', t: 'bir', s: 200, dz: 21, g: 'sp', w: 1 }, { a: 'İki Şarkı', t: 'iki', s: 200, dz: 22, g: 'sp', w: 1 },
      { a: 'Zara', t: 'Z', s: 200, p: 'u', g: 'fr', w: 2 },
      ...Array.from({ length: 4 }, (_, i) => ({ a: 'Metallica', t: `Met ${i}`, s: 300, dz: 200 + i, g: 'top' })),
      ...Array.from({ length: 4 }, (_, i) => ({ a: 'Tarkan', t: `T ${i}`, s: 300, dz: 300 + i, g: 'tr' })),
    ],
  };
  const yakin = poolFor(d, { pool: 'yakin' });
  assert.deepEqual(yakin.tracks.map((t) => t.t).sort(), ['K0', 'K1', 'M0', 'M1', 'M2'], 'only the flagged songs of the first list');
  const turkce = poolFor(d, { pool: 'turkce' });
  assert.ok(turkce.tracks.every((t) => t.a === 'Tarkan') && turkce.tracks.length === 4);
  const groups = pickGroups(d);
  assert.deepEqual(groups.map((g) => g.title), ["Beyza'nın listesi", "Mustafa'nın listesi", 'Türkçe (bilinenler)', 'Katalog', 'Diğer (ara)']);
  assert.deepEqual(groups[0].artists, ['Zara']);
  assert.deepEqual(groups[1].artists, ['Katatonia'], 'five or more songs, or a favourite weight');
  assert.deepEqual(groups[4].artists, ['İki Şarkı', 'Mode XL'], 'the 2–4-song tail is search-only; one-song bands are left out');
  assert.ok(groups[4].searchOnly);
  assert.deepEqual(catalogArtists(d), ['İki Şarkı', 'Katatonia', 'Metallica', 'Mode XL', 'Tarkan', 'Zara'], 'the search-only tail is still pickable');
});

test('şarkı havuzu: işaretlenen kaynaklar eşit pay alır, kaynak yoksa ilk liste, grup seçimi gerektiği gibi', () => {
  const d = {
    people: ['Mustafa', 'Beyza'], weights: { Katatonia: 3 }, catalog: ['Metallica'], catalogTR: ['Tarkan'],
    tracks: [
      ...Array.from({ length: 40 }, (_, i) => ({ a: i < 10 ? 'Katatonia' : `Band ${i}`, t: `M${i}`, s: 200, dz: 1 + i, g: 'sp', w: 1, y: i % 4 === 0 ? 1 : 0 })),
      ...Array.from({ length: 4 }, (_, i) => ({ a: 'Zara', t: `Z${i}`, s: 200, p: 'u', g: 'fr', w: 2 })),
      { a: 'Hayko Cepkin', t: 'Ortak', s: 200, p: 'u', g: 'jt', w: 3, j: 1 },
      ...Array.from({ length: 5 }, (_, i) => ({ a: 'Tarkan', t: `T${i}`, s: 300, dz: 300 + i, g: 'tr' })),
      ...Array.from({ length: 5 }, (_, i) => ({ a: 'Metallica', t: `Met${i}`, s: 300, dz: 400 + i, g: 'top' })),
    ],
  };
  assert.deepEqual(sourcesFrom({}), { srcMustafa: true, srcYakin: false, srcBeyza: false, srcOrtak: false, srcTurkce: false, srcSecim: false }, 'nothing ticked: the first list');
  assert.ok(needsPick(sourcesFrom({ srcSecim: true })) && !needsPick(sourcesFrom({ srcBeyza: true })));
  const total = (pool, pred) => pool.tracks.filter(pred).reduce((s, t) => s + pool.weights[`${t.a}|${t.t}`], 0);
  const two = mixPool(d, { sources: sourcesFrom({ srcMustafa: true, srcBeyza: true }), favor: 'none' });
  assert.equal(two.tracks.length, 40 + 4 + 1, 'the union, the shared song once');
  assert.ok(Math.abs(total(two, (t) => t.w === 1) - 500 * 40 / 41) < 1e-6, 'the big list gets half of the draws (41 songs, one of them shared)');
  assert.ok(Math.abs(total(two, (t) => t.w === 2) - 400) < 1e-6 && Math.abs(two.weights['Hayko Cepkin|Ortak'] - (500 / 41 + 100)) < 1e-6, 'the small list the other half; a song on both lists adds up');
  const fav = mixPool(d, { sources: sourcesFrom({ srcMustafa: true }), favor: 'high' });
  assert.ok(fav.weights['Katatonia|M0'] > 2.9 * fav.weights['Band 20|M20'], 'favourite weights apply inside the first list');
  const yakin = mixPool(d, { sources: sourcesFrom({ srcYakin: true }) });
  assert.ok(yakin.tracks.length === 10 && yakin.tracks.every((t) => t.y));
  const three = mixPool(d, { sources: sourcesFrom({ srcOrtak: true, srcTurkce: true, srcBeyza: true }) });
  for (const pred of [(t) => t.j, (t) => t.g === 'tr', (t) => t.w & 2]) assert.ok(total(three, pred) > 333 - 1e-6, 'each source at least a third (the shared song counts twice)');
  const picks = mixPool(d, { sources: sourcesFrom({ srcSecim: true }), picks: [['Metallica'], ['Tarkan']] });
  assert.deepEqual([...new Set(picks.tracks.map((t) => t.a))].sort(), ['Metallica', 'Tarkan']);
  const noPicks = mixPool(d, { sources: sourcesFrom({ srcSecim: true }), picks: [[], []] });
  assert.ok(noPicks.tracks.length === 41, 'nobody picked anything: the first list');
  const drawn = pickSongs(two, { count: 10, seed: 3 });
  assert.equal(drawn.length, 10);
});

test('yazılı cevap: aynı grubun başka şarkısı, başka numara, kelime içi parça ve başka alfabeler', () => {
  assert.equal(answerMatches('The Unforgiven II', 'The Unforgiven'), false, 'a number names another song');
  assert.equal(answerMatches('Vermilion', 'Vermilion, Pt. 2'), false);
  assert.equal(answerMatches('Vanished', 'Shed'), false, 'whole words only');
  assert.equal(answerMatches('Hello I Love You', 'Hello, I Love You'), true, 'an I in the middle is not a number');
  assert.equal(answerMatches('I Fly Among the Stars', 'II - I Fly Among the Stars'), true, 'the title after a leading numeral');
  assert.equal(answerMatches('batushka', 'БАТЮШКА'), true, 'Cyrillic typed in Latin letters');
  assert.equal(answerMatches('БАТЮШКА', 'БАТЮШКА'), true);
  assert.equal(answerMatches('!!!', '!!!'), true, 'a name of symbols only can still be typed');
  assert.equal(answerMatches('', '!!!'), false);
  assert.equal(answerMatches('dumanlar', 'Duman'), false);
  // numbers: the answer's own must be typed, a typed one must be in the full title; Roman = Arabic
  assert.equal(answerMatches('Eternity Part 2', 'Eternity (Part 2)'), true, 'the number inside the brackets');
  assert.equal(answerMatches('Eternity Part 1', 'Eternity (Part 2)'), false);
  assert.equal(answerMatches('Eternity', 'Eternity (Part 2)'), true);
  assert.equal(answerMatches('The Unforgiven 2', 'The Unforgiven II'), true, 'Roman and Arabic numerals');
  assert.equal(answerMatches('The Unforgiven 3', 'The Unforgiven II'), false);
  assert.equal(answerMatches('Epitome 14', 'Epitome XIV'), true);
  assert.equal(answerMatches('In the Presence of Enemies Part 1', 'In the Presence of Enemies - Part I'), true, 'the number after " - "');
  assert.equal(answerMatches('Sun Was High So Was I', 'Sun Was High (So Was I)'), true);
  assert.equal(answerMatches('Ruen II - The Epitaph', 'Ruun II - The Epitaph'), true, 'a slip in a title whose numeral is followed by " - …"');
  assert.equal(answerMatches('Misericord I', 'Misericorde I - As the Flesh Falls'), true);
  assert.equal(answerMatches('Ruun III', 'Ruun II - The Epitaph'), false);
  assert.equal(answerMatches('Devour Me Colossus Part 1', 'Devour Me, Colossus - Part I - Blackholes'), true, 'a numeral closing a middle part');
  assert.equal(answerMatches('Heaven Torn Lov I', 'Heaven Torn Low I (the passage)'), true);
  assert.equal(answerMatches('Devour Me Colossus Part 2', 'Devour Me, Colossus - Part I - Blackholes'), false);
  assert.equal(answerMatches('Clutch of Oblivion I', 'Clutch of Oblivion (I)'), true, 'a numeral alone in brackets');
  assert.equal(answerMatches('Clutch of Oblivion 1', 'Clutch of Oblivion (I)'), true);
  assert.equal(answerMatches('Ruun II The Epitaph', 'Ruun II - The Epitaph'), true, 'a Roman numeral inside the typed title');
  assert.equal(answerMatches('Ruun III The Epitaph', 'Ruun II - The Epitaph'), false);
  assert.equal(answerMatches('Hello I Love You', 'Hello, I Love You'), true, 'the pronoun I stays a word');
  assert.equal(answerMatches('II Bloodbirds', 'II - Bloodbirds'), true, 'the leading numeral typed too');
  assert.equal(answerMatches('2 Bloodbirds', 'II - Bloodbirds'), true);
  assert.equal(answerMatches('III Bloodbirds', 'II - Bloodbirds'), false);
  assert.equal(answerMatches('Belus Doed', 'ii. Belus Doed'), true, 'a leading track number with a period');
  assert.equal(answerMatches('Keilohesten', 'vi. Keilohesten'), true);
  assert.equal(answerMatches('6. Keilohesten', 'vi. Keilohesten'), true);
  assert.equal(answerMatches('5 Keilohesten', 'vi. Keilohesten'), false);
  assert.equal(answerMatches('Incarnate', 'I: Incarnate'), true);
  assert.equal(answerMatches('7 Keilohesten', 'vi. Keilohesten'), false);
  // the comparison without numerals still forgives what it always did
  assert.equal(answerMatches('İi Yabancı', 'İki Yabancı'), true, 'a slip that happens to make a Roman word');
  assert.equal(answerMatches("Since I'v Been Loving You", "Since I've Been Loving You"), true);
  assert.equal(answerMatches('The xx Intro', 'Intro'), true, 'a band with a numeral-looking name in front');
  assert.equal(answerMatches('Revlot III', 'Revolt III'), true, 'a slip in a short title with a closing numeral');
  assert.equal(answerMatches('Revolt II', 'Revolt III'), false);
  assert.equal(answerMatches('2-Bloodbirds', 'II - Bloodbirds'), true);
  assert.equal(answerMatches('I Fly Amomg the Stars', 'II - I Fly Among the Stars'), true, "the title's own I is not a track number");
  // a title that is all brackets, letters that drop out of the plain alphabet
  assert.equal(normalizeAnswer('(A)'), 'a');
  assert.equal(answerMatches('A', '(A)'), true);
  assert.equal(answerMatches('Getme', 'Getmə'), true);
  assert.equal(answerMatches('Nermine Memmedova', 'Nərminə Məmmədova'), true);
  assert.equal(answerMatches('Mu-Ziq', 'µ-Ziq'), true);
  assert.equal(answerMatches('Er Turan', 'Ер Тұран'), true);
  const songs = { tracks: [
    { a: 'Katatonia', t: 'Deliberation', s: 200 }, { a: 'Katatonia', t: 'Liberation', s: 210 },
    { a: 'Bathory', t: 'The Lake', s: 300 }, { a: 'Bathory', t: 'Lake of Fire', s: 310 },
    { a: 'Death', t: 'Crystal Mountain', s: 300 }, { a: 'Death Cab for Cutie', t: 'Transatlanticism', s: 400 },
  ] };
  assert.equal(titleMatches(songs, { a: 'Katatonia', t: 'Deliberation' }, 'Liberation'), false, "the band's other song");
  assert.equal(titleMatches(songs, { a: 'Katatonia', t: 'Deliberation' }, 'deliberaton'), true, 'a slip is still forgiven');
  assert.equal(titleMatches(songs, { a: 'Bathory', t: 'The Lake' }, 'Lake of Fire'), false);
  assert.equal(titleMatches(songs, { a: 'Bathory', t: 'The Lake' }, 'the lake'), true);
  assert.equal(artistMatches(songs, { a: 'Death' }, 'Death Cab for Cutie'), false, 'another band in the list');
  assert.equal(artistMatches(songs, { a: 'Death' }, 'death'), true);
});

test('şarkı havuzu: sesi olmayan seçim yedeğe döner, az şarkı iki listeden tamamlanır, tek grup yarı payını alır', () => {
  // picked bands with no sound: with needAudio the pick falls back instead of leaving nothing
  const silentPick = mixPool(data, { sources: { srcSecim: true }, picks: [['Silent'], ['Silent']], needAudio: true });
  assert.ok(silentPick.tracks.length > 0 && silentPick.tracks.every(hasAudio));
  assert.ok(silentArtists(data).has('silent') && !silentArtists(data).has('tool'));
  // two songs in the pick: topped up to the full count from the lists, no song twice, same seed same songs
  const tiny = pickSongs(mixPool(data, { sources: { srcSecim: true }, picks: [['Mix Band'], []] }), { count: 2, seed: 3 });
  const full = topUp(tiny.slice(), data, { seed: 3 }, 10, true);
  assert.equal(full.length, 10);
  assert.equal(new Set(full.map((x) => `${x.a}|${x.t}`)).size, 10);
  assert.deepEqual(full.slice(0, 2), tiny);
  assert.deepEqual(full, topUp(tiny.slice(), data, { seed: 3 }, 10, true));
  assert.ok(full.every(hasAudio));
  // one player picks a single band, the other three: the single band gets about half of the songs
  let single = 0;
  let total = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const pool = mixPool(data, { sources: { srcSecim: true }, picks: [['Opeth'], ['Katatonia', 'Metallica', 'Tool']] });
    const got = pickSongs(pool, { count: 10, seed, favor: 'high' }); // as the games draw: the pool's weights decide
    single += got.filter((x) => x.a === 'Opeth').length;
    total += got.length;
  }
  assert.ok(single / total > 0.4, `Opeth got ${single} of ${total}`);
  // with needAudio a picked band's silent songs do not eat its share, and a silent band counts as not picked
  const loud = { ...data, tracks: [...data.tracks, ...Array.from({ length: 6 }, (_, i) => ({ a: 'Opeth', t: `Opeth mute ${i}`, s: 90, dz: 900 + i, np: 1 }))] };
  single = 0;
  total = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const pool = mixPool(loud, { sources: { srcSecim: true }, picks: [['Opeth', 'Silent'], ['Katatonia', 'Metallica', 'Tool']], needAudio: true });
    const got = pickSongs(pool, { count: 10, seed, favor: 'high' });
    assert.ok(got.every(hasAudio));
    single += got.filter((x) => x.a === 'Opeth').length;
    total += got.length;
  }
  assert.ok(single / total > 0.4, `Opeth with silent songs got ${single} of ${total}`);
  // both picked only a silent band in common: the bands each picked, not the whole list
  const shared = mixPool(data, { sources: { srcSecim: true }, pickMode: 'ortak', picks: [['Silent', 'Metallica'], ['Silent', 'Tool']], needAudio: true });
  assert.deepEqual([...new Set(shared.tracks.map((x) => x.a))].sort(), ['Metallica', 'Tool']);
  assert.equal(noSharedPick(data, [['Silent', 'Metallica'], ['Silent', 'Tool']], true), true, 'the silent band is no shared band');
  assert.equal(noSharedPick(data, [['Silent', 'Metallica'], ['Silent', 'Tool']]), false);
  assert.equal(noSharedPick(data, [['Tool'], ['tool']], true), false);
  assert.equal(noSharedPick(data, [[], []], true), false, 'nobody picked: nothing to explain');
});
