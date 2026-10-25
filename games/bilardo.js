// Bilardo — a simple two-player pocket billiards game. Players shoot in turn; pocketing a
// ball scores a point and keeps the turn; the player with more balls at the end wins.
//
// The physics are deterministic (fixed time step, no trigonometry), so applyMove can run
// the whole shot on both devices and reach exactly the same final positions; render()
// re-runs the same simulation to animate it.
import { el, render as draw } from '../js/ui/dom.js';

export const meta = {
  name: 'Bilardo',
  icon: '🎱',
  description: 'Sırayla vur; topu cebe sokan puan alır ve devam eder. Çok top ceplayan kazanır.',
  rules: [
    'Beyaz topu sürükleyerek nişan al: parmağını beyaz topun üstünden istediğin yöne doğru çek; çizgi yönü, uzunluk gücü gösterir. Bırakınca vuruş yapılır.',
    'Bir topu cebe sokan 1 puan alır ve bir daha vurur. Top girmezse ya da beyaz top cebe düşerse sıra rakibe geçer (beyaz top başlangıç noktasına konur).',
    'Masadaki bütün toplar bitince çok topu olan kazanır.',
  ].join('\n'),
  data: [],
  settings: [
    { key: 'balls', label: 'Top sayısı', type: 'select', default: 9, options: [{ value: 9, label: '9 top (hızlı)' }, { value: 15, label: '15 top' }] },
  ],
};

export const W = 200;
export const H = 400;
export const R = 8;
const POCKET_R = 16;
const POCKETS = [[0, 0], [W, 0], [0, H / 2], [W, H / 2], [0, H], [W, H]];
const FRICTION = 0.991;
const CUSHION = 0.75;
const RESTITUTION = 0.96;
const STOP2 = 0.03 * 0.03;
const SPEED = 15;
const MAX_STEPS = 4000;
const COLORS = ['#ffffff', '#f4c20d', '#1e5bc6', '#d72c2c', '#5b2d90', '#f07b1f', '#1a7f37', '#8b1a1a', '#111111', '#f4c20d', '#1e5bc6', '#d72c2c', '#5b2d90', '#f07b1f', '#1a7f37'];

function fail(msg) {
  throw new Error(msg);
}

function rack(count) {
  const balls = [{ id: 0, x: W / 2, y: H * 0.78, pocketed: false }];
  const apexY = H * 0.28;
  const dy = R * 1.7320508 + 0.2; // sqrt(3) * R, slightly apart
  const rows = count === 9 ? [1, 2, 3, 2, 1] : [1, 2, 3, 4, 5];
  let id = 1;
  rows.forEach((n, k) => {
    const y = apexY - k * dy;
    for (let j = 0; j < n; j++) {
      const x = W / 2 + (j - (n - 1) / 2) * (2 * R + 0.4);
      balls.push({ id: id++, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, pocketed: false });
    }
  });
  return balls;
}

export function setup(options = {}) {
  const count = Number(options.balls) === 15 ? 15 : 9;
  return {
    count,
    balls: rack(count),   // { id, x, y, pocketed }
    turn: (Number(options.seed) || 0) % 2,
    scores: [0, 0],
    shots: 0,
    last: null,            // { by, before: balls, shot, pocketed: [ids], scratch }
    over: false,
  };
}

