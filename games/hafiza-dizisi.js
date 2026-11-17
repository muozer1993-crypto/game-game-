// Hafıza Dizisi — a "Simon" duel: the same seeded sequence of pads lights up, one more each
// round; repeat it by tapping. A mistake ends your run; the longer run wins.
import { el, render as draw, keysIntoViewOnce } from '../js/ui/dom.js';
import { createRng } from '../js/lib/rng.js';
import { clockPause } from '../js/ui/timer.js';

export const meta = {
  group: 'zeka',
  name: 'Hafıza Dizisi',
  icon: '🎵',
  description: 'Yanan renk dizisini ezberle, aynı sırayla dokunarak tekrarla; her turda bir uzar. Daha uzun diziyi hatırlayan kazanır.',
  rules: [
    'Dört renkli düğme sırayla yanar; sonra aynı sırayla dokunursun. Her turda dizi bir uzar (3\'ten başlar).',
    'Yanlış dokununca senin turun biter; ulaştığın uzunluk puanındır. Dizi ikiniz için aynıdır; uzun hatırlayan kazanır, eşitlikte berabere.',
    'Tek telefonda sırayla, iki telefonda aynı anda oynanır.',
  ].join('\n'),
  data: [],
  handoffNote: 'Dizi aynı: rakibin ekranı görmemeli.',
  settings: [
    { key: 'speed', label: 'Hız', type: 'select', default: 'normal', options: [{ value: 'slow', label: 'Yavaş' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Hızlı' }] },
  ],
};

export const PADS = [
  { name: 'kırmızı', css: '#e53935' },
  { name: 'mavi', css: '#1e88e5' },
  { name: 'yeşil', css: '#43a047' },
  { name: 'sarı', css: '#fdd835' },
];
export const START_LEN = 3;
export const MAX_LEN = 30;
const STEP_MS = { slow: 800, normal: 550, fast: 350 };

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const rng = createRng(Number(options.seed) || 1);
  return {
    id: String(options.seed ?? ''),
    speed: ['slow', 'normal', 'fast'].includes(options.speed) ? options.speed : 'normal',
    sequence: Array.from({ length: MAX_LEN }, () => Math.floor(rng() * 4)),
    length: [START_LEN, START_LEN], // the sequence length each player is currently repeating
    pos: [0, 0],                    // how many taps of the current round are done
    reached: [0, 0],                // longest sequence completed
    done: [false, false],
    phase: 'play',
  };
}

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (state.phase !== 'play') fail('Oyun bitti');
  if (player !== 0 && player !== 1) fail('Geçersiz oyuncu');
  if (state.done[player]) fail('Senin turun bitti');
  if (move.type !== 'tap') fail(`Bilinmeyen hamle: ${move.type}`);
  const pad = Number(move.pad);
  if (!Number.isInteger(pad) || pad < 0 || pad > 3) fail('Geçersiz düğme');
  const len = state.length[player];
  const pos = state.pos[player];
  const finish = (reached) => {
    const done = state.done.slice();
    done[player] = true;
    const r = state.reached.slice();
    r[player] = reached;
    return { ...state, done, reached: r, phase: done[0] && done[1] ? 'over' : 'play' };
  };
  if (pad !== state.sequence[pos]) return finish(state.reached[player]); // mistake: credit the rounds completed (0 before the first)
  const next = { ...state, pos: state.pos.slice(), length: state.length.slice(), reached: state.reached.slice() };
  if (pos + 1 < len) { next.pos[player] = pos + 1; return next; }
  next.reached[player] = len;
  if (len >= MAX_LEN) return { ...finish(len), reached: next.reached };
  next.length[player] = len + 1;
  next.pos[player] = 0;
  return next;
}

export function getTurn(state) {
  if (state.phase !== 'play') return null;
  const p = state.done[0] ? (state.done[1] ? null : 1) : 0;
  if (p == null) return null;
  // one phone: the first run has just ended (a wrong tap ends it at once): the handoff says how far it got
  return p === 1
    ? { player: p, private: true, simultaneous: true, note: `İlk tur bitti: ${state.reached[0]} adıma ulaşıldı. Şimdi sen dene!` }
    : { player: p, private: true, simultaneous: true };
}

export function getResult(state) {
  if (state.phase !== 'over') return null;
  const [a, b] = state.reached;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
const shown = new Map(); // `${id}:${player}:${length}` -> playback already shown for this round

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const opp = 1 - viewer;
  const timers = [];

  if (state.phase === 'over') {
    const r = getResult(state);
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, r.draw ? `Berabere: ikiniz de ${state.reached[0]} adıma ulaştınız.` : `${players[r.winner]} kazandı!`)),
      el('p', { class: 'hint' }, `${players[0]}: ${state.reached[0]} adım · ${players[1]}: ${state.reached[1]} adım`),
    );
    return null;
  }
  if (state.done[viewer]) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, `Turun bitti: ${state.reached[viewer]} adıma ulaştın.`)),
      el('p', { class: 'hint' }, `${players[opp]} oynuyor… (${state.reached[opp]} adım)`),
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
    );
    return null;
  }

  const len = state.length[viewer];
  const pos = state.pos[viewer];
  const key = `${state.id}:${viewer}:${len}`;
  const stepMs = STEP_MS[state.speed] || 550;
  const padEls = PADS.map((p, k) => el('button', { type: 'button', class: 'sm-pad', style: { background: p.css }, 'aria-label': p.name, disabled: true, onClick: () => sendMove({ type: 'tap', pad: k }) }));
  // two lines of room: "Şimdi sen: … tekrarla" wraps on a phone, and the pads must not move as they come alive
  const status = el('div', { class: 'status-line two' });
  const setStatus = (t) => draw(status, el('strong', {}, t));
  const enable = (on) => padEls.forEach((b) => { b.disabled = !on; });

  // The playback is scheduled relative to its start time (kept in `shown`), so a re-render in the
  // middle of it (the opponent's tap arriving online) resumes the remaining flashes instead of
  // dropping them and unlocking the pads on a sequence the player never saw.
  const playback = (startedAt) => {
    enable(false);
    setStatus(`${len} adımlık diziyi izle…`);
    const now = Date.now();
    // every flash lights and goes out at its own absolute time: one in progress when the screen is
    // redrawn only finishes its remaining part, so a pad repeated next still flashes twice
    for (let i = 0; i < len; i++) {
      const on = startedAt + 400 + i * stepMs - now;
      const off = on + stepMs * 0.6;
      if (off <= 0) continue; // already flashed
      const pad = padEls[state.sequence[i]];
      timers.push(setTimeout(() => pad.classList.add('lit'), Math.max(0, on)));
      timers.push(setTimeout(() => pad.classList.remove('lit'), off));
    }
    timers.push(setTimeout(() => { stopOnPause(); setStatus(`Şimdi sen: ${len} adımlık diziyi aynı sırayla tekrarla`); enable(true); }, Math.max(0, startedAt + 400 + len * stepMs - now)));
    // "Bağlantı koptu" hides the pads and nobody can play: the show stops and is offered again
    stopOnPause();
    stopOnPause = clockPause.onBegin(() => {
      stopOnPause();
      timers.splice(0).forEach((t) => clearTimeout(t));
      padEls.forEach((b) => b.classList.remove('lit'));
      shown.delete(key);
      enable(false);
      setStatus(`Dizi yarıda kaldı: ${len} adımlık diziyi yeniden izle.`);
      showBtn.textContent = `${len} adımlık diziyi göster`;
      slot(true);
    });
  };
  let stopOnPause = () => {};
  const showBtn = el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', onClick: () => { slot(false); const t = Date.now(); shown.set(key, t); playback(t); } }, pos === 0 && len === START_LEN ? 'Başla' : `${len} adımlık diziyi göster`);
  // the button keeps its place (hidden) once the round is under way: the page does not get shorter,
  // so a page scrolled down to it does not pull the pads down as the sequence starts
  const slot = (on) => {
    showBtn.style.visibility = on ? '' : 'hidden';
    showBtn.disabled = !on;
    if (on) showBtn.removeAttribute('aria-hidden'); else showBtn.setAttribute('aria-hidden', 'true');
  };
  const offer = pos === 0 && !shown.has(key);
  slot(offer);
  draw(container,
    status,
    el('p', { class: 'hint' }, `${players[viewer]} · tur ${len - START_LEN + 1} · ulaşılan: ${state.reached[viewer]}${pos ? ` · ${pos}/${len} dokunuldu` : ''}`),
    el('div', { class: 'sm-pads' }, padEls),
    showBtn,
  );
  // the button that starts the round, under the pads: once per round, so the opponent's taps
  // (online, each one redraws this screen) do not pull the page back down
  if (offer) keysIntoViewOnce(showBtn, container, key);
  const startedAt = shown.get(key);
  if (pos === 0 && startedAt == null) setStatus(len === START_LEN ? 'Hazır olunca başla.' : `Doğru! Sıradaki dizi ${len} adım.`);
  else if (pos === 0 && Date.now() < startedAt + 400 + len * stepMs) playback(startedAt); // re-rendered mid-playback
  else { setStatus(pos ? `Devam et: ${pos}/${len} dokunuldu` : `Şimdi sen: ${len} adımlık diziyi aynı sırayla tekrarla`); enable(true); }
  return () => { stopOnPause(); timers.forEach((t) => clearTimeout(t)); };
}

export default { id: 'hafiza-dizisi', meta, setup, applyMove, render, getTurn, getResult };
