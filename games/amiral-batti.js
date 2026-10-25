// Amiral Battı — each player hides a fleet; players take turns firing at the other sea.
// Fleets never leave the owner's device: the `place` move carries the fleet in its
// `secret` field, and shots are resolved on the owner's device by autoMove().
import { el, render as draw, toast } from '../js/ui/dom.js';
import { createRng, randomSeed } from '../js/lib/rng.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'masa',
  name: 'Amiral Battı',
  icon: '🚢',
  description: 'Gemilerini gizle, rakibin denizine ateş et. Bütün gemileri önce batıran kazanır.',
  rules: [
    'Her oyuncu gemilerini kendi denizine yerleştirir (düz, birbirine değmeden). Rakip bunları görmez.',
    'Sırayla rakibin denizinde bir kareye ateş edilir: İska, Vurdu ya da Batırdı. Önce bütün gemileri batıran kazanır.',
    'İlk oyuncunun avantajı olmasın diye ikisi de aynı sayıda atış yapar; ikisi de aynı turda bitirirse berabere.',
    'Tek telefonda: gemilerin "Gemilerimi göster" düğmesinin arkasında durur; sıra değişince telefonu vermeden önce gizle.',
  ].join('\n'),
  data: [],
  handoffNote: 'Gemilerini rakibin görmemeli.',
  settings: [
    { key: 'size', label: 'Deniz', type: 'select', default: 8, options: [{ value: 8, label: '8 × 8 (5 gemi)' }, { value: 10, label: '10 × 10 (5 gemi)' }] },
  ],
};

const FLEETS = { 8: [4, 3, 3, 2, 2], 10: [5, 4, 3, 3, 2] };

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const size = Number(options.size) === 10 ? 10 : 8;
  return {
    id: String(options.seed ?? ''), // new every game: placement drafts are kept per game
    size,
    ships: FLEETS[size].slice(),
    phase: 'place',      // place | play | over
    ready: [false, false],
    fleets: [null, null], // secret: fleets[p] = [[idx,...], ...] only on the owner's device
    shots: [[], []],      // shots[p] at the other sea: { idx, result: null|'miss'|'hit'|'sunk', ship?: [idx] }
    sunk: [0, 0],         // ships sunk by p
    revealed: [null, null],
    gaveUp: null,
  };
}

// ----------------------------------------------------------------- fleet helpers
const neighbors8 = (size, idx) => {
  const r = Math.floor(idx / size);
  const c = idx % size;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < size && cc >= 0 && cc < size) out.push(rr * size + cc);
    }
  }
  return out;
};

/** Throws if the fleet is not a valid placement for `ships` on a `size`×`size` sea. */
export function validateFleet(size, ships, fleet) {
  if (!Array.isArray(fleet)) fail('Geçersiz filo');
  const lens = fleet.map((s) => (Array.isArray(s) ? s.length : -1)).sort((a, b) => b - a);
  const want = ships.slice().sort((a, b) => b - a);
  if (lens.join(',') !== want.join(',')) fail('Bütün gemiler yerleştirilmeli');
  const used = new Set();
  for (const ship of fleet) {
    const cells = ship.map(Number);
    if (cells.some((i) => !Number.isInteger(i) || i < 0 || i >= size * size)) fail('Gemi denizin dışında');
    const rows = cells.map((i) => Math.floor(i / size));
    const cols = cells.map((i) => i % size);
    const sameRow = rows.every((r) => r === rows[0]);
    const sameCol = cols.every((c) => c === cols[0]);
    if (!sameRow && !sameCol) fail('Gemiler düz olmalı');
    const line = (sameRow ? cols : rows).slice().sort((a, b) => a - b);
    for (let k = 1; k < line.length; k++) if (line[k] !== line[k - 1] + 1) fail('Gemi parçaları bitişik olmalı');
    for (const i of cells) {
      if (used.has(i)) fail('Gemiler üst üste olamaz');
    }
    for (const i of cells) used.add(i);
  }
  // no touching (including diagonally)
  for (const ship of fleet) {
    const own = new Set(ship.map(Number));
    for (const i of own) {
      for (const nb of neighbors8(size, i)) {
        if (used.has(nb) && !own.has(nb)) fail('Gemiler birbirine değemez');
      }
    }
  }
  return fleet.map((s) => s.map(Number));
}

