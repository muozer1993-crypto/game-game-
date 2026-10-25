// Bilardo — two-player pocket billiards in two flavours: "çok top sokan kazanır" (pocketing a
// ball scores a point and keeps the turn; more balls wins) and classic 8-ball (solids against
// stripes, fouls give the opponent ball in hand, the 8 last).
//
// The physics are deterministic (fixed time step, no trigonometry), so applyMove can run
// the whole shot on both devices and reach exactly the same final positions; render()
// re-runs the same simulation to animate it.
import { el, render as draw } from '../js/ui/dom.js';
import { playClick, playPocket } from '../js/lib/sfx.js';

export const meta = {
  group: 'masa',
  name: 'Bilardo',
  icon: '🎱',
  description: 'Istakayı geri çeker gibi nişan al ve vur. Çok top sokan kazanır ya da klasik 8 top: düzler çizgililere karşı, 8 numara en son.',
  rules: [
    'Istakayı geri çeker gibi nişan al: parmağını beyaz topun arkasına koy ve topu göndermek istediğin yönün tersine doğru çek. Top parmağının tersi yönüne gider; parmağını koyduğun yerden ne kadar geri çekersen o kadar sert vurur. Kesik çizgi topun yolunu, sarı çizgi değeceği topun gideceği yönü gösterir. Bırakınca vuruş yapılır; vazgeçmek için parmağını başladığın yere ya da beyaz topun üstüne geri getirip bırak.',
    'Çok top sokan kazanır: bir topu cebe sokan 1 puan alır ve bir daha vurur. Top girmezse ya da beyaz top cebe düşerse sıra rakibe geçer (beyaz top başlangıç noktasına konur). Masadaki bütün toplar bitince çok topu olan kazanır.',
    'Klasik 8 top: 1–7 düz, 9–15 çizgili toplar. Açılıştan sonra ilk top sokan oyuncu o topun grubunu alır, rakip öbür grubu. Kendi grubundan top sokan bir daha vurur. Beyaz top önce kendi grubundan bir topa değmeli (masa açıkken 8 dışında herhangi bir topa); değmezse, hiçbir topa değmezse ya da beyaz top cebe düşerse faul olur ve rakip beyaz topu istediği yere elle koyar.',
    'Grubunu bitiren 8 numarayı hedefler ve onu sokan kazanır. 8 numara grubun bitmeden girerse ya da 8\'i sokarken faul yaparsan kaybedersin. Açılışta 8 girerse yerine konur.',
  ].join('\n'),
  data: [],
  settings: [
    { key: 'mode', label: 'Oyun türü', type: 'select', default: 'sayi', options: [{ value: 'sayi', label: 'Çok top sokan kazanır' }, { value: '8top', label: 'Klasik 8 top' }] },
    { key: 'balls', label: 'Top sayısı', type: 'select', default: 9, options: [{ value: 9, label: '9 top (hızlı)' }, { value: 15, label: '15 top' }], help: 'Klasik 8 topta her zaman 15 top.' },
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
export const CANCEL_R = R * 1.6;   // finger on the ball: no direction, no shot
export const PULL_FULL = 80;       // pull back this far from where the finger went down for full power
export const MIN_POWER = 0.08;     // = a 6.4-unit pull: a tap or a small slip never shoots
const MIN_FULL_PULL = 32;          // even right at the screen edge, power never gets twitchier than this

function fail(msg) {
  throw new Error(msg);
}

// 8-ball rack: the 8 in the middle of the third row, a solid and a stripe in the back corners
const RACK8 = [[1], [9, 2], [10, 8, 3], [11, 7, 14, 4], [5, 13, 15, 6, 12]];
export const FOOT_SPOT = { x: W / 2, y: Math.round(H * 0.28) };

function rack(count, eightBall = false) {
  const balls = [{ id: 0, x: W / 2, y: H * 0.78, pocketed: false }];
  const apexY = FOOT_SPOT.y;
  const dy = R * 1.7320508 + 0.2; // sqrt(3) * R, slightly apart
  const rows = eightBall ? RACK8.map((r) => r.length) : count === 9 ? [1, 2, 3, 2, 1] : [1, 2, 3, 4, 5];
  let id = 1;
  rows.forEach((n, k) => {
    const y = apexY - k * dy;
    for (let j = 0; j < n; j++) {
      const x = W / 2 + (j - (n - 1) / 2) * (2 * R + 0.4);
      balls.push({ id: eightBall ? RACK8[k][j] : id++, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, pocketed: false });
    }
  });
  return balls.sort((a, b) => a.id - b.id);
}

/** 8-ball groups: 'duz' (1–7), 'cizgili' (9–15); the 8 is its own. */
export const groupOf = (id) => (id === 8 ? 'sekiz' : id < 8 ? 'duz' : 'cizgili');
export const GROUP_NAME = { duz: 'düz', cizgili: 'çizgili' };
const left = (balls, group) => balls.filter((b) => b.id && !b.pocketed && groupOf(b.id) === group).length;

/** The balls the shooter must hit first: their group, the 8 once it is cleared, anything but the 8 on an open table. */
export function targetsOf(state, player) {
  const g = state.groups && state.groups[player];
  if (!g) return state.balls.filter((b) => b.id && b.id !== 8 && !b.pocketed).map((b) => b.id);
  const mine = state.balls.filter((b) => b.id && !b.pocketed && groupOf(b.id) === g).map((b) => b.id);
  return mine.length ? mine : [8];
}

/** Can the cue ball be put down here (ball in hand)? On the cloth, clear of the pockets and the other balls. */
export function canPlaceCue(balls, x, y) {
  if (!(x >= R && x <= W - R && y >= R && y <= H - R)) return false;
  if (POCKETS.some(([px, py]) => (x - px) ** 2 + (y - py) ** 2 < (POCKET_R + R) ** 2)) return false;
  return balls.every((b) => b.id === 0 || b.pocketed || (b.x - x) ** 2 + (b.y - y) ** 2 >= (2 * R + 0.5) ** 2);
}

export function setup(options = {}) {
  const eight = options.mode === '8top';
  const count = eight || Number(options.balls) === 15 ? 15 : 9;
  return {
    mode: eight ? '8top' : 'sayi',
    count,
    balls: rack(count, eight),   // { id, x, y, pocketed }
    groups: [null, null],  // 8-ball: 'duz' | 'cizgili' per player once decided
    ballInHand: false,     // 8-ball: after a foul the shooter may put the cue ball anywhere
    winner: null,
    turn: (Number(options.seed) || 0) % 2,
    scores: [0, 0],
    shots: 0,
    last: null,            // { by, before: balls, shot, pocketed: [ids], scratch }
    over: false,
  };
}

/**
 * Deterministic shot simulation. Returns { balls, pocketed (in order), firstHit (id the cue ball touched
 * first, or null), frames, events } — with frames, `events` lists [step, 'hit' | 'pocket', strength] for sounds.
 */
export function simulate(balls0, shot, withFrames = false) {
  const balls = balls0.map((b) => ({ ...b, vx: 0, vy: 0 }));
  const cue = balls.find((b) => b.id === 0);
  cue.vx = shot.dx * shot.power * SPEED;
  cue.vy = shot.dy * shot.power * SPEED;
  const pocketed = [];
  const frames = [];
  let firstHit = null;
  const events = [];
  let step = 0;
  const inPocket = (b) => {
    for (const [px, py] of POCKETS) {
      const dx = b.x - px;
      const dy = b.y - py;
      if (dx * dx + dy * dy < POCKET_R * POCKET_R) return true;
    }
    return false;
  };
  const pocket = (b) => { b.pocketed = true; b.vx = 0; b.vy = 0; pocketed.push(b.id); if (withFrames) events.push([step, 'pocket', 1]); };
  for (step = 0; step < MAX_STEPS; step++) {
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
          if (dvn < 0 && firstHit === null && (a.id === 0 || b.id === 0)) firstHit = a.id === 0 ? b.id : a.id;
          if (dvn < 0 && withFrames) events.push([step, 'hit', Math.min(1, -dvn / 8)]);
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
  return { balls: out, pocketed, firstHit, frames, events };
}

/**
 * Pull-back aiming: the shot goes from the finger through the cue ball and onwards, i.e. away
 * from the finger. The power is how far the finger has been pulled back (away from the ball)
 * since it went down at `start`, so where you first touch does not matter and a slip does not
 * shoot. null = no direction (finger on the ball).
 */
export function aimFromPointer(cue, p, start = cue, full = PULL_FULL) {
  const dx = cue.x - p.x;
  const dy = cue.y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < CANCEL_R) return null;
  const d0 = Math.max(CANCEL_R, Math.hypot(cue.x - start.x, cue.y - start.y));
  return { dx: dx / d, dy: dy / d, power: Math.min(1, Math.max(0, (d - d0) / full)) };
}

/**
 * The pull that gives full power. Normally PULL_FULL, but when the ball is near the screen edge on
 * the finger's side (a ball on a side cushion, say) there is not that much room: then the room up to
 * the edge (`room`, in table units from the ball) is the full pull, so full power stays reachable.
 */
export function fullPull(room, d0) {
  return Math.max(MIN_FULL_PULL, Math.min(PULL_FULL, room - d0 - 2));
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
    if (c <= 0) { // already touching: hit at once if aiming into it, otherwise it is not in the way
      if (fd < 0 && best > 0) { best = 0; hit = b; }
      continue;
    }
    const disc = fd * fd - c;
    if (disc < 0) continue;
    const t = -fd - Math.sqrt(disc);
    if (t >= 0 && t < best) { best = t; hit = b; }
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
  if (state.mode === '8top') return applyEightBall(state, player, move, shot);
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

const summarize = (l) => (l ? { by: l.by, pocketed: l.pocketed, scratch: l.scratch, foul: l.foul || null, eight: l.eight || null, assigned: l.assigned || null } : null);

/** Put the 8 back on the foot spot (or the nearest free spot above or below it on the long line). */
function respotEight(balls) {
  const eight = balls.find((b) => b.id === 8);
  for (let k = 0; k < 60; k++) {
    const off = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (2 * R + 1);
    const y = FOOT_SPOT.y + off;
    if (y < R || y > H - R) continue;
    if (balls.every((b) => b.id === 8 || b.pocketed || (b.x - FOOT_SPOT.x) ** 2 + (b.y - y) ** 2 >= (2 * R + 0.5) ** 2)) {
      eight.x = FOOT_SPOT.x; eight.y = y; eight.pocketed = false;
      return;
    }
  }
}

function applyEightBall(state, player, move, shot) {
  const opp = 1 - player;
  let start = state.balls;
  if (move.cue != null) {
    if (!state.ballInHand) fail('Beyaz topu şimdi elle koyamazsın');
    const x = Number(move.cue.x);
    const y = Number(move.cue.y);
    if (!canPlaceCue(state.balls, x, y)) fail('Beyaz top oraya konamaz');
    start = state.balls.map((b) => (b.id === 0 ? { ...b, x, y, pocketed: false } : b));
  }
  const before = start.map((b) => ({ ...b }));
  const targets = targetsOf({ ...state, balls: start }, player);
  const onEight = targets.length === 1 && targets[0] === 8;
  const isBreak = state.shots === 0;
  const sim = simulate(start, shot, false);
  const balls = sim.balls;
  const scratch = sim.pocketed.includes(0);
  const wrong = sim.firstHit !== null && !isBreak && !targets.includes(sim.firstHit);
  const foul = scratch ? 'scratch' : sim.firstHit === null ? 'none' : wrong ? 'wrong' : null;
  const groups = state.groups.slice();
  let winner = null;
  let eight = null;
  const eightIn = sim.pocketed.includes(8);
  if (eightIn) {
    if (isBreak) { eight = 'break'; respotEight(balls); }
    else if (onEight && !foul) { eight = 'win'; winner = player; }
    else { eight = onEight ? 'foul' : 'early'; winner = opp; }
  }
  const objects = sim.pocketed.filter((id) => id !== 0 && id !== 8);
  let assigned = null;
  if (!groups[player] && !isBreak && !foul && objects.length) {
    groups[player] = groupOf(objects[0]);
    groups[opp] = groups[player] === 'duz' ? 'cizgili' : 'duz';
    assigned = groups[player];
  }
  const mine = groups[player] ? objects.filter((id) => groupOf(id) === groups[player]) : objects;
  const keepTurn = winner === null && !foul && mine.length > 0;
  if (scratch) respotCue(balls);
  const over = winner !== null;
  return {
    ...state,
    balls,
    groups,
    shots: state.shots + 1,
    turn: over || keepTurn ? player : opp,
    ballInHand: !over && !!foul,
    winner,
    over,
    last: { by: player, before, shot, pocketed: sim.pocketed.filter((id) => id !== 0), scratch, foul, eight, assigned, firstHit: sim.firstHit, prevGroups: state.groups.slice(), prevNote: summarize(state.last) },
  };
}

export function getTurn(state) {
  return state.over ? null : { player: state.turn, private: false };
}

export function getResult(state) {
  if (!state.over) return null;
  if (state.mode === '8top') return { winner: state.winner };
  const [a, b] = state.scores;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

// ----------------------------------------------------------------- render
const animated = new WeakSet(); // state.last objects whose animation already played on this device

function drawBall(c, b) {
  const col = COLORS[b.id] || '#999';
  c.save();
  c.beginPath();
  c.arc(b.x, b.y, R, 0, Math.PI * 2);
  if (b.id > 8) { // stripe: a white ball with a coloured band
    c.fillStyle = '#f7f7f2';
    c.fill();
    c.clip();
    c.fillStyle = col;
    c.fillRect(b.x - R, b.y - R * 0.55, 2 * R, R * 1.1);
  } else {
    c.fillStyle = col;
    c.fill();
  }
  c.restore();
  c.beginPath();
  c.arc(b.x, b.y, R, 0, Math.PI * 2);
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(0,0,0,0.5)';
  c.stroke();
  if (b.id > 0) {
    c.beginPath();
    c.arc(b.x, b.y, R * 0.48, 0, Math.PI * 2);
    c.fillStyle = '#fff';
    c.fill();
    c.fillStyle = '#111';
    c.font = 'bold 6px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(b.id), b.x, b.y + 0.4);
  }
}

/**
 * opts.targets: ids the shooter may hit first (8-ball) — a ghost ball on any other ball turns red;
 * opts.placing: { x, y, ok } while the cue ball is being put down by hand.
 */
function drawTable(ctxc, scale, balls, aim, opts = {}) {
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
  const contact = aim && !aim.cancel && aim.power >= MIN_POWER ? predictContact(balls, aim.x0, aim.y0, aim.dx, aim.dy) : null;
  const foulHit = !!(contact && contact.ball && opts.targets && !opts.targets.has(contact.ball.id));
  if (contact) drawAimPath(c, aim, contact);
  for (const b of balls) if (!b.pocketed) drawBall(c, b);
  if (opts.placing) {
    c.beginPath();
    c.arc(opts.placing.x, opts.placing.y, R + 3, 0, Math.PI * 2);
    c.strokeStyle = opts.placing.ok ? '#7bd88f' : '#ef5350';
    c.lineWidth = 2;
    c.setLineDash([3, 3]);
    c.stroke();
    c.setLineDash([]);
  }
  if (contact) drawContact(c, aim, contact, foulHit);
  if (aim && !aim.cancel) drawCue(c, aim);
  if (aim) drawPower(c, aim, contact);
  c.restore();
}

/** Power gauge in the end band of the table away from the action (or "pull back" while there is no shot yet). */
function drawPower(c, aim, contact) {
  const w = 96;
  const x = (W - w) / 2;
  // the top or the bottom band, whichever is further from the cue ball and the contact point
  const ys = [aim.y0, contact ? contact.y : aim.y0];
  const top = Math.min(...ys.map((v) => Math.abs(v - 20))) >= Math.min(...ys.map((v) => Math.abs(v - (H - 20))));
  const y = top ? 10 : H - 30;
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
    c.fillText(aim.cancel ? 'Parmağını topun arkasına çek' : 'Geri çek…', W / 2, y + 8);
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

/** Dashed path of the cue ball up to its first contact (drawn under the balls). */
function drawAimPath(c, aim, hit) {
  c.save();
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.lineWidth = 1.5;
  c.setLineDash([4, 4]);
  c.beginPath();
  c.moveTo(aim.x0 + aim.dx * R, aim.y0 + aim.dy * R);
  c.lineTo(hit.x, hit.y);
  c.stroke();
  c.restore();
}

/** Ghost ball at the contact and the direction the struck ball will take (drawn over the balls); red = a foul (not your ball). */
function drawContact(c, aim, hit, foulHit = false) {
  c.save();
  c.beginPath();
  c.arc(hit.x, hit.y, R, 0, Math.PI * 2);
  c.strokeStyle = foulHit ? '#ff5252' : 'rgba(255,255,255,0.8)';
  c.lineWidth = foulHit ? 2.5 : 1.5;
  c.stroke();
  if (hit.ball && !foulHit) {
    const nx = hit.ball.x - hit.x;
    const ny = hit.ball.y - hit.y;
    const n = Math.sqrt(nx * nx + ny * ny) || 1;
    const len = 18 + aim.power * 42;
    c.beginPath();
    c.moveTo(hit.ball.x, hit.ball.y);
    c.lineTo(hit.ball.x + (nx / n) * (R + len), hit.ball.y + (ny / n) * (R + len));
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.lineWidth = 3.5;
    c.lineCap = 'round';
    c.stroke();
    c.strokeStyle = '#ffeb3b';
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

// ball in hand (8-ball): where this device has put the cue ball for the coming shot
let hand = { key: null, x: 0, y: 0, placing: false };

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const mine = !state.over && viewer === state.turn;
  const eight = state.mode === '8top';
  const canvas = el('canvas', { class: 'pool-canvas', width: W * 2, height: H * 2, 'aria-label': 'Bilardo masası' });
  const c2d = canvas.getContext('2d');
  const scale = 2;
  let aim = null;
  let animating = false;
  let raf = null;
  let placingAt = null; // { x, y, ok } while the finger drags the cue ball
  const info = el('div', { class: 'status-line' });

  // ball in hand: this device keeps the chosen spot until the shot is sent
  const inHand = eight && mine && state.ballInHand;
  const handKey = `${state.shots}:${state.turn}`;
  if (inHand && hand.key !== handKey) {
    const q0 = state.balls.find((b) => b.id === 0);
    hand = { key: handKey, x: q0.x, y: q0.y, placing: true };
  }
  const restBalls = () => (inHand ? state.balls.map((b) => (b.id === 0 ? { ...b, x: hand.x, y: hand.y, pocketed: false } : b)) : state.balls);
  let balls = restBalls();
  const targets = eight && mine && state.shots > 0 ? new Set(targetsOf(state, viewer)) : null;

  const groupText = (q, groups, list) => {
    const g = groups[q];
    if (!g) return `${players[q]}: —`;
    const n = left(list, g);
    return n ? `${players[q]}: ${GROUP_NAME[g]} (${n})` : `${players[q]}: sıra 8'de`;
  };
  const setStatus = () => {
    let text;
    if (state.over) {
      if (eight) text = `${players[state.winner]} kazandı!`;
      else text = state.scores[0] === state.scores[1] ? 'Berabere!' : `${players[state.scores[0] > state.scores[1] ? 0 : 1]} daha çok top cepledi!`;
    } else if (animating) text = 'Toplar yuvarlanıyor…';
    else if (mine && inHand) text = `${players[viewer]}, beyaz top elinde: istediğin yere koy, sonra vur`;
    else if (mine && eight) {
      const t = targetsOf(state, viewer);
      const what = state.shots === 0 ? 'açılış vuruşu' : !state.groups[viewer] ? 'masa açık' : t[0] === 8 ? 'hedef 8 numara!' : `hedef ${GROUP_NAME[state.groups[viewer]]}`;
      text = `Sıra sende, ${players[viewer]}: ${what}`;
    } else if (mine) text = `Sıra sende, ${players[viewer]}: ıstakayı geri çeker gibi nişan al`;
    else text = `${players[state.turn]} vuruyor…`;
    draw(info, el('strong', {}, text));
  };
  const paint = () => {
    c2d.clearRect(0, 0, canvas.width, canvas.height);
    drawTable(c2d, scale, balls, aim, { targets: aim ? targets : null, placing: placingAt });
  };

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
      let ev = 0; // next sound event; frame k shows simulation step 2k
      const tick = () => {
        const f = frames[Math.min(k, frames.length - 1)];
        balls = f.map(([id, x, y, p]) => ({ id, x, y, pocketed: !!p }));
        paint();
        let loud = 0;
        let drop = false;
        while (ev < sim.events.length && sim.events[ev][0] <= 2 * k) {
          const [, kind, v] = sim.events[ev++];
          if (kind === 'pocket') drop = true; else loud = Math.max(loud, v);
        }
        if (loud) playClick(loud);
        if (drop) playPocket();
        k += 2;
        if (k < frames.length) raf = requestAnimationFrame(tick);
        else { animating = false; balls = restBalls(); paint(); setStatus(); drawHandBar(); }
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
  // room from the cue ball to the edge of the screen in the pull direction (-dx, -dy), in table units
  const roomBehind = (q, dx, dy) => {
    const rect = canvas.getBoundingClientRect();
    const unit = rect.width / W;
    const bx = rect.left + q.x * unit;
    const by = rect.top + q.y * unit;
    const ux = -dx;
    const uy = -dy;
    const tx = ux > 1e-6 ? (innerWidth - 1 - bx) / ux : ux < -1e-6 ? (bx - 1) / -ux : Infinity;
    const ty = uy > 1e-6 ? (innerHeight - 1 - by) / uy : uy < -1e-6 ? (by - 1) / -uy : Infinity;
    return Math.min(tx, ty) / unit;
  };
  const aimAt = (p) => {
    const q = cue();
    let a = aimFromPointer(q, p, start);
    if (a) {
      const d0 = Math.max(CANCEL_R, Math.hypot(q.x - start.x, q.y - start.y));
      a = aimFromPointer(q, p, start, fullPull(roomBehind(q, a.dx, a.dy), d0));
    }
    // while the finger is down the table shows the cue and the power (drawn on the canvas, so
    // nothing around the table changes size and moves under the finger)
    aim = a ? { x0: q.x, y0: q.y, ...a } : { cancel: true, x0: q.x, y0: q.y };
    paint();
  };
  // ball in hand: the cue ball follows the finger; it stays where it is put if the spot is free
  const placeAt = (p) => {
    const x = Math.round(Math.min(W - R, Math.max(R, p.x)) * 1000) / 1000;
    const y = Math.round(Math.min(H - R, Math.max(R, p.y)) * 1000) / 1000;
    placingAt = { x, y, ok: canPlaceCue(state.balls, x, y) };
    balls = state.balls.map((b) => (b.id === 0 ? { ...b, x, y, pocketed: false } : b));
    paint();
  };
  // the touch area reaches a little past the table, so a ball resting on a cushion can still be
  // grabbed from behind
  const pad = el('div', { class: 'pool-hit', 'aria-hidden': 'true' });
  const onDown = (e) => {
    if (!mine || animating || dragging) return;
    dragging = true;
    pointerId = e.pointerId;
    start = toTable(e);
    try { pad.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (inHand && hand.placing) placeAt(start); else aimAt(start);
  };
  const onMove = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    if (inHand && hand.placing) placeAt(toTable(e)); else aimAt(toTable(e));
  };
  const onCancel = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    aim = null;
    placingAt = null;
    balls = restBalls();
    paint();
  };
  const onUp = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    if (inHand && hand.placing) {
      // put the ball down where the finger left it (a blocked spot keeps the old one); then aim
      if (placingAt && placingAt.ok) { hand.x = placingAt.x; hand.y = placingAt.y; hand.placing = false; }
      placingAt = null;
      balls = restBalls();
      paint();
      drawHandBar();
      return;
    }
    // power is measured from where the finger went down, so a tap or a small slip stays below MIN_POWER
    if (aim && !aim.cancel && aim.power >= MIN_POWER) {
      const dx = Math.round(aim.dx * 10000) / 10000;
      const dy = Math.round(aim.dy * 10000) / 10000;
      const n = Math.sqrt(dx * dx + dy * dy) || 1;
      const move = { type: 'shot', dx: Math.round((dx / n) * 10000) / 10000, dy: Math.round((dy / n) * 10000) / 10000, power: Math.round(aim.power * 100) / 100 };
      if (inHand) move.cue = { x: hand.x, y: hand.y };
      sendMove(move);
    }
    aim = null;
    paint();
  };
  pad.addEventListener('pointerdown', onDown);
  pad.addEventListener('pointermove', onMove);
  pad.addEventListener('pointerup', onUp);
  pad.addEventListener('pointercancel', onCancel);

  // ball in hand: one button switches between putting the ball down and aiming (always the same height)
  const handBar = el('div', { class: 'pool-hand' });
  const drawHandBar = () => {
    if (!inHand) { handBar.replaceChildren(); return; }
    draw(handBar, hand.placing
      ? el('button', { type: 'button', class: 'btn btn-secondary btn-small', disabled: animating, onClick: () => { hand.placing = false; drawHandBar(); } }, 'Top burada kalsın, nişan al')
      : el('button', { type: 'button', class: 'btn btn-secondary btn-small', disabled: animating, onClick: () => { hand.placing = true; drawHandBar(); } }, 'Beyaz topu taşı'),
    el('span', { class: 'muted' }, hand.placing ? 'Beyaz topu parmağınla sürükle' : 'Topun yerini değiştirebilirsin'));
  };

  // while the shot is still rolling, show the numbers from before the shot (no spoilers)
  const FOUL = { scratch: 'beyaz top cebe düştü', wrong: 'beyaz top önce başka bir topa değdi', none: 'beyaz top hiçbir topa değmedi' };
  const noteOf = (l) => {
    if (!l) return 'Topun arkasından geri çek ve bırak: top ters yöne gider, çektikçe sertleşir.';
    const by = players[l.by];
    const other = players[1 - l.by];
    if (!eight) return `${by}: ${l.pocketed.length ? `${l.pocketed.length} top cepledi` : 'top giremedi'}${l.scratch ? ', beyaz top cebe düştü' : ''}.`;
    if (l.eight === 'win') return `${by} 8 numarayı soktu ve kazandı!`;
    if (l.eight === 'early') return `${by} 8 numarayı grubunu bitirmeden soktu: ${other} kazandı.`;
    if (l.eight === 'foul') return `${by} 8 numarayı sokarken faul yaptı (${FOUL[l.foul]}): ${other} kazandı.`;
    const n = l.pocketed.filter((id) => id !== 8).length;
    let t = `${by}: ${n ? `${n} top soktu` : 'top giremedi'}.`;
    if (l.eight === 'break') t += ' 8 numara açılışta girdi, yerine kondu.';
    if (l.assigned) t += ` ${by} ${GROUP_NAME[l.assigned]}, ${other} ${GROUP_NAME[l.assigned === 'duz' ? 'cizgili' : 'duz']} toplarla oynuyor.`;
    if (l.foul) t += ` Faul: ${FOUL[l.foul]}. ${other} beyaz topu elle yerleştirir.`;
    return t;
  };
  const legend = el('div', { class: 'c4-legend' });
  const lastNote = el('p', { class: 'hint' });
  const drawInfo = () => {
    const pre = animating && state.last;
    if (eight) {
      const list = pre ? state.last.before : state.balls;
      const groups = pre ? state.last.prevGroups : state.groups;
      draw(legend, el('span', {}, groupText(0, groups, list)), el('span', {}, groupText(1, groups, list)),
        groups[0] ? null : el('span', { class: 'muted' }, 'masa açık'));
    } else {
      const scores = pre ? state.last.prevScores : state.scores;
      const onTable = pre ? state.last.prevOnTable : state.balls.filter((b) => b.id && !b.pocketed).length;
      draw(legend, el('span', {}, `${players[0]}: ${scores[0]}`), el('span', {}, `${players[1]}: ${scores[1]}`), el('span', { class: 'muted' }, `Masada: ${onTable}`));
    }
    lastNote.textContent = pre ? noteOf(state.last.prevNote) : noteOf(state.last);
  };
  const refresh = () => { setStatus(); drawInfo(); drawHandBar(); };
  refresh();
  paint();
  // the oversized touch area only while it is this device's turn (it must not cover anything else)
  draw(container, info, legend, el('div', { class: 'pool-wrap' }, canvas, mine ? pad : null), handBar, lastNote);
  if (willAnimate) {
    // when the animation ends, the completion branch calls setStatus(); refresh the numbers too
    const check = () => { if (animating) { raf2 = requestAnimationFrame(check); } else drawInfo(); };
    let raf2 = requestAnimationFrame(check);
    return () => { if (raf) cancelAnimationFrame(raf); cancelAnimationFrame(raf2); };
  }
  return () => { if (raf) cancelAnimationFrame(raf); };
}

export default { id: 'bilardo', meta, setup, applyMove, render, getTurn, getResult };
