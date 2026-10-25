import { test, assert } from './runner.js';
import game, { scoreFor, totalOf, upperSum, rollDice, CATS, BONUS } from '../games/zar-pokeri.js';

test('zar pokeri: hane puanları', () => {
  assert.equal(scoreFor('ones', [1, 1, 3, 1, 6]), 3);
  assert.equal(scoreFor('sixes', [6, 6, 6, 6, 2]), 24);
  assert.equal(scoreFor('pair', [2, 2, 5, 5, 1]), 10, 'highest pair');
  assert.equal(scoreFor('pair', [1, 2, 3, 4, 6]), 0);
  assert.equal(scoreFor('twoPairs', [2, 2, 5, 5, 1]), 14);
  assert.equal(scoreFor('twoPairs', [2, 2, 2, 2, 1]), 0, 'four of a kind is not two pairs');
  assert.equal(scoreFor('three', [4, 4, 4, 2, 1]), 12);
  assert.equal(scoreFor('three', [4, 4, 4, 4, 1]), 12, 'four of a kind counts as three');
  assert.equal(scoreFor('four', [4, 4, 4, 4, 1]), 16);
  assert.equal(scoreFor('small', [5, 4, 3, 2, 1]), 15);
  assert.equal(scoreFor('small', [5, 4, 3, 2, 2]), 0);
  assert.equal(scoreFor('large', [6, 5, 4, 3, 2]), 20);
  assert.equal(scoreFor('full', [3, 3, 3, 5, 5]), 19);
  assert.equal(scoreFor('full', [3, 3, 3, 3, 5]), 0);
  assert.equal(scoreFor('full', [3, 3, 3, 3, 3]), 0, 'five of a kind is not a full house');
  assert.equal(scoreFor('chance', [1, 2, 3, 4, 5]), 15);
  assert.equal(scoreFor('yatzy', [2, 2, 2, 2, 2]), 50);
  assert.equal(scoreFor('yatzy', [2, 2, 2, 2, 3]), 0);
  const sheet = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, chance: 20 };
  assert.equal(upperSum(sheet), 63);
  assert.equal(totalOf(sheet), 83 + BONUS);
  assert.equal(totalOf({ ...sheet, sixes: 12 }), 77, 'no bonus below 63');
  assert.equal(CATS.length, 15);
});

test('zar pokeri: atış, tutma, hane yazma, sıra, bitiş', () => {
  let s = game.setup({ seed: 11 });
  assert.deepEqual(game.getTurn(s), { player: 0, private: false });
  assert.throws(() => game.applyMove(s, 1, { type: 'roll' }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'score', cat: 'chance' }), 'Önce zar at');
  s = game.applyMove(s, 0, { type: 'roll', held: [true, true, true, true, true] }); // held ignored on the first roll
  assert.equal(s.rollsLeft, 2);
  assert.ok(s.dice.every((d) => d >= 1 && d <= 6));
  assert.deepEqual(s.dice, rollDice(11, 1, [0, 0, 0, 0, 0], [false, false, false, false, false]));
  const first = s.dice.slice();
  assert.throws(() => game.applyMove(s, 0, { type: 'roll', held: [true, true, true, true, true] }), 'Bütün zarları tutarak');
  s = game.applyMove(s, 0, { type: 'roll', held: [true, false, true, false, false] });
  assert.equal(s.dice[0], first[0]);
  assert.equal(s.dice[2], first[2]);
  assert.equal(s.rollsLeft, 1);
  s = game.applyMove(s, 0, { type: 'roll', held: [false, false, false, false, false] });
  assert.equal(s.rollsLeft, 0);
  assert.throws(() => game.applyMove(s, 0, { type: 'roll' }), 'atış hakkın bitti');
  assert.throws(() => game.applyMove(s, 0, { type: 'score', cat: 'nope' }), 'Geçersiz hane');
  const chance = s.dice.reduce((a, b) => a + b, 0);
  s = game.applyMove(s, 0, { type: 'score', cat: 'chance' });
  assert.equal(s.sheets[0].chance, chance);
  assert.equal(s.turn, 1);
  assert.deepEqual(s.dice, [0, 0, 0, 0, 0]);
  assert.equal(s.rollsLeft, 3);
  s = game.applyMove(s, 1, { type: 'roll' });
  const t1 = game.applyMove(s, 1, { type: 'score', cat: 'chance' });
  assert.equal(t1.sheets[1].chance, s.dice.reduce((a, b) => a + b, 0), 'player 1 scores its own dice');
  assert.equal(t1.sheets[0].chance, chance, 'player 0 sheet untouched');
  assert.equal(t1.turn, 0);
  // play to the end: one roll each, first free category
  let guard = 0;
  while (s.phase === 'play' && guard++ < 100) {
    const t = s.turn;
    if (!s.dice[0]) s = game.applyMove(s, t, { type: 'roll' });
    const cat = CATS.find((x) => s.sheets[t][x.id] == null);
    s = game.applyMove(s, t, { type: 'score', cat: cat.id });
  }
  assert.equal(s.phase, 'over');
  assert.ok(CATS.every((x) => s.sheets[0][x.id] != null && s.sheets[1][x.id] != null));
  const r = game.getResult(s);
  const [a, b] = s.sheets.map(totalOf);
  assert.ok(r && (a === b ? r.draw : r.winner === (a > b ? 0 : 1)));
  assert.throws(() => game.applyMove(s, 0, { type: 'roll' }), 'Oyun bitti');
});
