// Pieces painted on <canvas>. Phone browsers' forced dark modes (Chrome "Darken websites", Samsung
// Internet's dark mode) recolour CSS backgrounds, SVG fills and small images: white stones turned dark
// and yellow discs brown. They never touch canvas pixels, so colours drawn here stay true in every mode.
import { el } from './dom.js';

const SIZE = 96;

export const PIECE = {
  black: '#151515',
  white: '#f7f7f7',
  red: '#e53935',
  yellow: '#fdd835',
  blue: '#3b6ef6',
};

/**
 * A round piece as a canvas that fills its parent (CSS sizes it).
 * opts: rim (outline colour or null), mark (a short text/glyph drawn in the middle), markColor,
 * cls (extra class), size (internal pixels).
 */
export function discCanvas(fill, opts = {}) {
  const size = opts.size || SIZE;
  const c = el('canvas', { class: `piece-canvas ${opts.cls || ''}`.trim(), width: size, height: size, 'aria-hidden': 'true' });
  const g = c.getContext && c.getContext('2d');
  if (!g) return c;
  const lw = Math.max(2, size * 0.04);
  drawDisc(g, size / 2, size / 2, size / 2 - lw / 2 - 0.5, fill, { ...opts, lineWidth: lw });
  if (opts.mark) {
    g.fillStyle = opts.markColor || (isLight(fill) ? '#222' : '#fff');
    g.font = `700 ${Math.round(size * (String(opts.mark).length > 1 ? 0.42 : 0.52))}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(opts.mark), size / 2, size / 2 + size * 0.03);
  }
  return c;
}

/** Paint one shaded disc on a 2D context (used for whole boards too, e.g. Go). */
export function drawDisc(g, cx, cy, radius, fill, opts = {}) {
  const light = isLight(fill);
  const rim = opts.rim === undefined ? (light ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.55)') : opts.rim;
  g.save();
  if (opts.alpha != null) g.globalAlpha = opts.alpha;
  g.beginPath();
  g.arc(cx, cy, radius, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  // a soft highlight, top left, for a little depth
  const shine = g.createRadialGradient(cx - radius * 0.35, cy - radius * 0.45, radius * 0.04, cx, cy, radius);
  shine.addColorStop(0, light ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)');
  shine.addColorStop(0.6, 'rgba(255,255,255,0)');
  g.fillStyle = shine;
  g.fill();
  if (rim) {
    g.lineWidth = opts.lineWidth || Math.max(1, radius * 0.08);
    g.strokeStyle = rim;
    g.stroke();
  }
  g.restore();
}

/** A canvas filled with one colour (a board square, a panel): forced dark modes cannot repaint it. */
export function fillCanvas(color, cls = 'fill-canvas') {
  const c = el('canvas', { class: cls, width: 4, height: 4, 'aria-hidden': 'true' });
  const g = c.getContext && c.getContext('2d');
  if (g) {
    g.fillStyle = color;
    g.fillRect(0, 0, 4, 4);
  }
  return c;
}

/**
 * A plain canvas to sit behind an SVG board, painted in the page background colour. Forced dark modes
 * darken the page but not this, so the board's dark lines and dots stay visible on it. It follows the
 * phone switching between light and dark while a game is open (the "auto" theme).
 */
export function backdrop(varName = '--bg') {
  const c = el('canvas', { class: 'board-backdrop', width: 4, height: 4, 'aria-hidden': 'true' });
  const g = c.getContext && c.getContext('2d');
  if (!g) return c;
  const paint = () => {
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#ffffff';
    g.fillRect(0, 0, 4, 4);
  };
  paint();
  if (typeof matchMedia === 'function') {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (!c.isConnected) { mq.removeEventListener('change', onChange); return; }
      paint();
    };
    mq.addEventListener('change', onChange);
  }
  return c;
}

/** A tavla point: a triangle on canvas, pointing down (top row) or up (bottom row). */
export function triangleCanvas(color, pointDown, cls = 'tri-canvas') {
  const w = 40;
  const h = 120;
  const c = el('canvas', { class: cls, width: w, height: h, 'aria-hidden': 'true' });
  const g = c.getContext && c.getContext('2d');
  if (!g) return c;
  g.beginPath();
  if (pointDown) { g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w / 2, h); } else { g.moveTo(w / 2, 0); g.lineTo(w, h); g.lineTo(0, h); }
  g.closePath();
  g.fillStyle = color;
  g.fill();
  return c;
}

/** Small legend dot (the colour key next to a player's name). */
export const keyDot = (fill) => discCanvas(fill, { cls: 'key-dot', size: 32 });

function isLight(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160;
}
