// Turkish text helpers. Always use these instead of toUpperCase/toLowerCase
// so that i/İ and ı/I are handled correctly.

export const upperTR = (s) => String(s).toLocaleUpperCase('tr-TR');
export const lowerTR = (s) => String(s).toLocaleLowerCase('tr-TR');

// The 29 letters of the Turkish alphabet, in alphabetical order.
export const LETTERS = 'abcçdefgğhıijklmnoöprsştuüvyz';
export const VOWELS = 'aeıioöuü';
export const BACK_VOWELS = 'aıou';
// Voiceless consonants (for consonant harmony of suffixes: -de/-te).
const VOICELESS = 'fstkçşhpxq'; // x and q as in Max, Tariq: Max'ta

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

// A name that ends in a number takes its suffixes from the number's last spoken word:
// Oyuncu 3 -> üç'te, Oyuncu 10 -> on'da, Oyuncu 20 -> yirmi'de, Oyuncu 100 -> yüz'de.
const ONES = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
function spokenTail(digits) {
  const d = digits.replace(/^0+(?=\d)/, '');
  if (/^0+$/.test(d)) return 'sıfır';
  const last = Number(d[d.length - 1]);
  if (last) return ONES[last];
  const ten = Number(d[d.length - 2] || 0);
  if (ten) return TENS[ten];
  const zeros = d.length - d.replace(/0+$/, '').length; // trailing zeros
  if (zeros === 2) return 'yüz';
  if (zeros <= 5) return 'bin';
  if (zeros <= 8) return 'milyon';
  return 'milyar';
}

/**
 * Proper-noun suffix with apostrophe.
 *   nameSuffix('Ayşe', 'de')  -> "Ayşe'de"      (locative: -de/-da/-te/-ta)
 *   nameSuffix('Ahmet', 'de') -> "Ahmet'te"
 *   nameSuffix('Ayşe', 'e')   -> "Ayşe'ye"      (dative: -e/-a/-ye/-ya)
 *   nameSuffix('Ali', 'in')   -> "Ali'nin"      (genitive: -in/-ın/-un/-ün/-nin...)
 *   nameSuffix('Ali', 'i')    -> "Ali'yi"       (accusative: -i/-ı/-u/-ü/-yi...)
 * The sound comes from the last letter or number: a trailing emoji or mark is skipped (Beyza 💜'ya).
 */
export function nameSuffix(name, kind) {
  const n = String(name).trim();
  if (!n) return n;
  const core = n.replace(/[^\p{L}\p{N}]+$/u, ''); // an emoji-only name takes front suffixes: 💜'de
  const digits = (core.match(/\d+$/) || [''])[0];
  // the word whose sound decides the suffix: the last word of the name, or the number said aloud
  const tail = digits ? spokenTail(digits) : lowerTR(core.split(/[^\p{L}\p{N}]+/u).pop()).replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u');
  const lastCh = tail[tail.length - 1];
  // names with a soft final l take front suffixes against the vowel harmony: Kemal'de, Meral'in
  const softL = !digits && SOFT_L_NAMES.has(tail);
  const endsWithVowel = !softL && VOWELS.includes(lastCh);
  const voiceless = !softL && VOICELESS.includes(lastCh);
  const lv = softL ? 'e' : lastVowel(tail);
  const back = BACK_VOWELS.includes(lv);
  if (kind === 'de') {
    return `${n}'${voiceless ? 't' : 'd'}${back ? 'a' : 'e'}`;
  }
  if (kind === 'e') {
    return `${n}'${endsWithVowel ? 'y' : ''}${back ? 'a' : 'e'}`;
  }
  const v = ({ a: 'ı', ı: 'ı', o: 'u', u: 'u', e: 'i', i: 'i', ö: 'ü', ü: 'ü' })[lv] || 'i';
  if (kind === 'in') {
    // four-way harmony for genitive
    return `${n}'${endsWithVowel ? 'n' : ''}${v}n`;
  }
  if (kind === 'i') {
    return `${n}'${endsWithVowel ? 'y' : ''}${v}`;
  }
  return n;
}

const SOFT_L_NAMES = new Set(['kemal', 'cemal', 'celal', 'bilal', 'hilal', 'nihal', 'meral', 'hayal', 'zülal', 'visal', 'ikbal', 'iqbal', 'lal']);

/** The last vowel of a word ('e' when it has none, as in "Bğ"). */
function lastVowel(w) {
  for (let i = w.length - 1; i >= 0; i--) if (VOWELS.includes(w[i])) return w[i];
  return 'e';
}
