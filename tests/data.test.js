import { test, assert } from './runner.js';

// The content files are read straight from disk in Node; the browser test page skips these.
async function readJson(name) {
  if (typeof process === 'undefined' || !process.versions || !process.versions.node) return null;
  const fs = await import('node:fs');
  return JSON.parse(fs.readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
}
const key = (s) => String(s).trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
const dupes = (list) => list.filter((x, i) => list.indexOf(x) !== i);

test('veri: Genel Kültür soruları dört farklı şık, tek doğru cevap, benzersiz kimlik ve metin taşır', async () => {
  const d = await readJson('trivia.json');
  if (!d) return;
  const cats = Object.keys(d.categories);
  assert.ok(d.questions.length > 0);
  assert.deepEqual(dupes(d.questions.map((q) => q.id)), [], 'ids are unique');
  assert.deepEqual(dupes(d.questions.map((q) => key(q.text))), [], 'no question twice');
  for (const q of d.questions) {
    assert.ok(cats.includes(q.category), `${q.id}: known category`);
    assert.ok([1, 2, 3].includes(q.difficulty), `${q.id}: difficulty 1-3`);
    assert.ok(typeof q.text === 'string' && q.text.trim().length > 5, `${q.id}: text`);
    assert.ok(Array.isArray(q.options) && q.options.length === 4, `${q.id}: four options`);
    assert.deepEqual(dupes(q.options.map(key)), [], `${q.id}: options differ`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, `${q.id}: answer index`);
  }
});

test('veri: Tabu kartları benzersiz, her kartta beş farklı yasak kelime var', async () => {
  const d = await readJson('tabu.json');
  if (!d) return;
  assert.ok(d.cards.length > 0);
  assert.deepEqual(dupes(d.cards.map((c) => key(c.word))), [], 'no word twice (the deck and the history go by word)');
  for (const c of d.cards) {
    assert.ok(typeof c.word === 'string' && c.word.trim(), 'word');
    assert.ok(Array.isArray(c.taboo) && c.taboo.length === 5, `${c.word}: five taboo words`);
    assert.deepEqual(dupes(c.taboo.map(key)), [], `${c.word}: taboo words differ`);
    assert.ok(!c.taboo.some((t) => key(t) === key(c.word)), `${c.word}: the word itself is not a taboo word`);
  }
});

test('veri: Doğruluk mu Cesaret mi kartları boş değil ve tekrarlanmıyor', async () => {
  const d = await readJson('dogruluk.json');
  if (!d) return;
  for (const kind of ['truths', 'dares']) {
    assert.ok(d[kind].length > 0, kind);
    assert.ok(d[kind].every((t) => typeof t === 'string' && t.trim().length > 5), `${kind}: text`);
    assert.deepEqual(dupes(d[kind].map(key)), [], `${kind}: no card twice`);
  }
});

test('veri: Beni Tanı soruları benzersiz; seçmeli soruların farklı şıkları var, açık uçlularda şık yok', async () => {
  const d = await readJson('questions.json');
  if (!d) return;
  const cats = Object.keys(d.categories);
  assert.deepEqual(dupes(d.questions.map((q) => q.id)), [], 'ids are unique');
  assert.deepEqual(dupes(d.questions.map((q) => key(q.text))), [], 'no question twice');
  for (const q of d.questions) {
    assert.ok(cats.includes(q.category), `${q.id}: known category`);
    assert.ok(typeof q.text === 'string' && q.text.trim().length > 5, `${q.id}: text`);
    if (q.type === 'choice') {
      assert.ok(Array.isArray(q.options) && q.options.length >= 2, `${q.id}: options`);
      assert.deepEqual(dupes(q.options.map(key)), [], `${q.id}: options differ`);
    } else {
      assert.equal(q.type, 'open', `${q.id}: type`);
      assert.ok(!q.options || !q.options.length, `${q.id}: an open question has no options`);
    }
  }
});
