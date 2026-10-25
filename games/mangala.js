// Mangala — the Turkish mancala variant. 6 pits per player with 4 stones each, one store each.
import { el, render as draw } from '../js/ui/dom.js';

export const meta = {
  group: 'masa',
  name: 'Mangala',
  icon: '🪨',
  description: 'Türk mangalası: taşları dağıt, çift sayıda yakala, hazneyi doldur.',
  rules: [
    'Her oyuncunun 6 kuyusu ve bir haznesi vardır; her kuyuda 4 taş. Hazneler sağ tarafta: senin haznen kendi kuyularının sağında.',
    'Sırası gelen kendi kuyularından birini seçer; bir taşı o kuyuda bırakır, kalanını saat yönünün tersine birer birer dağıtır (kendi haznesine de bırakır, rakibin haznesini atlar). Kuyuda tek taş varsa o taş bir sonraki kuyuya gider.',
    'Son taş kendi haznene düşerse bir daha oynarsın. Son taş rakibin kuyusuna düşer ve oradaki taş sayısını çift yaparsa o kuyudaki taşların hepsini alırsın. Son taş kendi boş kuyuna düşerse ve karşısındaki rakip kuyusu doluysa oradakileri ve kendi taşını alırsın.',
    'Bir oyuncunun kuyuları boşalınca oyun biter; kuyularında taş kalan oyuncu o taşları alır. Haznesinde çok taşı olan kazanır.',
  ].join('\n'),
  data: [],
  settings: [],
};

function fail(msg) {
  throw new Error(msg);
}

// pits index: 0..5 player 0's pits (left to right from player 0's view), 6 = player 0 store,
// 7..12 player 1's pits, 13 = player 1 store. Sowing goes 0→1→…→6→7→…→13→0.
export function setup(options = {}) {
  const pits = new Array(14).fill(4);
  pits[6] = 0;
  pits[13] = 0;
  return { pits, turn: (Number(options.seed) || 0) % 2, over: false, last: null };
}

const storeOf = (p) => (p === 0 ? 6 : 13);
const ownsPit = (p, i) => (p === 0 ? i >= 0 && i <= 5 : i >= 7 && i <= 12);
const opposite = (i) => 12 - i;

export function legalPits(state, p = state.turn) {
  if (state.over) return [];
  const out = [];
  for (let i = 0; i < 14; i++) if (ownsPit(p, i) && state.pits[i] > 0) out.push(i);
  return out;
}

export function applyMove(state, player, move) {
  if (!move || move.type !== 'sow') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  const from = Number(move.pit);
  if (!ownsPit(player, from)) fail('Bu kuyu senin değil');
  if (state.pits[from] === 0) fail('Bu kuyu boş');
  const pits = state.pits.slice();
  let stones = pits[from];
  let i = from;
  const myStore = storeOf(player);
  const oppStore = storeOf(1 - player);
  let captured = 0;
  if (stones === 1) {
    pits[from] = 0;
  } else {
    pits[from] = 1;
    stones -= 1;
  }
  while (stones > 0) {
    i = (i + 1) % 14;
    if (i === oppStore) continue;
    pits[i] += 1;
    stones -= 1;
  }
  let again = false;
  if (i === myStore) {
    again = true;
  } else if (ownsPit(1 - player, i) && pits[i] % 2 === 0) {
    captured = pits[i];
    pits[myStore] += pits[i];
    pits[i] = 0;
  } else if (ownsPit(player, i) && pits[i] === 1 && pits[opposite(i)] > 0) {
    captured = pits[opposite(i)] + 1;
    pits[myStore] += pits[opposite(i)] + 1;
    pits[opposite(i)] = 0;
    pits[i] = 0;
  }
  let next = { ...state, pits, turn: again ? player : 1 - player, last: { from, to: i, captured, again } };
  // end: a player's side is empty -> the other player collects their remaining stones
  const side = (p) => (p === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);
  for (const p of [0, 1]) {
    if (side(p).every((k) => pits[k] === 0)) {
      const other = 1 - p;
      for (const k of side(other)) { pits[storeOf(other)] += pits[k]; pits[k] = 0; }
      next = { ...next, pits, over: true };
      break;
    }
  }
  return next;
}

export function getTurn(state) {
  return state.over ? null : { player: state.turn, private: false };
}

export function getResult(state) {
  if (!state.over) return null;
  const a = state.pits[6];
  const b = state.pits[13];
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const mine = !state.over && viewer === state.turn;
  const legal = new Set(mine ? legalPits(state) : []);
  const pit = (i) => el('button', {
    type: 'button',
    class: `mg-pit ${legal.has(i) ? 'legal' : ''} ${state.last && state.last.to === i ? 'last' : ''} ${state.last && state.last.from === i ? 'from' : ''}`,
    disabled: !legal.has(i),
    'aria-label': `${i < 6 ? players[0] : players[1]} kuyusu ${(i < 6 ? i : i - 7) + 1}: ${state.pits[i]} taş`,
    onClick: () => sendMove({ type: 'sow', pit: i }),
  }, el('span', { class: 'mg-count' }, String(state.pits[i])), el('span', { class: 'mg-stones' }, '●'.repeat(Math.min(state.pits[i], 12))));
  const store = (p) => el('div', { class: `mg-store p${p}`, 'aria-label': `${players[p]} haznesi: ${state.pits[storeOf(p)]} taş` }, el('span', { class: 'mg-count' }, String(state.pits[storeOf(p)])), el('span', { class: 'muted' }, players[p]));
  // top row: player 1's pits right-to-left (12..7) so that sowing runs counter-clockwise on screen
  const board = el('div', { class: 'mg-board' },
    store(1),
    el('div', { class: 'mg-rows' },
      el('div', { class: 'mg-row' }, [12, 11, 10, 9, 8, 7].map(pit)),
      el('div', { class: 'mg-row' }, [0, 1, 2, 3, 4, 5].map(pit)),
    ),
    store(0),
  );
  let status;
  if (state.over) status = state.pits[6] === state.pits[13] ? 'Berabere!' : `${players[state.pits[6] > state.pits[13] ? 0 : 1]} kazandı!`;
  else if (mine) status = `Sıra sende, ${players[viewer]}: bir kuyu seç`;
  else status = `${players[state.turn]} düşünüyor…`;
  const note = state.last
    ? el('p', { class: 'hint' }, `${state.last.captured ? `${state.last.captured} taş alındı. ` : ''}${state.last.again ? 'Son taş hazneye düştü: bir hamle daha.' : ''}`)
    : el('p', { class: 'hint' }, `${players[0]} alt sıradaki kuyuları oynar, ${players[1]} üst sıradakileri.`);
  draw(container, el('div', { class: 'status-line' }, el('strong', {}, status)), board, note);
  return null;
}

export default { id: 'mangala', meta, setup, applyMove, render, getTurn, getResult };
