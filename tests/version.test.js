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
