// Zar Pokeri — Yatzy-style dice poker for two: up to three rolls per turn (hold any dice),
// then write the result into one of 15 categories. Upper-section bonus at 63. No hidden
// information, so the phone is simply passed; online the opponent watches every roll.
import { el, render as draw } from '../js/ui/dom.js';
import { createRng } from '../js/lib/rng.js';

export const meta = {
  group: 'kart',
  name: 'Zar Pokeri',
  icon: '🎰',
  description: 'Beş zar, üç atış, 15 kategori; tutacağın zarı seç, en iyi haneyi doldur.',
  rules: [
    'Sırası gelen beş zar atar; istediği zarları tutup iki kez daha atabilir. Sonra sonucu boş bir haneye yazar (uymayan haneye 0 yazmak zorunda kalabilirsin).',
    'Üst bölüm: Birler–Altılar (o yüzlerin toplamı); toplam 63 ve üstüyse 50 bonus. Alt bölüm: Çift (en büyük çiftin toplamı), İki çift, Üçlü, Dörtlü, Küçük kent 1-2-3-4-5 (15), Büyük kent 2-3-4-5-6 (20), Full (üçlü + çift, zarların toplamı), Şans (toplam), Beşli (50).',
    '15 el sonunda toplamı yüksek olan kazanır. İki telefonda rakibinin atışlarını canlı izlersin.',
  ].join('\n'),
  data: [],
  settings: [],
};

export const CATS = [
  { id: 'ones', label: 'Birler', upper: 1 }, { id: 'twos', label: 'İkiler', upper: 2 }, { id: 'threes', label: 'Üçler', upper: 3 },
  { id: 'fours', label: 'Dörtler', upper: 4 }, { id: 'fives', label: 'Beşler', upper: 5 }, { id: 'sixes', label: 'Altılar', upper: 6 },
  { id: 'pair', label: 'Çift' }, { id: 'twoPairs', label: 'İki çift' }, { id: 'three', label: 'Üçlü' }, { id: 'four', label: 'Dörtlü' },
  { id: 'small', label: 'Küçük kent' }, { id: 'large', label: 'Büyük kent' }, { id: 'full', label: 'Full' }, { id: 'chance', label: 'Şans' }, { id: 'yatzy', label: 'Beşli' },
];
export const BONUS_AT = 63;
export const BONUS = 50;
export const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function fail(msg) {
  throw new Error(msg);
}

const counts = (dice) => { const c = [0, 0, 0, 0, 0, 0, 0]; dice.forEach((d) => { c[d] += 1; }); return c; };
const sum = (dice) => dice.reduce((s, d) => s + d, 0);

/** Score of `dice` in category `id` (0 when it does not fit). */
export function scoreFor(id, dice) {
  const c = counts(dice);
  const faces = (n) => { for (let f = 6; f >= 1; f--) if (c[f] >= n) return f; return 0; };
  switch (id) {
    case 'ones': case 'twos': case 'threes': case 'fours': case 'fives': case 'sixes': {
      const f = CATS.find((x) => x.id === id).upper;
      return c[f] * f;
    }
    case 'pair': return faces(2) * 2;
    case 'twoPairs': {
      const pairs = [];
      for (let f = 6; f >= 1; f--) if (c[f] >= 2) pairs.push(f);
      return pairs.length >= 2 ? pairs[0] * 2 + pairs[1] * 2 : 0;
    }
    case 'three': return faces(3) * 3;
    case 'four': return faces(4) * 4;
    case 'small': return [1, 2, 3, 4, 5].every((f) => c[f] === 1) ? 15 : 0;
    case 'large': return [2, 3, 4, 5, 6].every((f) => c[f] === 1) ? 20 : 0;
    case 'full': {
      const t = faces(3);
      if (!t) return 0;
      for (let f = 6; f >= 1; f--) if (f !== t && c[f] >= 2) return sum(dice);
      return 0;
    }
    case 'chance': return sum(dice);
    case 'yatzy': return faces(5) ? 50 : 0;
    default: return 0;
  }
}

export function upperSum(sheet) {
  return CATS.filter((x) => x.upper).reduce((s, x) => s + (sheet[x.id] || 0), 0);
}
export function totalOf(sheet) {
  const up = upperSum(sheet);
  return CATS.reduce((s, x) => s + (sheet[x.id] || 0), 0) + (up >= BONUS_AT ? BONUS : 0);
}

export function rollDice(seed, n, dice, held) {
  const rng = createRng(((Number(seed) || 1) + n * 7919) >>> 0);
  return dice.map((d, i) => (held[i] && d ? d : 1 + Math.floor(rng() * 6)));
}

