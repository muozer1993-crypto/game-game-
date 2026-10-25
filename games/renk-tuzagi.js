// Renk Tuzağı — a Stroop duel: a colour name is shown in some ink colour; tap the INK colour,
// not the word. Same seeded sequence for both players; most net correct answers win.
import { el, render as draw } from '../js/ui/dom.js';
import { createTimer } from '../js/ui/timer.js';
import { createRng } from '../js/lib/rng.js';

export const meta = {
  group: 'zeka',
  name: 'Renk Tuzağı',
  icon: '🎨',
  description: 'Kelimeye değil, rengine dokun! Süre dolana kadar en çok doğruyu yapan kazanır.',
  rules: [
    'Ekranda bir renk adı, başka (ya da aynı) renkte yazılmış olarak çıkar. Yazının rengine dokun; kelimeyi okumak tuzak.',
    'Doğru +1, yanlış −1. Süre dolunca puanı yüksek olan kazanır; eşitlikte az yanlış yapan.',
    'Tek telefonda sırayla, iki telefonda aynı anda oynanır; dizi ikiniz için aynıdır.',
  ].join('\n'),
  data: [],
  handoffNote: 'Dizi aynı: rakibin ekranı görmemeli.',
  settings: [
    { key: 'seconds', label: 'Süre', type: 'select', default: 30, options: [{ value: 20, label: '20 sn' }, { value: 30, label: '30 sn' }, { value: 45, label: '45 sn' }, { value: 60, label: '60 sn' }] },
  ],
};

export const COLOURS = [
  { name: 'KIRMIZI', css: '#e53935' },
  { name: 'MAVİ', css: '#1e88e5' },
  { name: 'YEŞİL', css: '#43a047' },
  { name: 'SARI', css: '#fdd835' },
];

function fail(msg) {
  throw new Error(msg);
}

/** Seeded items: { word, ink } (indexes into COLOURS); about half are incongruent. */
export function makeItems(count, seed) {
  const rng = createRng(seed);
  const out = [];
  let prevInk = -1;
  for (let i = 0; i < count; i++) {
    let ink = Math.floor(rng() * 4);
    if (ink === prevInk) ink = (ink + 1 + Math.floor(rng() * 3)) % 4;
    const same = rng() < 0.4;
    const word = same ? ink : (ink + 1 + Math.floor(rng() * 3)) % 4;
    out.push({ word, ink });
    prevInk = ink;
  }
  return out;
}

export function setup(options = {}) {
  const seconds = [20, 30, 45, 60].includes(Number(options.seconds)) ? Number(options.seconds) : 30;
  return {
    id: String(options.seed ?? ''),
    seconds,
    items: makeItems(400, Number(options.seed) || 1),
    answers: [[], []],  // answers[p][i] = 0/1 (wrong/right)
    started: [false, false],
    finished: [false, false],
    phase: 'play',
  };
}

export const scoreOf = (state, p) => {
  const right = state.answers[p].filter((a) => a === 1).length;
  const wrong = state.answers[p].length - right;
  return { right, wrong, score: right - wrong };
};

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (state.phase !== 'play') fail('Oyun bitti');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (move.type === 'start') {
    if (state.started[player]) fail('Zaten başladın');
    const started = state.started.slice();
    started[player] = true;
    return { ...state, started };
  }
  if (!state.started[player]) fail('Önce başla');
  if (state.finished[player]) fail('Süren doldu');
  if (move.type === 'answer') {
    const i = Number(move.index);
    if (i !== state.answers[player].length) fail('Sırayla cevaplanır');
    if (i >= state.items.length) fail('Dizi bitti');
    const choice = Number(move.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) fail('Geçersiz cevap');
    const answers = state.answers.map((l) => l.slice());
    answers[player].push(choice === state.items[i].ink ? 1 : 0);
    return { ...state, answers };
  }
  if (move.type === 'finish') {
    const finished = state.finished.slice();
    finished[player] = true;
    return { ...state, finished, phase: finished[0] && finished[1] ? 'over' : 'play' };
  }
  fail(`Bilinmeyen hamle: ${move.type}`);
  return state;
}

export function getTurn(state) {
  if (state.phase !== 'play') return null;
  const p = state.finished[0] ? (state.finished[1] ? null : 1) : 0;
  return p == null ? null : { player: p, private: true, simultaneous: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const a = scoreOf(state, 0);
  const b = scoreOf(state, 1);
  if (a.score !== b.score) return { winner: a.score > b.score ? 0 : 1 };
  if (a.wrong !== b.wrong) return { winner: a.wrong < b.wrong ? 0 : 1 };
  return { draw: true };
}

// ----------------------------------------------------------------- render
const starts = new Map(); // `${id}:${player}` -> clock start on this device

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const opp = 1 - viewer;
  const key = `${state.id}:${viewer}`;
  const line = (p) => { const s = scoreOf(state, p); return `${s.right} doğru, ${s.wrong} yanlış → ${s.score} puan`; };

  if (state.phase === 'over') {
    const r = getResult(state);
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, r.draw ? 'Berabere!' : `${players[r.winner]} kazandı!`)),
      el('p', { class: 'hint' }, `${players[0]}: ${line(0)}`),
      el('p', { class: 'hint' }, `${players[1]}: ${line(1)}`),
    );
    return null;
  }
  if (state.finished[viewer]) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `Bitirdin: ${line(viewer)}`)),
      el('p', { class: 'hint' }, state.started[opp] ? `${players[opp]} oynuyor… (${state.answers[opp].length} cevap)` : `${players[opp]} henüz başlamadı…`),
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
    );
    return null;
  }
  if (!state.started[viewer]) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}, hazır olunca başla`)),
      el('p', { class: 'hint' }, `${state.seconds} saniye boyunca yazının RENGİNE dokun, kelimeye değil. Doğru +1, yanlış −1.`),
      el('div', { class: 'rt-demo' }, el('span', { class: 'rt-word', style: { color: COLOURS[1].css } }, 'KIRMIZI'), el('span', { class: 'muted' }, ' → doğru cevap: mavi')),
      el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'start' }) }, 'Başla'),
    );
    return null;
  }
  if (!starts.has(key)) starts.set(key, Date.now()); // the clock starts with the first playing render
  const startedAt = starts.get(key);
  const deadline = startedAt + state.seconds * 1000;
  const i = state.answers[viewer].length;
  const item = state.items[i];
  const finish = () => sendMove({ type: 'finish' });
  const timerBox = el('div');
  const timer = createTimer(timerBox, { deadline, total: state.seconds * 1000, onExpire: finish });
  let answered = false;
  const sc = scoreOf(state, viewer);
  draw(container,
    timerBox,
    el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}: ${sc.score} puan (${sc.right} doğru, ${sc.wrong} yanlış)`)),
    el('div', { class: 'rt-card card' }, el('span', { class: 'rt-word', style: { color: COLOURS[item.ink].css } }, COLOURS[item.word].name)),
    el('div', { class: 'rt-pads' }, COLOURS.map((c, k) => el('button', {
      type: 'button', class: 'rt-pad', style: { background: c.css }, 'aria-label': c.name,
      onClick: () => { if (answered) return; answered = true; sendMove({ type: 'answer', index: i, choice: k }); },
    }))),
    el('p', { class: 'hint' }, 'Yazının rengine dokun'),
  );
  return () => timer.stop();
}

export default { id: 'renk-tuzagi', meta, setup, applyMove, render, getTurn, getResult };
