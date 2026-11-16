// "Which bands do you listen to?" — chips with a search box; the choice is remembered per player name.
import { el, render } from './dom.js';
import { load, save } from '../lib/storage.js';
import { normKey, normalizeAnswer } from '../lib/songs.js';
import { nameSuffix } from '../lib/tr.js';

const KEY = (name) => `song-picks:${normKey(name)}`;

export const rememberedPicks = (name) => (load(KEY(name), []) || []).filter((a) => typeof a === 'string');

/**
 * @param {HTMLElement} container
 * @param {{ groups: { title: string, artists: string[] }[], playerName: string, otherPicks?: string[]|null, onDone: (picked: string[]) => void,
 *   pickMode?: string, otherSources?: number, silent?: Set<string> }} opts
 *   pickMode 'ortak': only bands both pick play; otherSources: how many other ticked sources bring songs
 *   too; silent: bands (normKey) none of whose songs can play a clip, in a game that needs the sound
 */
export function renderArtistPick(container, opts) {
  const groups = opts.groups || [{ title: '', artists: opts.artists || [] }];
  const all = groups.flatMap((g) => g.artists);
  const known = new Set(all.map(normKey));
  const picked = new Set(rememberedPicks(opts.playerName).filter((a) => known.has(normKey(a))).map(normKey));
  const other = new Set((opts.otherPicks || []).map(normKey));
  const silent = opts.silent || new Set();
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
  }, a, silent.has(normKey(a)) ? ' 🔇' : '');
  const draw = () => {
    const q = normKey(search.value);
    const qa = normalizeAnswer(search.value); // "sebnem" finds "Şebnem Ferah"
    render(grid, groups.map((g) => {
      if (g.searchOnly && !q) return null; // a long tail that only the search box reaches
      const names = g.artists.filter((a) => !q || normKey(a).includes(q) || (qa && normalizeAnswer(a).includes(qa)));
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
    // the next screen is a new one (one phone: the other player's list): with nothing of this list
    // focused, the redraw does not put this list's scroll back (see scrollKeeper in dom.js)
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    if (a && a !== document.body && container.contains(a) && typeof a.blur === 'function') a.blur();
    opts.onDone(list);
  });
  render(container,
    el('h2', { class: 'ap-title' }, `${opts.playerName}, dinlediğin grupları seç`),
    el('p', { class: 'hint' }, [
      opts.otherPicks ? 'Kesikli çerçeveliler rakibinin seçtikleri.' : null,
      opts.pickMode === 'ortak'
        ? 'Yalnız ikinizin de seçtiği gruplar çalar (ortak grup yoksa ikinizin seçtiklerinin hepsi).'
        : 'Seçilen gruplardan gelen şarkıların yarısı senin, yarısı rakibinin seçtiklerinden; ikinizin de seçtiği gruplar iki pay alır.',
      opts.otherSources > 0 ? 'Ayarlarda işaretli öbür kaynaklar da şarkı getirir.' : null,
      silent.size ? '🔇: bu grubun şarkılarının sesi yok, bu oyunda çalmaz.' : null,
      'Aradığın grup listede yoksa yukarıdan ara. Seçimin bu telefonda adınla hatırlanır.',
    ].filter(Boolean).join(' ')),
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
    // already on the screen: leave it (re-inserting would take the focus from the search box)
    const same = container.childNodes.length === k.nodes.length && k.nodes.every((n, i) => container.childNodes[i] === n);
    if (!same) container.replaceChildren(...k.nodes);
    return;
  }
  renderArtistPick(container, opts);
  kept.set(container, { key, nodes: [...container.childNodes] });
  // a new list (one phone: the other player's turn to choose) starts at the top: title, search box
  if (typeof scrollY === 'number' && scrollY > 0 && typeof scrollTo === 'function') scrollTo(0, 0);
}
