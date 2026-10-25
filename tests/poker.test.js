import { test, assert } from './runner.js';
import game, { evaluate5, bestHand, compareHands, board, SB, BB } from '../games/poker.js';

const C = (s) => s.split(' ').map((t) => ({ r: { A: 14, K: 13, Q: 12, J: 11, T: 10 }[t[0]] || Number(t[0]), s: 'shdc'.indexOf(t[1]) }));

test('poker: el değerleri ve karşılaştırma', () => {
  assert.equal(evaluate5(C('As Ks Qs Js Ts')).name, 'Royal floş');
  assert.equal(evaluate5(C('9h 8h 7h 6h 5h')).rank, 8);
  assert.equal(evaluate5(C('5s 4s 3s 2s As')).keys[0], 5, 'steel wheel is five high');
  assert.equal(evaluate5(C('7s 7h 7d 7c 2s')).name, 'Kare');
  assert.equal(evaluate5(C('7s 7h 7d 2c 2s')).name, 'Full');
  assert.equal(evaluate5(C('Ks 9s 7s 4s 2s')).name, 'Renk');
  assert.equal(evaluate5(C('As 2h 3d 4c 5s')).name, 'Kent');
  assert.equal(evaluate5(C('As Kh Qd Jc Ts')).name, 'Kent');
  assert.equal(evaluate5(C('7s 7h 7d 4c 2s')).name, 'Üçlü');
  assert.equal(evaluate5(C('7s 7h 4d 4c 2s')).name, 'İki çift');
  assert.equal(evaluate5(C('7s 7h 5d 4c 2s')).name, 'Çift');
  assert.equal(evaluate5(C('9s 7h 5d 4c 2s')).name, 'Yüksek kart');
  assert.ok(compareHands(evaluate5(C('7s 7h 5d 4c 2s')), evaluate5(C('6s 6h Ad Kc Qs'))) > 0, 'higher pair beats higher kickers');
  assert.ok(compareHands(evaluate5(C('7s 7h Ad 4c 2s')), evaluate5(C('7d 7c Kd Qc 2h'))) > 0, 'kicker decides');
  assert.ok(compareHands(evaluate5(C('7s 7h 4d 4c As')), evaluate5(C('7d 7c 5d 5c 2h'))) < 0, 'second pair decides');
  assert.equal(compareHands(evaluate5(C('As Kh Qd Jc Ts')), evaluate5(C('Ad Kc Qh Js Td'))), 0, 'equal straights');
  assert.ok(compareHands(evaluate5(C('6h 5h 4h 3h 2h')), evaluate5(C('As Ah Ad Ac Ks'))) > 0, 'straight flush beats quads');
  // best of seven
  const seven = bestHand(C('As Ah 7d 7c 7s 2h 9c'));
  assert.equal(seven.name, 'Full');
  assert.deepEqual(seven.keys, [7, 14]);
  assert.equal(bestHand(C('2s 3s 4s 5s 9d 6s Kc')).name, 'Kent floş');
  assert.equal(bestHand(C('2s 3h 4d 5c 9d 6s Kc')).name, 'Kent');
  assert.equal(bestHand(C('As Kd 7d 4c 9s 2h Jc')).name, 'Yüksek kart');
});

