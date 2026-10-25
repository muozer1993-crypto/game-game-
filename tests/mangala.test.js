import { test, assert } from './runner.js';
import game, { legalPits, replayFrames } from '../games/mangala.js';

test('mangala: diziliş, dağıtma, bir taş bırakma kuralı', () => {
  let s = game.setup({ seed: 0 });
  assert.equal(s.pits.reduce((a, b) => a + b, 0), 48);
  assert.deepEqual(legalPits(s), [0, 1, 2, 3, 4, 5]);
  assert.throws(() => game.applyMove(s, 1, { type: 'sow', pit: 7 }), 'Sıra sende değil');
  assert.throws(() => game.applyMove(s, 0, { type: 'sow', pit: 7 }), 'senin değil');
  // pit 2 has 4 stones: leave 1, sow 3 -> pits 3,4,5 get one each; last in 5 (own pit, not empty) -> turn passes
  s = game.applyMove(s, 0, { type: 'sow', pit: 2 });
  assert.deepEqual(s.pits.slice(0, 7), [4, 4, 1, 5, 5, 5, 0]);
  assert.equal(s.turn, 1);
  // pit 3 has 4: leave 1, sow 3 -> 4,5 and the store: extra turn
  let t = game.setup({ seed: 0 });
  t = game.applyMove(t, 0, { type: 'sow', pit: 3 });
  assert.equal(t.pits[6], 1);
  assert.equal(t.turn, 0, 'last stone in own store: play again');
  assert.equal(t.last.again, true);
  // single stone moves to the next pit (no "leave one" rule)
  let u = game.setup({ seed: 0 });
  u.pits = u.pits.slice(); u.pits[0] = 1;
  u = game.applyMove(u, 0, { type: 'sow', pit: 0 });
  assert.equal(u.pits[0], 0);
  assert.equal(u.pits[1], 5);
});

test('mangala: çift yakalama ve karşı kuyu yakalama, rakip haznesi atlanır', () => {
  // player 0 pit 5 with 3 stones: leave 1, sow 2 -> store (6) and pit 7 (opponent) which has 4 -> 5 odd: no capture
  let s = game.setup({ seed: 0 });
  s.pits = s.pits.slice(); s.pits[5] = 3;
  s = game.applyMove(s, 0, { type: 'sow', pit: 5 });
  assert.equal(s.pits[7], 5);
  assert.equal(s.last.captured, 0);
  // opponent pit with 3 stones becomes 4 (even) -> captured
  let c = game.setup({ seed: 0 });
  c.pits = c.pits.slice(); c.pits[5] = 3; c.pits[7] = 3;
  c = game.applyMove(c, 0, { type: 'sow', pit: 5 });
  assert.equal(c.pits[7], 0);
  assert.equal(c.pits[6], 1 + 4, 'store got the sown stone plus the captured four');
  assert.equal(c.last.captured, 4);
  // own empty pit capture: pit 0 has 2 stones -> leave 1, sow 1 into pit 1 which is empty -> opposite pit 11 (4 stones) captured + own stone
  let d = game.setup({ seed: 0 });
  d.pits = d.pits.slice(); d.pits[0] = 2; d.pits[1] = 0;
  d = game.applyMove(d, 0, { type: 'sow', pit: 0 });
  assert.equal(d.pits[1], 0);
  assert.equal(d.pits[11], 0);
  assert.equal(d.pits[6], 5);
  // long sow skips the opponent's store: 15 stones from pit 5 -> leave 1, 14 go 6,7..12,(skip 13),0..5,6
  let e = game.setup({ seed: 0 });
  e.pits = e.pits.slice(); e.pits[5] = 15;
  e = game.applyMove(e, 0, { type: 'sow', pit: 5 });
  assert.equal(e.pits[13], 0, 'opponent store skipped');
  assert.equal(e.pits[6], 2);
  assert.equal(e.turn, 0, 'ended in own store');
});

test('mangala: bir taraf boşalınca oyun biter, kalan taşları kuyuları boşalan alır (resmî kural)', () => {
  let s = game.setup({ seed: 0 });
  s.pits = new Array(14).fill(0);
  s.pits[5] = 1; s.pits[6] = 20; s.pits[13] = 15; s.pits[7] = 3; s.pits[8] = 2;
  s = game.applyMove(s, 0, { type: 'sow', pit: 5 }); // single stone -> store, side empty -> over
  assert.equal(s.over, true);
  assert.equal(s.pits[6], 21 + 5, 'player 0 emptied first and takes the 5 stones left on player 1\'s side');
  assert.equal(s.pits[13], 15);
  assert.deepEqual(s.collected, { taker: 0, from: 1, count: 5, pits: [{ pit: 7, count: 3 }, { pit: 8, count: 2 }] });
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.throws(() => game.applyMove(s, 0, { type: 'sow', pit: 0 }), 'Oyun bitti');
  // a capture that empties the OPPONENT's side: the player with the empty row collects the capturer's leftovers
  let c = game.setup({ seed: 0 });
  c.pits = new Array(14).fill(0);
  c.pits[4] = 4; c.pits[0] = 5; c.pits[7] = 1; c.pits[6] = 10; c.pits[13] = 10;
  c = game.applyMove(c, 0, { type: 'sow', pit: 4 }); // leave 1 in 4, sow 5, 6, 7: pit 7 becomes 2 -> captured
  assert.equal(c.over, true);
  assert.equal(c.pits[6], 10 + 1 + 2, 'store: one sown stone + the captured pair');
  assert.equal(c.pits[13], 10 + 5 + 1 + 1, 'player 1 (empty row) takes the 7 stones left on player 0\'s side');
  assert.deepEqual(game.getResult(c), { winner: 1 });
  assert.equal(c.pits.reduce((a, b) => a + b, 0), 30, 'stones conserved');
});

