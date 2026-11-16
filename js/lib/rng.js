// Small seeded random generator (mulberry32) so that two devices can reproduce
// the same "random" choices from a shared seed.

export function createRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random 32-bit seed from the platform's secure generator (falls back to Math.random). */
export function randomSeed() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  }
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Fisher–Yates shuffle into a new array. */
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Play order that avoids repeats across games: the items whose key is not in `recent` come first
 * (shuffled), then the ones seen before, the longest-unseen first (shuffled within groups of
 * `bucket`). `recent` lists keys, oldest first (see the histories in js/app.js). With no history
 * this is the same as shuffle(rng, items).
 */
export function freshFirst(rng, items, keyOf, recent, bucket = 40) {
  const rank = new Map();
  (Array.isArray(recent) ? recent : []).forEach((k, i) => rank.set(String(k), i));
  const fresh = [];
  const seen = [];
  items.forEach((it) => (rank.has(String(keyOf(it))) ? seen : fresh).push(it));
  seen.sort((a, b) => rank.get(String(keyOf(a))) - rank.get(String(keyOf(b))));
  const out = shuffle(rng, fresh);
  for (let k = 0; k < seen.length; k += bucket) out.push(...shuffle(rng, seen.slice(k, k + bucket)));
  return out;
}
