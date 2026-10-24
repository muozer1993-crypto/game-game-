import { test, assert } from './runner.js';
import { createRng, pick, shuffle } from '../js/lib/rng.js';

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