/** Random valid fleet (for the "Rastgele yerleştir" button and tests). */
export function randomFleet(size, ships, rng = Math.random) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const fleet = [];
    const blocked = new Set();
    let ok = true;
    for (const len of ships) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const horizontal = rng() < 0.5;
        const r = Math.floor(rng() * (horizontal ? size : size - len + 1));
        const c = Math.floor(rng() * (horizontal ? size - len + 1 : size));
        const cells = [];
        for (let k = 0; k < len; k++) cells.push(horizontal ? r * size + c + k : (r + k) * size + c);
        if (cells.some((i) => blocked.has(i))) continue;
        fleet.push(cells);
        for (const i of cells) { blocked.add(i); for (const nb of neighbors8(size, i)) blocked.add(nb); }
        placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return fleet;
  }
  fail('Gemiler yerleştirilemedi');
  return null;
}

function resolveShot(fleet, idx, previousShots) {
  const ship = fleet.find((s) => s.includes(idx));
  if (!ship) return { result: 'miss' };
  const hitBefore = new Set(previousShots.filter((s) => s.result === 'hit' || s.result === 'sunk').map((s) => s.idx));
  const allHit = ship.every((i) => i === idx || hitBefore.has(i));
  return allHit ? { result: 'sunk', ship: ship.slice() } : { result: 'hit' };
}

// ----------------------------------------------------------------- rules
const pendingOf = (state, p) => {
  const list = state.shots[p];
  const last = list[list.length - 1];
  return last && last.result == null ? list.length - 1 : -1;
};

export function whoseTurn(state) {
  return state.shots[0].length > state.shots[1].length ? 1 : 0;
}