/** Deterministic shot simulation. Returns { balls, pocketed, frames }. */
export function simulate(balls0, shot, withFrames = false) {
  const balls = balls0.map((b) => ({ ...b, vx: 0, vy: 0 }));
  const cue = balls.find((b) => b.id === 0);
  cue.vx = shot.dx * shot.power * SPEED;
  cue.vy = shot.dy * shot.power * SPEED;
  const pocketed = [];
  const frames = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    let moving = false;
    for (const b of balls) {
      if (b.pocketed) continue;
      if (b.vx === 0 && b.vy === 0) continue;
      b.x += b.vx;
      b.y += b.vy;
      b.vx *= FRICTION;
      b.vy *= FRICTION;
      if (b.vx * b.vx + b.vy * b.vy < STOP2) { b.vx = 0; b.vy = 0; }
      let inPocket = false;
      for (const [px, py] of POCKETS) {
        const dx = b.x - px;
        const dy = b.y - py;
        if (dx * dx + dy * dy < POCKET_R * POCKET_R) { inPocket = true; break; }
      }
      if (inPocket) { b.pocketed = true; b.vx = 0; b.vy = 0; pocketed.push(b.id); continue; }
      if (b.x < R) { b.x = R; b.vx = -b.vx * CUSHION; }
      else if (b.x > W - R) { b.x = W - R; b.vx = -b.vx * CUSHION; }
      if (b.y < R) { b.y = R; b.vy = -b.vy * CUSHION; }
      else if (b.y > H - R) { b.y = H - R; b.vy = -b.vy * CUSHION; }
      if (b.vx !== 0 || b.vy !== 0) moving = true;
    }
    // ball-ball collisions
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.pocketed) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.pocketed) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        const dist = Math.sqrt(d2);
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = 2 * R - dist;
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2; b.y += ny * overlap / 2;
        const dvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (dvn < 0) {
          const jn = -(1 + RESTITUTION) * dvn / 2;
          a.vx -= jn * nx; a.vy -= jn * ny;
          b.vx += jn * nx; b.vy += jn * ny;
          moving = true;
        }
      }
    }
    if (withFrames && step % 2 === 0) frames.push(balls.map((b) => [b.id, b.x, b.y, b.pocketed ? 1 : 0]));
    if (!moving) break;
  }
  const out = balls.map(({ id, x, y, pocketed: p }) => ({ id, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, pocketed: p }));
  return { balls: out, pocketed, frames };
}

function respotCue(balls) {
  const cue = balls.find((b) => b.id === 0);
  let y = H * 0.78;
  for (let tries = 0; tries < 40; tries++) {
    const free = balls.every((b) => b.id === 0 || b.pocketed || (b.x - W / 2) ** 2 + (b.y - y) ** 2 > (2 * R + 1) ** 2);
    if (free) break;
    y -= 2 * R + 2;
    if (y < R) y = H - R;
  }
  cue.x = W / 2;
  cue.y = Math.round(y * 1000) / 1000;
  cue.pocketed = false;
}

export function applyMove(state, player, move) {
  if (!move || move.type !== 'shot') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  if (player !== state.turn) fail('Sıra sende değil');
  const dx = Number(move.dx);
  const dy = Number(move.dy);
  const power = Number(move.power);
  if (![dx, dy, power].every(Number.isFinite) || power <= 0 || power > 1) fail('Geçersiz vuruş');
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.9 || len2 > 1.1) fail('Geçersiz yön');
  const shot = { dx, dy, power };
  const before = state.balls.map((b) => ({ ...b }));
  const sim = simulate(state.balls, shot, false);
  const balls = sim.balls;
  const objectPocketed = sim.pocketed.filter((id) => id !== 0);
  const scratch = sim.pocketed.includes(0);
  if (scratch) respotCue(balls);
  const scores = state.scores.slice();
  scores[player] += objectPocketed.length;
  const keepTurn = objectPocketed.length > 0 && !scratch;
  const over = balls.every((b) => b.id === 0 || b.pocketed);
  return {
    ...state,
    balls,
    scores,
    shots: state.shots + 1,
    turn: keepTurn || over ? state.turn : 1 - player,
    last: { by: player, before, shot, pocketed: objectPocketed, scratch },
    over,
  };
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

// ----------------------------------------------------------------- render
let animatedShots = -1;

