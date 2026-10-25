import { test, assert } from './runner.js';
import game, { pickQuestions, points, formatPoints, allJudged } from '../games/beni-tani.js';

const pool = [];
for (let i = 0; i < 30; i++) {
  pool.push(i % 3 === 0
    ? { id: `o-${i}`, category: 'tercih', type: 'open', text: `Açık soru ${i}?` }
    : { id: `c-${i}`, category: 'yemek', type: 'choice', text: `Seçmeli soru ${i}?`, options: ['A', 'B', 'C', 'D'] });
}
const ctx = { questions: { categories: { yemek: 'Yemek' }, questions: pool }, customQuestions: [] };

function fresh(options = {}) {
  return game.setup({ count: 5, seed: 11, customMode: 'first', ...options }, { ...ctx, ...(options.ctx || {}) });
}

function runAuto(s, players = [0, 1]) {
  for (let guard = 0; guard < 10; guard++) {
    let did = false;
    for (const p of players) {
      const m = game.autoMove(s, p);
      if (m) { s = game.applyMove(s, p, m); did = true; break; }
    }
    if (!did) break;
  }
  return s;
}

const val = (q, tag) => (q.type === 'choice' ? 'A' : `${tag}`);

test('beni tanı: kurulum — aynı tohum aynı soruları seçer, iki oyuncuya tek soru seti', () => {
  const a = fresh();
  const b = fresh();
  assert.deepEqual(a.questions, b.questions);
  assert.equal(a.questions.length, 5);
  assert.equal(new Set(a.questions.map((q) => q.id)).size, 5);
  assert.notEqual(JSON.stringify(a.questions), JSON.stringify(fresh({ seed: 12 }).questions));
  assert.equal(a.phase, 'play');
  assert.deepEqual(game.getTurn(a), { player: 0, private: true, simultaneous: true });
});

test('beni tanı: özel sorular önce gelir / karışır / kullanılmaz', () => {
  const custom = [{ id: 'x1', type: 'open', text: 'Özel 1?' }, { id: 'x2', type: 'choice', text: 'Özel 2?', options: ['1', '2'] }];
  const first = pickQuestions(pool, custom, 5, 'first', 3);
  assert.deepEqual(first.slice(0, 2).map((q) => q.id).sort(), ['x1', 'x2']);
  const none = pickQuestions(pool, custom, 5, 'none', 3);
  assert.ok(!none.some((q) => q.id.startsWith('x')));
  assert.equal(pickQuestions(pool, custom, 5, 'mix', 3).length, 5);
  const bad = pickQuestions(pool, [{ type: 'choice', text: 'Tek seçenek', options: ['a'] }, { type: 'open', text: '' }], 5, 'first', 3);
  assert.ok(!bad.some((q) => q.text === 'Tek seçenek'));
  assert.equal(pickQuestions([{ id: 'a', type: 'open', text: 'A?' }], [], 5, 'first', 1).length, 5, 'small pools cycle');
  assert.throws(() => pickQuestions([], [], 5, 'first', 1), 'havuzu boş');
});

