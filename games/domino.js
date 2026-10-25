// Domino — the classic draw game for two: seven tiles each, match an end of the line, draw from
// the boneyard when you cannot play, pass when it is empty. Going out scores the opponent's
// pips; a blocked hand goes to the lighter hand. Rounds up to a target.
import { el, render as draw } from '../js/ui/dom.js';
import { createRng, shuffle } from '../js/lib/rng.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'masa',
  name: 'Domino',
  icon: '🁣',
  description: 'Yedişer taş, uçlardan birine uyanı ekle; oynayamazsan çek. Elini bitiren rakibin puanını alır.',
  rules: [
    'Yedişer taş alınır, kalanlar kapalı durur. Başlayan istediği taşı koyar; sonra sıra ile dizinin iki ucundan birine, o uçtaki sayıya uyan bir taş eklenir. İki uca da uyuyorsa yönü seçersin.',
    'Uyan taşın yoksa kapalı taşlardan çekersin (uyan gelene kadar); çekilecek taş kalmadıysa pas geçersin.',
    'Taşlarını ilk bitiren, rakibinin elinde kalan noktaların toplamını alır. İkiniz de oynayamıyorsanız el kilitlenir: noktası az olan, farkı alır. Hedef puana ulaşan kazanır.',
  ].join('\n'),
  data: [],
  handoffNote: 'Taşlarını rakibin görmemeli.',
  settings: [
    { key: 'target', label: 'Hedef puan', type: 'select', default: 50, options: [{ value: 0, label: 'Tek el' }, { value: 50, label: '50' }, { value: 100, label: '100' }] },
  ],
};

function fail(msg) {
  throw new Error(msg);
}

export function makeSet() {
  const tiles = [];
  let id = 0;
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) tiles.push({ id: id++, a, b });
  return tiles;
}

export const pips = (hand) => hand.reduce((s, t) => s + t.a + t.b, 0);

function dealHand(state, handNo) {
  const deck = shuffle(createRng((state.seed + handNo * 7919) >>> 0), makeSet());
  const hands = [deck.splice(0, 7), deck.splice(0, 7)];
  return { ...state, handNo, boneyard: deck, hands, line: [], passes: 0, turn: handNo % 2, phase: 'play', result: null };
}

export function setup(options = {}) {
  const target = [0, 50, 100].includes(Number(options.target)) ? Number(options.target) : 50;
  return dealHand({ id: String(options.seed ?? ''), seed: Number(options.seed) || 1, target, scores: [0, 0] }, 0);
}

/** The two open ends of the line (null when the line is empty). */
export function ends(line) {
  if (!line.length) return null;
  return [line[0].a, line[line.length - 1].b]; // tiles in the line are oriented: [a|b] left to right
}

/** Which sides a tile can go to: 'L', 'R' or both. */
export function sidesFor(tile, line) {
  const e = ends(line);
  if (!e) return ['L', 'R'];
  const out = [];
  if (tile.a === e[0] || tile.b === e[0]) out.push('L');
  if (tile.a === e[1] || tile.b === e[1]) out.push('R');
  return out;
}