test('poker: körler, bekle/gör/yükselt/pas, sokaklar, rest ve iade, bitiş', () => {
  let s = game.setup({ stack: 1000, seed: 9 });
  assert.equal(s.dealer, 0);
  assert.deepEqual(s.bets, [SB, BB]);
  assert.deepEqual(s.stacks, [990, 980]);
  assert.equal(s.turn, 0, 'the dealer (small blind) acts first before the flop');
  assert.deepEqual(game.getTurn(s), { player: 0, private: true });
  assert.equal(board(s).length, 0);
  assert.throws(() => game.applyMove(s, 0, { type: 'check' }), 'görmen gerek');
  assert.throws(() => game.applyMove(s, 0, { type: 'raise', to: 30 }), 'En az 20');
  s = game.applyMove(s, 0, { type: 'call' });
  assert.deepEqual(s.bets, [BB, BB]);
  assert.equal(s.turn, 1, 'the big blind still has the option');
  assert.equal(s.street, 0);
  s = game.applyMove(s, 1, { type: 'check' });
  assert.equal(s.street, 1, 'flop');
  assert.equal(board(s).length, 3);
  assert.equal(s.pot, 40);
  assert.deepEqual(s.bets, [0, 0]);
  assert.equal(s.turn, 1, 'after the flop the non-dealer acts first');
  s = game.applyMove(s, 1, { type: 'raise', to: 40 }); // a bet of 40
  assert.equal(s.turn, 0);
  assert.throws(() => game.applyMove(s, 0, { type: 'raise', to: 60 }), 'En az 40');
  s = game.applyMove(s, 0, { type: 'raise', to: 120 }); // raise by 80
  assert.equal(s.lastRaise, 80);
  assert.equal(s.turn, 1);
  s = game.applyMove(s, 1, { type: 'call' });
  assert.equal(s.street, 2, 'turn');
  assert.equal(s.pot, 280);
  assert.deepEqual(s.stacks, [860, 860]);
  s = game.applyMove(s, 1, { type: 'check' });
  s = game.applyMove(s, 0, { type: 'check' });
  assert.equal(s.street, 3, 'river');
  assert.equal(board(s).length, 5);
  // fold on the river: the pot goes to the other player, cards stay hidden
  const f = game.applyMove(game.applyMove(s, 1, { type: 'raise', to: 100 }), 0, { type: 'fold' });
  assert.equal(f.phase, 'handOver');
  assert.equal(f.result.winner, 1);
  assert.equal(f.result.folder, 0);
  assert.equal(f.result.shown, false);
  assert.deepEqual(f.stacks, [860, 1140]);
  assert.equal(f.stacks[0] + f.stacks[1], 2000, 'chips are conserved');
  // showdown instead
  s = game.applyMove(s, 1, { type: 'check' });
  s = game.applyMove(s, 0, { type: 'check' });
  assert.equal(s.phase, 'handOver');
  assert.ok(s.result.hands && s.result.hands.length === 2 && s.result.shown);
  assert.equal(s.stacks[0] + s.stacks[1], 2000);
  assert.ok(s.result.winner == null ? s.stacks[0] === 1000 : s.stacks[s.result.winner] === 1140);
  // next hand: the button moves, blinds swap
  s = game.applyMove(s, 0, { type: 'next' });
  assert.equal(s.handNo, 1);
  assert.equal(s.dealer, 1);
  assert.equal(s.turn, 1);
  assert.equal(s.bets[1], SB);
  assert.equal(s.bets[0], BB);
  // all-in for less: the excess is returned and the board runs out to a showdown
  let a = { ...s, stacks: [100, 500], bets: [0, 0], invested: [0, 0], pot: 0, street: 1, turn: 0, acted: [false, false], lastRaise: BB };
  a = game.applyMove(a, 0, { type: 'raise', to: 100 }); // all-in 100
  assert.equal(a.stacks[0], 0);
  assert.throws(() => game.applyMove(a, 1, { type: 'raise', to: 500 }), 'rest çekti');
  a = game.applyMove(a, 1, { type: 'call' });
  assert.ok(a.phase === 'handOver' || a.phase === 'over', 'runs out to the showdown');
  assert.equal(board({ ...a, street: 3 }).length, 5);
  assert.equal(a.stacks[0] + a.stacks[1], 600);
  assert.ok(a.result.shown);
  if (a.result.winner === 1) { assert.deepEqual(a.stacks, [0, 600]); assert.equal(a.phase, 'over'); assert.deepEqual(game.getResult(a), { winner: 1 }); }
  else if (a.result.winner === 0) assert.deepEqual(a.stacks, [200, 400]);
  else assert.deepEqual(a.stacks, [100, 500]);
  // calling all-in for less than the bet refunds the bettor's excess
  let b = { ...s, stacks: [60, 940], bets: [0, 0], invested: [0, 0], pot: 0, street: 3, turn: 1, acted: [false, false], lastRaise: BB };
  b = game.applyMove(b, 1, { type: 'raise', to: 300 });
  b = game.applyMove(b, 0, { type: 'call' });
  assert.ok(b.phase === 'handOver' || b.phase === 'over');
  assert.equal(b.stacks[0] + b.stacks[1], 1000);
  assert.ok(b.result.winner === 1 ? b.stacks[1] === 1000 : b.result.winner === 0 ? b.stacks[0] === 120 && b.stacks[1] === 880 : b.stacks[0] === 60);
  // the pot shown after a fold equals what was awarded
  assert.equal(f.pot, f.result.amount, 'pot after a fold');
  // a big blind that cannot cover the small blind: nobody has a decision, the board runs out
  let sb = game.applyMove({ ...s, stacks: [5, 1995], phase: 'handOver', result: { winner: 1 } }, 0, { type: 'next' });
  assert.ok(sb.phase === 'handOver' || sb.phase === 'over', 'short big blind: hand resolved at once');
  assert.equal(sb.stacks[0] + sb.stacks[1], 2000);
  assert.ok(sb.result.shown, 'showdown, not a fold');
  // a small blind that is all-in for less than the big blind: the big blind's excess comes back
  let ss = game.applyMove({ ...s, stacks: [1992, 8], phase: 'handOver', result: { winner: 0 } }, 0, { type: 'next' });
  assert.ok(ss.phase === 'handOver' || ss.phase === 'over');
  assert.equal(ss.stacks[0] + ss.stacks[1], 2000);
  assert.ok(ss.result.winner == null ? ss.result.amount === 8 : ss.result.amount === 16, 'pot is twice the short blind: ' + ss.result.amount);
  // a big blind all-in for more than the small blind: the small blind still decides (call 10 or fold)
  let bb = game.applyMove({ ...s, stacks: [1000, 20], phase: 'handOver', result: { winner: 0 } }, 0, { type: 'next' });
  assert.equal(bb.phase, 'play', 'small blind has a decision');
  assert.equal(bb.turn, 0);
  assert.deepEqual(bb.bets, [10, 20]);
  const bbCall = game.applyMove(bb, 0, { type: 'call' });
  assert.ok(bbCall.phase === 'handOver' || bbCall.phase === 'over', 'the call runs out the board');
  assert.equal(bbCall.stacks[0] + bbCall.stacks[1], 1020);
  assert.ok(bbCall.result.amount === 40, 'pot 40: ' + bbCall.result.amount);
  const bbFold = game.applyMove(bb, 0, { type: 'fold' });
  assert.deepEqual(bbFold.stacks, [990, 30]);
  // a matched call that puts the caller all-in needs no further action from the other side
  let m = { ...s, stacks: [40, 500], bets: [0, 0], invested: [0, 0], pot: 0, street: 1, turn: 1, acted: [false, false], lastRaise: BB };
  m = game.applyMove(m, 1, { type: 'raise', to: 60 });
  m = game.applyMove(m, 0, { type: 'call' });
  assert.ok(m.phase === 'handOver' || m.phase === 'over', 'runs out without asking the bettor to check');
  assert.equal(m.stacks[0] + m.stacks[1], 540);
});
