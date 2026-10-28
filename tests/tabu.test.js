import { test, assert } from './runner.js';
import game, { roundScore, firstDescriber, cardAt, buildDeck, shownCards } from '../games/tabu.js';
import { createRng } from '../js/lib/rng.js';

const cards = Array.from({ length: 6 }, (_, i) => ({ word: `k${i}`, taboo: ['a', 'b', 'c', 'd', 'e'] }));
const ctx = { tabu: { cards } };
const fresh = (opts = {}) => game.setup({ rounds: 2, seconds: 45, seed: 2, ...opts }, ctx); // seed 2: player 0 describes first

test('tabu: kurulum — tohumlu deste, kart yoksa hata', () => {
  const s = fresh();
  assert.equal(s.deck.length, 6);
  assert.deepEqual(s.deck.slice().sort(), [0, 1, 2, 3, 4, 5], 'every card once');
  assert.deepEqual(fresh().deck, s.deck, 'same seed, same order');
  assert.notEqual(fresh({ seed: 9 }).deck.join(), s.deck.join());
  assert.equal(s.describer, 0);
  assert.equal(s.phase, 'ready');
  assert.deepEqual(game.getTurn(s), { player: 0, private: true });
  assert.throws(() => game.setup({ seed: 1 }, {}), 'kartları yüklenemedi');
  assert.equal(cardAt(s, ctx), cards[s.deck[0]]);
  assert.equal(s.mode, 'tabu');
  assert.equal(fresh({ mode: 'mime' }).mode, 'mime', 'sessiz sinema mode');
});

test('tabu: tur akışı — başla, kartlar, puan, bitir, roller değişir, sonuç', () => {
  let s = fresh();
  assert.throws(() => game.applyMove(s, 1, { type: 'start' }), 'anlatan sen değilsin');
  assert.throws(() => game.applyMove(s, 0, { type: 'card', card: s.deck[0], result: 'ok' }), 'Tur oynanmıyor');
  s = game.applyMove(s, 0, { type: 'start' });
  assert.equal(s.phase, 'play');
  assert.throws(() => game.applyMove(s, 0, { type: 'start' }), 'zaten başladı');
  assert.throws(() => game.applyMove(s, 1, { type: 'card', card: s.deck[0], result: 'ok' }), 'anlatan işaretler');
  assert.throws(() => game.applyMove(s, 0, { type: 'card', card: s.deck[1], result: 'ok' }), 'Kart uyuşmuyor');
  assert.throws(() => game.applyMove(s, 0, { type: 'card', card: s.deck[0], result: 'maybe' }), 'Geçersiz sonuç');
  s = game.applyMove(s, 0, { type: 'card', card: s.deck[0], result: 'ok' });
  s = game.applyMove(s, 0, { type: 'card', card: s.deck[1], result: 'pass' });
  s = game.applyMove(s, 0, { type: 'card', card: s.deck[2], result: 'taboo' });
  s = game.applyMove(s, 0, { type: 'card', card: s.deck[3], result: 'ok' });
  assert.equal(s.cursor, 4);
  assert.deepEqual(s.scores, [1, 0], '+1 0 -1 +1');
  assert.equal(roundScore(s.log[0]), 1);
  assert.equal(cardAt(s, ctx), cards[s.deck[4]], 'the next card is dealt');
  assert.throws(() => game.applyMove(s, 1, { type: 'end' }), 'anlatan bitirir');
  s = game.applyMove(s, 0, { type: 'end' });
  assert.equal(s.phase, 'summary');
  assert.equal(game.getTurn(s), null);
  // the card on the screen when the round ended is put aside: 0 points, listed, never dealt again to the guesser
  assert.equal(s.cursor, 5);
  assert.deepEqual(s.log[0].at(-1), { card: s.deck[4], result: 'time' });
  assert.deepEqual(s.scores, [1, 0]);
  assert.equal(roundScore(s.log[0]), 1);
  assert.throws(() => game.applyMove(s, 0, { type: 'card', card: s.deck[4], result: 'ok' }), 'Tur oynanmıyor');
  assert.throws(() => game.applyMove(s, 0, { type: 'card', card: s.deck[4], result: 'time' }), 'Tur oynanmıyor');
  s = game.applyMove(s, 1, { type: 'next' });
  assert.equal(s.round, 1);
  assert.equal(s.describer, 1, 'roles swap');
  assert.equal(s.phase, 'ready');
  assert.deepEqual(s.log, [[{ card: s.deck[0], result: 'ok' }, { card: s.deck[1], result: 'pass' }, { card: s.deck[2], result: 'taboo' }, { card: s.deck[3], result: 'ok' }, { card: s.deck[4], result: 'time' }], []]);
  assert.equal(firstDescriber(s), 0);
  s = game.applyMove(s, 1, { type: 'start' });
  assert.equal(cardAt(s, ctx), cards[s.deck[5]], 'the new describer gets a new card, not the one the other player was describing');
  assert.throws(() => game.applyMove(s, 1, { type: 'card', card: s.deck[4], result: 'ok' }), 'Kart uyuşmuyor');
  assert.throws(() => game.applyMove(s, 1, { type: 'card', card: s.deck[5], result: 'time' }), 'Geçersiz sonuç');
  s = game.applyMove(s, 1, { type: 'card', card: s.deck[5], result: 'ok' });
  s = game.applyMove(s, 1, { type: 'card', card: s.deck[0], result: 'ok' }); // the deck wraps around
  s = game.applyMove(s, 1, { type: 'card', card: s.deck[1], result: 'ok' });
  assert.equal(s.cursor, 8);
  s = game.applyMove(s, 1, { type: 'end' });
  s = game.applyMove(s, 0, { type: 'next' });
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.scores, [1, 3]);
  assert.deepEqual(game.getResult(s), { winner: 1 });
  assert.throws(() => game.applyMove(s, 0, { type: 'next' }), 'Oyun bitti');
  // a draw
  let t = fresh();
  t = game.applyMove(t, 0, { type: 'start' });
  t = game.applyMove(t, 0, { type: 'end' });
  t = game.applyMove(t, 0, { type: 'next' });
  t = game.applyMove(t, 1, { type: 'start' });
  t = game.applyMove(t, 1, { type: 'end' });
  t = game.applyMove(t, 1, { type: 'next' });
  assert.deepEqual(game.getResult(t), { draw: true });
});

