import { test, assert } from './runner.js';
import { APP_VERSION } from '../js/version.js';

test('sürüm: js/version.js ile sw.js aynı sürümü taşır', async () => {
  assert.ok(/^v\d+$/.test(APP_VERSION));
  if (typeof process === 'undefined' || !process.versions || !process.versions.node) return; // browser: nothing to read
  const fs = await import('node:fs');
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const m = sw.match(/const VERSION = '([^']+)'/);
  assert.equal(m && m[1], APP_VERSION, 'bump both on every deploy');
});

test('çevrimdışı: uygulamanın her dosyası sw.js önbellek listesinde', async () => {
  if (typeof process === 'undefined' || !process.versions || !process.versions.node) return; // browser: nothing to read
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = new URL('..', import.meta.url).pathname;
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const shell = new Set([...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]));
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
  // a game, a word list or a picture missing from the list loads online but not offline
  const files = ['js', 'games', 'css', 'img', 'icons', 'data', 'vendor'].filter((d) => fs.existsSync(path.join(root, d)))
    .flatMap(walk).filter((f) => !/(LICENSE|README)[^/]*$/i.test(f));
  const missing = files.filter((f) => !shell.has(f));
  assert.equal(missing.join(', '), '', 'add these to SHELL in sw.js');
  for (const f of shell) if (f) assert.ok(fs.existsSync(path.join(root, f)), `sw.js lists a missing file: ${f}`);
});

test('tema: "sistem karanlık" kuralları yalnızca karanlık medya sorgusunun içinde', async () => {
  if (typeof process === 'undefined' || !process.versions || !process.versions.node) return; // browser: nothing to read
  const fs = await import('node:fs');
  // :root:not([data-theme="light"]) also matches a light phone on the default "Sistem" theme, so a rule
  // with it outside @media (prefers-color-scheme: dark) paints dark colours in light mode
  const css = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = []; let start = 0; const leaks = [];
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      const head = css.slice(start, i).trim();
      if (head.includes(':root:not([data-theme="light"])') && !stack.some((h) => /prefers-color-scheme:\s*dark/.test(h))) leaks.push(head.slice(0, 80));
      stack.push(head); start = i + 1;
    } else if (css[i] === '}') { stack.pop(); start = i + 1; } else if (css[i] === ';' && !stack.length) start = i + 1;
  }
  assert.deepEqual(leaks, []);
});
