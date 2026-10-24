import { test, assert } from './runner.js';
import { upperTR, lowerTR, normalizeWord, isTurkishWord, lettersOnly, nameSuffix, capitalizeTR } from '../js/lib/tr.js';

test('tr: büyük/küçük harf i-İ ve ı-I karışmaz', () => {
  assert.equal(upperTR('istanbul'), 'İSTANBUL');
  assert.equal(upperTR('ılık'), 'ILIK');
  assert.equal(lowerTR('İSTANBUL'), 'istanbul');
  assert.equal(lowerTR('ILIK'), 'ılık');
  assert.equal(upperTR('çğöşü'), 'ÇĞÖŞÜ');
});

test('tr: normalizeWord küçültür, kırpar, şapkayı atar', () => {
  assert.equal(normalizeWord('  Kâğıt '), 'kağıt');
  assert.equal(normalizeWord('İDDİA'), 'iddia');
});

test('tr: isTurkishWord yalnızca Türkçe harfleri kabul eder', () => {
  assert.ok(isTurkishWord('çiçek'));
  assert.ok(!isTurkishWord('taxi'));
  assert.ok(!isTurkishWord('ka ğıt'));
  assert.ok(!isTurkishWord(''));
});

test('tr: lettersOnly harf dışını atar', () => {
  assert.equal(lettersOnly('Ka-ğıt!'), 'kağıt');
  assert.equal(lettersOnly('a1b2'), 'ab');
});

test('tr: capitalizeTR', () => {
  assert.equal(capitalizeTR('istanbul'), 'İstanbul');
  assert.equal(capitalizeTR('ışık'), 'Işık');
  assert.equal(capitalizeTR(''), '');
});

test('tr: bulunma eki (-de/-da/-te/-ta)', () => {
  assert.equal(nameSuffix('Ayşe', 'de'), "Ayşe'de");
  assert.equal(nameSuffix('Mustafa', 'de'), "Mustafa'da");
  assert.equal(nameSuffix('Ahmet', 'de'), "Ahmet'te");
  assert.equal(nameSuffix('Burak', 'de'), "Burak'ta");
  assert.equal(nameSuffix('Gül', 'de'), "Gül'de");
  assert.equal(nameSuffix('Oyuncu 1', 'de'), "Oyuncu 1'de");
  assert.equal(nameSuffix('Oyuncu 2', 'de'), "Oyuncu 2'de");
  assert.equal(nameSuffix('Oyuncu 3', 'de'), "Oyuncu 3'te");
  assert.equal(nameSuffix('Oyuncu 6', 'de'), "Oyuncu 6'da");
});

test('tr: yönelme eki (-e/-a/-ye/-ya)', () => {
  assert.equal(nameSuffix('Ayşe', 'e'), "Ayşe'ye");
  assert.equal(nameSuffix('Mustafa', 'e'), "Mustafa'ya");
  assert.equal(nameSuffix('Ahmet', 'e'), "Ahmet'e");
  assert.equal(nameSuffix('Burak', 'e'), "Burak'a");
});

test('tr: ilgi eki (-in/-ın/-un/-ün, -nin...)', () => {
  assert.equal(nameSuffix('Ali', 'in'), "Ali'nin");
  assert.equal(nameSuffix('Ayşe', 'in'), "Ayşe'nin");
  assert.equal(nameSuffix('Mustafa', 'in'), "Mustafa'nın");
  assert.equal(nameSuffix('Burak', 'in'), "Burak'ın");
  assert.equal(nameSuffix('Umut', 'in'), "Umut'un");
  assert.equal(nameSuffix('Gül', 'in'), "Gül'ün");
});
