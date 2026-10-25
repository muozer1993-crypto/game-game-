import { test, assert } from './runner.js';
import game, { pickQuestions, scoreOf } from '../games/genel-kultur.js';

const pool = [];
const cats = ['cografya', 'tarih', 'bilim', 'spor'];
for (let i = 0; i < 40; i++) pool.push({ id: `q${i}`, category: cats[i % 4], difficulty: 1 + (i % 3), text: `Soru ${i}?`, options: ['a', 'b', 'c', 'd'], answer: i % 4 });
const ctx = { trivia: { categories: { cografya: 'Coğrafya' }, questions: pool } };

test('genel kültür: seçim — tohuma bağlı, kategoriler dengeli, zorluk süzgeci', () => {
  const a = pickQuestions(pool, 8, 'mixed', 5);
  const b = pickQuestions(pool, 8, 'mixed', 5);
  assert.deepEqual(a.map((q) => q.id), b.map((q) => q.id));
  assert.equal(a.length, 8);
  assert.equal(new Set(a.map((q) => q.id)).size, 8);
  const perCat = {};
  a.forEach((q) => { perCat[q.category] = (perCat[q.category] || 0) + 1; });
  assert.ok(Object.values(perCat).every((n) => n <= 3), 'no category dominates: ' + JSON.stringify(perCat));
  assert.ok(pickQuestions(pool, 10, 'easy', 1).every((q) => q.difficulty <= 2));
  assert.ok(pickQuestions(pool, 10, 'hard', 1).every((q) => q.difficulty >= 2));
  assert.throws(() => pickQuestions([], 5, 'mixed', 1), 'havuzu boş');
  assert.ok(!pickQuestions([{ text: 'x', options: ['a'], answer: 0 }, pool[0]], 2, 'mixed', 1).some((q) => q.text === 'x'), 'malformed questions dropped');
});

test('genel kültür: cevaplama, süre sınırı, sonuç ve hız beraberliği', () => {
  let s = game.setup({ count: 5, timeLimit: 10, seed: 3 }, ctx);
  assert.equal(s.questions.length, 5);
  assert.deepEqual(game.getTurn(s), { player: 0, private: true, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'answer', index: 1, choice: 0, ms: 100 }), 'sırayla');
  assert.throws(() => game.applyMove(s, 0, { type: 'answer', index: 0, choice: 7, ms: 100 }), 'Geçersiz cevap');
  // player 0: all correct, 1 s each; player 1: all correct, 0.5 s each
  for (let i = 0; i < 5; i++) s = game.applyMove(s, 0, { type: 'answer', index: i, choice: s.questions[i].answer, ms: 1000 });
  assert.deepEqual(game.getTurn(s), { player: 1, private: true, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'answer', index: 5, choice: 0, ms: 1 }), 'Bütün soruları');
  for (let i = 0; i < 5; i++) s = game.applyMove(s, 1, { type: 'answer', index: i, choice: s.questions[i].answer, ms: 500 });
  assert.equal(s.phase, 'over');
  assert.deepEqual(scoreOf(s, 0), { correct: 5, ms: 5000 });
  assert.deepEqual(game.getResult(s), { winner: 1 }, 'same score: the faster player wins');
  // time-outs count as wrong and are clamped to the limit
  let t = game.setup({ count: 5, timeLimit: 10, seed: 3 }, ctx);
  t = game.applyMove(t, 0, { type: 'answer', index: 0, choice: -1, ms: 99999 });
  assert.equal(t.answers[0][0].ms, 10000);
  assert.equal(scoreOf(t, 0).correct, 0);
  // identical results -> draw
  let d = game.setup({ count: 5, timeLimit: 0, seed: 3 }, ctx);
  for (let p of [0, 1]) for (let i = 0; i < 5; i++) d = game.applyMove(d, p, { type: 'answer', index: i, choice: 0, ms: 700 });
  assert.deepEqual(game.getResult(d), { draw: true });
});
