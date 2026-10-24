import { test, assert } from './runner.js';
import { syllabify, lastSyllable } from '../js/lib/syllabify.js';

const cases = {
  kitap: ['ki', 'tap'],
  anne: ['an', 'ne'],
  kardeş: ['kar', 'deş'],
  Türkçe: ['Türk', 'çe'],
  saat: ['sa', 'at'],
  kağıt: ['ka', 'ğıt'],
  yoğurt: ['yo', 'ğurt'],
  değil: ['de', 'ğil'],
  spor: ['spor'],
  tren: ['tren'],
  elma: ['el', 'ma'],
  ağaç: ['a', 'ğaç'],
};

for (const [word, expected] of Object.entries(cases)) {
  test(`syllabify: ${word} → ${expected.join('-')}`, () => {
    assert.deepEqual(syllabify(word), expected);
  });
}

test('syllabify: daha uzun kelimeler', () => {
  assert.deepEqual(syllabify('tapınak'), ['ta', 'pı', 'nak']);
  assert.deepEqual(syllabify('nakış'), ['na', 'kış']);
  assert.deepEqual(syllabify('elektrik'), ['e', 'lek', 'trik']);
  assert.deepEqual(syllabify('kontrol'), ['kon', 'trol']);
  assert.deepEqual(syllabify('istanbul'), ['is', 'tan', 'bul']);
  assert.deepEqual(syllabify('öğretmen'), ['öğ', 'ret', 'men']);
  assert.deepEqual(syllabify('şiir'), ['şi', 'ir']);
  assert.deepEqual(syllabify('aile'), ['a', 'i', 'le']);
});

test('syllabify: üç ünsüzde tr/pl kümesi birlikte kalır, iki ünsüz ayrılır', () => {
  assert.deepEqual(syllabify('santral'), ['san', 'tral']);
  assert.deepEqual(syllabify('sürpriz'), ['sür', 'priz']);
  assert.deepEqual(syllabify('kompleks'), ['kom', 'pleks']);
  assert.deepEqual(syllabify('ekspres'), ['eks', 'pres']);
  assert.deepEqual(syllabify('ibret'), ['ib', 'ret']);
  assert.deepEqual(syllabify('kartpostal'), ['kart', 'pos', 'tal']);
  assert.deepEqual(syllabify('yurttaş'), ['yurt', 'taş']);
  assert.deepEqual(syllabify('istasyon'), ['is', 'tas', 'yon']);
});

test('syllabify: tek heceli ve ünlüsüz', () => {
  assert.deepEqual(syllabify('at'), ['at']);
  assert.deepEqual(syllabify('o'), ['o']);
  assert.deepEqual(syllabify('brr'), ['brr']);
  assert.deepEqual(syllabify(''), []);
});

test('lastSyllable', () => {
  assert.equal(lastSyllable('kitap'), 'tap');
  assert.equal(lastSyllable('tapınak'), 'nak');
  assert.equal(lastSyllable('kağıt'), 'ğıt');
  assert.equal(lastSyllable(''), '');
});
