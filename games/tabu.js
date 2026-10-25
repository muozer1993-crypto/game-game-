// Tabu — one player describes the word on the card without saying the five forbidden
// words, the other guesses aloud. Roles swap every round; "Bildi" +1, "Tabu" −1, "Pas" 0.
import { el, render as draw } from '../js/ui/dom.js';
import { createTimer } from '../js/ui/timer.js';
import { createRng, shuffle } from '../js/lib/rng.js';
import { nameSuffix, upperTR } from '../js/lib/tr.js';

export const meta = {
  group: 'kelime',
  name: 'Tabu',
  icon: '🤐',
  description: 'Karttaki kelimeyi yasaklı beş kelimeyi söylemeden anlat; eşin tahmin etsin. Roller her turda değişir.',
  rules: [
    'Anlatan karttaki kelimeyi, altındaki beş yasaklı kelimeyi (ve türevlerini) söylemeden anlatır; tahmin eden yüksek sesle tahmin eder.',
    'Bilinen kart +1, pas 0, yasaklı kelime kaçarsa anlatan "Tabu" der ve −1. Süre dolunca tur biter, roller değişir.',
    'Tek telefonda kartı yalnızca anlatan görür; iki telefonda tahmin edenin ekranında kart görünmez. Yasaklı kelime denetimi anlatanın dürüstlüğüne kalır.',
  ].join('\n'),
  data: ['tabu'],
  handoffNote: 'Kartı yalnızca anlatan görmeli.',
  settings: [
    { key: 'rounds', label: 'Tur sayısı', type: 'select', default: 4, options: [{ value: 2, label: '2 (birer tur)' }, { value: 4, label: '4 (ikişer tur)' }, { value: 6, label: '6 (üçer tur)' }] },
    { key: 'seconds', label: 'Tur süresi', type: 'select', default: 60, options: [{ value: 45, label: '45 sn' }, { value: 60, label: '60 sn' }, { value: 90, label: '90 sn' }] },
  ],
};

export const RESULTS = ['ok', 'pass', 'taboo'];
const POINTS = { ok: 1, pass: 0, taboo: -1 };

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}, ctx = {}) {
  const cards = ctx.tabu && Array.isArray(ctx.tabu.cards) ? ctx.tabu.cards : [];
  if (!cards.length) fail('Tabu kartları yüklenemedi');
  const rounds = [2, 4, 6].includes(Number(options.rounds)) ? Number(options.rounds) : 4;
  const seconds = [45, 60, 90].includes(Number(options.seconds)) ? Number(options.seconds) : 60;
  const rng = createRng(Number(options.seed) || 1);
  return {
    id: String(options.seed ?? ''),
    rounds,
    seconds,
    deck: shuffle(rng, [...cards.keys()]), // card indexes in play order, shared by both devices
    cursor: 0,
    round: 0,
    describer: (Number(options.seed) || 0) % 2,
    phase: 'ready',      // ready | play | summary | over
    log: [[]],           // per round: { card, result }
    scores: [0, 0],
  };
}

