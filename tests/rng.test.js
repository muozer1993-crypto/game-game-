import { test, assert } from './runner.js';
import { createRng, pick, shuffle, freshFirst } from '../js/lib/rng.js';

test('rng: aynı tohum aynı diziyi üretir', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});

test('rng: değerler [0,1) aralığında', () => {
  const r = createRng(7);
  for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});

test('rng: shuffle bir permütasyon döndürür, girdiyi bozmaz', () => {
  const arr = [1, 2, 3, 4, 5, 6];
  const out = shuffle(createRng(3), arr);
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(out.slice().sort(), [1, 2, 3, 4, 5, 6]);
});

test('rng: pick diziden eleman seçer', () => {
  const r = createRng(9);
  for (let i = 0; i < 50; i++) assert.ok(['a', 'b', 'c'].includes(pick(r, ['a', 'b', 'c'])));
});

test('rng: freshFirst görülmemişleri önce, görülenleri en eskiden başlayarak sona koyar', () => {
  const items = Array.from({ length: 12 }, (_, i) => `k${i}`);
  assert.deepEqual(freshFirst(createRng(9), items, (x) => x, []), shuffle(createRng(9), items), 'no history: a plain shuffle');
  const recent = ['k3', 'k0', 'k7']; // oldest first
  const out = freshFirst(createRng(9), items, (x) => x, recent, 1);
  assert.equal(out.length, 12);
  assert.deepEqual(out.slice().sort(), items.slice().sort());
  assert.deepEqual(out.slice(-3), ['k3', 'k0', 'k7'], 'seen ones last, longest-unseen first');
  assert.ok(out.slice(0, 9).every((x) => !recent.includes(x)));
  assert.deepEqual(freshFirst(createRng(9), items, (x) => x, recent), freshFirst(createRng(9), items, (x) => x, recent), 'deterministic');
});
