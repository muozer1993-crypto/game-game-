// Bilardo — a simple two-player pocket billiards game. Players shoot in turn; pocketing a
// ball scores a point and keeps the turn; the player with more balls at the end wins.
//
// The physics are deterministic (fixed time step, no trigonometry), so applyMove can run
// the whole shot on both devices and reach exactly the same final positions; render()
// re-runs the same simulation to animate it.
import { el, render as draw } from '../js/ui/dom.js';

export const meta = {
  group: 'masa',
  name: 'Bilardo',
  icon: '🎱',
  description: 'Istakayı geri çeker gibi nişan al ve vur; topu cebe sokan puan alır ve devam eder. Çok top ceplayan kazanır.',
  rules: [
    'Istakayı geri çeker gibi nişan al: parmağını beyaz topun arkasına koy ve topu göndermek istediğin yönün tersine doğru çek. Top parmağının tersi yönüne gider; ne kadar geri çekersen o kadar sert vurur. Kesik çizgi topun yolunu ve ilk değeceği topu gösterir. Bırakınca vuruş yapılır; vazgeçmek için parmağını beyaz topun üstüne geri getirip bırak.',
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
const COLORS = ['#ffffff', '#f4c20d', '#1e5bc6', '#d72c2c', '#5b2d90', '#f07b1f', '#1a7f37', '#8b1a1a', '#111111', '#f4c20d', '#1e5bc6', '#d72c2c', '#5b2d90', '#f07b1f', '#1a7f37', '#8b1a1a'];
const SUB = 4; // sub-steps per step so that a fast ball never skips over another ball
// pull-back aiming: the finger behind the cue ball is the cue; the ball goes the other way
export const CANCEL_R = R * 1.6;   // finger back on the ball: no shot
export const PULL_FULL = 100;      // pull this far beyond CANCEL_R for full power
export const MIN_POWER = 0.06;

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
  const inPocket = (b) => {
    for (const [px, py] of POCKETS) {
      const dx = b.x - px;
      const dy = b.y - py;
      if (dx * dx + dy * dy < POCKET_R * POCKET_R) return true;
    }
    return false;
  };
  const pocket = (b) => { b.pocketed = true; b.vx = 0; b.vy = 0; pocketed.push(b.id); };
  for (let step = 0; step < MAX_STEPS; step++) {
    let moving = false;
    for (let sub = 0; sub < SUB; sub++) {
      for (const b of balls) {
        if (b.pocketed || (b.vx === 0 && b.vy === 0)) continue;
        b.x += b.vx / SUB;
        b.y += b.vy / SUB;
        if (inPocket(b)) { pocket(b); continue; }
        if (b.x < R) { b.x = R; b.vx = -b.vx * CUSHION; }
        else if (b.x > W - R) { b.x = W - R; b.vx = -b.vx * CUSHION; }
        if (b.y < R) { b.y = R; b.vy = -b.vy * CUSHION; }
        else if (b.y > H - R) { b.y = H - R; b.vy = -b.vy * CUSHION; }
      }
      // ball-ball collisions (after every sub-move, so nothing tunnels through)
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
          }
        }
      }
    }
    // friction once per step; keep every ball on the table and check pockets for balls that were pushed
    for (const b of balls) {
      if (b.pocketed) continue;
      if (b.x < R) b.x = R; else if (b.x > W - R) b.x = W - R;
      if (b.y < R) b.y = R; else if (b.y > H - R) b.y = H - R;
      if (inPocket(b)) { pocket(b); continue; }
      if (b.vx === 0 && b.vy === 0) continue;
      b.vx *= FRICTION;
      b.vy *= FRICTION;
      if (b.vx * b.vx + b.vy * b.vy < STOP2) { b.vx = 0; b.vy = 0; }
      if (b.vx !== 0 || b.vy !== 0) moving = true;
    }
    if (withFrames && step % 2 === 0) frames.push(balls.map((b) => [b.id, b.x, b.y, b.pocketed ? 1 : 0]));
    if (!moving) break;
  }
  const out = balls.map(({ id, x, y, pocketed: p }) => ({ id, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, pocketed: p }));
  return { balls: out, pocketed, frames };
}

/**
 * Pull-back aiming: the shot goes from the finger through the cue ball and onwards, i.e. away
 * from the finger, and the further the finger is from the ball, the harder. null = cancelled
 * (finger back on the ball).
 */
export function aimFromPointer(cue, p) {
  const dx = cue.x - p.x;
  const dy = cue.y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < CANCEL_R) return null;
  return { dx: dx / d, dy: dy / d, power: Math.min(1, (d - CANCEL_R) / PULL_FULL) };
}

/**
 * Where the cue ball, rolling from (x0, y0) along the unit vector (dx, dy), first touches
 * another ball or a cushion: { x, y } is the cue ball's centre at that moment, `ball` the
 * ball it hits (or null for a cushion).
 */
