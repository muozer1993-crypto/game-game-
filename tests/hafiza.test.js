import { test, assert } from './runner.js';
import game from '../games/hafiza.js';

test('hafıza: diziliş, eşleşme, kapanma ve sıra', () => {
  let s = game.setup({ size: 12, seed: 0 });
  assert.equal(s.cards.length, 12);
  const counts = {};
  s.cards.forEach((c) => { counts[c.sym] = (counts[c.sym] || 0) + 1; });
  assert.ok(Object.values(counts).every((n) => n === 2), 'every symbol twice');
  assert.deepEqual(game.setup({ size: 12, seed: 0 }).cards, s.cards, 'seeded');
  const first = 0;
  const partner = s.cards.findIndex((c, i) => i !== first && c.sym === s.cards[first].sym);
  const other = s.cards.findIndex((c, i) => c.sym !== s.cards[first].sym);
  assert.throws(() => game.applyMove(s, 1 - s.turn, { type: 'flip', card: 0 }), 'Sıra sende değil');
  const p = s.turn;
  s = game.applyMove(s, p, { type: 'flip', card: first });
  assert.deepEqual(s.open, [first]);
  assert.throws(() => game.applyMove(s, p, { type: 'flip', card: first }), 'zaten açık');
  // mismatch: stays open until hide, then the turn passes
  s = game.applyMove(s, p, { type: 'flip', card: other });
  assert.equal(s.open.length, 2);
  assert.throws(() => game.applyMove(s, p, { type: 'flip', card: partner }), 'Önce kartlar kapanmalı');
  // either device may close the pair (the mover's device may have dropped); the turn still passes once
  const byOther = game.applyMove(s, 1 - p, { type: 'hide' });
  assert.equal(byOther.turn, 1 - p);
  s = game.applyMove(s, p, { type: 'hide' });
  assert.equal(s.turn, 1 - p);
  assert.deepEqual(s.open, []);
  // match: scores and keeps the turn
  s = game.applyMove(s, 1 - p, { type: 'flip', card: first });
  s = game.applyMove(s, 1 - p, { type: 'flip', card: partner });
  assert.equal(s.cards[first].matched, 1 - p);
  assert.equal(s.scores[1 - p], 1);
  assert.equal(s.turn, 1 - p);
  assert.throws(() => game.applyMove(s, 1 - p, { type: 'hide' }), 'Kapanacak kart yok');
});

test('hafıza: bütün çiftler bulununca sonuç', () => {
  let s = game.setup({ size: 12, seed: 2 });
  const p = s.turn;
  while (!s.over) {
    const i = s.cards.findIndex((c) => c.matched === null);
    const j = s.cards.findIndex((c, k) => k !== i && c.matched === null && c.sym === s.cards[i].sym);
    s = game.applyMove(s, s.turn, { type: 'flip', card: i });
    s = game.applyMove(s, s.turn, { type: 'flip', card: j });
  }
  assert.deepEqual(s.scores, p === 0 ? [6, 0] : [0, 6]);
  assert.deepEqual(game.getResult(s), { winner: p });
});
