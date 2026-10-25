// Doğruluk mu Cesaret mi? — the party classic for two: on your turn pick truth or dare, the
// other player judges whether you did it. A dare scores 2, a truth 1, a pass nothing. Nothing is
// hidden, so the phone is simply shown around; online the other phone shows the judge buttons.
import { el, render as draw } from '../js/ui/dom.js';
import { createRng, shuffle } from '../js/lib/rng.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'tanisma',
  name: 'Doğruluk mu Cesaret mi?',
  icon: '🎭',
  description: 'Sırayla doğruluk ya da cesaret seç; rakibin "yaptı" derse puan senin.',
  rules: [
    'Sırası gelen "Doğruluk" (bir soruya dürüstçe cevap) ya da "Cesaret" (küçük bir görev) seçer. Kart gelir; bir kez "Başka kart" diyebilirsin.',
    'Diğer oyuncu hakemdir: cevap ya da görev tamamlandıysa "Yaptı" der. Cesaret 2, doğruluk 1 puan; pas 0.',
    'Herkes aynı sayıda tur oynar; toplam puanı yüksek olan kazanır. Kartlar iki telefonda da aynı sırayla gelir.',
  ].join('\n'),
  data: ['dogruluk'],
  settings: [
    { key: 'rounds', label: 'Kişi başı tur', type: 'select', default: 5, options: [{ value: 3, label: '3' }, { value: 5, label: '5' }, { value: 8, label: '8' }] },
  ],
};

export const SCORE = { truth: 1, dare: 2 };

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}, ctx = {}) {
  const rounds = [3, 5, 8].includes(Number(options.rounds)) ? Number(options.rounds) : 5;
  const seed = Number(options.seed) || 1;
  const pool = ctx.dogruluk || {};
  const nT = Array.isArray(pool.truths) ? pool.truths.length : 0;
  const nD = Array.isArray(pool.dares) ? pool.dares.length : 0;
  const rng = createRng(seed);
  return {
    id: String(options.seed ?? ''),
    rounds,
    order: { truth: shuffle(rng, Array.from({ length: nT }, (_, i) => i)), dare: shuffle(rng, Array.from({ length: nD }, (_, i) => i)) },
    used: { truth: 0, dare: 0 },
    turn: 0,
    played: [0, 0],
    scores: [0, 0],
    phase: 'choose',   // choose | prompt | over
    current: null,     // { kind, index, swapped }
    history: [],       // { player, kind, index, done }
  };
}

function nextIndex(state, kind) {
  const list = state.order[kind];
  if (!list.length) return -1;
  return list[state.used[kind] % list.length];
}

