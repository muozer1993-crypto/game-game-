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
  assert.equal(nameSuffix('Kemal', 'de'), "Kemal'de", 'a soft final l takes front suffixes');
  assert.equal(nameSuffix('Meral', 'in'), "Meral'in");
  assert.equal(nameSuffix('Celâl', 'i'), "Celâl'i");
  assert.equal(nameSuffix('Kemal', 'e'), "Kemal'e");
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

test('tr: belirtme eki (-i/-ı/-u/-ü, -yi...)', () => {
  assert.equal(nameSuffix('Ahmet', 'i'), "Ahmet'i");
  assert.equal(nameSuffix('Ayşe', 'i'), "Ayşe'yi");
  assert.equal(nameSuffix('Ali', 'i'), "Ali'yi");
  assert.equal(nameSuffix('Burak', 'i'), "Burak'ı");
  assert.equal(nameSuffix('Umut', 'i'), "Umut'u");
  assert.equal(nameSuffix('Gül', 'i'), "Gül'ü");
  assert.equal(nameSuffix('Oyuncu 1', 'i'), "Oyuncu 1'i");
  assert.equal(nameSuffix('Oyuncu 2', 'i'), "Oyuncu 2'yi");
  assert.equal(nameSuffix('Oyuncu 3', 'i'), "Oyuncu 3'ü");
  assert.equal(nameSuffix('Oyuncu 6', 'i'), "Oyuncu 6'yı");
});

test('tr: ilgi eki (-in/-ın/-un/-ün, -nin...)', () => {
  assert.equal(nameSuffix('Ali', 'in'), "Ali'nin");
  assert.equal(nameSuffix('Ayşe', 'in'), "Ayşe'nin");
  assert.equal(nameSuffix('Mustafa', 'in'), "Mustafa'nın");
  assert.equal(nameSuffix('Burak', 'in'), "Burak'ın");
  assert.equal(nameSuffix('Umut', 'in'), "Umut'un");
  assert.equal(nameSuffix('Gül', 'in'), "Gül'ün");
});

test('tr: sayıyla, işaretle ya da yabancı harfle biten isimler', () => {
  // a number is read aloud: on, yirmi, kırk, yüz, bin
  assert.equal(nameSuffix('Oyuncu 10', 'de'), "Oyuncu 10'da");
  assert.equal(nameSuffix('Oyuncu 10', 'in'), "Oyuncu 10'un");
  assert.equal(nameSuffix('Oyuncu 20', 'e'), "Oyuncu 20'ye");
  assert.equal(nameSuffix('Oyuncu 40', 'de'), "Oyuncu 40'ta");
  assert.equal(nameSuffix('Oyuncu 50', 'in'), "Oyuncu 50'nin");
  assert.equal(nameSuffix('Oyuncu 60', 'i'), "Oyuncu 60'ı");
  assert.equal(nameSuffix('Oyuncu 100', 'in'), "Oyuncu 100'ün");
  assert.equal(nameSuffix('Oyuncu 1000', 'de'), "Oyuncu 1000'de");
  assert.equal(nameSuffix('Oyuncu 12', 'de'), "Oyuncu 12'de");
  assert.equal(nameSuffix('Oyuncu 0', 'e'), "Oyuncu 0'a");
  // a trailing emoji or mark is skipped for the sound
  assert.equal(nameSuffix('Beyza 💜', 'e'), "Beyza 💜'ya");
  assert.equal(nameSuffix('Beyza 💜', 'in'), "Beyza 💜'nın");
  assert.equal(nameSuffix('Ece ✨', 'de'), "Ece ✨'de");
  assert.equal(nameSuffix('💜', 'de'), "💜'de");
  // x is voiceless; the last word of a two-word name decides
  assert.equal(nameSuffix('Max', 'de'), "Max'ta");
  assert.equal(nameSuffix('Alex', 'in'), "Alex'in");
  assert.equal(nameSuffix('Ayşe Nur', 'in'), "Ayşe Nur'un");
  assert.equal(nameSuffix('Nâzım', 'e'), "Nâzım'a");
});
