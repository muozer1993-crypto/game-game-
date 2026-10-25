// Tavla — backgammon with Turkish rules (no doubling cube; mars = 2 points).
// Player 0 moves from point 24 down to 1 (indexes 23 → 0, home 0..5),
// player 1 moves from 1 up to 24 (indexes 0 → 23, home 18..23).
import { el, render as draw, toast } from '../js/ui/dom.js';
import { diceOnce } from '../js/lib/sfx.js';
import { randomSeed } from '../js/lib/rng.js';
import { nameSuffix } from '../js/lib/tr.js';
import { discCanvas, keyDot, triangleCanvas } from '../js/ui/paint.js';

export const meta = {
  group: 'kart',
  name: 'Tavla',
  icon: '🎲',
  description: 'Klasik tavla: zar at, pulları ev bölgene taşı, hepsini topla.',
  rules: [
    'Her oyuncunun 15 pulu vardır. Sırası gelen zar atar ve zarlardaki sayı kadar pul ilerletir; çift zarda dört hamle yapılır.',
    'Rakibin iki ya da daha çok pulu olan haneye gidilemez. Tek pul olan haneye gidilirse o pul kırılır ve bara gider; kırılan pul oyuna rakibin ev bölgesinden yeniden girmeden başka hamle yapılamaz.',
    'Bütün pullar ev bölgesine gelince pullar toplanmaya başlar. Pullarını önce toplayan kazanır; rakip hiç pul toplayamamışsa "mars" olur ve 2 puan yazılır.',
    'Mümkün olduğunca iki zar da oynanmalıdır; yalnızca biri oynanabiliyorsa büyük zar tercih edilir. Oynanacak hamle yoksa sıra kendiliğinden geçer.',
    'Oynamak için önce pulun bulunduğu haneye, sonra gideceği haneye dokun. Tur bitmeden "Geri al" ile hamleleri geri alabilirsin.',
  ].join('\n'),
  data: [],
  settings: [],
};

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const pts = new Array(24).fill(0); // >0: player 0 checkers, <0: player 1 checkers
  pts[23] = 2; pts[12] = 5; pts[7] = 3; pts[5] = 5;
  pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5;
  return {
    pts,
    bar: [0, 0],
    off: [0, 0],
    turn: (Number(options.seed) || 0) % 2,
    dice: [],          // remaining dice to play this turn
    rolled: null,      // the dice as rolled (for display)
    turnStart: null,   // snapshot {pts, bar, off, dice} taken after rolling, for undo
    moves: [],         // steps played this turn [{from, to, die, hit}]
    skipped: null,     // { player, dice } when the last roll had no legal move
    over: false,
    winner: null,
    points: 0,
  };
}

// ----------------------------------------------------------------- rules helpers
const sign = (p) => (p === 0 ? 1 : -1);
const count = (state, i, p) => (p === 0 ? Math.max(0, state.pts[i]) : Math.max(0, -state.pts[i]));
const HOME = [[0, 5], [18, 23]];

export function inHome(p, i) {
  return i >= HOME[p][0] && i <= HOME[p][1];
}

export function allHome(state, p) {
  if (state.bar[p] > 0) return false;
  for (let i = 0; i < 24; i++) if (count(state, i, p) > 0 && !inHome(p, i)) return false;
  return true;
}

export function pipCount(state, p) {
  let pips = state.bar[p] * 25;
  for (let i = 0; i < 24; i++) {
    const n = count(state, i, p);
    if (n) pips += n * (p === 0 ? i + 1 : 24 - i);
  }
  return pips;
}

/** Destination of a single step, or null if illegal. from = -1 means the bar. */
export function stepTarget(state, p, from, die) {
  if (state.bar[p] > 0 && from !== -1) return null; // must enter first
  if (from === -1) {
    if (state.bar[p] === 0) return null;
    const to = p === 0 ? 24 - die : die - 1;
    return count(state, to, 1 - p) >= 2 ? null : to;
  }
  if (count(state, from, p) === 0) return null;
  const to = p === 0 ? from - die : from + die;
  if (to >= 0 && to < 24) return count(state, to, 1 - p) >= 2 ? null : to;
  // bearing off
  if (!allHome(state, p)) return null;
  const dist = p === 0 ? from + 1 : 24 - from;
  if (dist === die) return 'off';
  if (die > dist) {
    // only if no checker further from the edge
    for (let i = 0; i < 24; i++) {
      if (count(state, i, p) === 0) continue;
      const d = p === 0 ? i + 1 : 24 - i;
      if (d > dist) return null;
    }
    return 'off';
  }
  return null;
}

