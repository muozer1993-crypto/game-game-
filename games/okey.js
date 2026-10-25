// İkili Okey — two-player okey. 106 tiles (1–13 in four colours twice, plus two fake jokers);
// the indicator decides the okey (joker). Draw from the pile or take the opponent's last discard,
// discard one; finish by showing 14 tiles in runs/sets (or seven pairs) and throwing the 15th.
import { el, render as draw } from '../js/ui/dom.js';
import { createRng, shuffle } from '../js/lib/rng.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'kart',
  name: 'Okey (ikili)',
  icon: '🀄',
  description: 'Gösterge, okey, per ve seriler: 14 taşı diz, 15.yi at, eli bitir.',
  rules: [
    'Başlayan 15, diğeri 14 taş alır; bir taş gösterge olarak açılır, aynı renkte bir büyüğü okeydir (joker). Sahte okey taşları okeyin yerine geçer.',
    'Sıran gelince ortadan bir taş çekersin ya da rakibin son attığı taşı alırsın, sonra bir taş atarsın. Elini bitirmek için 14 taşın perlere (aynı renk ardışık, en az üç; 12-13-1 olur) ve serilere (aynı sayı farklı renk, üç ya da dört) ya da yedi çifte ayrılabilmeli; 15. taşı atarsın.',
    'Normal bitiş 2 puan, çifte bitiş ya da okey atarak bitiş 4 puan. Hedef puana ulaşan kazanır; orta biterse el berabere.',
  ].join('\n'),
  data: [],
  handoffNote: 'Taşlarını rakibin görmemeli.',
  settings: [
    { key: 'target', label: 'Hedef puan', type: 'select', default: 6, options: [{ value: 0, label: 'Tek el' }, { value: 6, label: '6' }, { value: 12, label: '12' }] },
  ],
};

export const COLOUR_NAMES = ['kırmızı', 'sarı', 'mavi', 'siyah'];
export const FAKE = 4;

function fail(msg) {
  throw new Error(msg);
}

export function makeTiles() {
  const tiles = [];
  let id = 0;
  for (let copy = 0; copy < 2; copy++) for (let c = 0; c < 4; c++) for (let n = 1; n <= 13; n++) tiles.push({ id: id++, c, n });
  tiles.push({ id: id++, c: FAKE, n: 0 }, { id: id++, c: FAKE, n: 0 });
  return tiles;
}

export const isOkey = (t, okey) => t.c === okey.c && t.n === okey.n;
export const isFake = (t) => t.c === FAKE;

/** Count real identities: fake okeys become the okey tile, okey tiles become jokers. */
export function normalize(tiles, okey) {
  const counts = Array.from({ length: 4 }, () => new Array(15).fill(0));
  let jokers = 0;
  for (const t of tiles) {
    if (isFake(t)) counts[okey.c][okey.n] += 1;
    else if (isOkey(t, okey)) jokers += 1;
    else counts[t.c][t.n] += 1;
  }
  return { counts, jokers };
}

function solveGroups(counts, jk) {
  let fc = -1;
  let fn = -1;
  for (let n = 1; n <= 13 && fc < 0; n++) for (let c = 0; c < 4; c++) if (counts[c][n] > 0) { fc = c; fn = n; break; }
  if (fc < 0) return true; // leftover jokers extend any group
  counts[fc][fn] -= 1;
  const withTiles = (items, fn2) => {
    // items: [c, n] to consume (tile if available, else a joker)
    const used = [];
    for (const [c, n] of items) {
      if (counts[c][n] > 0) { counts[c][n] -= 1; used.push([c, n]); } else if (jk.n > 0) { jk.n -= 1; used.push(null); } else {
        used.forEach((u) => { if (u) counts[u[0]][u[1]] += 1; else jk.n += 1; });
        return false;
      }
    }
    const ok = fn2();
    used.forEach((u) => { if (u) counts[u[0]][u[1]] += 1; else jk.n += 1; });
    return ok;
  };
  let ok = false;
  const others = [0, 1, 2, 3].filter((c) => c !== fc);
  const combos = [[others[0], others[1]], [others[0], others[2]], [others[1], others[2]], others];
  for (const combo of combos) {
    if (withTiles(combo.map((c) => [c, fn]), () => solveGroups(counts, jk))) { ok = true; break; }
  }
  if (!ok) {
    for (let len = 3; len <= 14 - fn + 1 && !ok; len++) {
      const items = [];
      for (let k = 1; k < len; k++) { const n = fn + k; items.push([fc, n === 14 ? 1 : n]); }
      if (withTiles(items, () => solveGroups(counts, jk))) ok = true;
    }
  }
  if (!ok && fn === 1) {
    // this 1 ends a run: ...12-13-1
    for (let s = 12; s >= 2 && !ok; s--) {
      const items = [];
      for (let n = s; n <= 13; n++) items.push([fc, n]);
      if (withTiles(items, () => solveGroups(counts, jk))) ok = true;
    }
  }
  counts[fc][fn] += 1;
  return ok;
}

