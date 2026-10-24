// Countdown timer with a progress bar. onExpire fires once, when Date.now() >= deadline.
import { el } from './dom.js';

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {number} opts.deadline   absolute time in ms (Date.now() based)
 * @param {number} opts.total      full duration in ms (for the progress bar)
 * @param {() => void} [opts.onExpire]
 * @param {boolean} [opts.paused]
 * @param {number} [opts.remaining]  when paused, the remaining ms to display
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
  let handle = null;

  const update = () => {
    const remaining = opts.paused ? (opts.remaining ?? 0) : Math.max(0, opts.deadline - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    text.textContent = opts.paused ? `⏸ ${seconds} sn` : `${seconds} sn`;
    const ratio = opts.total > 0 ? Math.min(1, remaining / opts.total) : 0;
    fill.style.width = `${ratio * 100}%`;
    root.classList.toggle('urgent', !opts.paused && remaining <= 5000);
    if (!opts.paused && remaining <= 0 && !expired) {
      expired = true;
      stop();
      if (opts.onExpire) opts.onExpire();
    }
  };

  const stop = () => {
    if (handle !== null) { clearInterval(handle); handle = null; }
  };

  update();
  if (!opts.paused) handle = setInterval(update, 100);

  return { stop, element: root };
}
