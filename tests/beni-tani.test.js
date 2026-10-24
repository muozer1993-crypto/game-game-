import { test, assert } from './runner.js';
import game, { pickQuestions, points, formatPoints } from '../games/beni-tani.js';

const pool = [];
for (let i = 0; i < 30; i++) {
  pool.push(i % 3 === 0
    ? { id: `o-${i}`, category: 'tercih', type: 'open', text: `Açık soru ${i}?` }
    : { id: `c-${i}`, category: 'yemek', type: 'choice', text: `Seçmeli soru ${i}?`, options: ['A', 'B', 'C', 'D'] });
}
const ctx = { questions: { categories: { yemek: 'Yemek' }, questions: pool }, customQuestions: [] };

function fresh(options = {}) {
  return game.setup({ perRound: 5, seed: 11, customMode: 'first', ...options }, { ...ctx, ...(options.ctx || {}) });
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

test('beni tanı: kurulum — aynı tohum aynı soruları seçer, turlar farklı sorular', () => {
  const a = fresh();
  const b = fresh();
  assert.deepEqual(a.questions, b.questions);
  assert.equal(a.questions[0].length, 5);
  assert.equal(a.questions[1].length, 5);
  const ids = a.questions.flat().map((q) => q.id);
  assert.equal(new Set(ids).size, 10, 'no repeats across rounds');
  assert.notEqual(JSON.stringify(a.questions), JSON.stringify(fresh({ seed: 12 }).questions));
  assert.equal(a.phase, 'answer');
  assert.deepEqual(game.getTurn(a), { player: 0, private: true });
});

test('beni tanı: özel sorular önce gelir / karışır / kullanılmaz', () => {
  const custom = [{ id: 'x1', type: 'open', text: 'Özel 1?' }, { id: 'x2', type: 'choice', text: 'Özel 2?', options: ['1', '2'] }];
  const [r0, r1] = pickQuestions(pool, custom, 5, 'first', 3);
  // own questions are dealt to both rounds so that both players get asked them
  assert.deepEqual([r0[0].id, r1[0].id].sort(), ['x1', 'x2']);
  assert.equal(r0.length, 5);
  assert.equal(r1.length, 5);
  const none = pickQuestions(pool, custom, 5, 'none', 3).flat();
  assert.ok(!none.some((q) => q.id.startsWith('x')));
  const mixed = pickQuestions(pool, custom, 5, 'mix', 3).flat();
  assert.equal(mixed.length, 10);
  // invalid custom entries are dropped
  const [bad] = pickQuestions(pool, [{ type: 'choice', text: 'Tek seçenek', options: ['a'] }, { type: 'open', text: '' }], 5, 'first', 3);
  assert.ok(!bad.some((q) => q.text === 'Tek seçenek'));
});

test('beni tanı: küçük havuz döngüsel kullanılır, boş havuz hata verir', () => {
  const small = [{ id: 'a', type: 'open', text: 'A?' }, { id: 'b', type: 'open', text: 'B?' }];
  const [r0, r1] = pickQuestions(small, [], 5, 'first', 1);
  assert.equal(r0.length, 5);
  assert.equal(r1.length, 5);
  assert.throws(() => pickQuestions([], [], 5, 'first', 1), 'havuzu boş');
});

test('beni tanı: cevap → tahmin → karar → roller değişir → sonuç', () => {
  let s = fresh();
  const q0 = s.questions[0];
  // player 0 answers (secret), in order
  assert.throws(() => game.applyMove(s, 1, { type: 'answer', index: 0, secret: { value: 'A' } }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'answer', index: 1, secret: { value: 'A' } }), 'sırayla');
  for (let i = 0; i < 5; i++) {
    const q = q0[i];
    const value = q.type === 'choice' ? 'A' : `cevap ${i}`;
    if (q.type === 'choice') assert.throws(() => game.applyMove(s, 0, { type: 'answer', index: i, secret: { value: 'Z' } }), 'Seçeneklerden');
    s = game.applyMove(s, 0, { type: 'answer', index: i, secret: { value } });
  }
  assert.equal(s.phase, 'guess');
  assert.deepEqual(game.getTurn(s), { player: 1, private: true });
  // player 1 guesses: choice -> 'A' (match) except the last choice one -> 'B'; open -> 'tahmin'
  const choiceIdx = q0.map((q, i) => (q.type === 'choice' ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < 5; i++) {
    const q = q0[i];
    const value = q.type === 'choice' ? (i === choiceIdx[choiceIdx.length - 1] ? 'B' : 'A') : 'tahmin';
    s = game.applyMove(s, 1, { type: 'guess', index: i, value });
  }
  assert.equal(s.phase, 'judge');
  assert.deepEqual(game.getTurn(s), { player: 0, private: true });
  assert.equal(s.revealed[0], false);
  // the answerer's device reveals the answers; choice questions are judged automatically
  assert.equal(game.autoMove(s, 1), null);
  const reveal = game.autoMove(s, 0);
  assert.equal(reveal.type, 'reveal');
  s = game.applyMove(s, 0, reveal);
  assert.equal(s.revealed[0], true);
  choiceIdx.forEach((i, k) => assert.equal(s.judgments[0][i], k === choiceIdx.length - 1 ? 'miss' : 'match'));
  const openIdx = q0.map((q, i) => (q.type === 'open' ? i : -1)).filter((i) => i >= 0);
  openIdx.forEach((i) => assert.equal(s.judgments[0][i], null));
  assert.throws(() => game.applyMove(s, 0, { type: 'continue' }), 'karar ver');
  assert.throws(() => game.applyMove(s, 0, { type: 'judge', index: choiceIdx[0], verdict: 'match' }), 'otomatik');
  assert.throws(() => game.applyMove(s, 1, { type: 'judge', index: openIdx[0], verdict: 'match' }), 'sahibi karar verir');
  openIdx.forEach((i, k) => { s = game.applyMove(s, 0, { type: 'judge', index: i, verdict: k === 0 ? 'close' : 'match' }); });
  const expected = (choiceIdx.length - 1) * 1 + (openIdx.length - 1) * 1 + 0.5;
  assert.equal(points(s)[1], expected, 'player 1 scored as guesser of round 0');
  s = game.applyMove(s, 0, { type: 'continue' });
  assert.equal(s.phase, 'review', 'the guesser gets to look at the comparison');
  assert.deepEqual(game.getTurn(s), { player: 1, private: true });
  assert.throws(() => game.applyMove(s, 0, { type: 'continue' }), 'Sıra sende değil');
  s = game.applyMove(s, 1, { type: 'continue' });
  assert.equal(s.round, 1);
  assert.equal(s.phase, 'answer');
  assert.deepEqual(game.getTurn(s), { player: 1, private: true });
  // round 1: player 1 answers, player 0 guesses everything wrong
  const q1 = s.questions[1];
  for (let i = 0; i < 5; i++) s = game.applyMove(s, 1, { type: 'answer', index: i, secret: { value: q1[i].type === 'choice' ? 'A' : 'x' } });
  for (let i = 0; i < 5; i++) s = game.applyMove(s, 0, { type: 'guess', index: i, value: q1[i].type === 'choice' ? 'B' : 'y' });
  s = runAuto(s);
  assert.equal(s.revealed[1], true);
  q1.forEach((q, i) => { if (q.type === 'open') s = game.applyMove(s, 1, { type: 'judge', index: i, verdict: 'miss' }); });
  assert.equal(points(s)[0], 0);
  s = game.applyMove(s, 1, { type: 'continue' });
  assert.equal(s.phase, 'review');
  s = game.applyMove(s, 0, { type: 'continue' });
  assert.equal(s.phase, 'over');
  assert.deepEqual(game.getResult(s), { winner: 1 });
  assert.equal(game.getTurn(s), null);
});

test('beni tanı: online — tahmin eden cihaz cevapları görmeden ilerler, reveal ile öğrenir', () => {
  // the guesser's device receives answer moves without the secret field
  let s = fresh();
  for (let i = 0; i < 5; i++) s = game.applyMove(s, 0, { type: 'answer', index: i });
  assert.equal(s.phase, 'guess');
  assert.deepEqual(s.answers[0], [null, null, null, null, null]);
  for (let i = 0; i < 5; i++) s = game.applyMove(s, 1, { type: 'guess', index: i, value: s.questions[0][i].type === 'choice' ? 'A' : 'z' });
  assert.equal(s.phase, 'judge');
  assert.equal(game.autoMove(s, 0), null, 'cannot reveal without knowing the answers');
  const answers = s.questions[0].map((q) => (q.type === 'choice' ? 'A' : 'z'));
  s = game.applyMove(s, 0, { type: 'reveal', answers });
  assert.deepEqual(s.answers[0], answers);
  s.questions[0].forEach((q, i) => { if (q.type === 'choice') assert.equal(s.judgments[0][i], 'match'); });
});

test('beni tanı: prototip anahtarı karar olarak kabul edilmez', () => {
  let s = fresh();
  s = { ...s, phase: 'judge', revealed: [true, false] };
  const openIdx = s.questions[0].findIndex((q) => q.type === 'open');
  assert.throws(() => game.applyMove(s, 0, { type: 'judge', index: openIdx, verdict: 'constructor' }), 'Geçersiz karar');
});

test('beni tanı: berabere ve puan biçimi', () => {
  assert.equal(formatPoints(7), '7');
  assert.equal(formatPoints(7.5), '7,5');
  let s = fresh();
  s = { ...s, phase: 'over', judgments: [['match', 'close', null, null, null], ['match', 'close', null, null, null]] };
  assert.deepEqual(points(s), [1.5, 1.5]);
  assert.deepEqual(game.getResult(s), { draw: true });
});