export function predictContact(balls, x0, y0, dx, dy) {
  let best = Infinity;
  let hit = null;
  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    const fx = x0 - b.x;
    const fy = y0 - b.y;
    const fd = fx * dx + fy * dy;
    const c = fx * fx + fy * fy - 4 * R * R;
    if (c <= 0) continue; // already touching
    const disc = fd * fd - c;
    if (disc < 0) continue;
    const t = -fd - Math.sqrt(disc);
    if (t > 0 && t < best) { best = t; hit = b; }
  }
  const tx = dx > 0 ? (W - R - x0) / dx : dx < 0 ? (R - x0) / dx : Infinity;
  const ty = dy > 0 ? (H - R - y0) / dy : dy < 0 ? (R - y0) / dy : Infinity;
  const tc = Math.max(0, Math.min(tx, ty));
  if (tc < best) { best = tc; hit = null; }
  return { x: x0 + dx * best, y: y0 + dy * best, ball: hit };
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
    last: { by: player, before, shot, pocketed: objectPocketed, scratch, prevScores: state.scores.slice(), prevOnTable: state.balls.filter((b) => b.id && !b.pocketed).length, prevNote: state.last ? { by: state.last.by, pocketed: state.last.pocketed, scratch: state.last.scratch } : null },
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
const animated = new WeakSet(); // state.last objects whose animation already played on this device

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
  if (aim && !aim.cancel) drawAimPath(c, balls, aim);
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
  if (aim && !aim.cancel) drawCue(c, aim);
  if (aim) drawPower(c, aim);
  c.restore();
}

/** Power gauge at the top of the table while aiming (or "no shot" with the finger on the ball). */
function drawPower(c, aim) {
  const w = 96;
  const x = (W - w) / 2;
  const y = 10;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.beginPath();
  c.roundRect ? c.roundRect(x - 4, y - 4, w + 8, 24, 6) : c.rect(x - 4, y - 4, w + 8, 24);
  c.fill();
  c.font = 'bold 8px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (aim.cancel || aim.power < MIN_POWER) {
    c.fillStyle = '#fff';
    c.fillText(aim.cancel ? 'Vuruş yok (geri çek)' : 'Biraz daha geri çek', W / 2, y + 8);
  } else {
    c.fillStyle = 'rgba(255,255,255,0.2)';
    c.fillRect(x, y + 10, w, 5);
    c.fillStyle = aim.power < 0.5 ? '#7bd88f' : aim.power < 0.8 ? '#f4c20d' : '#ef5350';
    c.fillRect(x, y + 10, w * aim.power, 5);
    c.fillStyle = '#fff';
    c.fillText(`Güç %${Math.round(aim.power * 100)}`, W / 2, y + 3);
  }
  c.restore();
}

/** Dashed path of the cue ball up to its first contact, a ghost ball there and the struck ball's direction. */
function drawAimPath(c, balls, aim) {
  const hit = predictContact(balls, aim.x0, aim.y0, aim.dx, aim.dy);
  c.save();
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.lineWidth = 1.5;
  c.setLineDash([4, 4]);
  c.beginPath();
  c.moveTo(aim.x0 + aim.dx * R, aim.y0 + aim.dy * R);
  c.lineTo(hit.x, hit.y);
  c.stroke();
  c.setLineDash([]);
  c.beginPath();
  c.arc(hit.x, hit.y, R, 0, Math.PI * 2);
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.stroke();
  if (hit.ball) {
    const nx = hit.ball.x - hit.x;
    const ny = hit.ball.y - hit.y;
    const n = Math.sqrt(nx * nx + ny * ny) || 1;
    const len = 18 + aim.power * 42;
    c.beginPath();
    c.moveTo(hit.ball.x + (nx / n) * R, hit.ball.y + (ny / n) * R);
    c.lineTo(hit.ball.x + (nx / n) * (R + len), hit.ball.y + (ny / n) * (R + len));
    c.strokeStyle = 'rgba(255,235,59,0.9)';
    c.lineWidth = 2;
    c.stroke();
  }
  c.restore();
}

