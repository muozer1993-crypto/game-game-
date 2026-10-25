// Yalancı Zar — liar's dice for two. Both roll their dice in secret; players take turns
// raising the bid ("there are at least 3 fives on the table, ones count as any face") until
// one calls the other a liar. All dice are revealed: if the bid holds, the challenger loses a
// die, otherwise the bidder does. Whoever runs out of dice loses.
import { el, render as draw } from '../js/ui/dom.js';
import { diceOnce } from '../js/lib/sfx.js';
import { createRng } from '../js/lib/rng.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'kart',
  name: 'Yalancı Zar',
  icon: '🎲',
  description: 'Zarların gizli; masadaki zarlar üstüne blöf yap, rakibin blöfünü yakala.',
  rules: [
    'İkiniz de zarlarınızı gizlice atarsınız (varsayılan 5 zar). Sırası gelen, masadaki bütün zarlar hakkında bir teklif verir: "en az 3 tane 5 var" gibi. Birler jokerdir: teklif edilen yüz yerine sayılır (ayarlardan kapatılabilir).',
    'Rakip ya teklifi yükseltir (daha çok zar, ya da aynı sayıda daha yüksek yüz) ya da "Yalan!" der. O zaman zarlar açılır: teklif tutuyorsa "Yalan!" diyen, tutmuyorsa teklifi veren bir zar kaybeder.',
    'Zarı kaybeden yeni eli başlatır. Zarı kalmayan oyunu kaybeder. Tek telefonda sıra her teklifte el değiştirir; iki telefonda herkes kendi zarını görür.',
  ].join('\n'),
  data: [],
  handoffNote: 'Zarlarını rakibin görmemeli.',
  settings: [
    { key: 'dice', label: 'Kişi başı zar', type: 'select', default: 5, options: [{ value: 3, label: '3' }, { value: 4, label: '4' }, { value: 5, label: '5' }] },
    { key: 'wild', label: 'Birler joker', type: 'toggle', default: true },
  ],
};

export const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function fail(msg) {
  throw new Error(msg);
}

/** Dice for `round`: deterministic from the seed so that both devices see the same rolls. */
export function rollDice(seed, round, counts) {
  return counts.map((n, p) => {
    const rng = createRng(((Number(seed) || 1) + round * 7919 + p * 104729) >>> 0);
    return Array.from({ length: n }, () => 1 + Math.floor(rng() * 6)).sort((a, b) => a - b);
  });
}

export function setup(options = {}) {
  const n = [3, 4, 5].includes(Number(options.dice)) ? Number(options.dice) : 5;
  const wild = options.wild !== false && options.wild !== 'false';
  const seed = Number(options.seed) || 1;
  const counts = [n, n];
  return {
    id: String(options.seed ?? ''),
    seed,
    wild,
    counts,            // dice left per player
    dice: rollDice(seed, 0, counts),
    round: 0,
    turn: 0,           // who bids next
    bid: null,         // { q, f, by }
    phase: 'bid',      // bid | reveal | over
    last: null,        // { bid, count, loser, dice } after a challenge
    history: [],       // losers per round
  };
}

/** How many dice on the table show `face` (ones too when wild). */
export function countFace(dice, face, wild) {
  return dice.flat().filter((d) => d === face || (wild && d === 1)).length;
}

export const totalDice = (state) => state.counts[0] + state.counts[1];

/** Is {q, f} a legal raise over the current bid? */
export function isRaise(bid, q, f, total) {
  if (!Number.isInteger(q) || !Number.isInteger(f) || q < 1 || q > total || f < 2 || f > 6) return false;
  if (!bid) return true;
  return q > bid.q || (q === bid.q && f > bid.f);
}

