// "Pass the phone" screen used between turns in games with hidden information.
import { el, render } from './dom.js';
import { nameSuffix } from '../lib/tr.js';

/**
 * @param {HTMLElement} container
 * @param {{ name: string, note?: string, onReady: () => void }} opts
 */
export const READY_DELAY_MS = 700;

export function showHandoff(container, opts) {
  const screen = el('div', { class: 'handoff' },
    el('div', { class: 'handoff-icon', 'aria-hidden': 'true' }, '📱'),
    el('h2', {}, `Sıra ${nameSuffix(opts.name, 'de')}`),
    el('p', {}, 'Telefonu ona ver.'),
    opts.note ? el('p', { class: 'muted' }, opts.note) : null,
    el('button', { type: 'button', class: 'btn btn-primary btn-big', disabled: true, onClick: opts.onReady }, 'Hazırım'),
  );
  render(container, screen);
  // the move that handed over the phone was a tap: a quick double tap must not also press
  // "Hazırım" and show the next player's hidden cards to the one who just played
  const ready = screen.querySelector('button');
  setTimeout(() => { ready.disabled = false; }, READY_DELAY_MS);
  return screen;
}
