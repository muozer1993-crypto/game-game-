// Tiny DOM helpers. el('button', { class: 'btn', onClick: fn }, 'Metin')

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  append(node, children);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Like el() but creates SVG elements. svg('circle', { cx: 10, cy: 10, r: 4 }) */
export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.setAttribute('class', value);
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value);
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/**
 * Taking a focused element (a key, a tile) out of the page makes the browser pull the page scroll
 * back while the container is empty. Call before emptying a container; the returned function puts
 * the scroll back once the new content is in (a redraw of a scrolled screen stays put).
 */
export function scrollKeeper(container) {
  if (typeof document === 'undefined' || typeof scrollTo !== 'function') return () => {};
  const a = document.activeElement;
  if (!a || a === document.body || !container || typeof container.contains !== 'function' || !container.contains(a)) return () => {};
  if (typeof scrollY !== 'number') return () => {}; // (read only now: reading the scroll lays the page out)
  const y = scrollY;
  return () => { if (scrollY !== y) scrollTo(0, y); };
}

/**
 * A short phone: once the screen is laid out, scroll just enough that the whole box (a keypad, GİR
 * included) is on screen. Nothing happens when it already is.
 */
const viewKeys = new WeakMap(); // owner -> the key keysIntoViewOnce last scrolled for

/**
 * keysIntoView, only when `key` differs from the last one for `owner` (a new turn, a new word): a redraw
 * of the same screen leaves the page where the player scrolled it, instead of pulling it back down.
 */
export function keysIntoViewOnce(box, owner, key) {
  if (!owner || viewKeys.get(owner) === key) return;
  viewKeys.set(owner, key);
  keysIntoView(box);
}

export function keysIntoView(box) {
  if (typeof requestAnimationFrame !== 'function' || typeof innerHeight !== 'number') return;
  requestAnimationFrame(() => {
    if (box.isConnected && box.getBoundingClientRect().bottom > innerHeight) box.scrollIntoView({ block: 'end' });
  });
}

/**
 * Buttons that come up where the finger just was (an amount row after "Yükselt", "Pes" after "Zar
 * at"): they ignore taps for a moment, so a double tap does not press them.
 */
export function armAfter(node, ms = 350) {
  if (!node || !node.style) return node;
  node.style.pointerEvents = 'none';
  setTimeout(() => { node.style.pointerEvents = ''; }, ms);
  return node;
}

/** Replace the content of a container with the given children. */
export function render(container, ...children) {
  const back = scrollKeeper(container);
  clear(container);
  append(container, children);
  back();
  return container;
}

let toastTimer = null;
/** Short non-blocking message at the bottom of the screen. */
export function toast(message, { duration = 2200, kind = '', top = false } = {}) {
  let host = document.getElementById('toast');
  if (!host) {
    host = el('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  // top: at the top of the screen, clear of a keypad at the bottom (kept while it fades out)
  const place = top ? ' top' : '';
  host.textContent = message;
  host.className = `toast show ${kind}${place}`.replace(/\s+/g, ' ').trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { host.className = `toast${place}`; }, duration);
}
