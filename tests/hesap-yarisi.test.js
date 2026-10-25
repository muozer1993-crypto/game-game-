import { test, assert } from './runner.js';
import game, { generateQuestions, scoreOf } from '../games/hesap-yarisi.js';

const evaluate = (text) => {
  const t = text.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
  return Function(`return (${t})`)();
};

test('hesap yarışı: sorular tohuma göre aynı, cevaplar doğru ve negatif değil', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const qs = generateQuestions(20, level, 11);
    assert.equal(qs.length, 20, level);
    assert.deepEqual(qs, generateQuestions(20, level, 11));
    assert.equal(new Set(qs.map((q) => q.text)).size, 20, 'no repeats');
    for (const q of qs) {
      assert.equal(evaluate(q.text), q.answer, `${q.text} = ${q.answer}`);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0);
    }
  }
  assert.notEqual(generateQuestions(5, 'easy', 1).map((q) => q.text).join(), generateQuestions(5, 'easy', 2).map((q) => q.text).join());
  const easy = generateQuestions(30, 'easy', 3);
  assert.ok(easy.every((q) => q.answer <= 45), 'easy answers stay small');
});

test('hesap yarışı: cevaplama, süre, puan ve sonuç', () => {
  let s = game.setup({ count: 5, level: 'easy', timeLimit: 10, seed: 3 });
  assert.equal(s.questions.length, 5);
  assert.deepEqual(game.getTurn(s), { player: 0, private: true, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'answer', index: 1, value: 1, ms: 100 }), 'sırayla');
  assert.throws(() => game.applyMove(s, 0, { type: 'answer', index: 0, value: -3, ms: 100 }), 'Geçersiz cevap');
  for (let i = 0; i < 5; i++) s = game.applyMove(s, 0, { type: 'answer', index: i, value: s.questions[i].answer, ms: 1000 });
  assert.deepEqual(game.getTurn(s), { player: 1, private: true, simultaneous: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'answer', index: 5, value: 1, ms: 1 }), 'Bütün soruları');
  // player 1: four right, one timed out, faster
  for (let i = 0; i < 4; i++) s = game.applyMove(s, 1, { type: 'answer', index: i, value: s.questions[i].answer, ms: 500 });
  s = game.applyMove(s, 1, { type: 'answer', index: 4, value: null, ms: 99999 });
  assert.equal(s.phase, 'over');
  assert.deepEqual(scoreOf(s, 0), { correct: 5, ms: 5000 });
  assert.deepEqual(scoreOf(s, 1), { correct: 4, ms: 2000 + 10000 }, 'time-out clamped to the limit');
  assert.deepEqual(game.getResult(s), { winner: 0 });
  // equal correct: the faster wins; everything equal: draw
  let t = game.setup({ count: 5, level: 'medium', timeLimit: 0, seed: 4 });
  for (let i = 0; i < 5; i++) t = game.applyMove(t, 0, { type: 'answer', index: i, value: t.questions[i].answer, ms: 800 });
  for (let i = 0; i < 5; i++) t = game.applyMove(t, 1, { type: 'answer', index: i, value: t.questions[i].answer, ms: 700 });
  assert.deepEqual(game.getResult(t), { winner: 1 });
  let d = game.setup({ count: 5, level: 'hard', timeLimit: 0, seed: 4 });
  for (let i = 0; i < 5; i++) d = game.applyMove(d, 0, { type: 'answer', index: i, value: 0, ms: 100 });
  for (let i = 0; i < 5; i++) d = game.applyMove(d, 1, { type: 'answer', index: i, value: 0, ms: 100 });
  assert.deepEqual(game.getResult(d), { draw: true });
});