function drawTable(ctxc, scale, balls, aim) {
  const c = ctxc;
  c.save();
  c.scale(scale, scale);
  c.fillStyle = '#1b6b3a';
  c.fillRect(0, 0, W, H);
  c.strokeStyle = '#7a4a1e';
  c.lineWidth = 6;
  c.strokeRect(0, 0, W, H);
  for (const [px, py] of POCKETS) {
    c.beginPath();
    c.arc(px, py, POCKET_R - 2, 0, Math.PI * 2);
    c.fillStyle = '#111';
    c.fill();
  }
  if (aim) {
    c.beginPath();
    c.moveTo(aim.x0, aim.y0);
    c.lineTo(aim.x0 + aim.dx * (30 + aim.power * 120), aim.y0 + aim.dy * (30 + aim.power * 120));
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 2;
    c.setLineDash([4, 4]);
    c.stroke();
    c.setLineDash([]);
  }
  for (const b of balls) {
    if (b.pocketed) continue;
    c.beginPath();
    c.arc(b.x, b.y, R, 0, Math.PI * 2);
    c.fillStyle = COLORS[b.id] || '#999';
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.stroke();
    if (b.id > 8) { // striped look: inner ring
      c.beginPath();
      c.arc(b.x, b.y, R * 0.55, 0, Math.PI * 2);
      c.fillStyle = '#fff';
      c.fill();
    }
    if (b.id > 0) {
      c.fillStyle = b.id > 8 ? '#222' : '#fff';
      c.font = 'bold 7px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(b.id), b.x, b.y + 0.5);
    }
  }
  c.restore();
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const mine = !state.over && viewer === state.turn;
  const canvas = el('canvas', { class: 'pool-canvas', width: W * 2, height: H * 2, 'aria-label': 'Bilardo masası' });
  const c2d = canvas.getContext('2d');
  const scale = 2;
  let balls = state.balls;
  let aim = null;
  let animating = false;
  let raf = null;
  const info = el('div', { class: 'status-line' });

  const setStatus = () => {
    let text;
    if (state.over) text = state.scores[0] === state.scores[1] ? 'Berabere!' : `${players[state.scores[0] > state.scores[1] ? 0 : 1]} daha çok top cepledi!`;
    else if (animating) text = 'Toplar yuvarlanıyor…';
    else if (mine) text = `Sıra sende, ${players[viewer]}: beyaz topu çekerek nişan al`;
    else text = `${players[state.turn]} vuruyor…`;
    draw(info, el('strong', {}, text));
  };
  const paint = () => { c2d.clearRect(0, 0, canvas.width, canvas.height); drawTable(c2d, scale, balls, aim); };

  // animate the last shot once (both on the shooter's and the other device)
  if (state.last && animatedShots !== state.shots) {
    animatedShots = state.shots;
    const sim = simulate(state.last.before, state.last.shot, true);
    const frames = sim.frames;
    if (frames.length) {
      animating = true;
      balls = state.last.before.map((b) => ({ ...b }));
      let k = 0;
      const tick = () => {
        const f = frames[Math.min(k, frames.length - 1)];
        balls = f.map(([id, x, y, p]) => ({ id, x, y, pocketed: !!p }));
        paint();
        k += 2;
        if (k < frames.length) raf = requestAnimationFrame(tick);
        else { animating = false; balls = state.balls; paint(); setStatus(); }
      };
      raf = requestAnimationFrame(tick);
    }
  }

  // aiming: drag anywhere; the direction is from the cue ball towards the pointer
  const cue = () => balls.find((b) => b.id === 0);
  const toTable = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H };
  };
  let dragging = false;
  const onDown = (e) => { if (!mine || animating) return; dragging = true; canvas.setPointerCapture(e.pointerId); onMove(e); };
  const onMove = (e) => {
    if (!dragging) return;
    const p = toTable(e);
    const q = cue();
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 2) { aim = null; paint(); return; }
    const power = Math.min(1, Math.max(0.08, d / 140));
    aim = { x0: q.x, y0: q.y, dx: dx / d, dy: dy / d, power };
    paint();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    if (aim && aim.power > 0.08) {
      const dx = Math.round(aim.dx * 10000) / 10000;
      const dy = Math.round(aim.dy * 10000) / 10000;
      const n = Math.sqrt(dx * dx + dy * dy) || 1;
      sendMove({ type: 'shot', dx: Math.round((dx / n) * 10000) / 10000, dy: Math.round((dy / n) * 10000) / 10000, power: Math.round(aim.power * 100) / 100 });
    }
    aim = null;
    paint();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const lastNote = state.last
    ? el('p', { class: 'hint' }, `${players[state.last.by]}: ${state.last.pocketed.length ? `${state.last.pocketed.length} top cepledi` : 'top giremedi'}${state.last.scratch ? ', beyaz top cebe düştü' : ''}.`)
    : el('p', { class: 'hint' }, 'Parmağını beyaz toptan vurmak istediğin yöne sürükle; uzaklık gücü belirler.');
  setStatus();
  paint();
  draw(container,
    info,
    el('div', { class: 'c4-legend' },
      el('span', {}, `${players[0]}: ${state.scores[0]}`),
      el('span', {}, `${players[1]}: ${state.scores[1]}`),
      el('span', { class: 'muted' }, `Masada: ${state.balls.filter((b) => b.id && !b.pocketed).length}`),
    ),
    el('div', { class: 'pool-wrap' }, canvas),
    lastNote,
  );
  return () => { if (raf) cancelAnimationFrame(raf); };
}

export default { id: 'bilardo', meta, setup, applyMove, render, getTurn, getResult };