/** History kept the way js/app.js keeps it: words, oldest first; re-seen words move to the end. */
function memoryHistory() {
  let list = [];
  return { get: () => list.slice(), add: (words) => { const f = new Set(words); list = list.filter((w) => !f.has(w)).concat(words); } };
}

test('tabu: yeni oyun önce hiç görülmemiş kartları, sonra en uzun süredir görülmeyenleri dağıtır', () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ word: `w${i}`, taboo: [] }));
  const rng = createRng(5);
  // never seen anything: a plain shuffle of every card
  const d0 = buildDeck(many, [], rng);
  assert.deepEqual(d0.slice().sort((a, b) => a - b), many.map((_, i) => i));
  // 30 seen: the 70 unseen come first, then the seen ones with the oldest group first
  const recent = Array.from({ length: 30 }, (_, i) => `w${i}`); // w0 oldest … w29 newest
  const d1 = buildDeck(many, recent, createRng(6));
  assert.equal(d1.length, 100);
  assert.ok(d1.slice(0, 70).every((i) => i >= 30), 'unseen cards first');
  assert.deepEqual(d1.slice(70).sort((a, b) => a - b), Array.from({ length: 30 }, (_, i) => i));
  // everything seen: the 40 longest-unseen come back before the newer ones
  const all = Array.from({ length: 100 }, (_, i) => `w${i}`);
  const d2 = buildDeck(many, all, createRng(7));
  assert.ok(d2.slice(0, 40).every((i) => i < 40), 'oldest group first');
  assert.ok(d2.slice(80).every((i) => i >= 80), 'newest group last');
  // words no longer in the card list are ignored
  assert.equal(buildDeck(many, ['yok', 'w1'], createRng(8)).length, 100);
});

test('tabu: gösterilen kartlar gösterildikleri sırayla; deste dönünce en son gösterilişleri sayılır', () => {
  const s = fresh(); // 6 cards
  assert.deepEqual(shownCards(s), [], 'nothing shown before the first round');
  assert.deepEqual(shownCards({ ...s, phase: 'play' }), [s.deck[0]], 'the card on screen counts');
  assert.deepEqual(shownCards({ ...s, phase: 'summary', cursor: 4 }), s.deck.slice(0, 4));
  // 8 cards through a 6-card deck: deck[0] and deck[1] were shown again last
  assert.deepEqual(shownCards({ ...s, phase: 'summary', cursor: 8 }), [...s.deck.slice(2), s.deck[0], s.deck[1]]);
  assert.deepEqual(shownCards({ ...s, phase: 'play', cursor: 8 }), [...s.deck.slice(3), s.deck[0], s.deck[1], s.deck[2]]);
});

test('tabu: art arda oyunlarda bütün kartlar görülmeden hiçbir kart tekrar gelmez; tur sonundaki kart öbür oyuncuya geçmez', () => {
  const pool = Array.from({ length: 60 }, (_, i) => ({ word: `c${i}`, taboo: [] }));
  const history = memoryHistory();
  const hctx = { tabu: { cards: pool }, tabuHistory: history };
  const seen = new Set();
  let shown = 0;
  for (let g = 0; g < 5; g++) {
    let s = game.setup({ rounds: 2, seed: 100 + g }, hctx);
    while (s.phase !== 'over') {
      s = game.applyMove(s, s.describer, { type: 'start' });
      for (let k = 0; k < 3; k++) {
        const c = s.deck[s.cursor % s.deck.length];
        if (seen.size < pool.length) assert.ok(!seen.has(c), `card ${pool[c].word} repeated in game ${g + 1} before all were seen`);
        seen.add(c);
        shown++;
        s = game.applyMove(s, s.describer, { type: 'card', card: c, result: 'ok' });
      }
      // time runs out with a fourth card on the screen
      const onScreen = s.deck[s.cursor % s.deck.length];
      if (seen.size < pool.length) assert.ok(!seen.has(onScreen));
      seen.add(onScreen);
      shown++;
      s = game.applyMove(s, s.describer, { type: 'end' });
      s = game.applyMove(s, 0, { type: 'next' });
      if (s.phase !== 'over') {
        s = game.applyMove(s, s.describer, { type: 'start' });
        assert.notEqual(s.deck[s.cursor % s.deck.length], onScreen, 'the next describer does not get the card the guesser just heard');
        s = { ...s, phase: 'ready' }; // back to the loop's start for this round
      }
      history.add(shownCards(s).map((i) => pool[i].word));
    }
  }
  assert.equal(shown, 40);
  assert.equal(seen.size, 40, '40 different cards in 5 games');
  // the 6th game starts with the 20 cards never shown, then the oldest
  const next = game.setup({ rounds: 2, seed: 200 }, hctx);
  assert.ok(next.deck.slice(0, 20).every((i) => !seen.has(i)), 'unseen cards first');
});
