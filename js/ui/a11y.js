// Screen readers and the keyboard: every move redraws the game box, which would drop the focus to the
// page and say nothing about whose turn it is now. These helpers say the new turn line in a live
// region and put the focus back on the same cell or key after a redraw.

let region = null;
let lastSaid = '';

/** The visually hidden live region (made once; empty until the first message). */
export function liveRegion() {
  if (typeof document === 'undefined') return null;
  if (!region || !region.isConnected) {
    region = document.getElementById('sr-status');
    if (!region) {
      region = document.createElement('div');
      region.id = 'sr-status';
      region.className = 'sr-only';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'true');
      document.body.append(region);
    }
  }
  return region;
}

/**
 * Say a line once. A line that differs only in its numbers (a countdown, a score) is not said again,
 * so a clock in the turn line does not talk every second.
 */
export function announce(text) {
  const r = liveRegion();
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  if (!r || !line) return;
  const shape = line.replace(/\d+/g, '#');
  if (shape === lastSaid) return;
  lastSaid = shape;
  r.textContent = line;
}

/** What has the focus in the box, in words that survive a redraw: its tag, first class and name. */
export function focusMark(container) {
  if (typeof document === 'undefined' || !container || typeof container.contains !== 'function') return null;
  const a = document.activeElement;
  if (!a || a === document.body || !container.contains(a)) return null;
  if (a.matches('input, textarea, select')) return null; // a field keeps its own focus
  return {
    tag: a.tagName,
    cls: a.classList[0] || '',
    key: a.dataset ? a.dataset.key : undefined,
    name: nameOf(a),
  };
}

// "e2, beyaz piyon, seçili" and "e2" are the same cell: the part before the first comma names it
const nameOf = (node) => String(node.getAttribute('aria-label') || node.textContent || '').split(',')[0].trim();

const usable = (node) => !node.disabled && node.getAttribute('aria-disabled') !== 'true' && !node.closest('[aria-hidden="true"]')
  && (node.tabIndex >= 0 || node.matches('button, a[href]')) && node.getClientRects().length > 0;

/**
 * After a redraw: the focus goes back to the same cell or key. If it is gone (a played card), the turn
 * line takes it, so the keyboard carries on from there and a screen reader reads it.
 */
export function restoreFocus(container, mark) {
  if (!mark || typeof document === 'undefined' || !container || typeof container.querySelectorAll !== 'function') return;
  const a = document.activeElement;
  if (a && a !== document.body) return; // the game (or the player) put it somewhere already
  let target = null;
  for (const node of container.querySelectorAll(mark.tag.toLowerCase())) {
    if ((node.classList[0] || '') !== mark.cls) continue;
    if (mark.key !== undefined ? node.dataset.key !== mark.key : nameOf(node) !== mark.name) continue;
    if (usable(node)) { target = node; break; }
  }
  if (!target) {
    target = container.querySelector('.status-line');
    if (target && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  }
  if (target && target.focus) target.focus({ preventScroll: true });
}