export function setup(options = {}) {
  return {
    id: String(options.seed ?? ''),
    seed: Number(options.seed) || 1,
    sheets: [{}, {}],      // category id -> score
    turn: 0,
    dice: [0, 0, 0, 0, 0], // 0 = not rolled yet this turn
    held: [false, false, false, false, false],
    rollsLeft: 3,
    rollCount: 0,
    phase: 'play',         // play | over
  };
}

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.phase !== 'play') fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  switch (move.type) {
    case 'roll': {
      if (state.rollsLeft <= 0) fail('Bu elde atış hakkın bitti');
      const held = Array.isArray(move.held) && state.dice[0] ? state.dice.map((_, i) => !!move.held[i]) : [false, false, false, false, false];
      if (held.every(Boolean)) fail('Bütün zarları tutarak atılmaz');
      const rollCount = state.rollCount + 1;
      return { ...state, dice: rollDice(state.seed, rollCount, state.dice, held), held, rollsLeft: state.rollsLeft - 1, rollCount };
    }
    case 'score': {
      if (!state.dice[0]) fail('Önce zar at');
      const cat = CATS.find((x) => x.id === move.cat);
      if (!cat) fail('Geçersiz hane');
      if (state.sheets[player][cat.id] != null) fail('Bu hane dolu');
      const sheets = state.sheets.map((s) => ({ ...s }));
      sheets[player][cat.id] = scoreFor(cat.id, state.dice);
      const done = sheets.every((s) => CATS.every((x) => s[x.id] != null));
      return { ...state, sheets, turn: 1 - player, dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rollsLeft: 3, phase: done ? 'over' : 'play' };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase !== 'play') return null;
  return { player: state.turn, private: false }; // nothing is hidden: no handoff screens
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const [a, b] = state.sheets.map(totalOf);
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
const drafts = new Map(); // `${id}:${rollCount}` -> held[] being chosen for the next roll
let draftsFor = null;

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  if (draftsFor !== state.id) { drafts.clear(); draftsFor = state.id; }
  const p = state.turn;
  const mine = !online || viewer === p;
  const rolled = !!state.dice[0];
  const totals = state.sheets.map(totalOf);
  const uppers = state.sheets.map(upperSum);
  const filled = state.sheets.map((s) => CATS.filter((x) => s[x.id] != null).length);

  const sheet = () => {
    const rows = [el('div', { class: 'zp-row zp-head' }, el('span', {}, ''), el('span', {}, players[0]), el('span', {}, players[1]))];
    const cell = (q, cat) => {
      const v = state.sheets[q][cat.id];
      if (v != null) return el('span', { class: 'zp-val used' }, String(v));
      if (q === p && mine && rolled && state.phase === 'play') return el('span', { class: 'zp-val can' }, `${scoreFor(cat.id, state.dice)}`);
      return el('span', { class: 'zp-val' }, '·');
    };
    CATS.forEach((cat, i) => {
      const can = mine && rolled && state.phase === 'play' && state.sheets[p][cat.id] == null;
      const row = el(can ? 'button' : 'div', {
        type: can ? 'button' : undefined, class: `zp-row ${can ? 'can' : ''}`,
        onClick: can ? () => {
          const v = scoreFor(cat.id, state.dice);
          if (v === 0 && !confirm(`${cat.label} hanesine 0 yazılsın mı?`)) return;
          sendMove({ type: 'score', cat: cat.id });
        } : undefined,
      }, el('span', { class: 'zp-cat' }, cat.label), cell(0, cat), cell(1, cat));
      rows.push(row);
      if (i === 5) rows.push(el('div', { class: 'zp-row zp-bonus' }, el('span', { class: 'zp-cat' }, `Bonus (${BONUS_AT}+)`), ...[0, 1].map((q) => el('span', { class: 'zp-val' }, `${uppers[q]}/${BONUS_AT}${uppers[q] >= BONUS_AT ? ` +${BONUS}` : ''}`))));
    });
    rows.push(el('div', { class: 'zp-row zp-total' }, el('span', { class: 'zp-cat' }, 'Toplam'), ...[0, 1].map((q) => el('strong', { class: 'zp-val' }, String(totals[q])))));
    return el('div', { class: 'zp-sheet card' }, rows);
  };

  if (state.phase === 'over') {
    const [a, b] = totals;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, a === b ? `Berabere: ${a}–${b}` : `${players[a > b ? 0 : 1]} kazandı: ${Math.max(a, b)}–${Math.min(a, b)}`)),
      sheet(),
    );
    return null;
  }

  // the hold draft belongs to one roll: before the first roll of a turn there is nothing to hold
  const key = `${state.id}:${state.rollCount}`;
  const held = rolled ? (drafts.get(key) || state.held.slice()) : [false, false, false, false, false];
  if (rolled) drafts.set(key, held);
  const dieBtns = state.dice.map((d, i) => el('button', {
    type: 'button', class: `zp-die ${held[i] ? 'held' : ''}`, disabled: !mine || !rolled || state.rollsLeft === 0,
    'aria-label': d ? `zar ${d}${held[i] ? ', tutuluyor' : ''}` : 'zar',
    onClick: () => { held[i] = !held[i]; dieBtns[i].classList.toggle('held', held[i]); dieBtns[i].setAttribute('aria-label', `zar ${d}${held[i] ? ', tutuluyor' : ''}`); syncRoll(); },
  }, d ? FACES[d] : '·'));
  const rollBtn = mine && state.rollsLeft > 0
    ? el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', onClick: () => { if (rolled && held.every(Boolean)) return; sendMove({ type: 'roll', held: held.slice() }); } },
      rolled ? `Tekrar at (${state.rollsLeft} hak)` : 'Zar at')
    : null;
  const syncRoll = () => { // holding all five leaves nothing to roll: say so instead of a dead button
    if (!rollBtn) return;
    const all = rolled && held.every(Boolean);
    rollBtn.disabled = all;
    rollBtn.textContent = all ? 'En az bir zarı bırak' : rolled ? `Tekrar at (${state.rollsLeft} hak)` : 'Zar at';
  };
  syncRoll();
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, mine ? (rolled ? (state.rollsLeft > 0 ? `${players[p]}: zarları tut, tekrar at ya da bir hane seç` : `${players[p]}: bir hane seç`) : `${players[p]}, zar at`) : `${players[p]} oynuyor…`)),
    el('div', { class: 'zp-dice' }, dieBtns),
    rolled && mine && state.rollsLeft > 0 ? el('p', { class: 'hint' }, 'Tutmak istediğin zara dokun.') : null,
    rollBtn,
    el('p', { class: 'hint' }, `${filled[p] + 1}. el / ${CATS.length}`),
    sheet(),
  );
  return null;
}

export default { id: 'zar-pokeri', meta, setup, applyMove, render, getTurn, getResult };
