// Scoreboard: two player names, scores, and a marker for whose turn it is.
import { el } from './dom.js';

/**
 * @param {{ players: string[], scores: number[], turn?: number|null, self?: number|null }} opts
 */
export function createScoreboard(opts) {
  const cells = opts.players.map((name, i) =>
    el('div', {
      class: `score-cell ${opts.turn === i ? 'active' : ''} ${opts.self === i ? 'self' : ''}`,
    },
      el('div', { class: 'score-name' }, name, opts.self === i ? el('span', { class: 'muted' }, ' (sen)') : null),
      el('div', { class: 'score-value' }, String(opts.scores[i] ?? 0)),
    ),
  );
  return el('div', { class: 'scoreboard' }, cells[0], el('div', { class: 'score-sep' }, '–'), cells[1]);
}
