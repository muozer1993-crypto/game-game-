// Hafıza — memory pairs. Flip two cards; a match scores and keeps the turn.
import { el, render as draw } from '../js/ui/dom.js';
import { createRng, shuffle } from '../js/lib/rng.js';

export const meta = {
  name: 'Hafıza',
  icon: '🃏',
  description: 'Kapalı kartlardan ikisini aç; eşleşirse puan senin ve bir daha oynarsın.',
  rules: [
    'Kartlar kapalıdır. Sırası gelen iki kart açar: aynıysa çifti alır ve yeniden oynar; değilse kartlar kapanır ve sıra geçer.',
    'Bütün çiftler bulununca çok çifti olan kazanır.',
  ].join('\n'),
  data: [],
  settings: [
    { key: 'size', label: 'Kart sayısı', type: 'select', default: 16, options: [{ value: 12, label: '12 kart (6 çift)' }, { value: 16, label: '16 kart (8 çift)' }, { value: 24, label: '24 kart (12 çift)' }, { value: 36, label: '36 kart (18 çift)' }] },
  ],
};

const SYMBOLS = ['🍎', '🍌', '🍇', '🍓', '🍒', '🍑', '🥝', '🍉', '🐶', '🐱', '🐭', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸', '🐙', '🦋', '🌵', '🌸', '🍄', '⭐', '🌙', '⚽', '🎈', '🎁', '🚗', '✈️', '🚀', '⛵'];
const HIDE_MS = 1100;

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const size = [12, 16, 24, 36].includes(Number(options.size)) ? Number(options.size) : 16;
  const rng = createRng(Number(options.seed) || 1);
  const syms = shuffle(rng, SYMBOLS).slice(0, size / 2);
  const cards = shuffle(rng, syms.concat(syms)).map((sym) => ({ sym, matched: null }));
  return {
    size,
    cards,
    open: [],          // indexes of face-up unmatched cards (0..2)
    turn: (Number(options.seed) || 0) % 2,
    scores: [0, 0],
    over: false,
  };
}

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  if (move.type === 'flip') {
    if (state.open.length >= 2) fail('Önce kartlar kapanmalı');
    const i = Number(move.card);
    if (!Number.isInteger(i) || i < 0 || i >= state.cards.length) fail('Geçersiz kart');
    if (state.cards[i].matched !== null || state.open.includes(i)) fail('Bu kart zaten açık');
    const open = state.open.concat([i]);
    if (open.length < 2) return { ...state, open };
    const [a, b] = open;
    if (state.cards[a].sym === state.cards[b].sym) {
      const cards = state.cards.map((c, k) => (k === a || k === b ? { ...c, matched: player } : c));
      const scores = state.scores.slice();
      scores[player] += 1;
      const over = cards.every((c) => c.matched !== null);
      return { ...state, cards, open: [], scores, over };
    }
    return { ...state, open }; // mismatch stays visible until 'hide'
  }
  if (move.type === 'hide') {
    if (state.open.length !== 2) fail('Kapanacak kart yok');
    return { ...state, open: [], turn: 1 - player };
  }
  fail(`Bilinmeyen hamle: ${move.type}`);
  return state;
}

export function getTurn(state) {
  return state.over ? null : { player: state.turn, private: false };
}

export function getResult(state) {
  if (!state.over) return null;
  const [a, b] = state.scores;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const mine = !state.over && viewer === state.turn;
  const waitingHide = state.open.length === 2;
  const cols = state.size === 12 ? 4 : state.size === 36 ? 6 : state.size === 24 ? 6 : 4;
  let timer = null;
  if (waitingHide && mine) timer = setTimeout(() => sendMove({ type: 'hide' }), HIDE_MS);
  const board = el('div', { class: 'mem-board', style: { gridTemplateColumns: `repeat(${cols}, 1fr)` } },
    state.cards.map((c, i) => {
      const faceUp = c.matched !== null || state.open.includes(i);
      return el('button', {
        type: 'button',
        class: `mem-card ${faceUp ? 'up' : ''} ${c.matched !== null ? `matched p${c.matched}` : ''}`,
        disabled: !mine || faceUp || waitingHide,
        'aria-label': faceUp ? c.sym : `Kapalı kart ${i + 1}`,
        onClick: () => sendMove({ type: 'flip', card: i }),
      }, faceUp ? c.sym : '');
    }));
  let status;
  if (state.over) status = state.scores[0] === state.scores[1] ? 'Berabere!' : `${players[state.scores[0] > state.scores[1] ? 0 : 1]} daha çok çift buldu!`;
  else if (waitingHide) status = 'Eşleşmedi…';
  else status = mine ? `Sıra sende, ${players[viewer]}: ${state.open.length ? 'ikinci kartı aç' : 'bir kart aç'}` : `${players[state.turn]} oynuyor…`;
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, status)),
    el('div', { class: 'c4-legend' }, el('span', {}, `${players[0]}: ${state.scores[0]}`), el('span', {}, `${players[1]}: ${state.scores[1]}`)),
    board,
  );
  return () => { if (timer) clearTimeout(timer); };
}

export default { id: 'hafiza', meta, setup, applyMove, render, getTurn, getResult };
