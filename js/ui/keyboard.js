// On-screen keyboard. Turkish Q layout by default, a digit pad for number games.
// Key states ('correct' | 'present' | 'absent') colour the keys like Wordle.
import { el, clear } from './dom.js';
import { lowerTR, LETTERS } from '../lib/tr.js';

// Turkish Q layout minus q/w/x, which no Turkish word uses: that keeps the keys wide
// enough to hit on a 360px-wide phone.
export const TR_ROWS = [
  ['e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i'],
  ['enter', 'z', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç', 'backspace'],
];

export const DIGIT_ROWS = [
  ['1', '2', '3', '4', '5'],
  ['6', '7', '8', '9', '0'],
  ['enter', 'backspace'],
];

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {(key: string) => void} opts.onKey        a letter or digit was pressed
 * @param {() => void} opts.onEnter
 * @param {() => void} opts.onBackspace
 * @param {'tr'|'digits'} [opts.layout]
 * @param {boolean} [opts.physical]   also listen to the physical keyboard (default true)
 * @returns {{ setKeyStates(states: Record<string,string>): void, setDisabled(d: boolean): void, destroy(): void }}
 */
const STATE_WORDS = { correct: 'doğru', present: 'yeri yanlış', absent: 'yok' };

export function createKeyboard(container, opts) {
  const layout = opts.layout === 'digits' ? DIGIT_ROWS : TR_ROWS;
  const root = el('div', { class: `keyboard ${opts.layout === 'digits' ? 'keyboard-digits' : ''}` });
  const keyEls = new Map();
  let disabled = false;

  const press = (key) => {
    if (disabled) return;
    if (key === 'enter') opts.onEnter && opts.onEnter();
    else if (key === 'backspace') opts.onBackspace && opts.onBackspace();
    else opts.onKey && opts.onKey(key);
  };

  for (const row of layout) {
    const rowEl = el('div', { class: 'kb-row' });
    for (const key of row) {
      const special = key === 'enter' || key === 'backspace';
      const label = key === 'enter' ? 'GİR' : key === 'backspace' ? '⌫' : key.toLocaleUpperCase('tr-TR');
      const btn = el('button', {
        type: 'button',
        class: `key ${special ? 'key-wide' : ''}`,
        dataset: { key },
        'aria-label': key === 'backspace' ? 'Sil' : key === 'enter' ? 'Gir' : label,
        onClick: (e) => { e.preventDefault(); press(key); },
      }, label);
      keyEls.set(key, btn);
      rowEl.append(btn);
    }
    root.append(rowEl);
  }
  clear(container).append(root);

  const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
  const ACTIVATE = new Set(['BUTTON', 'A', 'SUMMARY']);
  const onKeydown = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // a window is open over the game (the rules, "Bağlantı koptu"): the screen behind takes no typing
    if (!root.isConnected || root.closest('[inert]')) return;
    const target = e.target;
    // a field types for itself
    if (target && (TYPING.has(target.tagName) || target.isContentEditable)) return;
    // a button or link left focused by a tap (an on-screen key, "Kelimeyi bütün olarak tahmin et")
    // still lets letters and ⌫ through to the game; Enter and Space stay its own, except on one of
    // this keyboard's keys, where Enter sends the entry instead of typing that key again
    const ownKey = !!target && root.contains(target);
    if (target && ACTIVATE.has(target.tagName) && !ownKey && (e.key === 'Enter' || e.key === ' ')) return;
    if (e.key === 'Enter') { e.preventDefault(); press('enter'); return; }
    if (e.key === 'Backspace') { e.preventDefault(); press('backspace'); return; }
    if (e.key.length !== 1) return;
    const k = opts.layout === 'digits' ? e.key : lowerTR(e.key);
    if (keyEls.has(k)) { e.preventDefault(); press(k); }
  };
  const physical = opts.physical !== false && typeof window !== 'undefined';
  if (physical) window.addEventListener('keydown', onKeydown);

  return {
    setKeyStates(states) {
      for (const [key, btn] of keyEls) {
        btn.classList.remove('correct', 'present', 'absent');
        const s = states && states[key];
        if (s) btn.classList.add(s);
        // the colour said in words too, for screen readers ("E, yeri yanlış")
        if (key !== 'enter' && key !== 'backspace') btn.setAttribute('aria-label', `${key.toLocaleUpperCase('tr-TR')}${STATE_WORDS[s] ? `, ${STATE_WORDS[s]}` : ''}`);
      }
    },
    setDisabled(d) {
      disabled = !!d;
      root.classList.toggle('disabled', disabled);
    },
    destroy() {
      if (physical) window.removeEventListener('keydown', onKeydown);
      if (root.parentNode) root.parentNode.removeChild(root);
    },
  };
}

/** Allowed characters for the given layout (used by games to validate key input). */
export function allowedKeys(layout) {
  return layout === 'digits' ? '0123456789' : LETTERS;
}
