// Mangala — the Turkish mancala variant (official TAZOF/MEB rules by default), with house rules
// and a Bantumi variant (the mancala of old Nokia phones). Every move records its full path so
// the board can replay the sowing stone by stone on both phones.
import { el, render as draw } from '../js/ui/dom.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'masa',
  name: 'Mangala',
  icon: '🪨',
  description: 'Türk mangalası ya da Nokia\'nın Bantumi\'si: taşları dağıt, yakala, hazneyi doldur.',
  rules: [
    'Her oyuncunun 6 kuyusu ve bir haznesi vardır; her kuyuda 4 taş. Ekranda 1. oyuncu alt sırayı oynar ve haznesi sağdadır; 2. oyuncu üst sırayı oynar ve haznesi soldadır. Taşlar alt sırada sağa, üst sırada sola doğru akar (saat yönünün tersine).',
    'Sırası gelen kendi kuyularından birini seçer; resmî kurala göre ilk taşı aldığı kuyuya geri bırakır, kalanını saat yönünün tersine birer birer dağıtır (kendi haznesine de bırakır, rakibin haznesini atlar). Kuyuda tek taş varsa o taş bir sonraki kuyuya gider. Ayarlardan "Sonraki kuyudan başla" seçilirse ilk taş aldığın kuyuya bırakılmaz, dağıtım bir sonraki kuyudan başlar (klasik ev kuralı); 13 ya da daha çok taşla tur dönerse o kuyuya da taş düşer.',
    'Son taş kendi haznene düşerse bir daha oynarsın. Son taş rakibin kuyusuna düşer ve oradaki taş sayısını çift yaparsa o kuyudaki taşların hepsini alırsın. Son taş kendi boş kuyuna düşerse ve karşısındaki rakip kuyusu doluysa oradakileri ve kendi taşını alırsın.',
    'Bir oyuncunun kuyuları boşalınca oyun biter. Resmî kurala göre kuyuları ilk boşalan oyuncu, rakibin kuyularında kalan bütün taşları kendi haznesine alır (ayarlardan "herkes kendi tarafındakini alır" seçilebilir). Haznesinde çok taşı olan kazanır; eşitlikte berabere.',
    'Varsayılanlar Türkiye Akıl ve Zekâ Oyunları Federasyonu (TAZOF) ve MEB zekâ oyunları kurallarıdır.',
    'Bantumi türü (eski Nokia telefonlarındaki oyun): dağıtım her zaman aldığın kuyudan sonraki kuyudan başlar; rakibin kuyusunu çift yapınca alma yoktur. Son taş haznene düşerse bir hamle daha. Son taş kendi boş kuyuna düşerse o taş ve karşısındaki kuyunun taşları haznene gider (karşısı boşsa yalnız o taş). Oyun bitince herkes kendi tarafındaki taşları alır. Bantumi seçiliyken "İlk taş" ve "Kalan taşlar" ayarları kullanılmaz.',
    'Taşların dağıtılışı adım adım gösterilir; tahtaya dokunarak animasyonu geçebilir, ayarlardan hızını değiştirebilir ya da kapatabilirsin.',
  ].join('\n'),
  data: [],
  settings: [
    { key: 'variant', label: 'Oyun türü', type: 'select', default: 'mangala', options: [{ value: 'mangala', label: 'Türk Mangalası (resmî kurallar)' }, { value: 'bantumi', label: 'Bantumi (Nokia klasiği)' }] },
    { key: 'firstStone', label: 'İlk taş', type: 'select', default: 'back', help: 'Bantumi seçiliyse kullanılmaz.', options: [{ value: 'back', label: 'Aldığın kuyuya geri bırakılır (resmî)' }, { value: 'next', label: 'Sonraki kuyudan başlanır (klasik ev kuralı)' }] },
    { key: 'leftovers', label: 'Oyun sonunda kalan taşlar', type: 'select', default: 'emptier', help: 'Bantumi seçiliyse kullanılmaz.', options: [{ value: 'emptier', label: 'Kuyuları ilk boşalan alır (resmî)' }, { value: 'owner', label: 'Herkes kendi tarafındakini alır (ev kuralı)' }] },
    { key: 'anim', label: 'Taş animasyonu', type: 'select', default: 'normal', options: [{ value: 'normal', label: 'Normal' }, { value: 'slow', label: 'Yavaş' }, { value: 'fast', label: 'Hızlı' }, { value: 'off', label: 'Kapalı' }] },
  ],
};

