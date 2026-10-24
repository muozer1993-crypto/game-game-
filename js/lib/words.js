// Loads the word lists under data/ once and caches them.
//  - data/words-tr.txt   : one lowercase word per line, used to validate words
//  - data/common-tr.json : { "4": [...], "5": [...], "6": [...] } common words for secrets
import { normalizeWord } from './tr.js';

const DICT_URL = new URL('../../data/words-tr.txt', import.meta.url);
const COMMON_URL = new URL('../../data/common-tr.json', import.meta.url);

let dictPromise = null;
let commonPromise = null;

/** @returns {Promise<{has(word: string): boolean, size: number}>} */
export function loadDictionary() {
  if (!dictPromise) {
    dictPromise = fetch(DICT_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Kelime listesi yüklenemedi (${r.status})`);
        return r.text();
      })
      .then((text) => {
        const set = new Set();
        for (const line of text.split('\n')) {
          const w = line.trim();
          if (w && w[0] !== '#') set.add(w);
        }
        return {
          has: (word) => set.has(normalizeWord(word)),
          size: set.size,
        };
      })
      .catch((err) => {
        dictPromise = null;
        throw err;
      });
  }
  return dictPromise;
}

/** @returns {Promise<Record<string, string[]>>} */
export function loadCommonWords() {
  if (!commonPromise) {
    commonPromise = fetch(COMMON_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Yaygın kelime listesi yüklenemedi (${r.status})`);
        return r.json();
      })
      .catch((err) => {
        commonPromise = null;
        throw err;
      });
  }
  return commonPromise;
}

/** Build a dictionary object from an array (used by tests and the "no list" fallback). */
export function dictionaryFrom(words) {
  const set = new Set(words.map(normalizeWord));
  return { has: (w) => set.has(normalizeWord(w)), size: set.size };
}