function checkOver(state) {
  if (pendingOf(state, 0) >= 0 || pendingOf(state, 1) >= 0) return state;
  if (state.shots[0].length !== state.shots[1].length) return state;
  const n = state.ships.length;
  if (state.sunk[0] >= n || state.sunk[1] >= n) return { ...state, phase: 'over' };
  return state;
}

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  switch (move.type) {
    case 'place': {
      if (state.phase !== 'place') fail('Yerleştirme bitti');
      if (state.ready[player]) fail('Gemilerin zaten hazır');
      const fleets = state.fleets.slice();
      if (move.secret && move.secret.fleet) fleets[player] = validateFleet(state.size, state.ships, move.secret.fleet);
      const ready = state.ready.slice();
      ready[player] = true;
      const next = { ...state, fleets, ready };
      if (ready[0] && ready[1]) next.phase = 'play';
      return next;
    }
    case 'shot': {
      if (state.phase !== 'play') fail('Şu anda ateş edilemez');
      if (player !== whoseTurn(state)) fail('Sıra sende değil');
      if (pendingOf(state, player) >= 0) fail('Önceki atış değerlendiriliyor');
      if (pendingOf(state, 1 - player) >= 0) fail('Rakibin atışı değerlendiriliyor');
      const idx = Number(move.idx);
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.size * state.size) fail('Geçersiz kare');
      if (state.shots[player].some((s) => s.idx === idx)) fail('Buraya zaten ateş ettin');
      const shots = state.shots.map((l) => l.slice());
      shots[player].push({ idx, result: null });
      return { ...state, shots };
    }
    case 'result': {
      if (state.phase !== 'play') fail('Oyun bu aşamada değil');
      const g = move.shooter;
      if (g !== 0 && g !== 1) fail('Geçersiz hamle');
      if (player !== 1 - g) fail('Atışı denizin sahibi değerlendirir');
      const idx = pendingOf(state, g);
      if (idx < 0 || idx !== move.index) fail('Değerlendirilecek atış yok');
      if (!['miss', 'hit', 'sunk'].includes(move.result)) fail('Geçersiz sonuç');
      const shots = state.shots.map((l) => l.slice());
      const entry = { ...shots[g][idx], result: move.result };
      if (move.result === 'sunk') {
        if (!Array.isArray(move.ship) || !move.ship.includes(entry.idx)) fail('Geçersiz sonuç');
        entry.ship = move.ship.map(Number);
      }
      shots[g][idx] = entry;
      const sunk = state.sunk.slice();
      if (move.result === 'sunk') sunk[g] += 1;
      return checkOver({ ...state, shots, sunk });
    }
    case 'giveup': {
      if (state.phase !== 'play') fail('Şu anda pes edilemez');
      if (player !== whoseTurn(state)) fail('Sıra sende değil');
      return { ...state, phase: 'over', gaveUp: player };
    }
    case 'reveal': {
      if (state.phase !== 'over') fail('Oyun bitmeden filo açıklanamaz');
      if (state.revealed[player]) return state;
      const revealed = state.revealed.slice();
      revealed[player] = Array.isArray(move.fleet) ? move.fleet : [];
      return { ...state, revealed };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function autoMove(state, player) {
  if (state.phase === 'play') {
    const g = 1 - player;
    const idx = pendingOf(state, g);
    if (idx < 0 || !state.fleets[player]) return null;
    const shot = state.shots[g][idx];
    const res = resolveShot(state.fleets[player], shot.idx, state.shots[g].slice(0, idx));
    return { type: 'result', shooter: g, index: idx, result: res.result, ship: res.ship };
  }
  if (state.phase === 'over' && !state.revealed[player] && state.fleets[player]) {
    return { type: 'reveal', fleet: state.fleets[player] };
  }
  return null;
}

export function getTurn(state) {
  if (state.phase === 'place') {
    const p = state.ready[0] ? (state.ready[1] ? null : 1) : 0;
    return p == null ? null : { player: p, private: true };
  }
  if (state.phase === 'play') return { player: whoseTurn(state), private: false };
  return null;
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  if (state.gaveUp != null) return { winner: 1 - state.gaveUp };
  const n = state.ships.length;
  const a = state.sunk[0] >= n;
  const b = state.sunk[1] >= n;
  if (a && b) return { draw: true };
  return { winner: a ? 0 : 1 };
}

// ----------------------------------------------------------------- render
const LETTERS = 'ABCDEFGHIJ';
const drafts = new Map(); // placement in progress per viewer: survives re-renders caused by remote moves
let draftsFor = null;     // state.id the drafts belong to
const RESULT_TEXT = { miss: 'İska', hit: 'Vurdu!', sunk: 'Batırdı!' };

function grid(size, cellFn, opts = {}) {
  const board = el('div', { class: `sea ${opts.small ? 'sea-small' : ''}`, style: { gridTemplateColumns: `auto repeat(${size}, 1fr)` }, role: 'grid', 'aria-label': opts.label || 'Deniz' });
  board.append(el('span', { class: 'sea-corner' }));
  for (let c = 0; c < size; c++) board.append(el('span', { class: 'sea-head' }, String(c + 1)));
  for (let r = 0; r < size; r++) {
    board.append(el('span', { class: 'sea-head' }, LETTERS[r]));
    for (let c = 0; c < size; c++) board.append(cellFn(r * size + c, r, c));
  }
  return board;
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  if (draftsFor !== state.id) { drafts.clear(); draftsFor = state.id; }
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  const opp = 1 - viewer;
  const { size } = state;
  const cellName = (idx) => `${LETTERS[Math.floor(idx / size)]}${(idx % size) + 1}`;

  // ---- placement
  if (state.phase === 'place') {
    if (state.ready[viewer]) {
      drafts.delete(`${viewer}:${state.size}`); // accepted: the draft is no longer needed
      draw(container,
        el('div', { class: 'status-line' }, el('strong', {}, 'Gemilerin hazır.')),
        el('p', { class: 'hint' }, `${players[opp]} gemilerini yerleştiriyor…`),
        el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      );
      return null;
    }
    const draftKey = `${viewer}:${state.size}`;
    if (!drafts.has(draftKey)) drafts.set(draftKey, { fleet: [], horizontal: true });
    const draft = drafts.get(draftKey);
    let fleet = draft.fleet;
    let horizontal = draft.horizontal;
    const keep = () => { draft.fleet = fleet; draft.horizontal = horizontal; };
    const remaining = () => {
      const left = state.ships.slice();
      for (const s of fleet) { const k = left.indexOf(s.length); if (k >= 0) left.splice(k, 1); }
      return left;
    };
    const occupied = () => new Set(fleet.flat());
    const boardBox = el('div');
    const info = el('div', { class: 'status-line' });
    const orientBtn = el('button', { type: 'button', class: 'btn btn-small', onClick: () => { horizontal = !horizontal; redraw(); } });
    const tryPlace = (idx) => {
      const left = remaining();
      if (!left.length) return;
      const len = left[0];
      const r = Math.floor(idx / size);
      const c = idx % size;
      const cells = [];
      for (let k = 0; k < len; k++) {
        const rr = horizontal ? r : r + k;
        const cc = horizontal ? c + k : c;
        if (rr >= size || cc >= size) { toast('Gemi denize sığmıyor', { kind: 'error' }); return; }
        cells.push(rr * size + cc);
      }
      const occ = occupied();
      for (const i of cells) {
        if (occ.has(i)) { toast('Gemiler üst üste olamaz', { kind: 'error' }); return; }
        for (const nb of neighbors8(size, i)) if (occ.has(nb)) { toast('Gemiler birbirine değemez', { kind: 'error' }); return; }
      }
      fleet = fleet.concat([cells]);
      keep();
      redraw();
    };
    const redraw = () => {
      keep();
      const left = remaining();
      const occ = occupied();
      orientBtn.textContent = horizontal ? 'Yön: yatay ↔' : 'Yön: dikey ↕';
      draw(info, left.length
        ? el('strong', {}, `${players[viewer]}, gemilerini yerleştir: sırada ${left[0]} kareli gemi (kalan: ${left.join(', ')})`)
        : el('strong', {}, 'Bütün gemiler yerinde. Hazırsan onayla.'));
      draw(boardBox, grid(size, (idx) => el('button', {
        type: 'button',
        class: `sea-cell ${occ.has(idx) ? 'ship' : ''}`,
        'aria-label': cellName(idx),
        disabled: !left.length && !occ.has(idx),
        onClick: () => {
          if (occ.has(idx)) { fleet = fleet.filter((s) => !s.includes(idx)); redraw(); return; } // tap a ship to remove it
          tryPlace(idx);
        },
      }), { label: 'Senin denizin' }));
    };
    redraw();
    draw(container,
      info,
      el('p', { class: 'hint' }, 'Bir kareye dokun: gemi oradan başlayarak yerleşir. Gemiye dokununca kaldırılır.'),
      el('div', { class: 'row', style: { marginBottom: '8px' } },
        orientBtn,
        el('button', { type: 'button', class: 'btn btn-small', onClick: () => { fleet = randomFleet(size, state.ships, createRng(randomSeed())); redraw(); } }, 'Rastgele yerleştir'),
        el('button', { type: 'button', class: 'btn btn-small', onClick: () => { fleet = []; redraw(); } }, 'Temizle'),
      ),
      boardBox,
      el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '10px' }, onClick: () => sendMove({ type: 'place', secret: { fleet } }) }, 'Hazır'), // a rejected placement keeps the draft
    );
    return null;
  }
  drafts.delete(`${viewer}:${state.size}`);

  // ---- target grid (viewer's shots at the opponent's sea)
  const myShots = new Map(state.shots[viewer].map((s) => [s.idx, s]));
  const sunkCells = new Set(state.shots[viewer].flatMap((s) => s.ship || []));
  const turn = state.phase === 'play' ? whoseTurn(state) : null;
  const mine = state.phase === 'play' && viewer === turn;
  const myPending = pendingOf(state, viewer) >= 0;
  const oppFleetRevealed = state.revealed[opp];
  const targetGrid = grid(size, (idx) => {
    const s = myShots.get(idx);
    const revealedShip = oppFleetRevealed && oppFleetRevealed.some((ship) => ship.includes(idx));
    const cls = s ? (s.result === null ? 'pending' : sunkCells.has(idx) ? 'sunk' : s.result) : (revealedShip ? 'ship' : '');
    return el('button', {
      type: 'button',
      class: `sea-cell ${cls}`,
      'aria-label': `${cellName(idx)}${s ? `, ${s.result === null ? 'bekliyor' : RESULT_TEXT[s.result]}` : ''}`,
      disabled: !mine || myPending || !!s,
      onClick: () => sendMove({ type: 'shot', idx }),
    }, s ? (s.result === 'miss' ? '·' : s.result === null ? '…' : '✕') : '');
  }, { label: `${nameSuffix(players[opp], 'in')} denizi` });

  // ---- own sea (opponent's shots at the viewer), ships hidden on a shared phone until toggled
  const oppShots = new Map(state.shots[opp].map((s) => [s.idx, s]));
  const oppSunkCells = new Set(state.shots[opp].flatMap((s) => s.ship || []));
  const myFleet = state.fleets[viewer] || state.revealed[viewer] || [];
  const myShipCells = new Set(myFleet.flat());
  let showShips = online || state.phase === 'over';
  const ownBox = el('div');
  const drawOwn = () => {
    draw(ownBox, grid(size, (idx) => {
      const s = oppShots.get(idx);
      const cls = s ? (s.result === 'miss' ? 'miss' : oppSunkCells.has(idx) ? 'sunk' : 'hit') : (showShips && myShipCells.has(idx) ? 'ship' : '');
      return el('span', { class: `sea-cell ${cls}`, 'aria-label': cellName(idx) }, s ? (s.result === 'miss' ? '·' : '✕') : '');
    }, { small: true, label: 'Senin denizin' }));
  };
  drawOwn();

  const lastShot = state.shots[viewer][state.shots[viewer].length - 1];
  const lastOppShot = state.shots[opp][state.shots[opp].length - 1];
  let status;
  if (state.phase === 'over') {
    const r = getResult(state);
    status = state.gaveUp != null ? `${players[state.gaveUp]} pes etti.` : (r.draw ? 'İkiniz de aynı turda bitirdiniz: berabere!' : `${players[r.winner]} bütün gemileri batırdı!`);
  } else if (myPending) status = 'Atış değerlendiriliyor…';
  else if (mine) status = `Sıra sende, ${players[viewer]}: ${nameSuffix(players[opp], 'in')} denizinde bir kare seç`;
  else status = `${players[turn]} ateş ediyor…`;
  const notes = [];
  if (lastShot && lastShot.result) notes.push(`Son atışın ${cellName(lastShot.idx)}: ${RESULT_TEXT[lastShot.result]}`);
  if (lastOppShot && lastOppShot.result) notes.push(`${nameSuffix(players[opp], 'in')} son atışı ${cellName(lastOppShot.idx)}: ${RESULT_TEXT[lastOppShot.result]}`);
  const oppSolved = state.sunk[opp] >= state.ships.length;
  if (state.phase === 'play' && oppSolved && mine) notes.push(`${players[opp]} bütün gemilerini batırdı. Bu son atışın: sen de bitirirsen berabere.`);

  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, status)),
    notes.length ? el('p', { class: 'hint' }, notes.join(' · ')) : null,
    el('div', { class: 'c4-legend' },
      el('span', {}, `Batırdığın: ${state.sunk[viewer]}/${state.ships.length}`),
      el('span', {}, `Batan gemin: ${state.sunk[opp]}/${state.ships.length}`),
    ),
    el('div', { class: 'col-title active' }, `${nameSuffix(players[opp], 'in')} denizi (hedef)`),
    targetGrid,
    el('div', { class: 'col-title', style: { marginTop: '10px' } }, 'Senin denizin'),
    !online && state.phase !== 'over'
      ? el('button', {
        type: 'button', class: 'btn btn-small', style: { touchAction: 'none' },
        onPointerdown: (e) => { e.preventDefault(); showShips = true; drawOwn(); },
        onPointerup: () => { showShips = false; drawOwn(); },
        onPointercancel: () => { showShips = false; drawOwn(); },
        onPointerleave: () => { if (showShips) { showShips = false; drawOwn(); } },
      }, 'Gemilerimi göster (basılı tut)')
      : null,
    ownBox,
    mine && !myPending ? el('div', { class: 'row', style: { marginTop: '10px' } },
      el('button', { type: 'button', class: 'btn btn-secondary btn-small', onClick: () => { if (confirm('Pes ediyor musun?')) sendMove({ type: 'giveup' }); } }, 'Pes'),
    ) : null,
  );
  return null;
}

export default { id: 'amiral-batti', meta, setup, applyMove, autoMove, render, getTurn, getResult };
