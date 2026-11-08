// "Which bands do you listen to?" — chips with a search box; the choice is remembered per player name.
import { el, render } from './dom.js';
import { load, save } from '../lib/storage.js';
import { normKey } from '../lib/songs.js';
import { nameSuffix } from '../lib/tr.js';

const KEY = (name) => `song-picks:${normKey(name)}`;

export const rememberedPicks = (name) => (load(KEY(name), []) || []).filter((a) => typeof a === 'string');

/**
 * @param {HTMLElement} container
 * @param {{ groups: { title: string, artists: string[] }[], playerName: string, otherPicks?: string[]|null, onDone: (picked: string[]) => void }} opts
 */
export function renderArtistPick(container, opts) {
  const groups = opts.groups || [{ title: '', artists: opts.artists || [] }];
  const all = groups.flatMap((g) => g.artists);
  const known = new Set(all.map(normKey));
  const picked = new Set(rememberedPicks(opts.playerName).filter((a) => known.has(normKey(a))).map(normKey));
  const other = new Set((opts.otherPicks || []).map(normKey));
  const count = el('span', { class: 'ap-count' });
  const grid = el('div', { class: 'ap-grid' });
  const search = el('input', { type: 'search', class: 'input', id: 'ap-search', placeholder: 'Grup ara…', autocomplete: 'off', inputmode: 'search' });
  const done = el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block' });
  const update = () => {
    count.textContent = picked.size ? `${picked.size} grup seçildi` : 'Henüz seçim yok';
    done.textContent = picked.size ? `Tamam (${picked.size} grup)` : 'Seçmeden geç';
    for (const c of grid.querySelectorAll('.ap-chip')) c.classList.toggle('selected', picked.has(c.dataset.key));
  };
  const chip = (a) => el('button', {
    type: 'button',
    class: `ap-chip ${picked.has(normKey(a)) ? 'selected' : ''} ${other.has(normKey(a)) ? 'other' : ''}`,
    dataset: { key: normKey(a) },
    'aria-pressed': picked.has(normKey(a)) ? 'true' : 'false',
    onClick: (e) => {
      const k = normKey(a);
      if (picked.has(k)) picked.delete(k); else picked.add(k);
      e.currentTarget.setAttribute('aria-pressed', picked.has(k) ? 'true' : 'false');
      update();
    },
  }, a);
  const draw = () => {
    const q = normKey(search.value);
    render(grid, groups.map((g) => {
      if (g.searchOnly && !q) return null; // a long tail that only the search box reaches
      const names = g.artists.filter((a) => !q || normKey(a).includes(q));
      if (!names.length) return null;
      return el('div', { class: 'ap-group' },
        g.title ? el('h3', { class: 'ap-group-title' }, g.title) : null,
        el('div', { class: 'ap-chips' }, names.map(chip)),
      );
    }));
    update();
  };
  search.addEventListener('input', draw);
  done.addEventListener('click', () => {
    const list = all.filter((a) => picked.has(normKey(a)));
    save(KEY(opts.playerName), list);
    opts.onDone(list);
  });
  render(container,
    el('h2', { class: 'ap-title' }, `${opts.playerName}, dinlediğin grupları seç`),
    el('p', { class: 'hint' }, opts.otherPicks
      ? 'Kesikli çerçeveliler rakibinin seçtikleri. Aradığın grup listede yoksa yukarıdan ara. Seçimin bu telefonda adınla hatırlanır.'
      : 'Şarkıların yarısı senin, yarısı rakibinin seçtiği gruplardan gelir; ikinizin de seçtiği gruplar iki pay alır. Aradığın grup listede yoksa yukarıdan ara. Seçimin bu telefonda adınla hatırlanır.'),
    el('div', { class: 'ap-tools' },
      search,
      el('button', { type: 'button', class: 'btn btn-small', onClick: () => { picked.clear(); update(); } }, 'Temizle'),
    ),
    count,
    grid,
    el('div', { class: 'section' }, done),
  );
  draw();
  return { destroy: () => {} };
}

const kept = new WeakMap(); // container -> { key, nodes }

/**
 * renderArtistPick, but drawing it again with the same key puts the same screen back (search text
 * and ticks intact): on two phones both pick at once, and the other phone's list arriving redraws
 * the game while this player is still choosing.
 */
export function keepArtistPick(container, key, opts) {
  const k = kept.get(container);
  if (k && k.key === key) {
    container.replaceChildren(...k.nodes);
    return;
  }
  renderArtistPick(container, opts);
  kept.set(container, { key, nodes: [...container.childNodes] });
}
