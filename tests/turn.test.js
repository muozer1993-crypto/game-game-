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

// --- createHost / joinRoom against a fake PeerJS (loadPeerJs takes window.Peer when it exists)
import { joinRoom, createHost } from '../js/net/peer.js';

function fakePeerClass(log) {
  class Peer {
    constructor(idOrOpts) {
      this.id = typeof idOrOpts === 'string' ? idOrOpts : 'guest';
      this.h = {}; this.destroyed = false; this.disconnected = false;
      log.peers.push(this);
    }
    on(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); }
    emit(ev, ...a) { (this.h[ev] || []).forEach((f) => f(...a)); }
    connect(id) { const c = fakeConn(); c.target = id; log.connects.push(c); return c; }
    destroy() { this.destroyed = true; }
    disconnect() { this.disconnected = true; }
    reconnect() { this.disconnected = false; }
  }
  return Peer;
}

async function withFakePeer(fn) {
  const log = { peers: [], connects: [] };
  const hadWindow = typeof globalThis.window !== 'undefined';
  const prev = hadWindow ? globalThis.window.Peer : undefined;
  if (!hadWindow) globalThis.window = {};
  globalThis.window.Peer = fakePeerClass(log);
  try { return await fn(log); } finally {
    if (hadWindow) globalThis.window.Peer = prev; else delete globalThis.window;
  }
}

const until = async (cond) => { for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 5)); assert.ok(cond(), 'condition met in time'); };

test('odaya katıl: soket yenilenince gelen ikinci "open" ikinci bir connect() yapmaz', async () => {
  await withFakePeer(async (log) => {
    const p = joinRoom('ABCDE');
    await until(() => log.peers.length === 1);
    const peer = log.peers[0];
    peer.emit('open');
    peer.emit('open'); // PeerJS re-emits 'open' after reconnect()
    assert.equal(log.connects.length, 1, 'one connect() per join');
    assert.ok(log.connects[0].target.endsWith('-ABCDE'), 'the room id carries the code');
    log.connects[0].emit('open');
    const t = await p;
    assert.ok(t.connected);
    peer.emit('open');
    assert.equal(log.connects.length, 1, 'still one after the channel is open');
    t.close();
    assert.ok(peer.destroyed);
  });
});

test('odaya katıl: ekrandan çıkınca (signal) bekleyen deneme düşer ve eş yok edilir', async () => {
  await withFakePeer(async (log) => {
    const ctrl = new AbortController();
    const p = joinRoom('ABCDE', { signal: ctrl.signal });
    await until(() => log.peers.length === 1);
    log.peers[0].emit('open');
    ctrl.abort();
    let err = null;
    try { await p; } catch (e) { err = e; }
    assert.equal(err && err.type, 'aborted');
    assert.ok(log.peers[0].destroyed, 'nothing keeps running in the background');
  });
});

test('oda kur: ikinci "open" ikinci bir taşıyıcı kurmaz; iptal odayı kapatır', async () => {
  await withFakePeer(async (log) => {
    const p = createHost('ABCDE');
    await until(() => log.peers.length === 1);
    const peer = log.peers[0];
    peer.emit('open');
    peer.emit('open');
    const t = await p;
    assert.equal(t.code, 'ABCDE');
    assert.equal((peer.h.connection || []).length, 1, 'one connection handler, one transport');
    t.close();
  });
  await withFakePeer(async (log) => {
    const ctrl = new AbortController();
    const p = createHost('ABCDE', { signal: ctrl.signal });
    await until(() => log.peers.length === 1);
    ctrl.abort();
    let err = null;
    try { await p; } catch (e) { err = e; }
    assert.equal(err && err.type, 'aborted');
    assert.ok(log.peers[0].destroyed, 'the room is gone');
  });
});

test('öne dönünce soket yalnızca ortada bir bağlantı yokken tazelenir', () => {
  if (typeof document !== 'undefined') return; // in a browser the real document owns the event
  const listeners = [];
  globalThis.document = { visibilityState: 'visible', addEventListener: (ev, fn) => listeners.push(fn), removeEventListener() {} };
  try {
    const peer = emitter({ disconnected: false, destroyed: false, swaps: 0, disconnect() { this.disconnected = true; }, reconnect() { this.disconnected = false; this.swaps += 1; }, destroy() { this.destroyed = true; } });
    const t = makeTransport('host', 'ABCDE', peer);
    const foreground = () => listeners.forEach((fn) => fn());
    foreground();
    assert.equal(peer.swaps, 1, 'no connection yet: the room id is re-registered');
    const c = fakeConn();
    t.attach(c);
    foreground();
    assert.equal(peer.swaps, 1, 'a connection is being negotiated: the socket is left alone');
    c.emit('open');
    foreground();
    assert.equal(peer.swaps, 1, 'open channel: nothing to do');
    peer.disconnected = true;
    foreground();
    assert.equal(peer.swaps, 2, 'a socket PeerJS itself reports as lost is reopened');
    t.close();
  } finally { delete globalThis.document; }
});
