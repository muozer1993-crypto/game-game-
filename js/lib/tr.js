// Turkish text helpers. Always use these instead of toUpperCase/toLowerCase
// so that i/İ and ı/I are handled correctly.

export const upperTR = (s) => String(s).toLocaleUpperCase('tr-TR');
export const lowerTR = (s) => String(s).toLocaleLowerCase('tr-TR');

// The 29 letters of the Turkish alphabet, in alphabetical order.
export const LETTERS = 'abcçdefgğhıijklmnoöprsştuüvyz';
export const VOWELS = 'aeıioöuü';
export const BACK_VOWELS = 'aıou';
// Voiceless consonants (for consonant harmony of suffixes: -de/-te).
const VOICELESS = 'fstkçşhp';

const LETTER_RE = /^[abcçdefgğhıijklmnoöprsştuüvyz]+$/;

export const isVowel = (ch) => VOWELS.includes(lowerTR(ch));

/** Lowercase, trim, drop circumflexes (kâğıt -> kağıt). Does not strip other characters. */
export function normalizeWord(s) {
  return lowerTR(String(s).trim())
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u');
}

/** True if the string consists only of Turkish letters (q, w, x excluded). */
export const isTurkishWord = (w) => LETTER_RE.test(w);

/** Keep only Turkish letters (after normalizing). Used to sanitize typed input. */
export function lettersOnly(s) {
  return [...normalizeWord(s)].filter((ch) => LETTERS.includes(ch)).join('');
}

/** Capitalize first letter the Turkish way (istanbul -> İstanbul). */
export function capitalizeTR(s) {
  const str = String(s);
  if (!str) return str;
  return upperTR(str[0]) + str.slice(1);
}

function lastVowelIsBack(word) {
  const w = lowerTR(word);
  for (let i = w.length - 1; i >= 0; i--) {
    if (VOWELS.includes(w[i])) return BACK_VOWELS.includes(w[i]);
  }
  return null; // no vowel at all
}

// Locative/dative suffix for names ending with a digit, by the digit's Turkish name.
// 1 bir, 2 iki, 3 üç, 4 dört, 5 beş, 6 altı, 7 yedi, 8 sekiz, 9 dokuz, 0 sıfır
const DIGIT_BACK = { 0: true, 1: false, 2: false, 3: false, 4: true, 5: false, 6: true, 7: false, 8: false, 9: true };
const DIGIT_VOICELESS = { 3: true, 4: true, 5: true };
const DIGIT_ENDS_WITH_VOWEL = { 2: true, 6: true, 7: true };

/**
 * Proper-noun suffix with apostrophe.
 *   nameSuffix('Ayşe', 'de')  -> "Ayşe'de"      (locative: -de/-da/-te/-ta)
 *   nameSuffix('Ahmet', 'de') -> "Ahmet'te"
 *   nameSuffix('Ayşe', 'e')   -> "Ayşe'ye"      (dative: -e/-a/-ye/-ya)
 *   nameSuffix('Ali', 'in')   -> "Ali'nin"      (genitive: -in/-ın/-un/-ün/-nin...)
 *   nameSuffix('Ali', 'i')    -> "Ali'yi"       (accusative: -i/-ı/-u/-ü/-yi...)
 */
export function nameSuffix(name, kind) {
  const n = String(name).trim();
  if (!n) return n;
  const last = lowerTR(n[n.length - 1]);
  const isDigit = /[0-9]/.test(last);
  let back, voiceless, endsWithVowel;
  if (isDigit) {
    back = DIGIT_BACK[last];
    voiceless = !!DIGIT_VOICELESS[last];
    endsWithVowel = !!DIGIT_ENDS_WITH_VOWEL[last];
  } else {
    back = lastVowelIsBack(n);
    if (back === null) back = false;
    voiceless = VOICELESS.includes(last);
    endsWithVowel = VOWELS.includes(last);
  }
  if (kind === 'de') {
    return `${n}'${voiceless ? 't' : 'd'}${back ? 'a' : 'e'}`;
  }
  if (kind === 'e') {
    return `${n}'${endsWithVowel ? 'y' : ''}${back ? 'a' : 'e'}`;
  }
  if (kind === 'in') {
    // four-way harmony for genitive
    const lv = lastVowel(n, isDigit, last);
    const v = ({ a: 'ı', ı: 'ı', o: 'u', u: 'u', e: 'i', i: 'i', ö: 'ü', ü: 'ü' })[lv] || 'i';
    return `${n}'${endsWithVowel ? 'n' : ''}${v}n`;
  }
  if (kind === 'i') {
    const lv = lastVowel(n, isDigit, last);
    const v = ({ a: 'ı', ı: 'ı', o: 'u', u: 'u', e: 'i', i: 'i', ö: 'ü', ü: 'ü' })[lv] || 'i';
    return `${n}'${endsWithVowel ? 'y' : ''}${v}`;
  }
  return n;
}

const DIGIT_LAST_VOWEL = { 0: 'ı', 1: 'i', 2: 'i', 3: 'ü', 4: 'ö', 5: 'e', 6: 'ı', 7: 'i', 8: 'i', 9: 'u' };
function lastVowel(n, isDigit, last) {
  if (isDigit) return DIGIT_LAST_VOWEL[last];
  const w = lowerTR(n);
  for (let i = w.length - 1; i >= 0; i--) if (VOWELS.includes(w[i])) return w[i];
  return 'i';
}