export function isPairs(counts, jokers) {
  let pairs = 0;
  let singles = 0;
  for (let c = 0; c < 4; c++) for (let n = 1; n <= 13; n++) { pairs += Math.floor(counts[c][n] / 2); singles += counts[c][n] % 2; }
  if (jokers < singles) return false;
  const left = jokers - singles;
  if (left % 2) return false;
  return pairs + singles + left / 2 === 7;
}

/** Do these 14 tiles finish the hand? */
export function isWinning(tiles, okey) {
  if (tiles.length !== 14) return false;
  const { counts, jokers } = normalize(tiles, okey);
  if (isPairs(counts, jokers)) return 'pairs';
  const c2 = counts.map((r) => r.slice());
  return solveGroups(c2, { n: jokers }) ? 'groups' : false;
}

function dealHand(state, handNo) {
  const deck = shuffle(createRng((state.seed + handNo * 7919) >>> 0), makeTiles());
  let indicator = deck.pop();
  while (isFake(indicator)) { deck.unshift(indicator); indicator = deck.pop(); }
  const okey = { c: indicator.c, n: (indicator.n % 13) + 1 };
  const starter = handNo % 2;
  const hands = [[], []];
  for (let i = 0; i < 14; i++) { hands[0].push(deck.pop()); hands[1].push(deck.pop()); }
  hands[starter].push(deck.pop());
  return { ...state, handNo, deck, indicator, okey, hands, discards: [[], []], turn: starter, phase: 'discard', result: null };
}

export function setup(options = {}) {
  const target = [0, 6, 12].includes(Number(options.target)) ? Number(options.target) : 6;
  return dealHand({ id: String(options.seed ?? ''), seed: Number(options.seed) || 1, target, scores: [0, 0], hands: [[], []] }, 0);
}

