import { test, assert } from './runner.js';
import { stripSecret } from '../js/session.js';

test('session: stripSecret gizli alanı siler, diğerlerini bırakır', () => {
  assert.deepEqual(stripSecret({ type: 'setSecret', secret: { word: 'kalem' } }), { type: 'setSecret' });
  assert.deepEqual(stripSecret({ type: 'guess', word: 'kalem' }), { type: 'guess', word: 'kalem' });
  assert.equal(stripSecret(null), null);
});