function applyStep(state, p, from, die) {
  const to = stepTarget(state, p, from, die);
  if (to === null) return null;
  const pts = state.pts.slice();
  const bar = state.bar.slice();
  const off = state.off.slice();
  let hit = false;
  if (from === -1) bar[p] -= 1; else pts[from] -= sign(p);
  if (to === 'off') off[p] += 1;
  else {
    if (count(state, to, 1 - p) === 1) { pts[to] = 0; bar[1 - p] += 1; hit = true; }
    pts[to] += sign(p);
  }
  const dice = state.dice.slice();
  dice.splice(dice.indexOf(die), 1);
  return { ...state, pts, bar, off, dice, moves: state.moves.concat([{ from, to, die, hit }]) };
}

/** All (from, die) pairs that are legal single steps right now, ignoring the max-usage rule. */
function rawSteps(state, p) {
  const out = [];
  const dice = [...new Set(state.dice)];
  const froms = state.bar[p] > 0 ? [-1] : [...Array(24).keys()].filter((i) => count(state, i, p) > 0);
  for (const from of froms) for (const die of dice) if (stepTarget(state, p, from, die) !== null) out.push({ from, die });
  return out;
}

function maxUsable(state, p, depth = 0) {
  if (!state.dice.length) return 0;
  let best = 0;
  for (const s of rawSteps(state, p)) {
    const next = applyStep(state, p, s.from, s.die);
    const used = 1 + maxUsable(next, p, depth + 1);
    if (used > best) best = used;
    if (best === state.dice.length) break;
  }
  return best;
}

/** Legal steps under the "play as many dice as possible, prefer the larger die" rule. */
export function legalSteps(state, p = state.turn) {
  if (state.over || p !== state.turn || !state.dice.length) return [];
  const steps = rawSteps(state, p);
  if (!steps.length) return [];
  const max = maxUsable(state, p);
  let allowed = steps.filter((s) => 1 + maxUsable(applyStep(state, p, s.from, s.die), p) === max);
  if (max === 1 && state.dice.length >= 2) {
    const big = Math.max(...state.dice);
    const withBig = allowed.filter((s) => s.die === big);
    if (withBig.length) allowed = withBig;
  }
  return allowed.map((s) => ({ ...s, to: stepTarget(state, p, s.from, s.die) }));
}

function endTurn(state) {
  return { ...state, turn: 1 - state.turn, dice: [], rolled: null, turnStart: null, moves: [] };
}