test('beni tanı: önce kendi cevapların, sonra tahminler; ikisi bitince karşılaştırma', () => {
  let s = fresh();
  const qs = s.questions;
  assert.throws(() => game.applyMove(s, 0, { type: 'guess', index: 0, value: 'A' }), 'Önce kendi cevaplarını');
  assert.throws(() => game.applyMove(s, 0, { type: 'answer', index: 1, secret: { value: 'A' } }), 'sırayla');
  for (let i = 0; i < 5; i++) s = game.applyMove(s, 0, { type: 'answer', index: i, secret: { value: val(qs[i], 'ben0') } });
  assert.equal(s.answered[0], 5);
  assert.deepEqual(game.getTurn(s), { player: 0, private: true, simultaneous: true }, 'still player 0: guesses come next');
  for (let i = 0; i < 5; i++) s = game.applyMove(s, 0, { type: 'guess', index: i, value: val(qs[i], 'tahmin0') });
  assert.equal(s.finished[0], true);
  assert.equal(s.phase, 'play');
  assert.deepEqual(game.getTurn(s), { player: 1, private: true, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'answer', index: 5, secret: { value: 'A' } }), 'Bitirdin');
  // player 1 answers B for choice questions (so player 0's guesses "A" miss) and guesses A (match player 0)
  for (let i = 0; i < 5; i++) s = game.applyMove(s, 1, { type: 'answer', index: i, secret: { value: qs[i].type === 'choice' ? 'B' : 'ben1' } });
  for (let i = 0; i < 5; i++) s = game.applyMove(s, 1, { type: 'guess', index: i, value: val(qs[i], 'tahmin1') });
  assert.equal(s.phase, 'compare');
  assert.equal(game.getTurn(s), null, 'comparison is looked at together');
  s = runAuto(s);
  assert.deepEqual(s.revealed, [true, true]);
  const choice = qs.map((q, i) => (q.type === 'choice' ? i : -1)).filter((i) => i >= 0);
  const open = qs.map((q, i) => (q.type === 'open' ? i : -1)).filter((i) => i >= 0);
  choice.forEach((i) => { assert.equal(s.judgments[0][i], 'match'); assert.equal(s.judgments[1][i], 'miss'); });
  open.forEach((i) => { assert.equal(s.judgments[0][i], null); assert.equal(s.judgments[1][i], null); });
  assert.equal(allJudged(s), false);
  assert.throws(() => game.applyMove(s, 0, { type: 'finish' }), 'karar verilmeli');
  // on one phone either player may press the owner's buttons; online only the owner
  assert.throws(() => game.applyMove(s, 1, { type: 'judge', owner: 0, index: open[0], verdict: 'match' }, { mode: 'online' }), 'sahibi karar verir');
  s = game.applyMove(s, 1, { type: 'judge', owner: 0, index: open[0], verdict: 'match' }, { mode: 'local' });
  open.forEach((i, k) => { if (k) s = game.applyMove(s, 0, { type: 'judge', owner: 0, index: i, verdict: 'close' }); });
  open.forEach((i) => { s = game.applyMove(s, 1, { type: 'judge', owner: 1, index: i, verdict: 'miss' }); });
  assert.equal(allJudged(s), true);
  const p = points(s);
  assert.equal(p[1], choice.length + 1 + 0.5 * (open.length - 1), 'player 1 guessed player 0 well');
  assert.equal(p[0], 0, 'player 0 missed everything');
  s = game.applyMove(s, 0, { type: 'finish' });
  assert.equal(s.phase, 'over');
  assert.deepEqual(game.getResult(s), { winner: 1 });
});

test('beni tanı: online — iki oyuncu aynı anda ilerler, cevaplar reveal ile gelir', () => {
  let s = fresh();
  const qs = s.questions;
  // both devices interleave moves; the guesser device receives stripped answer moves
  for (let i = 0; i < 5; i++) {
    s = game.applyMove(s, 1, { type: 'answer', index: i });
    s = game.applyMove(s, 0, { type: 'answer', index: i, secret: { value: val(qs[i], 'ben0') } });
  }
  for (let i = 0; i < 5; i++) {
    s = game.applyMove(s, 0, { type: 'guess', index: i, value: val(qs[i], 'g0') });
    s = game.applyMove(s, 1, { type: 'guess', index: i, value: val(qs[i], 'g1') });
  }
  assert.equal(s.phase, 'compare');
  assert.deepEqual(s.answers[1], [null, null, null, null, null], 'the other player\'s answers are unknown here');
  assert.equal(game.autoMove(s, 1), null, 'cannot reveal what it does not know');
  const mine = game.autoMove(s, 0);
  assert.equal(mine.type, 'reveal');
  s = game.applyMove(s, 0, mine);
  s = game.applyMove(s, 1, { type: 'reveal', answers: qs.map((q) => val(q, 'ben1')) });
  assert.deepEqual(s.revealed, [true, true]);
  qs.forEach((q, i) => { if (q.type === 'choice') { assert.equal(s.judgments[0][i], 'match'); assert.equal(s.judgments[1][i], 'match'); } });
});

test('beni tanı: prototip anahtarı karar olarak kabul edilmez, berabere ve puan biçimi', () => {
  assert.equal(formatPoints(7), '7');
  assert.equal(formatPoints(7.5), '7,5');
  let s = fresh();
  s = { ...s, phase: 'compare', revealed: [true, true] };
  const openIdx = s.questions.findIndex((q) => q.type === 'open');
  assert.throws(() => game.applyMove(s, 0, { type: 'judge', owner: 0, index: openIdx, verdict: 'constructor' }), 'Geçersiz karar');
  s = { ...s, phase: 'over', judgments: [['match', 'close', null, null, null], ['match', 'close', null, null, null]] };
  assert.deepEqual(points(s), [1.5, 1.5]);
  assert.deepEqual(game.getResult(s), { draw: true });
});
