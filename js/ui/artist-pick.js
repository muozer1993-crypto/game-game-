// "Which bands do you listen to?" — chips with a search box; the choice is remembered per player name.
import { el, render } from './dom.js';
import { load, save } from '../lib/storage.js';
import { normKey } from '../lib/songs.js';
import { nameSuffix } from '../lib/tr.js';

const KEY = (name) => `song-picks:${normKey(name)}`;

export const rememberedPicks = (name) => (load(KEY(name), []) || []).filter((a) => typeof a === 'string');

/**
 * @param {HTMLElement} container
 * @param {{ artists: string[], playerName: string, otherPicks?: string[]|null, onDone: (picked: string[]) => void }} opts
 */
export function renderArtistPick(container, opts) {
  const known = new Set(opts.artists.map(normKey));
  const picked = new Set(rememberedPicks(opts.playerName).filter((a) => known.has(normKey(a))).map(normKey));
  const other = new Set((opts.otherPicks || []).map(normKey));
  const count = el('span', { class: 'ap-count' });
  const grid = el('div', { class: 'ap-grid' });
  const search = el('input', { type: 'search', class: 'input', id: 'ap-search', placeholder: 'Grup ara…', autocomplete: 'off', inputmode: 'search' });
  const done = el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block' });
  const update = () => {
    count.textContent = picked.size ? `${picked.size} grup seçildi` : 'Henüz seçim yok';
    done.textContent = picked.size ? `Tamam (${picked.size} grup)` : 'Seçmeden geç';
    for (const chip of grid.children) chip.classList.toggle('selected', picked.has(chip.dataset.key));
  };
  const draw = () => {
    const q = normKey(search.value);
    render(grid, opts.artists.filter((a) => !q || normKey(a).includes(q)).map((a) => el('button', {
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
    }, a)));
    update();
  };
  search.addEventListener('input', draw);
  done.addEventListener('click', () => {
    const list = opts.artists.filter((a) => picked.has(normKey(a)));
    save(KEY(opts.playerName), list);
    opts.onDone(list);
  });
  render(container,
    el('h2', { class: 'ap-title' }, `${opts.playerName}, dinlediğin grupları seç`),
    el('p', { class: 'hint' }, opts.otherPicks
      ? 'Soluk çerçeveliler rakibinin seçtikleri. Seçimin bu telefonda adınla hatırlanır.'
      : 'Şarkılar seçtiğiniz gruplardan gelir; ikinizin de seçtiği gruplar daha sık. Seçimin bu telefonda adınla hatırlanır.'),
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
