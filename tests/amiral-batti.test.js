import { test, assert } from './runner.js';
import game, { validateFleet, randomFleet, whoseTurn } from '../games/amiral-batti.js';
import { createRng } from '../js/lib/rng.js';

const SHIPS = [4, 3, 3, 2, 2];
// 8x8: row-major idx = r*8+c
const fleetA = [[0, 1, 2, 3], [16, 17, 18], [32, 33, 34], [48, 49], [6, 14]];
const fleetB = [[63, 62, 61, 60], [40, 41, 42], [24, 25, 26], [8, 9], [12, 20]];

test('amiral battı: filo doğrulama', () => {
  assert.deepEqual(validateFleet(8, SHIPS, fleetA), fleetA);
  assert.throws(() => validateFleet(8, SHIPS, fleetA.slice(1)), 'Bütün gemiler');
  assert.throws(() => validateFleet(8, SHIPS, [[0, 1, 2, 3], [16, 17, 18], [32, 33, 34], [48, 49], [6, 15]]), 'düz');
  assert.throws(() => validateFleet(8, SHIPS, [[0, 1, 2, 3], [16, 17, 18], [32, 33, 34], [48, 49], [6, 22]]), 'bitişik');
  assert.throws(() => validateFleet(8, SHIPS, [[0, 1, 2, 3], [16, 17, 18], [32, 33, 34], [48, 49], [3, 11]]), 'üst üste');
  assert.throws(() => validateFleet(8, SHIPS, [[0, 1, 2, 3], [16, 17, 18], [32, 33, 34], [48, 49], [4, 12]]), 'değemez');
  assert.throws(() => validateFleet(8, SHIPS, [[0, 1, 2, 3], [16, 17, 18], [32, 33, 34], [48, 49], [60, 68]]), 'dışında');
  for (let i = 0; i < 30; i++) validateFleet(8, SHIPS, randomFleet(8, SHIPS, createRng(i)));
  for (let i = 0; i < 10; i++) validateFleet(10, [5, 4, 3, 3, 2], randomFleet(10, [5, 4, 3, 3, 2], createRng(i)));
});

function ready() {
  let s = game.setup({ size: 8 });
  assert.deepEqual(game.getTurn(s), { player: 0, private: true });
  s = game.applyMove(s, 0, { type: 'place', secret: { fleet: fleetA } });
  s = game.applyMove(s, 1, { type: 'place', secret: { fleet: fleetB } });
  assert.equal(s.phase, 'play');
  return s;
}

function runAuto(s) {
  for (let guard = 0; guard < 10; guard++) {
    let did = false;
    for (const p of [0, 1]) { const m = game.autoMove(s, p); if (m) { s = game.applyMove(s, p, m); did = true; break; } }
    if (!did) break;
  }
  return s;
}

test('amiral battı: atış, sonuç (iska/vurdu/batırdı) ve sıra', () => {
  let s = ready();
  assert.equal(whoseTurn(s), 0);
  assert.throws(() => game.applyMove(s, 1, { type: 'shot', idx: 0 }), 'Sıra sende değil');
  s = game.applyMove(s, 0, { type: 'shot', idx: 0 }); // B's sea at idx 0: empty
  const r = game.autoMove(s, 1);
  assert.equal(r.type, 'result');
  assert.equal(r.result, 'miss');
  assert.throws(() => game.applyMove(s, 0, r), 'denizin sahibi');
  s = game.applyMove(s, 1, r);
  assert.equal(whoseTurn(s), 1);
  s = game.applyMove(s, 1, { type: 'shot', idx: 6 }); // A's 2-ship at 6,14
  s = runAuto(s);
  assert.equal(s.shots[1][0].result, 'hit');
  s = game.applyMove(s, 0, { type: 'shot', idx: 8 }); // B's 2-ship 8,9
  s = runAuto(s);
  s = game.applyMove(s, 1, { type: 'shot', idx: 14 });
  s = runAuto(s);
  assert.equal(s.shots[1][1].result, 'sunk');
  assert.deepEqual(s.shots[1][1].ship, [6, 14]);
  assert.deepEqual(s.sunk, [0, 1]);
  assert.throws(() => game.applyMove(s, 0, { type: 'shot', idx: 8 }), 'zaten ateş ettin');
  // the shooter's device cannot resolve shots (no fleet)
  let g = game.setup({ size: 8 });
  g = game.applyMove(g, 0, { type: 'place' });
  g = game.applyMove(g, 1, { type: 'place', secret: { fleet: fleetB } });
  g = game.applyMove(g, 0, { type: 'shot', idx: 5 });
  assert.equal(game.autoMove(g, 0), null);
  assert.equal(game.autoMove(g, 1).result, 'miss');
});

test('amiral battı: önce bitiren kazanır, aynı turda bitirince berabere', () => {
  const sinkAll = (s, shooter, fleet) => {
    for (const ship of fleet) for (const idx of ship) {
      // alternate with harmless shots by the other player to respect turns
      if (whoseTurn(s) !== shooter) {
        const other = 1 - shooter;
        let k = 0;
        while (s.shots[other].some((x) => x.idx === k) || (other === 0 ? fleetB : fleetA).flat().includes(k)) k++;
        s = game.applyMove(s, other, { type: 'shot', idx: k });
        s = runAuto(s);
      }
      s = game.applyMove(s, shooter, { type: 'shot', idx });
      s = runAuto(s);
      if (s.phase === 'over') return s;
    }
    return s;
  };
  let s = sinkAll(ready(), 0, fleetB);
  assert.equal(s.sunk[0], 5);
  assert.equal(s.phase, 'play', 'player 1 still gets the same round');
  assert.equal(whoseTurn(s), 1);
  s = game.applyMove(s, 1, { type: 'shot', idx: 63 });
  s = runAuto(s);
  assert.equal(s.phase, 'over');
  assert.deepEqual(game.getResult(s), { winner: 0 });
  assert.deepEqual(s.revealed[0], fleetA);
  assert.deepEqual(s.revealed[1], fleetB);
});

test('amiral battı: pes', () => {
  let s = ready();
  assert.throws(() => game.applyMove(s, 1, { type: 'giveup' }), 'Sıra sende değil');
  s = game.applyMove(s, 0, { type: 'giveup' });
  assert.deepEqual(game.getResult(s), { winner: 1 });
});