export const cardAt = (state, ctx) => (ctx.tabu && ctx.tabu.cards ? ctx.tabu.cards[state.deck[state.cursor % state.deck.length]] : null);

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (state.phase === 'over') fail('Oyun bitti');
  const guesser = 1 - state.describer;
  switch (move.type) {
    case 'start':
      if (state.phase !== 'ready') fail('Tur zaten başladı');
      if (player !== state.describer) fail('Bu turda anlatan sen değilsin');
      return { ...state, phase: 'play' };
    case 'card': {
      if (state.phase !== 'play') fail('Tur oynanmıyor');
      if (player !== state.describer) fail('Kartları anlatan işaretler');
      if (!RESULTS.includes(move.result)) fail('Geçersiz sonuç');
      const card = state.deck[state.cursor % state.deck.length];
      if (move.card !== card) fail('Kart uyuşmuyor');
      const log = state.log.map((r) => r.slice());
      log[state.round].push({ card, result: move.result });
      const scores = state.scores.slice();
      scores[state.describer] += POINTS[move.result];
      return { ...state, log, scores, cursor: state.cursor + 1 };
    }
    case 'end':
      if (state.phase !== 'play') fail('Tur oynanmıyor');
      if (player !== state.describer) fail('Turu anlatan bitirir');
      return { ...state, phase: 'summary' };
    case 'next': {
      if (state.phase !== 'summary') fail('Tur henüz bitmedi');
      const round = state.round + 1;
      if (round >= state.rounds) return { ...state, phase: 'over' };
      return { ...state, round, describer: guesser, phase: 'ready', log: state.log.concat([[]]) };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase === 'ready' || state.phase === 'play') return { player: state.describer, private: true };
  return null; // the round summary and the result are looked at together
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const [a, b] = state.scores;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

/** Who described round 0: roles alternate, so it follows from the current round and describer. */
export const firstDescriber = (state) => (state.round % 2 === 0 ? state.describer : 1 - state.describer);

export function roundScore(entries) {
  return entries.reduce((s, e) => s + POINTS[e.result], 0);
}

// ------------------------------------------------------------------ rendering
const starts = new Map(); // `${id}:${round}` -> Date.now() when this device saw the round begin
const MARK = { ok: '✓', pass: '→', taboo: '✗' };
const LABEL = { ok: 'Bildi', pass: 'Pas', taboo: 'Tabu' };

function cardView(card) {
  return el('div', { class: 'tb-card card' },
    el('div', { class: 'tb-word' }, upperTR(card.word)),
    el('div', { class: 'tb-taboo' }, card.taboo.map((t) => el('span', { class: 'tb-no' }, t))),
  );
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  const cards = ctx.tabu && ctx.tabu.cards ? ctx.tabu.cards : [];
  const d = state.describer;
  const g = 1 - d;
  const isDescriber = viewer === d;
  const entries = state.log[state.round] || [];
  const tally = (r) => entries.filter((e) => e.result === r).length;
  const score = el('div', { class: 'c4-legend' }, el('span', {}, `${players[0]}: ${state.scores[0]}`), el('span', {}, `${players[1]}: ${state.scores[1]}`), el('span', { class: 'muted' }, `${Math.min(state.round + 1, state.rounds)}. tur / ${state.rounds}`));
  const cleanups = [];

  if (state.phase === 'over') {
    const [a, b] = state.scores;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, a === b ? `Berabere: ${a}–${b}` : `${players[a > b ? 0 : 1]} kazandı: ${Math.max(a, b)}–${Math.min(a, b)}`)),
      score,
      el('div', { class: 'tb-rounds' }, state.log.map((r, i) => el('div', { class: 'tb-round' },
        el('div', { class: 'col-title' }, `${i + 1}. tur — ${players[firstDescriber(state) === 0 ? i % 2 : 1 - (i % 2)]} anlattı, ${roundScore(r) > 0 ? '+' : ''}${roundScore(r)}`),
        el('div', { class: 'tb-list' }, r.map((e) => el('span', { class: `tb-chip ${e.result}` }, `${MARK[e.result]} ${cards[e.card] ? cards[e.card].word : '?'}`))),
      ))),
    );
    return null;
  }

  if (state.phase === 'summary') {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${state.round + 1}. tur bitti: ${nameSuffix(players[d], 'in')} anlattığı ${tally('ok')} kart bilindi${tally('taboo') ? `, ${tally('taboo')} tabu` : ''}${tally('pass') ? `, ${tally('pass')} pas` : ''}. Tur puanı ${roundScore(entries) > 0 ? '+' : ''}${roundScore(entries)}.`)),
      score,
      el('div', { class: 'tb-list' }, entries.map((e) => el('span', { class: `tb-chip ${e.result}` }, `${MARK[e.result]} ${cards[e.card] ? cards[e.card].word : '?'}`))),
      el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'next' }) },
        state.round + 1 >= state.rounds ? 'Sonucu gör' : `Sonraki tur (${players[g]} anlatacak)`),
    );
    return null;
  }

  if (state.phase === 'ready') {
    if (isDescriber) {
      draw(container,
        el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}, bu turda sen anlatıyorsun`)),
        el('p', { class: 'hint' }, `${state.seconds} saniyen var. Kartı ${players[g]} görmemeli. Yasaklı kelimelerden birini söylersen "Tabu"ya bas.`),
        el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'start' }) }, 'Başla'),
        score,
      );
    } else {
      draw(container,
        el('div', { class: 'status-line' }, el('span', { class: 'muted' }, `${players[d]} anlatmaya hazırlanıyor…`)),
        el('p', { class: 'hint' }, 'Bu turda sen tahmin ediyorsun: tahminlerini yüksek sesle söyle.'),
        el('div', { class: 'spinner', 'aria-hidden': 'true' }),
        score,
      );
    }
    return null;
  }

  // ---- play
  const key = `${state.id}:${state.round}`;
  if (!starts.has(key)) starts.set(key, Date.now());
  const deadline = starts.get(key) + state.seconds * 1000;
  const timerBox = el('div');
  const end = () => sendMove({ type: 'end' });
  const timer = createTimer(timerBox, { deadline, total: state.seconds * 1000, onExpire: isDescriber ? end : null });
  cleanups.push(() => timer.stop());
  const counts = el('div', { class: 'c4-legend' },
    el('span', { class: 'tb-count ok' }, `✓ ${tally('ok')}`), el('span', { class: 'tb-count pass' }, `→ ${tally('pass')}`), el('span', { class: 'tb-count taboo' }, `✗ ${tally('taboo')}`));
  if (!isDescriber) {
    draw(container,
      timerBox,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[d]} anlatıyor, sen tahmin et!`)),
      counts,
      el('p', { class: 'hint' }, online ? 'Kart yalnızca anlatanın ekranında.' : 'Telefona bakma; tahminlerini yüksek sesle söyle.'),
      score,
    );
    return () => cleanups.forEach((fn) => fn());
  }
  const card = cardAt(state, ctx);
  const cardIdx = state.deck[state.cursor % state.deck.length];
  const mark = (result) => sendMove({ type: 'card', card: cardIdx, result });
  draw(container,
    timerBox,
    el('div', { class: 'status-line' }, el('strong', {}, `Anlat, ${players[viewer]}!`)),
    counts,
    card ? cardView(card) : el('p', { class: 'hint' }, 'Kart yüklenemedi.'),
    el('div', { class: 'tb-actions' },
      el('button', { type: 'button', class: 'btn btn-secondary btn-big', onClick: () => mark('pass') }, 'Pas'),
      el('button', { type: 'button', class: 'btn btn-primary btn-big', onClick: () => mark('ok') }, 'Bildi ✓'),
      el('button', { type: 'button', class: 'btn btn-danger btn-big', onClick: () => mark('taboo') }, 'Tabu ✗'),
    ),
    el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '10px' } },
      el('button', { type: 'button', class: 'btn btn-small', onClick: () => { if (confirm('Süre dolmadan tur bitirilsin mi?')) end(); } }, 'Turu bitir'),
    ),
    score,
  );
  return () => cleanups.forEach((fn) => fn());
}

export default { id: 'tabu', meta, setup, applyMove, render, getTurn, getResult };
