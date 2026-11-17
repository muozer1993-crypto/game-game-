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