export const canPlay = (tile, line) => sidesFor(tile, line).length > 0;
export const hasPlay = (hand, line) => hand.some((t) => canPlay(t, line));

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.phase === 'over') fail('Oyun bitti');
  if (move.type === 'next') {
    if (state.phase !== 'handOver') fail('El henüz bitmedi');
    return dealHand(state, state.handNo + 1);
  }
  if (state.phase !== 'play') fail('Önce sonraki ele geçin');
  if (player !== state.turn) fail('Sıra sende değil');
  const opp = 1 - player;
  const hand = state.hands[player].slice();
  const hands = state.hands.map((h, i) => (i === player ? hand : h));
  const finishHand = (winner, points, how) => {
    const scores = state.scores.slice();
    if (winner != null) scores[winner] += points;
    const over = winner != null && (!state.target || scores[winner] >= state.target);
    return { ...state, hands, scores, phase: over ? 'over' : 'handOver', result: { winner, points, how } };
  };
  switch (move.type) {
    case 'play': {
      const i = hand.findIndex((t) => t.id === Number(move.tile));
      if (i < 0) fail('Bu taş sende değil');
      const tile = hand[i];
      const sides = sidesFor(tile, state.line);
      if (!sides.length) fail('Bu taş uçlardan hiçbirine uymuyor');
      const e0 = ends(state.line);
      // the side only matters when the two ends differ (an empty line or equal ends: either will do)
      const side = sides.length === 1 ? sides[0] : (move.side || (!e0 || e0[0] === e0[1] ? 'R' : null));
      if (side !== 'L' && side !== 'R') fail('Yön seç: sol ya da sağ');
      if (!sides.includes(side)) fail('Bu uca uymuyor');
      hand.splice(i, 1);
      const e = ends(state.line);
      let line;
      if (!e) line = [{ ...tile }];
      else if (side === 'L') line = [tile.b === e[0] ? { ...tile } : { id: tile.id, a: tile.b, b: tile.a }].concat(state.line);
      else line = state.line.concat([tile.a === e[1] ? { ...tile } : { id: tile.id, a: tile.b, b: tile.a }]);
      if (!hand.length) return { ...finishHand(player, pips(state.hands[opp]), 'out'), line };
      return { ...state, hands, line, passes: 0, turn: opp };
    }
    case 'draw': {
      if (hasPlay(hand, state.line)) fail('Oynayabileceğin taş var');
      if (!state.boneyard.length) fail('Çekilecek taş kalmadı: pas geç');
      const boneyard = state.boneyard.slice();
      hand.push(boneyard.pop());
      return { ...state, hands, boneyard };
    }
    case 'pass': {
      if (hasPlay(hand, state.line)) fail('Oynayabileceğin taş var');
      if (state.boneyard.length) fail('Önce taş çek');
      const passes = state.passes + 1;
      if (passes >= 2) {
        // blocked: the lighter hand takes the difference
        const [p0, p1] = [pips(state.hands[0]), pips(state.hands[1])];
        if (p0 === p1) return finishHand(null, 0, 'blocked');
        return finishHand(p0 < p1 ? 0 : 1, Math.abs(p0 - p1), 'blocked');
      }
      return { ...state, passes, turn: opp };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase !== 'play') return null;
  return { player: state.turn, private: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const [a, b] = state.scores;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
const PIPS = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const drafts = new Map(); // `${id}:${handNo}:${viewer}` -> { sel }
let draftsFor = null;

export function tileEl(t, opts = {}) {
  const face = (n) => el('span', { class: `dm-half ${n === 0 ? 'blank' : ''}` }, n === 0 ? '' : PIPS[n]);
  return el(opts.button ? 'button' : 'span', {
    type: opts.button ? 'button' : null,
    class: `dm-tile ${opts.sel ? 'sel' : ''} ${opts.small ? 'small' : ''} ${opts.end ? 'end' : ''}`,
    'aria-label': `${t.a}-${t.b}`,
    disabled: opts.button ? opts.disabled : null,
    onClick: opts.onClick,
  }, face(t.a), face(t.b));
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const opp = 1 - viewer;
  if (draftsFor !== state.id) { drafts.clear(); draftsFor = state.id; }
  const legend = el('div', { class: 'c4-legend' }, el('span', {}, `${players[0]}: ${state.scores[0]}`), el('span', {}, `${players[1]}: ${state.scores[1]}`), el('span', { class: 'muted' }, state.target ? `hedef ${state.target}` : 'tek el'));
  const lineView = el('div', { class: 'dm-line card' }, state.line.length
    ? state.line.map((t, i) => tileEl(t, { small: true, end: i === 0 || i === state.line.length - 1 }))
    : el('span', { class: 'muted' }, 'Dizi boş: ilk taşı koy.'));
  const e = ends(state.line);

  if (state.phase === 'handOver' || state.phase === 'over') {
    const R = state.result;
    const line = R.winner == null ? 'El kilitlendi, noktalar eşit: puan yok.' : R.how === 'out' ? `${players[R.winner]} taşlarını bitirdi: +${R.points} (${nameSuffix(players[1 - R.winner], 'in')} elindeki noktalar).` : `El kilitlendi: ${players[R.winner]} daha hafif, +${R.points}.`;
    const [a, b] = state.scores;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, state.phase === 'over' ? (a === b ? `Berabere: ${a}–${b}` : `${players[a > b ? 0 : 1]} kazandı: ${Math.max(a, b)}–${Math.min(a, b)}`) : line)),
      state.phase === 'over' ? el('p', { class: 'hint' }, line) : null,
      legend, lineView,
      ...[0, 1].map((p) => el('div', {}, el('div', { class: 'col-title' }, `${players[p]} — ${pips(state.hands[p])} nokta`), el('div', { class: 'dm-hand' }, state.hands[p].map((t) => tileEl(t, { small: true }))))),
      state.phase === 'handOver' ? el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'next' }) }, 'Sonraki el') : null,
    );
    return null;
  }

  const mine = viewer === state.turn;
  const hand = state.hands[viewer];
  const key = `${state.id}:${state.handNo}:${viewer}`;
  const draft = drafts.get(key) || { sel: null };
  drafts.set(key, draft);
  if (draft.sel != null && !hand.some((t) => t.id === draft.sel)) draft.sel = null;
  const info = el('p', { class: 'hint' }, `${players[opp]}: ${state.hands[opp].length} taş · kapalı: ${state.boneyard.length}${e ? ` · uçlar: ${e[0]} ve ${e[1]}` : ''}`);
  if (!mine) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[opp]} oynuyor…`)),
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      lineView, info,
      el('div', { class: 'col-title' }, 'Taşların'), el('div', { class: 'dm-hand' }, hand.map((t) => tileEl(t, { small: true }))),
      legend,
    );
    return null;
  }
  const playable = hasPlay(hand, state.line);
  const rerender = () => render(state, viewer, container, sendMove, ctx);
  const handView = el('div', { class: 'dm-hand' }, hand.map((t) => tileEl(t, {
    button: true, sel: draft.sel === t.id, disabled: !canPlay(t, state.line),
    onClick: () => {
      const sides = sidesFor(t, state.line);
      if (sides.length === 1 || !e || e[0] === e[1]) { sendMove({ type: 'play', tile: t.id, side: sides[0] }); return; }
      draft.sel = draft.sel === t.id ? null : t.id;
      rerender();
    },
  })));
  const selTile = hand.find((t) => t.id === draft.sel);
  const sideBtns = selTile ? el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px' } },
    el('span', { class: 'muted' }, `${selTile.a}-${selTile.b}: `),
    el('button', { type: 'button', class: 'btn btn-primary', onClick: () => sendMove({ type: 'play', tile: selTile.id, side: 'L' }) }, e ? `◀ Sola (${e[0]})` : '◀ Sola'),
    el('button', { type: 'button', class: 'btn btn-primary', onClick: () => sendMove({ type: 'play', tile: selTile.id, side: 'R' }) }, e ? `Sağa (${e[1]}) ▶` : 'Sağa ▶'),
  ) : null;
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}, sıra sende`)),
    lineView, info,
    el('div', { class: 'col-title' }, `Taşların (${hand.length})`),
    handView,
    sideBtns,
    el('p', { class: 'hint' }, playable ? (selTile ? 'Yönü seç.' : (e ? 'Uyan bir taşa dokun (koyu olanlar).' : 'İlk taşı sen koy: herhangi birine dokun.')) : (state.boneyard.length ? 'Uyan taşın yok: kapalıdan çek.' : 'Uyan taşın yok ve kapalı bitti: pas geç.')),
    !playable ? el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', onClick: () => sendMove({ type: state.boneyard.length ? 'draw' : 'pass' }) }, state.boneyard.length ? `Kapalıdan çek (${state.boneyard.length})` : 'Pas') : null,
    legend,
  );
  return null;
}

export default { id: 'domino', meta, setup, applyMove, render, getTurn, getResult };