// Bantumi (Nokia 3310/3330/3390 era), reconciled from the Nokia 3395 manual, the 3310 firmware
// help text and the code of several remakes (Bantumi GL, UPM, Pragmatists): Kalah-style sowing,
// no even capture, the lone last bean is captured even when the opposite pot is empty (the most
// common reading; the phone's own texts do not say), leftovers go to their owner.
// Every flag is stored in the state so that both phones play the same game.
export const BANTUMI = {
  firstStone: 'next',               // sowing starts in the pot after the emptied one
  leftovers: 'owner',               // at the end each side keeps the beans on it
  evenCapture: false,               // no capture by making an opponent pot even
  emptyCaptureNeedsOpposite: false, // the last bean in an own empty pot always goes to the store
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
  const bantumi = options.variant === 'bantumi';
  return {
    id: String(options.seed ?? ''),
    pits,
    turn: (Number(options.seed) || 0) % 2,
    over: false,
    last: null,
    n: 0, // moves played (keys the replay animation)
    variant: bantumi ? 'bantumi' : 'mangala',
    // house rules travel in the state so that both phones play the same variant;
    // anything but the explicit variant value means the official (TAZOF) rule
    firstStone: bantumi ? BANTUMI.firstStone : (options.firstStone === 'next' ? 'next' : 'back'),
    leftovers: bantumi ? BANTUMI.leftovers : (options.leftovers === 'owner' ? 'owner' : 'emptier'),
    evenCapture: bantumi ? BANTUMI.evenCapture : true,
    emptyCaptureNeedsOpposite: bantumi ? BANTUMI.emptyCaptureNeedsOpposite : true,
    collected: null, // { taker, from, count, pits: [{ pit, count }] } when the game ended with stones left
  };
}