test('mangala: ev kuralları — sonraki kuyudan başla, kalan taşlar sahibine', () => {
  const def = game.setup({ seed: 0 });
  assert.equal(def.firstStone, 'back', 'official rule by default');
  assert.equal(def.leftovers, 'emptier');
  // first stone goes to the next pit: 4 stones from pit 2 -> pits 3, 4, 5 and the store; last in the store -> play again
  let n = game.setup({ seed: 0, firstStone: 'next' });
  n = game.applyMove(n, 0, { type: 'sow', pit: 2 });
  assert.deepEqual(n.pits.slice(0, 7), [4, 4, 0, 5, 5, 5, 1]);
  assert.equal(n.turn, 0, 'last stone in the store: extra turn');
  // the official rule from the same pit ends one pit earlier (pit 5) and passes the turn
  let o = game.applyMove(game.setup({ seed: 0 }), 0, { type: 'sow', pit: 2 });
  assert.deepEqual(o.pits.slice(0, 7), [4, 4, 1, 5, 5, 5, 0]);
  assert.equal(o.turn, 1);
  // leftovers to their owner (Kalah-style house rule)
  let k = game.setup({ seed: 0, leftovers: 'owner' });
  k.pits = new Array(14).fill(0);
  k.pits[5] = 1; k.pits[6] = 20; k.pits[13] = 15; k.pits[7] = 3; k.pits[8] = 2;
  k = game.applyMove(k, 0, { type: 'sow', pit: 5 });
  assert.equal(k.over, true);
  assert.equal(k.pits[6], 21);
  assert.equal(k.pits[13], 20, 'player 1 keeps its own 5 stones');
  assert.deepEqual(k.collected, { taker: 1, from: 1, count: 5, pits: [{ pit: 7, count: 3 }, { pit: 8, count: 2 }] });
  // unknown option values fall back to the official rules
  const odd = game.setup({ seed: 0, firstStone: 'x', leftovers: 42 });
  assert.equal(odd.firstStone, 'back');
  assert.equal(odd.leftovers, 'emptier');
});

test('mangala: tam sayı olmayan kuyu reddedilir', () => {
  const s = game.setup({ seed: 0 });
  assert.throws(() => game.applyMove(s, 0, { type: 'sow', pit: 2.5 }), 'Geçersiz hamle');
});

test('mangala: hamle yolu kaydedilir, tekrar oynatma kareleri son duruma varır', () => {
  // official: 4 stones from pit 2 -> back into 2, then 3, 4, 5
  let s = game.applyMove(game.setup({ seed: 0 }), 0, { type: 'sow', pit: 2 });
  assert.deepEqual(s.last.path, [2, 3, 4, 5]);
  assert.equal(s.last.lifted, 4);
  assert.equal(s.n, 1);
  let f = replayFrames(s);
  assert.equal(f.length, 1 + 4, 'lift + one frame per stone');
  assert.deepEqual(f[0].hand, { at: 2, count: 4 });
  assert.equal(f[0].pits[2], 0, 'the lifted pit is empty while the stones are in hand');
  assert.deepEqual(f[f.length - 1].pits, s.pits, 'the last frame is the final board');
  assert.equal(f[f.length - 1].hand, null);
  // 'next' house rule: the path starts after the lifted pit
  let n = game.applyMove(game.setup({ seed: 0, firstStone: 'next' }), 0, { type: 'sow', pit: 2 });
  assert.deepEqual(n.last.path, [3, 4, 5, 6]);
  // a capture: frames take the pit and carry the stones into the store, ending on the final board
  let c = game.setup({ seed: 0 });
  c.pits = c.pits.slice(); c.pits[5] = 3; c.pits[7] = 3;
  c = game.applyMove(c, 0, { type: 'sow', pit: 5 });
  assert.deepEqual(c.last.takes, [{ pit: 7, count: 4 }]);
  f = replayFrames(c);
  assert.equal(f[f.length - 1].kind, 'store');
  assert.deepEqual(f[f.length - 1].pits, c.pits);
  // empty-pit capture takes the opposite pit and the own stone
  let d = game.setup({ seed: 0 });
  d.pits = d.pits.slice(); d.pits[0] = 2; d.pits[1] = 0;
  d = game.applyMove(d, 0, { type: 'sow', pit: 0 });
  assert.deepEqual(d.last.takes, [{ pit: 1, count: 1 }, { pit: 11, count: 4 }]);
  assert.deepEqual(replayFrames(d).slice(-1)[0].pits, d.pits);
  // the game end collection is replayed too
  let e = game.setup({ seed: 0 });
  e.pits = new Array(14).fill(0);
  e.pits[5] = 1; e.pits[6] = 20; e.pits[13] = 15; e.pits[7] = 3; e.pits[8] = 2;
  e = game.applyMove(e, 0, { type: 'sow', pit: 5 });
  f = replayFrames(e);
  assert.equal(f[f.length - 1].kind, 'collect');
  assert.deepEqual(f[f.length - 1].pits, e.pits);
  // random games: every replay ends exactly on the final board and conserves the stones
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let g = 0; g < 60; g++) {
    for (const opts of [{}, { firstStone: 'next' }, { variant: 'bantumi' }, { leftovers: 'owner' }]) {
      let st = game.setup({ seed: g, ...opts });
      for (let m = 0; m < 300 && !st.over; m++) {
        const legal = legalPits(st);
        st = game.applyMove(st, st.turn, { type: 'sow', pit: legal[Math.floor(rnd() * legal.length)] });
        const fr = replayFrames(st);
        assert.deepEqual(fr[fr.length - 1].pits, st.pits, 'replay ends on the board');
        fr.forEach((x) => assert.equal(x.pits.reduce((a, b) => a + b, 0) + (x.hand && (x.kind === 'lift' || x.kind === 'drop') ? x.hand.count : 0) + (x.kind === 'take' ? x.hand.count : 0), 48, 'stones conserved in every frame'));
      }
      assert.ok(st.over, 'random game ends');
    }
  }
});

