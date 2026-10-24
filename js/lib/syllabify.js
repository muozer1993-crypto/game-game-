// Rule-based Turkish syllabification.
//  - Each syllable has exactly one vowel.
//  - A single consonant between two vowels goes to the next syllable (ki-tap).
//  - With two or more consonants between vowels, only the last one goes to the
//    next syllable (an-ne, kar-deş, Türk-çe).
//  - Two adjacent vowels split (sa-at).
//  - A consonant cluster at the start of the word stays in the first syllable (spor, tren),
//    trailing consonants stay in the last syllable (Türk).
// The rule is applied uniformly, also to loanwords (e-lekt-rik, kont-rol): a "keep the
// tr/pl cluster together" exception would wrongly split native suffixed words such as
// Türk-ler, renk-li, dert-li, harf-ler, which matters for Son Hece.
import { isVowel } from './tr.js';

/**
 * @param {string} word  a single word (letters only; case is preserved in the output)
 * @returns {string[]}   syllables, e.g. syllabify('kitap') -> ['ki', 'tap']
 */
export function syllabify(word) {
  const chars = [...String(word)];
  if (chars.length === 0) return [];
  const vowelIdx = [];
  chars.forEach((ch, i) => { if (isVowel(ch)) vowelIdx.push(i); });
  if (vowelIdx.length <= 1) return [chars.join('')];

  const syllables = [];
  let start = 0;
  for (let k = 0; k < vowelIdx.length - 1; k++) {
    const v1 = vowelIdx[k];
    const v2 = vowelIdx[k + 1];
    const consonants = v2 - v1 - 1;
    // 0 consonants: split between the vowels; otherwise the last consonant
    // before the next vowel starts the next syllable.
    const cut = consonants === 0 ? v2 : v2 - 1;
    syllables.push(chars.slice(start, cut).join(''));
    start = cut;
  }
  syllables.push(chars.slice(start).join(''));
  return syllables;
}

/** Last syllable of a word, or '' for an empty string. */
export function lastSyllable(word) {
  const s = syllabify(word);
  return s.length ? s[s.length - 1] : '';
}
