import { test, assert } from './runner.js';
import { turnRestCredentials, getIceServers } from '../js/net/peer.js';

test('TURN REST kimliği: süreli kullanıcı adı ve HMAC-SHA1 şifre (bilinen değer)', async () => {
  const c = await turnRestCredentials('openrelayprojectsecret', 'oyungecesi', 86400, 1700000000000);
  assert.equal(c.username, '1700086400:oyungecesi');
  assert.equal(c.credential, 'Ao8Bg/Mr6aBvmp0e122IAWi0DCA=', 'matches Python hmac/sha1/base64 for the same input');
  const servers = await getIceServers();
  assert.ok(servers.some((s) => String(s.urls).startsWith('stun:')), 'STUN servers present');
  assert.ok(!servers.some((s) => /turn\.peerjs\.com|openrelay\.metered\.ca/.test(String(s.urls))), 'no dead relays (openrelay, peerjs, staticauth)');
  const relays = servers.filter((s) => String(s.urls).startsWith('turn'));
  assert.equal(relays.length, 4, 'the Metered relays from turn-config.js: udp 80, tcp 80, 443, tls 443');
  assert.ok(relays.every((s) => s.username && s.credential && /global\.relay\.metered\.ca/.test(String(s.urls))), 'every relay is authenticated and points at the Metered host');
  assert.ok(relays.some((s) => String(s.urls).startsWith('turns:')), 'a TLS relay on 443 for networks that block everything else');
});

import { makeTransport } from '../js/net/peer.js';

function emitter(extra = {}) {
  const h = {};
  return Object.assign({ on(ev, fn) { (h[ev] = h[ev] || []).push(fn); }, emit(ev, ...a) { (h[ev] || []).forEach((f) => f(...a)); } }, extra);
}
const fakePeer = () => emitter({ disconnected: false, destroyed: false, reconnect() { this.reconnected = (this.reconnected || 0) + 1; }, disconnect() { this.disconnected = true; }, destroy() { this.destroyed = true; } });
const fakeConn = () => emitter({ open: false, sent: [], send(m) { this.sent.push(m); }, close() { this.closedByUs = true; } });

test('bağlantı: açılmadan düşen deneme ev sahibinin odasını kapatmaz, konuk nedenini öğrenir', () => {
  const host = makeTransport('host', 'ABCDE', fakePeer());
  let closed = 0; const attempts = [];
  host.onClose(() => { closed += 1; });
  host.onAttemptFailed((reason) => attempts.push(reason));
  const c1 = fakeConn();
  host.attach(c1);
  c1.emit('error', { type: 'negotiation-failed', message: 'Negotiation of connection to x failed.' });
  assert.equal(closed, 0, 'the room stays open');
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].type, 'negotiation-failed');
  assert.ok(attempts[0].message.includes('Bağlantı testi'), 'the explanation names the self-test');
  assert.ok(!host.connected);
  const c2 = fakeConn();
  host.attach(c2);
  host.send({ t: 'hello' });
  assert.deepEqual(c2.sent, [], 'queued until open');
  c2.emit('open');
  assert.ok(host.connected);
  assert.deepEqual(c2.sent, [{ t: 'hello' }], 'the second attempt works and gets the queued message');
  c2.emit('close');
  assert.equal(closed, 1, 'a drop after opening is a real close');

  const guest = makeTransport('guest', 'ABCDE', fakePeer());
  const reasons = [];
  guest.onClose((r) => reasons.push(r));
  const g = fakeConn();
  guest.attach(g);
  g.emit('close'); // ICE failed before the channel ever opened
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0].type, 'negotiation-failed');
  assert.ok(reasons[0].message.includes('ağ engeli'));
});
