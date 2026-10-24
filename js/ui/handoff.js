// "Pass the phone" screen used between turns in games with hidden information.
import { el, render } from './dom.js';
import { nameSuffix } from '../lib/tr.js';

/**
 * @param {HTMLElement} container
 * @param {{ name: string, note?: string, onReady: () => void }} opts
 */
export function showHandoff(container, opts) {
  const screen = el('div', { class: 'handoff' },
    el('div', { class: 'handoff-icon', 'aria-hidden': 'true' }, '📱'),
    el('h2', {}, `Sıra ${nameSuffix(opts.name, 'de')}`),
    el('p', {}, 'Telefonu ona ver.'),
    opts.note ? el('p', { class: 'muted' }, opts.note) : null,
    el('button', { type: 'button', class: 'btn btn-primary btn-big', onClick: opts.onReady }, 'Hazırım'),
  );
  render(container, screen);
  return screen;
}