export function rollDice(rnd = Math.random) {
  return [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
}

// ----------------------------------------------------------------- moves
export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  switch (move.type) {
    case 'roll': {
      if (state.dice.length || state.rolled) fail('Zar zaten atıldı');
      const d = Array.isArray(move.dice) ? move.dice.map(Number) : [];
      if (d.length !== 2 || d.some((x) => !Number.isInteger(x) || x < 1 || x > 6)) fail('Geçersiz zar');
      const dice = d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : d.slice().sort((a, b) => b - a);
      const next = { ...state, dice, rolled: d.slice(), moves: [], skipped: null };
      next.turnStart = { pts: next.pts.slice(), bar: next.bar.slice(), off: next.off.slice(), dice: dice.slice() };
      return next;
    }
    case 'step': {
      if (!state.dice.length) fail('Önce zar at');
      const from = move.from === 'bar' ? -1 : Number(move.from);
      const die = Number(move.die);
      const legal = legalSteps(state, player).find((s) => s.from === from && s.die === die);
      if (!legal) fail('Bu hamle kurallara uymuyor');
      let next = applyStep(state, player, from, die);
      if (next.off[player] >= 15) {
        const mars = next.off[1 - player] === 0;
        return { ...next, over: true, winner: player, points: mars ? 2 : 1, dice: [] };
      }
      if (!legalSteps(next, player).length) next = endTurn(next);
      return next;
    }
    case 'undo': {
      if (!state.turnStart) fail('Geri alınacak hamle yok');
      const t = state.turnStart;
      return { ...state, pts: t.pts.slice(), bar: t.bar.slice(), off: t.off.slice(), dice: t.dice.slice(), moves: [] };
    }
    case 'pass': {
      if (!state.dice.length) fail('Geçilecek hamle yok');
      if (legalSteps(state, player).length) fail('Oynanabilecek hamle var');
      return { ...endTurn(state), skipped: { player, dice: state.rolled ? state.rolled.slice() : state.dice.slice() } };
    }
    case 'giveup': {
      return { ...state, over: true, winner: 1 - player, points: 1, dice: [] };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function autoMove(state, player) {
  // no legal move with the rolled dice: the turn passes by itself
  if (!state.over && state.turn === player && state.dice.length && !legalSteps(state, player).length) return { type: 'pass' };
  return null;
}

export function getTurn(state) {
  return state.over ? null : { player: state.turn, private: false };
}

export function getResult(state) {
  if (!state.over) return null;
  return { winner: state.winner, points: state.points };
}

// ----------------------------------------------------------------- render
const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const CHECKER = ['#fafafa', '#263238'];
/** A checker drawn on canvas (forced dark modes cannot recolour it); `label` is the stack count. */
const checker = (owner, label) => el('span', { class: `tv-checker p${owner}` }, discCanvas(CHECKER[owner], { mark: label, size: 56 }));

export function render(state, viewer, container, sendMove, ctx = {}) {
  if (state.turnStart) diceOnce(state.turnStart); // a new roll makes a new turnStart
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  const p = state.turn;
  const mine = !state.over && viewer === p;
  // the online guest sees the board from its own side; on a shared phone the board stays fixed
  const flip = online && viewer === 1;
  const disp = (i) => (flip ? 23 - i : i); // board index -> display index
  const legal = mine ? legalSteps(state, p) : [];
  let selected = null; // board index or -1 (bar)

  const boardBox = el('div', { class: 'tv-board' });
  const info = el('div', { class: 'status-line' });

  const drawBoard = () => {
    const targets = new Map(); // board index|'off' -> step for the selected source
    if (selected !== null) for (const s of legal) if (s.from === selected) targets.set(s.to, s);
    const sources = new Set(legal.map((s) => s.from));

    const point = (i) => {
      const n = state.pts[i];
      const owner = n > 0 ? 0 : n < 0 ? 1 : null;
      const cnt = Math.abs(n);
      const d = disp(i);
      const top = d >= 12; // display rows: 12..23 on top (left→right), 0..11 bottom (right→left)
      const isSource = sources.has(i);
      const isTarget = targets.has(i);
      const checkers = [];
      for (let k = 0; k < Math.min(cnt, 5); k++) checkers.push(checker(owner, k === 4 && cnt > 5 ? String(cnt) : ''));
      return el('button', {
        type: 'button',
        class: `tv-point ${top ? 'top' : 'bottom'} ${d % 2 ? 'odd' : 'even'} ${isSource ? 'source' : ''} ${isTarget ? 'target' : ''} ${selected === i ? 'selected' : ''}`,
        style: { gridColumn: String(colOf(d)) },
        'aria-label': `${i + 1}. hane${cnt ? `, ${players[owner]} ${cnt} pul` : ''}`,
        disabled: !mine || !(isSource || isTarget),
        onClick: () => {
          if (isTarget) { sendMove({ type: 'step', from: selected === -1 ? 'bar' : selected, die: targets.get(i).die }); return; }
          selected = selected === i ? null : i;
          drawBoard();
        },
      }, triangleCanvas(selected === i ? '#ffb300' : isTarget ? '#81c784' : isSource ? '#ffe082' : d % 2 ? '#a1887f' : '#d7ccc8', top, 'tv-tri'), el('span', { class: 'tv-stack' }, checkers));
    };
    // display column: top row shows display indexes 12..23 left to right, bottom shows 11..0 left to right
    function colOf(d) {
      const col = d >= 12 ? d - 12 : 11 - d;
      return col + (col >= 6 ? 2 : 1); // leave column 7 for the bar
    }
    const cells = [];
    for (let i = 0; i < 24; i++) cells.push(point(i));
    const barSource = sources.has(-1);
    const bar = el('button', {
      type: 'button',
      class: `tv-bar ${barSource ? 'source' : ''} ${selected === -1 ? 'selected' : ''}`,
      style: { gridColumn: '7', gridRow: '1 / span 2' },
      disabled: !mine || !barSource,
      'aria-label': `Bar: ${players[0]} ${state.bar[0]}, ${players[1]} ${state.bar[1]}`,
      onClick: () => { selected = selected === -1 ? null : -1; drawBoard(); },
    },
      el('span', { class: 'tv-stack' }, Array.from({ length: Math.min(state.bar[0], 5) }, (_, k) => checker(0, k === 4 && state.bar[0] > 5 ? String(state.bar[0]) : ''))),
      el('span', { class: 'tv-stack' }, Array.from({ length: Math.min(state.bar[1], 5) }, (_, k) => checker(1, k === 4 && state.bar[1] > 5 ? String(state.bar[1]) : ''))),
    );
    const offTarget = targets.has('off');
    const offTray = el('button', {
      type: 'button',
      class: `tv-off ${offTarget ? 'target' : ''}`,
      style: { gridColumn: '14', gridRow: '1 / span 2' },
      disabled: !offTarget,
      'aria-label': `Toplanan: ${players[0]} ${state.off[0]}, ${players[1]} ${state.off[1]}`,
      onClick: () => { if (offTarget) sendMove({ type: 'step', from: selected === -1 ? 'bar' : selected, die: targets.get('off').die }); },
    },
    // each count sits beside its owner's home: the top home is the opponent's on the shown side
    ...(flip ? [0, 1] : [1, 0]).map((q) => el('span', { class: `tv-off-count p${q}` }, String(state.off[q]))));
    draw(boardBox, cells, bar, offTray);
  };

  let dice;
  if (state.dice.length) dice = el('div', { class: 'tv-dice' }, state.rolled.map((d) => el('span', { class: 'tv-die' }, DIE[d])), el('span', { class: 'muted' }, ` kalan: ${state.dice.join(' ')}`));
  else if (state.skipped) dice = el('div', { class: 'tv-dice' }, state.skipped.dice.map((d) => el('span', { class: 'tv-die' }, DIE[d])), el('span', { class: 'muted', style: { fontSize: '0.95rem' } }, ` ${players[state.skipped.player]} attı: oynanacak hamle yok, sıra geçti`));
  else dice = el('div', { class: 'tv-dice muted' }, 'Zar atılmadı');

  let status;
  if (state.over) status = `${players[state.winner]} kazandı${state.points === 2 ? ' (mars, 2 puan)' : ''}!`;
  else if (!state.dice.length) status = mine ? `Sıra sende, ${players[viewer]}: zar at` : `${players[p]} zar atacak…`;
  else status = mine ? `Pul seç, sonra gideceği haneyi seç` : `${players[p]} oynuyor…`;
  draw(info, el('strong', {}, status));
  drawBoard();

  const actions = [];
  if (mine && !state.dice.length) {
    actions.push(el('button', { type: 'button', class: 'btn btn-primary btn-big', onClick: () => sendMove({ type: 'roll', dice: rollDice(() => randomSeed() / 4294967296) }) }, '🎲 Zar at'));
  }
  if (mine && state.dice.length && state.moves.length) {
    actions.push(el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => sendMove({ type: 'undo' }) }, 'Geri al'));
  }
  if (mine) actions.push(el('button', { type: 'button', class: 'btn btn-secondary btn-small', onClick: () => { if (confirm('Pes ediyor musun?')) sendMove({ type: 'giveup' }); } }, 'Pes'));

  draw(container,
    info,
    el('div', { class: 'c4-legend' },
      el('span', { class: 'tv-key' }, keyDot(CHECKER[0]), `${players[0]}: ${pipCount(state, 0)} pip, ${state.off[0]} toplandı`),
      el('span', { class: 'tv-key' }, keyDot(CHECKER[1]), `${players[1]}: ${pipCount(state, 1)} pip, ${state.off[1]} toplandı`),
    ),
    dice,
    boardBox,
    el('p', { class: 'hint' }, flip ? 'Pulların sağ alttaki eve doğru ilerler.' : `${players[0]} sağ alttaki eve, ${players[1]} sağ üstteki eve doğru ilerler.`),
    actions.length ? el('div', { class: 'row', style: { marginTop: '10px' } }, actions) : null,
  );
  return null;
}

export default { id: 'tavla', meta, setup, applyMove, autoMove, render, getTurn, getResult };
