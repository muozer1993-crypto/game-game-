// Mangala — the Turkish mancala variant. 6 pits per player with 4 stones each, one store each.
import { el, render as draw } from '../js/ui/dom.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'masa',
  name: 'Mangala',
  icon: '🪨',
  description: 'Türk mangalası: taşları dağıt, çift sayıda yakala, hazneyi doldur.',
  rules: [
    'Her oyuncunun 6 kuyusu ve bir haznesi vardır; her kuyuda 4 taş. Ekranda 1. oyuncu alt sırayı oynar ve haznesi sağdadır; 2. oyuncu üst sırayı oynar ve haznesi soldadır. Taşlar alt sırada sağa, üst sırada sola doğru akar (saat yönünün tersine).',
    'Sırası gelen kendi kuyularından birini seçer; resmî kurala göre ilk taşı aldığı kuyuya geri bırakır, kalanını saat yönünün tersine birer birer dağıtır (kendi haznesine de bırakır, rakibin haznesini atlar). Kuyuda tek taş varsa o taş bir sonraki kuyuya gider. Ayarlardan "Sonraki kuyudan başla" seçilirse ilk taş aldığın kuyuya bırakılmaz, dağıtım bir sonraki kuyudan başlar (klasik ev kuralı); 13 ya da daha çok taşla tur dönerse o kuyuya da taş düşer.',
    'Son taş kendi haznene düşerse bir daha oynarsın. Son taş rakibin kuyusuna düşer ve oradaki taş sayısını çift yaparsa o kuyudaki taşların hepsini alırsın. Son taş kendi boş kuyuna düşerse ve karşısındaki rakip kuyusu doluysa oradakileri ve kendi taşını alırsın.',
    'Bir oyuncunun kuyuları boşalınca oyun biter. Resmî kurala göre kuyuları ilk boşalan oyuncu, rakibin kuyularında kalan bütün taşları kendi haznesine alır (ayarlardan "herkes kendi tarafındakini alır" seçilebilir). Haznesinde çok taşı olan kazanır; eşitlikte berabere.',
    'Varsayılanlar Türkiye Akıl ve Zekâ Oyunları Federasyonu (TAZOF) ve MEB zekâ oyunları kurallarıdır.',
  ].join('\n'),
  data: [],
  settings: [
    { key: 'firstStone', label: 'İlk taş', type: 'select', default: 'back', options: [{ value: 'back', label: 'Aldığın kuyuya geri bırakılır (resmî)' }, { value: 'next', label: 'Sonraki kuyudan başlanır (klasik ev kuralı)' }] },
    { key: 'leftovers', label: 'Oyun sonunda kalan taşlar', type: 'select', default: 'emptier', options: [{ value: 'emptier', label: 'Kuyuları ilk boşalan alır (resmî)' }, { value: 'owner', label: 'Herkes kendi tarafındakini alır (ev kuralı)' }] },
  ],
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
  return {
    pits,
    turn: (Number(options.seed) || 0) % 2,
    over: false,
    last: null,
    // house rules travel in the state so that both phones play the same variant;
    // anything but the explicit variant value means the official (TAZOF) rule
    firstStone: options.firstStone === 'next' ? 'next' : 'back',
    leftovers: options.leftovers === 'owner' ? 'owner' : 'emptier',
    collected: null, // { taker, from, count } when the game ended with stones left on the board
  };
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
  if (!Number.isInteger(from)) fail('Geçersiz hamle');
  if (!ownsPit(player, from)) fail('Bu kuyu senin değil');
  if (state.pits[from] === 0) fail('Bu kuyu boş');
  const pits = state.pits.slice();
  let stones = pits[from];
  let i = from;
  const myStore = storeOf(player);
  const oppStore = storeOf(1 - player);
  let captured = 0;
  if (stones === 1 || state.firstStone === 'next') {
    pits[from] = 0; // a single stone always moves on; in the 'next' variant nothing stays behind
  } else {
    pits[from] = 1; // official rule: the first stone goes back into the pit it was lifted from
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
  // end: a player's side is empty. Official rule (TAZOF 4. temel kural): that player takes every
  // stone left on the opponent's side; in the 'owner' variant each side's stones go to their owner.
  const side = (p) => (p === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);
  for (const p of [0, 1]) {
    if (side(p).every((k) => pits[k] === 0)) {
      const other = 1 - p;
      const taker = state.leftovers === 'owner' ? other : p;
      let count = 0;
      for (const k of side(other)) { count += pits[k]; pits[storeOf(taker)] += pits[k]; pits[k] = 0; }
      next = { ...next, pits, over: true, collected: count ? { taker, from: other, count } : null };
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
  const C = state.collected;
  const endNote = state.over && C
    ? (C.taker === C.from ? `Kuyularda kalan ${C.count} taş sahibine (${players[C.taker]}) gitti.` : `Kuyuları ilk boşalan ${players[C.taker]}, ${nameSuffix(players[C.from], 'in')} kuyularında kalan ${C.count} taşı aldı.`)
    : '';
  const variant = [state.firstStone === 'next' ? 'sonraki kuyudan başla' : null, state.leftovers === 'owner' ? 'kalan taşlar sahibine' : null].filter(Boolean);
  const note = state.last
    ? el('p', { class: 'hint' }, `${state.last.captured ? `${state.last.captured} taş alındı. ` : ''}${state.last.again && !state.over ? 'Son taş hazneye düştü: bir hamle daha. ' : ''}${endNote}`)
    : el('p', { class: 'hint' }, `${players[0]} alt sıradaki kuyuları oynar, ${players[1]} üst sıradakileri.`);
  // the house rules stay visible all game (the guest never saw the host's settings form)
  const variantLine = variant.length ? el('p', { class: 'hint mg-variant' }, `Ev kuralı: ${variant.join(', ')}.`) : null;
  draw(container, el('div', { class: 'status-line' }, el('strong', {}, status)), board, note, variantLine);
  return null;
}

export default { id: 'mangala', meta, setup, applyMove, render, getTurn, getResult };
