// Countdown timer with a progress bar. onExpire fires once, when Date.now() >= deadline (moved on by
// the time the clocks stood still, see clockPause).
import { el } from './dom.js';

// Two phones: while the "Bağlantı koptu" overlay is up nobody can play, so every clock stands still.
// The app marks the overlay's time here; a countdown adds the part of it that fell after its start.
const pauses = []; // [from, to (null while it lasts)], oldest first
export const clockPause = {
  begin() {
    const last = pauses[pauses.length - 1];
    if (!last || last[1] != null) pauses.push([Date.now(), null]);
    if (pauses.length > 50) pauses.shift();
  },
  end() {
    const last = pauses[pauses.length - 1];
    if (last && last[1] == null) last[1] = Date.now();
  },
  active() {
    const last = pauses[pauses.length - 1];
    return !!last && last[1] == null;
  },
};

/** Milliseconds between `from` and `to` that the clocks stood still. */
export function pausedBetween(from, to = Date.now()) {
  if (!Number.isFinite(from)) return 0;
  let sum = 0;
  for (const [a, b] of pauses) sum += Math.max(0, Math.min(b == null ? to : b, to) - Math.max(a, from));
  return sum;
}

/** Milliseconds since `from` that counted (the clocks' standstills left out). */
export const activeSince = (from) => Math.max(0, Date.now() - from - pausedBetween(from));

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {number} opts.deadline   absolute time in ms (Date.now() based)
 * @param {number} opts.total      full duration in ms (for the progress bar)
 * @param {() => void} [opts.onExpire]
 * @param {boolean} [opts.paused]
 * @param {number} [opts.remaining]  when paused, the remaining ms to display
 * @param {number} [opts.start]  when the countdown began (default deadline - total): standstills after it move the deadline
 * @returns {{ stop(): void, element: HTMLElement }}
 */
export function createTimer(container, opts) {
  const text = el('span', { class: 'timer-text' });
  const bar = el('div', { class: 'timer-bar' });
  const fill = el('div', { class: 'timer-fill' });
  bar.append(fill);
  const root = el('div', { class: `timer ${opts.paused ? 'paused' : ''}`, role: 'timer' }, text, bar);
  container.append(root);

  let expired = false;
  let handle = null;   // the interval while counting down
  let deferred = null; // onExpire deferred past the render that created the timer

  const start = Number.isFinite(opts.start) ? opts.start : opts.deadline - (opts.total || 0);
  const update = (initial = false) => {
    const remaining = opts.paused ? (opts.remaining ?? 0) : Math.max(0, opts.deadline + pausedBetween(start) - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    text.textContent = opts.paused || clockPause.active() ? `⏸ ${seconds} sn` : `${seconds} sn`;
    const ratio = opts.total > 0 ? Math.min(1, remaining / opts.total) : 0;
    fill.style.width = `${ratio * 100}%`;
    root.classList.toggle('urgent', !opts.paused && remaining <= 5000);
    if (!opts.paused && remaining <= 0 && !expired) {
      expired = true;
      stop();
      if (!opts.onExpire) return;
      // createTimer runs inside a game's render(); when the deadline has already passed,
      // onExpire (which dispatches a move and re-renders) must not run re-entrantly, or the
      // outer render would overwrite the screen the nested one drew.
      if (initial) deferred = setTimeout(() => { deferred = null; opts.onExpire(); }, 0);
      else opts.onExpire();
    }
  };

  const stop = () => {
    if (handle !== null) { clearInterval(handle); handle = null; }
    if (deferred !== null) { clearTimeout(deferred); deferred = null; }
  };

  update(true);
  if (!opts.paused && !expired) handle = setInterval(update, 100);

  return { stop, element: root };
}
