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
  assert.deepEqual(syllabify('elektrik'), ['e', 'lekt', 'rik']); // brief rule, applied uniformly
  assert.deepEqual(syllabify('kontrol'), ['kont', 'rol']);
  assert.deepEqual(syllabify('istanbul'), ['is', 'tan', 'bul']);
  assert.deepEqual(syllabify('öğretmen'), ['öğ', 'ret', 'men']);
  assert.deepEqual(syllabify('şiir'), ['şi', 'ir']);
  assert.deepEqual(syllabify('aile'), ['a', 'i', 'le']);
});

test('syllabify: ekli kelimelerde yalnızca son ünsüz sonraki heceye geçer', () => {
  assert.deepEqual(syllabify('Türkler'), ['Türk', 'ler']);
  assert.deepEqual(syllabify('renkli'), ['renk', 'li']);
  assert.deepEqual(syllabify('dertli'), ['dert', 'li']);
  assert.deepEqual(syllabify('harfler'), ['harf', 'ler']);
  assert.deepEqual(syllabify('çiftlik'), ['çift', 'lik']);
  assert.deepEqual(syllabify('kurtlar'), ['kurt', 'lar']);
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
