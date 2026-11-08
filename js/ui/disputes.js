// The screen part of objections (see js/lib/objections.js): the mark on a word the list does not
// have, and the list of such words with an "İtiraz et" button for the owner's opponent.
import { el } from './dom.js';
import { upperTR } from '../lib/tr.js';

/** The small "?" after a word the list does not have. */
export function unlistedMark() {
  return el('span', { class: 'unlisted-mark', title: 'Kelime listesinde yok: itiraz edilebilir', 'aria-label': ' (listede yok, itiraz edilebilir)' }, '?');
}

/**
 * @param {object} p
 * @param {{ id: string, owner: 0|1, word: string, detail?: string }[]} p.items
 * @param {string[]} p.objected    ids objected to
 * @param {string[]} p.players
 * @param {0|1} p.viewer
 * @param {boolean} p.online
 * @param {(move: object) => void} [p.sendMove]  omitted: the list is shown without buttons
 * @param {string} [p.effect]      what an objection costs, in one sentence
 * @param {string} [p.title]
 */
export function objectionList({ items, objected, players, viewer, online, sendMove, effect, title = 'Listede olmayan kelimeler' }) {
  const set = new Set(objected || []);
  return el('div', { class: 'card objections' },
    el('div', { class: 'objections-title' }, title),
    effect ? el('p', { class: 'hint' }, effect) : null,
    el('div', { class: 'objection-rows' }, items.map((it) => {
      const on = set.has(it.id);
      const mayObject = !!sendMove && (!online || viewer === 1 - it.owner);
      return el('div', { class: `objection-row ${on ? 'objected' : ''}` },
        el('span', { class: 'objection-word' }, upperTR(it.word), unlistedMark()),
        el('span', { class: 'objection-who muted' }, `${players[it.owner]}${it.detail ? ` · ${it.detail}` : ''}`),
        on ? el('span', { class: 'badge miss' }, 'itiraz edildi') : null,
        mayObject ? el('button', {
          type: 'button',
          class: `btn btn-small objection-btn ${on ? 'btn-secondary' : 'btn-danger'}`,
          onClick: () => sendMove({ type: 'object', id: it.id, on: !on, by: 1 - it.owner }),
        }, on ? 'İtirazı geri al' : (online ? 'İtiraz et' : `${players[1 - it.owner]}: itiraz et`)) : null,
      );
    })),
  );
}
