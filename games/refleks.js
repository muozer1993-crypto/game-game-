// Refleks — reaction duel. The screen goes green after a random wait; the faster tap wins
// the round, tapping early loses it. One phone: two tap zones. Two phones: each device
// times its own player, so network delay does not matter.
import { el, render as draw } from '../js/ui/dom.js';
import { createRng } from '../js/lib/rng.js';

export const meta = {
  group: 'zeka',
  name: 'Refleks',
  icon: '⚡',
  description: 'Ekran yeşile dönünce ilk dokunan eli alır; erken dokunan eli kaybeder.',
  rules: [
    'Her elde ekran kırmızıyken bekle; rastgele bir süre sonra yeşile döner ve "ŞİMDİ!" yazar. İlk dokunan eli alır.',
    'Yeşile dönmeden dokunursan o eli kaybedersin. Tek telefonda ekranın üst yarısı bir oyuncunun, alt yarısı diğerinindir.',
    'İki telefonda her cihaz kendi oyuncusunun tepki süresini ölçer; kısa süre kazanır. Ayarlardaki el sayısının çoğunu alan kazanır.',
  ].join('\n'),
  data: [],
  settings: [
    { key: 'rounds', label: 'El sayısı', type: 'select', default: 5, options: [{ value: 3, label: '3' }, { value: 5, label: '5' }, { value: 7, label: '7' }, { value: 9, label: '9' }] },
  ],
};

export const NO_TAP_MS = 3000; // after this the device reports that its player did not react

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const rounds = [3, 5, 7, 9].includes(Number(options.rounds)) ? Number(options.rounds) : 5;
  const rng = createRng(Number(options.seed) || 1);
  return {
    id: String(options.seed ?? ''),
    rounds,
    delays: Array.from({ length: rounds }, () => 1500 + Math.floor(rng() * 3500)), // ms before "go", shared
    round: 0,
    phase: 'ready',        // ready | wait | result | over
    times: [null, null],   // this round: reaction ms, 'early' or 'none'
    history: [],           // { times, winner }
    scores: [0, 0],
  };
}

/** Round winner from both reaction reports: early loses, then the smaller time; null = nobody. */
export function roundWinner(times) {
  const bad = (t) => t === 'early' || t === 'none';
  if (bad(times[0]) && bad(times[1])) return times[0] === 'early' && times[1] !== 'early' ? 1 : (times[1] === 'early' && times[0] !== 'early' ? 0 : null);
  if (bad(times[0])) return 1;
  if (bad(times[1])) return 0;
  if (times[0] === times[1]) return null;
  return times[0] < times[1] ? 0 : 1;
}