/** The smallest legal raise, or null when the bid is already at the top. */
export function minRaise(bid, total) {
  if (!bid) return { q: 1, f: 2 };
  if (bid.f < 6) return { q: bid.q, f: bid.f + 1 };
  return bid.q < total ? { q: bid.q + 1, f: 2 } : null;
}

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.phase === 'over') fail('Oyun bitti');
  switch (move.type) {
    case 'bid': {
      if (state.phase !== 'bid') fail('Önce zarlar açılsın');
      if (player !== state.turn) fail('Sıra sende değil');
      const q = Number(move.q);
      const f = Number(move.f);
      if (!isRaise(state.bid, q, f, totalDice(state))) fail('Teklif öncekinden yüksek olmalı');
      return { ...state, bid: { q, f, by: player }, turn: 1 - player };
    }
    case 'challenge': {
      if (state.phase !== 'bid') fail('Önce zarlar açılsın');
      if (player !== state.turn) fail('Sıra sende değil');
      if (!state.bid) fail('Henüz teklif yok');
      const count = countFace(state.dice, state.bid.f, state.wild);
      const holds = count >= state.bid.q;
      const loser = holds ? player : state.bid.by;
      const counts = state.counts.slice();
      counts[loser] -= 1;
      return { ...state, counts, phase: 'reveal', last: { bid: state.bid, count, holds, loser, dice: state.dice }, history: state.history.concat([loser]) };
    }
    case 'next': {
      if (state.phase !== 'reveal') fail('Bu el henüz bitmedi');
      const loser = state.last.loser;
      if (state.counts[loser] === 0) return { ...state, phase: 'over' };
      const round = state.round + 1;
      return { ...state, round, dice: rollDice(state.seed, round, state.counts), bid: null, turn: loser, phase: 'bid' };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase !== 'bid') return null; // the reveal is looked at together
  return { player: state.turn, private: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  return { winner: state.counts[0] === 0 ? 1 : 0 };
}

// ----------------------------------------------------------------- render
const drafts = new Map(); // `${id}:${round}:${player}` -> { q, f } being composed
let draftsFor = null;

function diceRow(dice, { hit = null, wild = false, hidden = false } = {}) {
  return el('div', { class: 'yz-dice' }, dice.map((d) => el('span', {
    class: `yz-die ${hidden ? 'hidden' : ''} ${hit != null && (d === hit || (wild && d === 1)) ? 'hit' : ''}`,
    'aria-label': hidden ? 'gizli zar' : String(d),
  }, hidden ? '🎲' : FACES[d])));
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  diceOnce(`yz:${state.id}:${state.round}`); // every round starts with fresh dice
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  const opp = 1 - viewer;
  if (draftsFor !== state.id) { drafts.clear(); draftsFor = state.id; }
  const bidText = (b) => `${b.q} × ${FACES[b.f]}`;
  const legend = el('div', { class: 'c4-legend' }, el('span', {}, `${players[0]}: ${state.counts[0]} zar`), el('span', {}, `${players[1]}: ${state.counts[1]} zar`), el('span', { class: 'muted' }, `${state.round + 1}. el`));

  if (state.phase === 'over') {
    const w = getResult(state).winner;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[w]} kazandı! ${nameSuffix(players[1 - w], 'in')} zarı kalmadı.`)),
      legend,
      el('p', { class: 'hint' }, `${state.history.length} el oynandı.`),
    );
    return null;
  }

  if (state.phase === 'reveal') {
    const L = state.last;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[L.bid.by]} dedi: en az ${bidText(L.bid)}. Masada ${L.count} tane var → teklif ${L.holds ? 'tutuyor' : 'tutmuyor'}. ${players[L.loser]} bir zar kaybetti.`)),
      legend,
      el('div', { class: 'col-title' }, players[0]), diceRow(L.dice[0], { hit: L.bid.f, wild: state.wild }),
      el('div', { class: 'col-title' }, players[1]), diceRow(L.dice[1], { hit: L.bid.f, wild: state.wild }),
      state.wild ? el('p', { class: 'hint' }, 'Birler joker sayıldı.') : null,
      el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'next' }) },
        state.counts[L.loser] === 0 ? 'Sonucu gör' : 'Sonraki el'),
    );
    return null;
  }

  // ---- bidding
  const mine = state.dice[viewer];
  const total = totalDice(state);
  const current = state.bid ? el('div', { class: 'yz-bid card' }, el('span', { class: 'muted' }, `${players[state.bid.by]} dedi: `), el('strong', {}, `en az ${bidText(state.bid)}`)) : el('p', { class: 'hint' }, 'İlk teklif henüz verilmedi.');
  const myDice = [el('div', { class: 'col-title' }, `Zarların (${mine.length})`), diceRow(mine), el('div', { class: 'col-title' }, `${players[opp]} — ${state.counts[opp]} zar`), diceRow(Array(state.counts[opp]).fill(0), { hidden: true })];
  if (state.turn !== viewer) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[opp]} düşünüyor…`)),
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      current, ...myDice, legend,
    );
    return null;
  }
  const key = `${state.id}:${state.round}:${viewer}:${state.bid ? `${state.bid.q}${state.bid.f}` : ''}`;
  const min = minRaise(state.bid, total);
  const draft = drafts.get(key) || { ...(min || { q: total, f: 6 }) };
  drafts.set(key, draft);
  const qLabel = el('strong', { class: 'yz-q' });
  const bidBtn = el('button', { type: 'button', class: 'btn btn-primary btn-big', onClick: () => { if (isRaise(state.bid, draft.q, draft.f, total)) sendMove({ type: 'bid', q: draft.q, f: draft.f }); } });
  const faceBtns = [2, 3, 4, 5, 6].map((f) => el('button', { type: 'button', class: 'btn btn-secondary yz-face', 'aria-label': `yüz ${f}`, onClick: () => { draft.f = f; update(); } }, FACES[f]));
  const update = () => {
    qLabel.textContent = String(draft.q);
    faceBtns.forEach((b, i) => b.classList.toggle('selected', i + 2 === draft.f));
    const ok = isRaise(state.bid, draft.q, draft.f, total);
    bidBtn.disabled = !ok;
    bidBtn.textContent = min ? `Teklif: en az ${draft.q} × ${FACES[draft.f]}` : 'Teklif yükseltilemez';
  };
  update();
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}, sıra sende`)),
    current,
    ...myDice,
    el('p', { class: 'hint' }, min ? `Masada toplam ${total} zar var.${state.wild ? ' Birler joker.' : ''}${state.bid ? ' Teklifi yükselt ya da "Yalan!" de.' : ''}` : 'Teklif en üst düzeyde: tek seçenek "Yalan!" demek.'),
    el('div', { class: 'yz-controls' },
      el('div', { class: 'yz-qty' },
        el('button', { type: 'button', class: 'btn btn-secondary', 'aria-label': 'azalt', onClick: () => { if (draft.q > 1) { draft.q -= 1; update(); } } }, '−'),
        qLabel,
        el('button', { type: 'button', class: 'btn btn-secondary', 'aria-label': 'artır', onClick: () => { if (draft.q < total) { draft.q += 1; update(); } } }, '+'),
      ),
      el('div', { class: 'yz-faces' }, faceBtns),
    ),
    el('div', { class: 'yz-actions' },
      bidBtn,
      state.bid ? el('button', { type: 'button', class: 'btn btn-danger btn-big', onClick: () => sendMove({ type: 'challenge' }) }, 'Yalan!') : null,
    ),
    legend,
  );
  return null;
}

export default { id: 'yalanci-zar', meta, setup, applyMove, render, getTurn, getResult };
