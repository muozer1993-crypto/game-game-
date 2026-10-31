import { test, assert } from './runner.js';
import { poolFor, pickSongs, catalogArtists, artistOptions, songOptions, listTracks, hasAudio } from '../js/lib/songs.js';

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
  assert.deepEqual(secim.weights, { Tool: 3 }, 'a band both picked weighs more (case-insensitive)');
  const ortak = poolFor(data, { pool: 'ortak', picks: [['Metallica', 'Tool'], ['Tool', 'Katatonia']] });
  assert.deepEqual([...new Set(ortak.tracks.map((t) => t.a))], ['Tool']);
  assert.deepEqual(ortak.weights, {});
  const noCommon = poolFor(data, { pool: 'ortak', picks: [['Metallica'], ['Tool']] });
  assert.deepEqual([...new Set(noCommon.tracks.map((t) => t.a))].sort(), ['Metallica', 'Tool'], 'no common band: the union is used');
  const nothing = poolFor(data, { pool: 'secim', picks: [[], null] });
  assert.equal(nothing.tracks.length, 18, 'nobody picked: back to the personal list');
  assert.deepEqual(catalogArtists(data), ['Katatonia', 'Metallica', 'Opeth', 'Tool']);
  assert.deepEqual(catalogArtists({ tracks: data.tracks }), ['Katatonia', 'Metallica', 'Mix Band', 'Opeth', 'Tool'], 'without a list: bands with 5+ songs');
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
  const small = artistOptions({ tracks: [{ a: 'Only' }] }, { a: 'Only', t: 'x' }, 1);
  assert.deepEqual(small, ['Only'], 'a pool with one band and no data to fill from gives one option');
});