/** The cue stick behind the ball, drawn back further the harder the shot. */
function drawCue(c, aim) {
  const back = R + 3 + aim.power * 30;
  const tipX = aim.x0 - aim.dx * back;
  const tipY = aim.y0 - aim.dy * back;
  const buttX = tipX - aim.dx * 160;
  const buttY = tipY - aim.dy * 160;
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(0,0,0,0.35)'; // shadow
  c.lineWidth = 5;
  c.beginPath(); c.moveTo(tipX + 1.5, tipY + 2); c.lineTo(buttX + 1.5, buttY + 2); c.stroke();
  const g = c.createLinearGradient(tipX, tipY, buttX, buttY);
  g.addColorStop(0, '#f3e2c0');
  g.addColorStop(0.55, '#c8955a');
  g.addColorStop(0.56, '#3b2414');
  g.addColorStop(1, '#2a180c');
  c.strokeStyle = g;
  c.lineWidth = 4;
  c.beginPath(); c.moveTo(tipX, tipY); c.lineTo(buttX, buttY); c.stroke();
  c.strokeStyle = '#3d7bd9'; // chalked tip
  c.lineWidth = 4;
  c.beginPath(); c.moveTo(tipX, tipY); c.lineTo(tipX - aim.dx * 2.5, tipY - aim.dy * 2.5); c.stroke();
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
    else if (mine) text = `Sıra sende, ${players[viewer]}: ıstakayı geri çeker gibi nişan al`;
    else text = `${players[state.turn]} vuruyor…`;
    draw(info, el('strong', {}, text));
  };
  const paint = () => { c2d.clearRect(0, 0, canvas.width, canvas.height); drawTable(c2d, scale, balls, aim); };

  // animate the last shot once (both on the shooter's and the other device)
  const willAnimate = state.last && !animated.has(state.last);
  if (willAnimate) {
    animated.add(state.last);
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

  // aiming: pull back like a cue — the ball goes from the finger through the cue ball, away from the finger
  const cue = () => balls.find((b) => b.id === 0);
  const toTable = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H };
  };
  let dragging = false;
  let pointerId = null;
  let start = null;
  let moved = false;
  const aimAt = (p) => {
    const q = cue();
    const a = aimFromPointer(q, p);
    // while the finger is down the table shows the cue and the power (drawn on the canvas, so
    // nothing around the table changes size and moves under the finger)
    aim = a ? { x0: q.x, y0: q.y, ...a } : { cancel: true };
    paint();
  };
  const onDown = (e) => {
    if (!mine || animating || dragging) return;
    dragging = true;
    pointerId = e.pointerId;
    start = toTable(e);
    moved = false;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    aimAt(start);
  };
  const onMove = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    const p = toTable(e);
    // a plain tap must not shoot: require a real drag first
    if (!moved) {
      const mx = p.x - start.x;
      const my = p.y - start.y;
      if (mx * mx + my * my >= 36) moved = true;
    }
    aimAt(p);
  };
  const onCancel = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    aim = null;
    paint();
  };
  const onUp = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    if (moved && aim && !aim.cancel && aim.power >= MIN_POWER) {
      const dx = Math.round(aim.dx * 10000) / 10000;
      const dy = Math.round(aim.dy * 10000) / 10000;
      const n = Math.sqrt(dx * dx + dy * dy) || 1;
      sendMove({ type: 'shot', dx: Math.round((dx / n) * 10000) / 10000, dy: Math.round((dy / n) * 10000) / 10000, power: Math.max(0.01, Math.round(aim.power * 100) / 100) });
    }
    aim = null;
    paint();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);

  // while the shot is still rolling, show the numbers from before the shot (no spoilers)
  const noteOf = (l) => (l ? `${players[l.by]}: ${l.pocketed.length ? `${l.pocketed.length} top cepledi` : 'top giremedi'}${l.scratch ? ', beyaz top cebe düştü' : ''}.` : 'Parmağını beyaz topun arkasına koy, geri çek ve bırak: top parmağının tersi yönüne gider; ne kadar çekersen o kadar sert.');
  const legend = el('div', { class: 'c4-legend' });
  const lastNote = el('p', { class: 'hint' });
  const drawInfo = () => {
    const pre = animating && state.last;
    const scores = pre ? state.last.prevScores : state.scores;
    const onTable = pre ? state.last.prevOnTable : state.balls.filter((b) => b.id && !b.pocketed).length;
    draw(legend, el('span', {}, `${players[0]}: ${scores[0]}`), el('span', {}, `${players[1]}: ${scores[1]}`), el('span', { class: 'muted' }, `Masada: ${onTable}`));
    lastNote.textContent = pre ? noteOf(state.last.prevNote) : noteOf(state.last);
  };
  const baseSetStatus = setStatus;
  const refresh = () => { baseSetStatus(); drawInfo(); };
  refresh();
  paint();
  draw(container, info, legend, el('div', { class: 'pool-wrap' }, canvas), lastNote);
  if (willAnimate) {
    // when the animation ends, the completion branch calls setStatus(); refresh the numbers too
    const check = () => { if (animating) { raf2 = requestAnimationFrame(check); } else drawInfo(); };
    let raf2 = requestAnimationFrame(check);
    return () => { if (raf) cancelAnimationFrame(raf); cancelAnimationFrame(raf2); };
  }
  return () => { if (raf) cancelAnimationFrame(raf); };
}

export default { id: 'bilardo', meta, setup, applyMove, render, getTurn, getResult };