export function applyMove(state, player, move, ctx = {}) {
  const online = ctx.mode === 'online'; // on one phone the moves come from whoever holds it
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.phase === 'over') fail('Oyun bitti');
  switch (move.type) {
    case 'pick': {
      if (state.phase !== 'choose') fail('Önce bu kart sonuçlansın');
      if (player !== state.turn) fail('Sıra sende değil');
      const kind = move.kind === 'dare' ? 'dare' : move.kind === 'truth' ? 'truth' : null;
      if (!kind) fail('Doğruluk ya da cesaret seç');
      const index = nextIndex(state, kind);
      if (index < 0) fail('Kart havuzu boş');
      return { ...state, phase: 'prompt', used: { ...state.used, [kind]: state.used[kind] + 1 }, current: { kind, index, swapped: false } };
    }
    case 'swap': {
      if (state.phase !== 'prompt') fail('Önce bir kart seç');
      if (online && player !== state.turn) fail('Kartı yalnızca sırası gelen değiştirebilir');
      if (state.current.swapped) fail('Bir kart yalnızca bir kez değiştirilir');
      const kind = state.current.kind;
      const index = nextIndex(state, kind);
      return { ...state, used: { ...state.used, [kind]: state.used[kind] + 1 }, current: { kind, index, swapped: true } };
    }
    case 'resolve': {
      if (state.phase !== 'prompt') fail('Sonuçlanacak kart yok');
      if (online && player === state.turn) fail('Hakem diğer oyuncu'); // online: only the other phone judges
      const done = !!move.done;
      const scores = state.scores.slice();
      if (done) scores[state.turn] += SCORE[state.current.kind];
      const played = state.played.slice();
      played[state.turn] += 1;
      const history = state.history.concat([{ player: state.turn, kind: state.current.kind, index: state.current.index, done }]);
      const over = played[0] >= state.rounds && played[1] >= state.rounds;
      return { ...state, scores, played, history, current: null, phase: over ? 'over' : 'choose', turn: 1 - state.turn };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase === 'choose') return { player: state.turn, private: false };
  if (state.phase === 'prompt') return { player: 1 - state.turn, private: false }; // the judge decides
  return null;
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const [a, b] = state.scores;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  const pool = ctx.dogruluk || { truths: [], dares: [] };
  const textOf = (kind, index) => (kind === 'truth' ? pool.truths : pool.dares)[index] || '…';
  const legend = el('div', { class: 'c4-legend' }, el('span', {}, `${players[0]}: ${state.scores[0]}`), el('span', {}, `${players[1]}: ${state.scores[1]}`), el('span', { class: 'muted' }, `tur ${Math.min(state.played[0], state.rounds) + (state.turn === 0 && state.played[0] < state.rounds ? 1 : 0)}/${state.rounds}`));
  const historyView = state.history.length ? el('div', { class: 'dc-history' }, state.history.slice().reverse().slice(0, 6).map((h) =>
    el('div', { class: `dc-item ${h.done ? 'ok' : 'miss'}` }, `${h.kind === 'dare' ? '🔥' : '💬'} ${players[h.player]}: ${textOf(h.kind, h.index)} — ${h.done ? `+${SCORE[h.kind]}` : 'pas'}`))) : null;

  if (state.phase === 'over') {
    const [a, b] = state.scores;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, a === b ? `Berabere: ${a}–${b}` : `${players[a > b ? 0 : 1]} kazandı: ${Math.max(a, b)}–${Math.min(a, b)}`)),
      legend, historyView,
    );
    return null;
  }

  const p = state.turn;
  if (state.phase === 'choose') {
    const mine = !online || viewer === p;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, mine ? `${players[p]}, seç:` : `${players[p]} seçiyor…`)),
      mine ? el('div', { class: 'dc-choice' },
        el('button', { type: 'button', class: 'btn btn-secondary dc-btn', onClick: () => sendMove({ type: 'pick', kind: 'truth' }) }, el('span', { class: 'dc-icon' }, '💬'), 'Doğruluk', el('span', { class: 'muted' }, '1 puan')),
        el('button', { type: 'button', class: 'btn btn-primary dc-btn', onClick: () => sendMove({ type: 'pick', kind: 'dare' }) }, el('span', { class: 'dc-icon' }, '🔥'), 'Cesaret', el('span', { class: 'muted' }, '2 puan')),
      ) : el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      legend, historyView,
    );
    return null;
  }

  // prompt: the card is shown to both; the judge (other player) resolves, the player may swap once
  const cur = state.current;
  const judge = 1 - p;
  const amJudge = !online || viewer === judge;
  const amPlayer = !online || viewer === p;
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, `${players[p]} — ${cur.kind === 'dare' ? 'Cesaret 🔥' : 'Doğruluk 💬'}`)),
    el('div', { class: 'dc-card card' }, el('div', { class: 'dc-text' }, textOf(cur.kind, cur.index))),
    amPlayer && !cur.swapped ? el('button', { type: 'button', class: 'btn btn-small', onClick: () => sendMove({ type: 'swap' }) }, 'Başka kart (bir kez)') : null,
    el('p', { class: 'hint' }, amJudge ? `${players[judge]} hakem: ${cur.kind === 'dare' ? 'görev yapıldı mı?' : 'cevap verildi mi?'}` : `${players[judge]} karar verecek…`),
    amJudge ? el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px' } },
      el('button', { type: 'button', class: 'btn btn-primary btn-big', onClick: () => sendMove({ type: 'resolve', done: true }) }, `Yaptı (+${SCORE[cur.kind]})`),
      el('button', { type: 'button', class: 'btn btn-secondary btn-big', onClick: () => sendMove({ type: 'resolve', done: false }) }, 'Pas (0)'),
    ) : null,
    legend, historyView,
  );
  return null;
}

export default { id: 'dogruluk-cesaret', meta, setup, applyMove, render, getTurn, getResult };