export function applyMove(state, player, move, ctx = {}) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (state.phase === 'over') fail('Oyun bitti');
  switch (move.type) {
    case 'start':
      if (state.phase !== 'ready') fail('El zaten başladı');
      return { ...state, phase: 'wait', times: [null, null] };
    case 'tap': {
      if (state.phase !== 'wait') fail('Bu el bitti');
      // on one phone both players tap the same device: the zone says who; online each device
      // reports only for itself
      const who = ctx.mode === 'online' ? player : (move.who === 1 ? 1 : 0);
      if (ctx.mode === 'online' && move.who != null && move.who !== player) fail('Başkası adına dokunulamaz');
      if (state.times[who] != null) return state; // a second tap changes nothing
      const t = move.time === 'early' || move.time === 'none' ? move.time : Math.max(0, Math.round(Number(move.time)));
      if (typeof t === 'number' && !Number.isFinite(t)) fail('Geçersiz süre');
      const times = state.times.slice();
      times[who] = t;
      // on one phone an early tap ends the round at once; online both reports are needed so
      // that the two devices resolve the round the same way whatever order the taps arrive in
      const done = (t === 'early' && ctx.mode !== 'online') || (times[0] != null && times[1] != null);
      if (!done) return { ...state, times };
      const winner = roundWinner(times);
      const scores = state.scores.slice();
      if (winner != null) scores[winner] += 1;
      const history = state.history.concat([{ times, winner }]);
      const over = history.length >= state.rounds || scores[0] > state.rounds / 2 || scores[1] > state.rounds / 2;
      return { ...state, times, scores, history, phase: over ? 'over' : 'result' };
    }
    case 'next':
      if (state.phase !== 'result') fail('El henüz bitmedi');
      return { ...state, round: state.round + 1, phase: 'ready', times: [null, null] };
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function getTurn(state) {
  if (state.phase === 'over') return null;
  return { player: 0, private: false, simultaneous: true }; // both act at once; no handoffs
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const [a, b] = state.scores;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ------------------------------------------------------------------ rendering
const goAt = new Map(); // `${id}:${round}` -> timestamp when this device turns green

const fmt = (t) => (t == null ? '—' : t === 'early' ? 'erken!' : t === 'none' ? 'dokunmadı' : `${t} ms`);

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const online = ctx.mode === 'online';
  const score = el('div', { class: 'c4-legend' }, el('span', {}, `${players[0]}: ${state.scores[0]}`), el('span', {}, `${players[1]}: ${state.scores[1]}`), el('span', { class: 'muted' }, `${Math.min(state.round + 1, state.rounds)}. el / ${state.rounds}`));
  const last = state.history[state.history.length - 1];
  const lastLine = last ? el('p', { class: 'hint' }, `${players[0]} ${fmt(last.times[0])} · ${players[1]} ${fmt(last.times[1])} → ${last.winner == null ? 'kimse almadı' : `${players[last.winner]} aldı`}`) : null;

  if (state.phase === 'over') {
    const [a, b] = state.scores;
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, a === b ? `Berabere: ${a}–${b}` : `${players[a > b ? 0 : 1]} kazandı: ${Math.max(a, b)}–${Math.min(a, b)}`)),
      score, lastLine,
      el('div', { class: 'rf-history' }, state.history.map((h, i) => el('div', { class: 'muted' }, `${i + 1}. el: ${fmt(h.times[0])} – ${fmt(h.times[1])}${h.winner == null ? '' : ` (${players[h.winner]})`}`))),
    );
    return null;
  }
  if (state.phase === 'result') {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, last.winner == null ? 'Bu eli kimse almadı.' : `${players[last.winner]} bu eli aldı!`)),
      score, lastLine,
      el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'next' }) }, 'Sonraki el'),
    );
    return null;
  }
  if (state.phase === 'ready') {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${state.round + 1}. el: hazır olunca başlat`)),
      el('p', { class: 'hint' }, online ? 'Biriniz başlatınca ikinizin ekranı da kırmızıya döner; yeşili bekleyin.' : 'Üst yarı: ' + players[0] + ', alt yarı: ' + players[1] + '. Kırmızıda bekleyin, yeşilde dokunun.'),
      score, lastLine,
      el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'start' }) }, 'Başlat'),
    );
    return null;
  }

  // ---- wait: red, then green; one zone per player on one phone, one zone online
  const key = `${state.id}:${state.round}`;
  if (!goAt.has(key)) goAt.set(key, Date.now() + state.delays[state.round % state.delays.length]);
  const go = goAt.get(key);
  const zones = online ? [viewer] : [0, 1];
  const reported = new Set();
  const tap = (who) => {
    if (reported.has(who) || state.times[who] != null) return;
    const now = Date.now();
    if (now < go) { reported.add(who); sendMove({ type: 'tap', who, time: 'early' }); return; }
    reported.add(who);
    sendMove({ type: 'tap', who, time: now - go });
  };
  const zoneEls = zones.map((p) => el('button', {
    type: 'button', class: `rf-zone ${online ? 'single' : ''} ${p === 0 && !online ? 'flip' : ''}`,
    'aria-label': `${players[p]} dokunma alanı`,
    onPointerdown: (e) => { e.preventDefault(); tap(p); },
  }, el('span', { class: 'rf-name' }, players[p]), el('span', { class: 'rf-text' }, 'Bekle…')));
  const setGo = () => {
    zoneEls.forEach((z) => { z.classList.add('go'); z.querySelector('.rf-text').textContent = 'ŞİMDİ!'; });
  };
  const timers = [];
  // the opponent already jumped the gun: the round is decided, report at once instead of waiting
  if (online && state.times[1 - viewer] === 'early' && state.times[viewer] == null) {
    reported.add(viewer);
    timers.push(setTimeout(() => sendMove({ type: 'tap', who: viewer, time: 'none' }), 0));
  }
  const wait = go - Date.now();
  if (wait <= 0) setGo(); else timers.push(setTimeout(setGo, wait));
  // nobody reacted: report it so the round can end (the opponent may have tapped)
  timers.push(setTimeout(() => { zones.forEach((p) => { if (!reported.has(p) && state.times[p] == null) { reported.add(p); sendMove({ type: 'tap', who: p, time: 'none' }); } }); }, Math.max(0, wait) + NO_TAP_MS));
  draw(container,
    el('div', { class: 'rf-board' }, zoneEls),
    online && state.times[1 - viewer] === 'early' ? el('p', { class: 'hint' }, `${players[1 - viewer]} erken dokundu!`) : (online && state.times[1 - viewer] != null ? el('p', { class: 'hint' }, `${players[1 - viewer]} dokundu, senin dokunman bekleniyor…`) : null),
    online && state.times[viewer] != null ? el('p', { class: 'hint' }, `Senin süren: ${fmt(state.times[viewer])}. ${players[1 - viewer]} bekleniyor…`) : null,
  );
  return () => timers.forEach((t) => clearTimeout(t));
}

export default { id: 'refleks', meta, setup, applyMove, render, getTurn, getResult };