test('mangala: Bantumi türü (Nokia) — sonraki kuyudan başla, çift alma yok, boş kuyu yakalaması, kalanlar sahibine', () => {
  let s = game.setup({ seed: 0, variant: 'bantumi', firstStone: 'back', leftovers: 'emptier' }); // the house-rule menus are ignored
  assert.equal(s.variant, 'bantumi');
  assert.equal(s.firstStone, 'next');
  assert.equal(s.leftovers, 'owner');
  assert.equal(s.evenCapture, false);
  // 4 beans from pot 2 -> 3, 4, 5 and the store: extra turn
  s = game.applyMove(s, 0, { type: 'sow', pit: 2 });
  assert.deepEqual(s.pits.slice(0, 7), [4, 4, 0, 5, 5, 5, 1]);
  assert.equal(s.turn, 0);
  // no even capture: last bean makes an opponent pot even and nothing is taken
  let e = game.setup({ seed: 0, variant: 'bantumi' });
  e.pits = e.pits.slice(); e.pits[5] = 2; e.pits[7] = 3;
  e = game.applyMove(e, 0, { type: 'sow', pit: 5 }); // -> store, pot 7 (3 -> 4)
  assert.equal(e.pits[7], 4);
  assert.equal(e.last.captured, 0);
  // own empty pot capture: the bean and the opposite pot go to the store
  let c = game.setup({ seed: 0, variant: 'bantumi' });
  c.pits = c.pits.slice(); c.pits[0] = 1; c.pits[1] = 0;
  c = game.applyMove(c, 0, { type: 'sow', pit: 0 }); // single bean into the empty pot 1; opposite 11 has 4
  assert.equal(c.pits[1], 0);
  assert.equal(c.pits[11], 0);
  assert.equal(c.pits[6], 5);
  assert.equal(c.turn, 1, 'a capture ends the turn');
  // opposite pot empty: the lone bean still goes to the store
  let z = game.setup({ seed: 0, variant: 'bantumi' });
  z.pits = z.pits.slice(); z.pits[0] = 1; z.pits[1] = 0; z.pits[11] = 0;
  z = game.applyMove(z, 0, { type: 'sow', pit: 0 });
  assert.equal(z.pits[1], 0);
  assert.equal(z.pits[6], 1);
  assert.equal(z.last.captured, 1);
  // a full lap (13 beans) passes the emptied pot and ends in it: captures
  let l = game.setup({ seed: 0, variant: 'bantumi' });
  l.pits = l.pits.slice(); l.pits[0] = 13;
  l = game.applyMove(l, 0, { type: 'sow', pit: 0 });
  assert.equal(l.last.to, 0, '13 beans end in the starting pot');
  assert.equal(l.pits[13], 0, 'opponent store skipped');
  assert.equal(l.pits[0], 0, 'the lone bean in the emptied pot was captured');
  assert.equal(l.pits.reduce((a, b) => a + b, 0), 48 - 4 + 13);
  // leftovers to their owner at the end
  let k = game.setup({ seed: 0, variant: 'bantumi' });
  k.pits = new Array(14).fill(0);
  k.pits[5] = 1; k.pits[6] = 20; k.pits[13] = 15; k.pits[7] = 3; k.pits[8] = 2;
  k = game.applyMove(k, 0, { type: 'sow', pit: 5 });
  assert.equal(k.over, true);
  assert.deepEqual([k.pits[6], k.pits[13]], [21, 20]);
});
