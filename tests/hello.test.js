import { test, assert } from './runner.js';
import { boundedHello, helloMessages, HELLO_MAX_BYTES } from '../js/lib/hello.js';

const bytes = (o) => new TextEncoder().encode(JSON.stringify(o)).byteLength;
const list = (prefix, n) => Array.from({ length: n }, (_, i) => [`${prefix}-${String(i).padStart(3, '0')}-uzun bir anahtar`, 1794800000000 + i]);

test('selamlaşma: geçmişler JSON kanalının sınırını aşmaz, en yeni görülenler kalır', () => {
  const base = { t: 'hello', name: 'Gülşen Nur Yıldırımm', v: 'v121', clock: 1 };
  const small = boundedHello(base, { tabu: list('t', 3), trivia: list('q', 2) });
  assert.equal(small.tabuSeen.length, 3, 'small lists go out whole');
  assert.equal(small.seen.trivia.length, 2);
  assert.equal(small.name, base.name);
  const big = boundedHello(base, { tabu: list('t', 600), trivia: list('q', 500), dogruluk: list('d', 300), questions: list('b', 300) });
  assert.ok(bytes(big) <= HELLO_MAX_BYTES, `fits: ${bytes(big)} bytes`);
  assert.ok(bytes(big) < 16300, 'under the PeerJS JSON channel limit');
  assert.ok(big.tabuSeen.length > 50 && big.seen.trivia.length > 50, 'every list keeps a good part');
  assert.equal(big.tabuSeen[big.tabuSeen.length - 1][0], 't-599-uzun bir anahtar', 'the newest sighting stays');
  assert.equal(big.seen.questions[big.seen.questions.length - 1][0], 'b-299-uzun bir anahtar');
  const none = boundedHello(base, { tabu: [] });
  assert.deepEqual(none.tabuSeen, []);
  assert.deepEqual(none.seen, {});
});

test('selamlaşma: selama sığmayan geçmişler ayrı mesajlarla bütün gider', () => {
  const base = { t: 'hello', name: 'Gülşen Nur Yıldırımm', v: 'v121', clock: 7 };
  const word = (prefix, n) => Array.from({ length: n }, (_, i) => [`${prefix}-${String(i).padStart(3, '0')}`, 1794800000000 + i]); // card-sized keys
  const lists = { tabu: word('kelime', 374), trivia: word('tarih', 494), dogruluk: word('d', 217), questions: word('yemek', 172) };
  const [hello, ...more] = helloMessages(base, lists);
  assert.equal(hello.t, 'hello');
  assert.ok(hello.tabuSeen.length < 374, 'the greeting itself is cut');
  for (const m of [hello, ...more]) assert.ok(bytes(m) <= HELLO_MAX_BYTES, `fits: ${bytes(m)} bytes`);
  const got = Object.fromEntries(more.map((m) => [m.k, m]));
  for (const k of Object.keys(lists)) {
    assert.equal(got[k].t, 'seen');
    assert.equal(got[k].clock, 7);
    assert.deepEqual(got[k].list, lists[k], `${k} goes out whole`);
  }
  assert.deepEqual(helloMessages(base, { tabu: list('t', 3), trivia: list('q', 2) }).slice(1), [], 'nothing more when the greeting holds it all');
  const huge = helloMessages(base, { tabu: list('t', 1200) });
  assert.ok(huge.every((m) => bytes(m) <= HELLO_MAX_BYTES), 'a list too big alone is cut too');
  assert.equal(huge[1].list[huge[1].list.length - 1][0], 't-1199-uzun bir anahtar', 'keeping its newest');
});