const storeOf = (p) => (p === 0 ? 6 : 13);
const ownsPit = (p, i) => (p === 0 ? i >= 0 && i <= 5 : i >= 7 && i <= 12);
const opposite = (i) => 12 - i;
const sideOf = (p) => (p === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);

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
  const before = state.pits.slice();
  const pits = state.pits.slice();
  let stones = pits[from];
  const lifted = stones;
  const myStore = storeOf(player);
  const oppStore = storeOf(1 - player);
  const path = []; // every pit a stone was dropped into, in order
  pits[from] = 0;
  let i = from;
  if (stones > 1 && state.firstStone !== 'next') {
    // official rule: the first stone goes back into the pit it was lifted from
    pits[from] = 1;
    path.push(from);
    stones -= 1;
  }
  while (stones > 0) {
    i = (i + 1) % 14;
    if (i === oppStore) continue;
    pits[i] += 1;
    path.push(i);
    stones -= 1;
  }
  const to = path[path.length - 1];
  let again = false;
  let captured = 0;
  const takes = []; // [{ pit, count }] moved into the mover's store after the sowing
  if (to === myStore) {
    again = true;
  } else if (state.evenCapture !== false && ownsPit(1 - player, to) && pits[to] % 2 === 0) {
    takes.push({ pit: to, count: pits[to] });
  } else if (ownsPit(player, to) && pits[to] === 1 && (pits[opposite(to)] > 0 || state.emptyCaptureNeedsOpposite === false)) {
    takes.push({ pit: to, count: 1 }); // the capturing stone first, then the opposite pit (as the phone does)
    if (pits[opposite(to)] > 0) takes.push({ pit: opposite(to), count: pits[opposite(to)] });
  }
  for (const t of takes) { captured += t.count; pits[myStore] += t.count; pits[t.pit] = 0; }
  const n = (state.n || 0) + 1;
  let next = { ...state, pits, n, turn: again ? player : 1 - player, last: { from, to, captured, again, player, lifted, path, takes, before, n } };
  // end: a player's side is empty. Official rule (TAZOF 4. temel kural): that player takes every
  // stone left on the opponent's side; in the 'owner' variant each side's stones go to their owner.
  for (const p of [0, 1]) {
    if (sideOf(p).every((k) => pits[k] === 0)) {
      const other = 1 - p;
      const taker = state.leftovers === 'owner' ? other : p;
      let count = 0;
      const moved = [];
      for (const k of sideOf(other)) {
        if (pits[k]) moved.push({ pit: k, count: pits[k] });
        count += pits[k]; pits[storeOf(taker)] += pits[k]; pits[k] = 0;
      }
      next = { ...next, pits, over: true, collected: count ? { taker, from: other, count, pits: moved } : null };
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

// ----------------------------------------------------------------- replay frames
/**
 * The frames that replay the last move: lifting, each dropped stone, the captures and the
 * end-of-game collection. Each frame: { pits, hand: { at, count } | null, flash: [pits], note }.
 */
export function replayFrames(state) {
  const L = state.last;
  if (!L || !Array.isArray(L.path) || !Array.isArray(L.before)) return [];
  const frames = [];
  const pits = L.before.slice();
  pits[L.from] = 0;
  let hand = L.lifted;
  frames.push({ pits: pits.slice(), hand: { at: L.from, count: hand }, flash: [L.from], kind: 'lift' });
  for (const k of L.path) {
    pits[k] += 1;
    hand -= 1;
    frames.push({ pits: pits.slice(), hand: hand > 0 ? { at: k, count: hand } : null, flash: [k], kind: 'drop', at: k });
  }
  const store = storeOf(L.player);
  if (L.takes && L.takes.length) {
    let held = 0;
    for (const t of L.takes) {
      pits[t.pit] = 0;
      held += t.count;
      frames.push({ pits: pits.slice(), hand: { at: t.pit, count: held }, flash: [t.pit], kind: 'take' });
    }
    pits[store] += held;
    frames.push({ pits: pits.slice(), hand: null, flash: [store], kind: 'store' });
  }
  const C = state.collected;
  if (state.over && C && Array.isArray(C.pits)) {
    for (const t of C.pits) {
      pits[t.pit] = 0;
      pits[storeOf(C.taker)] += t.count;
      frames.push({ pits: pits.slice(), hand: null, flash: [t.pit, storeOf(C.taker)], kind: 'collect' });
    }
  }
  return frames;
}

const STEP_MS = { slow: 520, normal: 330, fast: 160 };
const played = new Map(); // `${id}:${n}` -> { start } (replay timing survives re-renders) | 'done'
let playedFor = null;

// ----------------------------------------------------------------- render
export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const opts = ctx.options || {};
  const speed = STEP_MS[opts.anim] ? opts.anim : (opts.anim === 'off' ? 'off' : 'normal');
  if (playedFor !== state.id) { played.clear(); playedFor = state.id; }
  const key = `${state.id}:${state.n || 0}`;
  const frames = speed === 'off' || !state.last ? [] : replayFrames(state);
  const status0 = played.get(key);
  const animating = frames.length > 0 && status0 !== 'done';
  if (animating && !status0) played.set(key, { start: Date.now() });

  const mine = !state.over && viewer === state.turn;
  const legal = new Set(mine && !animating ? legalPits(state) : []);
  const pitEls = new Array(14);
  const pit = (i) => {
    const b = el('button', {
      type: 'button',
      class: `mg-pit ${legal.has(i) ? 'legal' : ''} ${!animating && state.last && state.last.to === i ? 'last' : ''} ${!animating && state.last && state.last.from === i ? 'from' : ''}`,
      disabled: !legal.has(i),
      'aria-label': `${i < 6 ? players[0] : players[1]} kuyusu ${(i < 6 ? i : i - 7) + 1}: ${state.pits[i]} taş`,
      onClick: () => sendMove({ type: 'sow', pit: i }),
    }, el('span', { class: 'mg-count' }, String(state.pits[i])), el('span', { class: 'mg-stones' }, '●'.repeat(Math.min(state.pits[i], 12))));
    pitEls[i] = b;
    return b;
  };
  const store = (p) => {
    const s = el('div', { class: `mg-store p${p}`, 'aria-label': `${players[p]} haznesi: ${state.pits[storeOf(p)]} taş` }, el('span', { class: 'mg-count' }, String(state.pits[storeOf(p)])), el('span', { class: 'muted' }, players[p]));
    pitEls[storeOf(p)] = s;
    return s;
  };
  const hand = el('div', { class: 'mg-hand', 'aria-hidden': 'true' });
  // top row: player 1's pits right-to-left (12..7) so that sowing runs counter-clockwise on screen
  const board = el('div', { class: `mg-board ${animating ? 'animating' : ''}` },
    store(1),
    el('div', { class: 'mg-rows' },
      el('div', { class: 'mg-row' }, [12, 11, 10, 9, 8, 7].map(pit)),
      el('div', { class: 'mg-row' }, [0, 1, 2, 3, 4, 5].map(pit)),
    ),
    store(0),
    hand,
  );
  let status;
  if (state.over) status = state.pits[6] === state.pits[13] ? 'Berabere!' : `${players[state.pits[6] > state.pits[13] ? 0 : 1]} kazandı!`;
  else if (mine) status = `Sıra sende, ${players[viewer]}: bir kuyu seç`;
  else status = `${players[state.turn]} düşünüyor…`;
  const C = state.collected;
  const endNote = state.over && C
    ? (C.taker === C.from ? `Kuyularda kalan ${C.count} taş sahibine (${players[C.taker]}) gitti.` : `Kuyuları ilk boşalan ${players[C.taker]}, ${nameSuffix(players[C.from], 'in')} kuyularında kalan ${C.count} taşı aldı.`)
    : '';
  const variant = state.variant === 'bantumi'
    ? ['Bantumi']
    : [state.firstStone === 'next' ? 'sonraki kuyudan başla' : null, state.leftovers === 'owner' ? 'kalan taşlar sahibine' : null].filter(Boolean);
  const lastText = state.last
    ? `${state.last.captured ? `${state.last.captured} taş alındı. ` : ''}${state.last.again && !state.over ? 'Son taş hazneye düştü: bir hamle daha. ' : ''}${endNote}`
    : `${players[0]} alt sıradaki kuyuları oynar, ${players[1]} üst sıradakileri.`;
  const statusEl = el('div', { class: 'status-line' }, el('strong', {}, status));
  const note = el('p', { class: 'hint' }, lastText);
  // the house rules stay visible all game (the guest never saw the host's settings form)
  const variantLine = variant.length ? el('p', { class: 'hint mg-variant' }, state.variant === 'bantumi' ? 'Oyun türü: Bantumi (Nokia).' : `Ev kuralı: ${variant.join(', ')}.`) : null;
  draw(container, statusEl, board, note, variantLine);
  if (!animating) return null;

  // ---- replay the last move, stone by stone
  const stepMs = STEP_MS[speed] || STEP_MS.normal;
  const startAt = played.get(key).start;
  const who = players[state.last.player];
  const timers = [];
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    timers.forEach((t) => clearTimeout(t));
    played.set(key, 'done');
    if (container.isConnected) render(state, viewer, container, sendMove, ctx);
  };
  const place = (at) => {
    const target = pitEls[at];
    if (!target || !board.isConnected) return;
    const b = board.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    // sit on the lower part of the pit so its count stays readable
    hand.style.left = `${r.left - b.left + r.width / 2}px`;
    hand.style.top = `${r.top - b.top + r.height * 0.78}px`;
  };
  const show = (f) => {
    for (let k = 0; k < 14; k++) {
      const e = pitEls[k];
      if (!e) continue;
      e.querySelector('.mg-count').textContent = String(f.pits[k]);
      const st = e.querySelector('.mg-stones');
      if (st) st.textContent = '●'.repeat(Math.min(f.pits[k], 12));
      e.classList.toggle('flash', f.flash.includes(k));
      e.classList.toggle('lifted', f.kind === 'lift' && k === state.last.from);
    }
    if (f.hand) {
      hand.textContent = String(f.hand.count);
      hand.classList.add('show');
      place(f.hand.at);
    } else hand.classList.remove('show');
    note.textContent = f.kind === 'lift' ? `${who} ${f.hand.count} taşı aldı…`
      : f.kind === 'drop' ? `${who} dağıtıyor… (elde ${f.hand ? f.hand.count : 0})`
        : f.kind === 'take' ? `${who} taşları alıyor…`
          : f.kind === 'collect' ? 'Kalan taşlar hazneye…' : note.textContent;
  };
  statusEl.replaceChildren(el('strong', {}, `${who} oynuyor…`), el('span', { class: 'muted mg-skip' }, ' (geçmek için dokun)'));
  board.addEventListener('click', finish);
  // frames already due (a re-render in the middle of the replay) are shown at once
  const elapsed = Date.now() - startAt;
  let due = Math.min(frames.length - 1, Math.max(0, Math.floor(elapsed / stepMs)));
  show(frames[due]);
  hand.classList.add('no-move'); // the first placement does not slide in from the corner
  place(frames[due].hand ? frames[due].hand.at : state.last.from);
  requestAnimationFrame(() => hand.classList.remove('no-move'));
  for (let k = due + 1; k < frames.length; k++) {
    timers.push(setTimeout(() => show(frames[k]), startAt + k * stepMs - Date.now()));
  }
  timers.push(setTimeout(finish, startAt + frames.length * stepMs + 150 - Date.now()));
  return () => { finished = true; timers.forEach((t) => clearTimeout(t)); };
}

export default { id: 'mangala', meta, setup, applyMove, render, getTurn, getResult };