const findTile = (hand, id) => hand.findIndex((t) => t.id === Number(id));

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.phase === 'over') fail('Oyun bitti');
  if (move.type === 'next') {
    if (state.phase !== 'handOver') fail('El henüz bitmedi');
    return dealHand(state, state.handNo + 1);
  }
  if (state.phase === 'handOver') fail('Önce sonraki ele geçin');
  if (player !== state.turn) fail('Sıra sende değil');
  const opp = 1 - player;
  const hand = state.hands[player].slice();
  const hands = state.hands.map((h, i) => (i === player ? hand : h));
  const finishHand = (winner, how) => {
    const scores = state.scores.slice();
    let points = 0;
    if (winner != null) { points = how === 'pairs' || how === 'okey' ? 4 : 2; scores[winner] += points; }
    const over = winner != null && (!state.target || scores[winner] >= state.target);
    return { ...state, hands, scores, phase: over ? 'over' : 'handOver', result: { winner, how, points } };
  };
  switch (move.type) {
    case 'draw': {
      if (state.phase !== 'draw') fail('Önce bir taş at');
      if (move.from === 'discard') {
        const stack = state.discards[opp];
        if (!stack.length) fail('Rakibin attığı taş yok');
        const discards = state.discards.map((d, i) => (i === opp ? d.slice(0, -1) : d));
        hand.push(stack[stack.length - 1]);
        return { ...state, hands, discards, phase: 'discard' };
      }
      if (!state.deck.length) return finishHand(null, 'empty');
      const deck = state.deck.slice();
      hand.push(deck.pop());
      return { ...state, hands, deck, phase: 'discard' };
    }
    case 'discard': {
      if (state.phase !== 'discard') fail('Önce taş çek');
      const i = findTile(hand, move.tile);
      if (i < 0) fail('Bu taş sende değil');
      const [tile] = hand.splice(i, 1);
      const discards = state.discards.map((d, k) => (k === player ? d.concat([tile]) : d));
      if (!state.deck.length && !hand.length) return finishHand(null, 'empty');
      return { ...state, hands, discards, turn: opp, phase: 'draw' };
    }
    case 'finish': {
      if (state.phase !== 'discard') fail('Önce taş çek');
      const i = findTile(hand, move.tile);
      if (i < 0) fail('Bu taş sende değil');
      const rest = hand.filter((_, k) => k !== i);
      const how = isWinning(rest, state.okey);
      if (!how) fail('Taşlar bitmiyor: 14 taş per/seri ya da yedi çift olmalı');
      const thrown = hand[i];
      const discards = state.discards.map((d, k) => (k === player ? d.concat([thrown]) : d));
      return { ...finishHand(player, isOkey(thrown, state.okey) ? 'okey' : how), hands: hands.map((h, k) => (k === player ? rest : h)), discards };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase !== 'draw' && state.phase !== 'discard') return null;
  return { player: state.turn, private: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const [a, b] = state.scores;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
const drafts = new Map(); // `${id}:${handNo}:${viewer}` -> { order: [tile ids], sel: id|null }
let draftsFor = null;

export function tileEl(t, okey, opts = {}) {
  const joker = okey && isOkey(t, okey);
  return el(opts.button ? 'button' : 'span', {
    type: opts.button ? 'button' : null,
    class: `ok-tile c${t.c} ${opts.small ? 'small' : ''} ${opts.sel ? 'sel' : ''} ${joker ? 'joker' : ''}`,
    'aria-label': isFake(t) ? 'sahte okey' : `${COLOUR_NAMES[t.c]} ${t.n}${joker ? ' (okey)' : ''}`,
    disabled: opts.button ? opts.disabled : null,
    onClick: opts.onClick,
  }, isFake(t) ? el('span', { class: 'ok-fake' }, '★') : String(t.n), joker ? el('span', { class: 'ok-badge' }, '★') : null);
}

const sortKey = (t, okey, byNumber) => {
  if (isOkey(t, okey)) return 1000;
  if (isFake(t)) return 999;
  return byNumber ? t.n * 10 + t.c : t.c * 20 + t.n;
};

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  const opp = 1 - viewer;
  const okey = state.okey;
  if (draftsFor !== state.id) { drafts.clear(); draftsFor = state.id; }
  const legend = el('div', { class: 'c4-legend' }, el('span', {}, `${players[0]}: ${state.scores[0]}`), el('span', {}, `${players[1]}: ${state.scores[1]}`), el('span', { class: 'muted' }, state.target ? `hedef ${state.target}` : 'tek el'));
  const topDiscard = (p) => state.discards[p][state.discards[p].length - 1] || null;
  const tableView = el('div', { class: 'ok-table card' },
    el('div', { class: 'ok-slot' }, el('span', { class: 'muted' }, 'Gösterge'), tileEl(state.indicator, okey, { small: true }), el('span', { class: 'ok-note' }, `okey: ${COLOUR_NAMES[okey.c]} ${okey.n}`)),
    el('div', { class: 'ok-slot' }, el('span', { class: 'muted' }, 'Orta'), el('span', { class: 'ok-tile back small' }, String(state.deck.length))),
    el('div', { class: 'ok-slot' }, el('span', { class: 'muted' }, `${players[opp]} attı`), topDiscard(opp) ? tileEl(topDiscard(opp), okey, { small: true }) : el('span', { class: 'ok-tile empty small' }, '–')),
    el('div', { class: 'ok-slot' }, el('span', { class: 'muted' }, 'Sen attın'), topDiscard(viewer) ? tileEl(topDiscard(viewer), okey, { small: true }) : el('span', { class: 'ok-tile empty small' }, '–')),
  );

  if (state.phase === 'handOver' || state.phase === 'over') {
    const R = state.result;
    const how = { groups: 'eli bitirdi', pairs: 'çifte bitirdi (×2)', okey: 'okey atarak bitirdi (×2)' }[R.how];
    const line = R.winner == null ? 'Orta bitti: el berabere.' : `${players[R.winner]} ${how}: +${R.points} puan.`;
    const [a, b] = state.scores;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, state.phase === 'over' ? (a === b ? `Berabere: ${a}–${b}` : `${players[a > b ? 0 : 1]} kazandı: ${Math.max(a, b)}–${Math.min(a, b)}`) : line)),
      state.phase === 'over' ? el('p', { class: 'hint' }, line) : null,
      legend,
      ...[0, 1].map((p) => el('div', {}, el('div', { class: 'col-title' }, `${players[p]} (${state.hands[p].length} taş)`), el('div', { class: 'ok-rack small' }, state.hands[p].slice().sort((x, y) => sortKey(x, okey, false) - sortKey(y, okey, false)).map((t) => tileEl(t, okey, { small: true }))))),
      state.phase === 'handOver' ? el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'next' }) }, 'Sonraki el') : null,
    );
    return null;
  }

  const mine = viewer === state.turn;
  const hand = state.hands[viewer];
  const key = `${state.id}:${state.handNo}:${viewer}`;
  const draft = drafts.get(key) || { order: [], sel: null };
  drafts.set(key, draft);
  const ids = new Set(hand.map((t) => t.id));
  draft.order = draft.order.filter((id) => ids.has(id)).concat(hand.filter((t) => !draft.order.includes(t.id)).map((t) => t.id));
  if (draft.sel != null && !ids.has(draft.sel)) draft.sel = null;
  const byId = new Map(hand.map((t) => [t.id, t]));
  const rackBox = el('div', { class: 'ok-rack' });
  const actionBox = el('div', { class: 'ok-actions' });
  const hintBox = el('p', { class: 'hint' });
  const canFinish = () => draft.sel != null && state.phase === 'discard' && mine && isWinning(hand.filter((t) => t.id !== draft.sel), okey);
  const redraw = () => {
    rackBox.replaceChildren(...draft.order.map((id) => tileEl(byId.get(id), okey, {
      button: true, sel: draft.sel === id,
      onClick: () => {
        if (draft.sel == null) draft.sel = id;
        else if (draft.sel === id) draft.sel = null;
        else { // swap the two tiles' places on the rack
          const a = draft.order.indexOf(draft.sel);
          const b = draft.order.indexOf(id);
          [draft.order[a], draft.order[b]] = [draft.order[b], draft.order[a]];
          draft.sel = null;
        }
        redraw();
      },
    })));
    const sortBtns = el('div', { class: 'row', style: { justifyContent: 'center', gap: '6px' } },
      el('button', { type: 'button', class: 'btn btn-small', onClick: () => { draft.order.sort((x, y) => sortKey(byId.get(x), okey, false) - sortKey(byId.get(y), okey, false)); draft.sel = null; redraw(); } }, 'Renge göre diz'),
      el('button', { type: 'button', class: 'btn btn-small', onClick: () => { draft.order.sort((x, y) => sortKey(byId.get(x), okey, true) - sortKey(byId.get(y), okey, true)); draft.sel = null; redraw(); } }, 'Sayıya göre diz'),
    );
    if (!mine) {
      actionBox.replaceChildren(sortBtns);
      hintBox.textContent = `${players[opp]} oynuyor…`;
      return;
    }
    if (state.phase === 'draw') {
      const od = topDiscard(opp);
      actionBox.replaceChildren(
        el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px' } },
          el('button', { type: 'button', class: 'btn btn-primary', onClick: () => sendMove({ type: 'draw', from: 'pile' }) }, `Ortadan çek (${state.deck.length})`),
          od ? el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => sendMove({ type: 'draw', from: 'discard' }) }, 'Rakibin attığını al') : null,
        ), sortBtns);
      hintBox.textContent = state.deck.length ? 'Ortadan çek ya da rakibin attığı taşı al.' : 'Orta bitti: bir çekişle el berabere biter.';
      return;
    }
    const fin = canFinish();
    actionBox.replaceChildren(
      el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px' } },
        el('button', { type: 'button', class: 'btn btn-secondary', disabled: draft.sel == null, onClick: () => sendMove({ type: 'discard', tile: draft.sel }) }, 'Seçili taşı at'),
        el('button', { type: 'button', class: `btn ${fin ? 'btn-primary' : 'btn-secondary'}`, disabled: !fin, onClick: () => sendMove({ type: 'finish', tile: draft.sel }) }, fin ? `Bitir! (${fin === 'pairs' ? 'çifte' : 'per/seri'})` : 'Bitir'),
      ), sortBtns);
    hintBox.textContent = draft.sel == null ? 'Atacağın taşa dokun (iki taşa dokununca yer değiştirir).' : fin ? 'Kalan 14 taş bitiyor: Bitir!' : 'Seçili taşı at ya da başka bir taşa dokunarak yer değiştir.';
  };
  redraw();
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, mine ? `${players[viewer]}, sıra sende: ${state.phase === 'draw' ? 'taş çek' : 'taş at'}` : `${players[opp]} oynuyor…`)),
    tableView,
    el('div', { class: 'col-title' }, `Taşların (${hand.length}) · ${players[opp]}: ${state.hands[opp].length} taş`),
    rackBox,
    hintBox,
    actionBox,
    legend,
  );
  return null;
}

export default { id: 'okey', meta, setup, applyMove, render, getTurn, getResult };
