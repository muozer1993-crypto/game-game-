import { test, assert } from './runner.js';
import game, { dealPoints, cardText } from '../games/pisti.js';

const ON = { mode: 'online' }; // rule tests without the shared-phone 'Tamam' step

test('pişti: dağıtım, masa, alma ve pişti', () => {
  let s = game.setup({ seed: 5, target: 151 });
  assert.equal(s.hands[0].length, 4);
  assert.equal(s.hands[1].length, 4);
  assert.equal(s.table.length, 4);
  assert.equal(s.deck.length, 40);
  assert.notEqual(s.table[3].r, 11, 'open card is never a jack');
  assert.equal(s.turn, 1 - s.dealer);
  // craft: table top is a 7, player on turn holds a 7 and a jack
  s = { ...s, table: [{ r: 3, s: 0 }, { r: 7, s: 1 }], hands: [[{ r: 7, s: 2 }, { r: 11, s: 0 }, { r: 2, s: 0 }, { r: 9, s: 0 }], [{ r: 4, s: 0 }, { r: 5, s: 0 }, { r: 6, s: 0 }, { r: 8, s: 0 }]], turn: 0 };
  assert.throws(() => game.applyMove(s, 1, { type: 'play', card: 0 }, ON), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'play', card: 9 }, ON), 'Geçersiz kart');
  let t = game.applyMove(s, 0, { type: 'play', card: 0 }, ON); // 7 on 7 -> takes 3 cards
  assert.equal(t.captured[0].length, 3);
  assert.equal(t.table.length, 0);
  assert.equal(t.lastTaker, 0);
  assert.equal(t.last.pisti, 0);
  assert.equal(t.turn, 1);
  // pişti: single card on the table and a match
  let p = { ...s, table: [{ r: 9, s: 3 }] };
  p = game.applyMove(p, 0, { type: 'play', card: 3 }, ON); // 9 on single 9
  assert.equal(p.last.pisti, 10);
  assert.equal(p.pistiPoints[0], 10);
  // jack on single jack = 20
  let j = { ...s, table: [{ r: 11, s: 3 }] };
  j = game.applyMove(j, 0, { type: 'play', card: 1 }, ON);
  assert.equal(j.last.pisti, 20);
  // no match: the card stays on the table
  let n = game.applyMove(s, 0, { type: 'play', card: 2 }, ON);
  assert.equal(n.table.length, 3);
  assert.equal(n.captured[0].length, 0);
});

test('pişti: el puanları', () => {
  const pts = dealPoints([[{ r: 2, s: 3 }, { r: 10, s: 2 }, { r: 1, s: 0 }], [{ r: 11, s: 0 }, { r: 11, s: 1 }, { r: 5, s: 0 }, { r: 6, s: 0 }]]);
  assert.deepEqual(pts, [2 + 3 + 1, 1 + 1 + 3], 'club 2, diamond 10, ace; two jacks and card majority');
  assert.deepEqual(dealPoints([[], []]), [0, 0]);
  assert.equal(cardText({ r: 11, s: 1 }), 'J♥');
});

test('pişti: eller bitince yeni dağıtım, deste bitince el biter ve puanlanır, hedefe ulaşan kazanır', () => {
  let s = game.setup({ seed: 2, target: 51 });
  let plays = 0;
  // play random-ish: always the first card
  while (!s.over && plays < 500) {
    s = game.applyMove(s, s.turn, { type: 'play', card: 0 }, ON);
    plays++;
  }
  assert.ok(s.over, 'reaches the target eventually');
  assert.ok(s.scores[s.winner] >= 51);
  assert.deepEqual(game.getResult(s), { winner: s.winner });
  assert.throws(() => game.applyMove(s, s.turn, { type: 'play', card: 0 }, ON), 'Oyun bitti');
  // deals redistribute: after 8 plays both hands are refilled
  let d = game.setup({ seed: 3, target: 151 });
  for (let i = 0; i < 8; i++) d = game.applyMove(d, d.turn, { type: 'play', card: 0 }, ON);
  assert.equal(d.hands[0].length, 4);
  assert.equal(d.deck.length, 32);
});

test('pişti: eller açık ayarı tek telefonda ara ekranı kaldırır', () => {
  const hidden = game.setup({ seed: 1 });
  assert.equal(game.getTurn(hidden).private, true);
  const open = game.setup({ seed: 1, hideHands: false });
  assert.equal(game.getTurn(open).private, false);
});

test('pişti: dağıtan değişir, dağıtmayan başlar; tek telefonda Tamam adımı', () => {
  let s = game.setup({ seed: 4, target: 151 });
  assert.equal(s.turn, 1 - s.dealer);
  const leaders = [s.turn];
  let dealNo = s.dealNo;
  for (let i = 0; i < 48 * 3 && leaders.length < 3; i++) {
    s = game.applyMove(s, s.turn, { type: 'play', card: 0 }, ON);
    if (s.dealNo !== dealNo) { dealNo = s.dealNo; leaders.push(s.turn); assert.equal(s.turn, 1 - s.dealer, 'the non-dealer leads'); }
  }
  assert.deepEqual(leaders.slice(0, 3), [leaders[0], 1 - leaders[0], leaders[0]], 'the leader alternates every deal');
  // shared phone with hidden hands: the player confirms the outcome before the turn passes
  let h = game.setup({ seed: 4 });
  const p = h.turn;
  h = game.applyMove(h, p, { type: 'play', card: 0 }, { mode: 'local' });
  assert.equal(h.pendingAck, p);
  assert.deepEqual(game.getTurn(h), { player: p, private: true });
  assert.throws(() => game.applyMove(h, 1 - p, { type: 'play', card: 0 }, { mode: 'local' }), 'Tamam');
  assert.throws(() => game.applyMove(h, 1 - p, { type: 'ack' }, { mode: 'local' }), 'Onaylanacak');
  h = game.applyMove(h, p, { type: 'ack' }, { mode: 'local' });
  assert.equal(h.turn, 1 - p);
  assert.equal(h.pendingAck, null);
  // with open hands there is no ack step
  let o = game.setup({ seed: 4, hideHands: false });
  o = game.applyMove(o, o.turn, { type: 'play', card: 0 }, { mode: 'local' });
  assert.equal(o.pendingAck, null);
});
