// PeerJS adapter: direct WebRTC data channel between the two phones. The room code is
// the host's peer id (namespaced so that it cannot collide with other apps on the public
// PeerJS server). PeerJS itself is loaded lazily from vendor/peerjs.min.js (MIT).
import { generateRoomCode, normalizeRoomCode } from './transport.js';
import { STATIC_TURN, METERED } from './turn-config.js';

export { generateRoomCode, normalizeRoomCode };

const PEERJS_URL = new URL('../../vendor/peerjs.min.js', import.meta.url);
const ID_PREFIX = 'oyungecesi-';

// Two phones on mobile data usually sit behind carrier NATs that STUN alone cannot punch through;
// a TURN relay carries the data channel in that case. The free public relays of earlier years
// (openrelay.metered.ca with static credentials, PeerJS's own eu-0/us-0.turn.peerjs.com) were shut
// down by 2026, so the relay comes from: the player's own free account (js/net/turn-config.js) and,
// as a best-effort fallback, Metered's shared-secret host for the Open Relay Project, whose
// short-lived credentials are derived here (TURN REST API: username "<expiry>:<name>", password
// base64(HMAC-SHA1(secret, username))). The connection test on the online screen shows what answers.
const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
const OPEN_RELAY_STATIC_AUTH = { host: 'staticauth.openrelay.metered.ca', secret: 'openrelayprojectsecret', ttlSec: 24 * 3600 };

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

/** TURN REST credentials (RFC draft "TURN Server REST API") for a shared secret, valid `ttlSec` from now. */
export async function turnRestCredentials(secret, name, ttlSec, now = Date.now()) {
  const username = `${Math.floor(now / 1000) + ttlSec}:${name}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username));
  return { username, credential: b64(sig) };
}

let meteredCache = null; // { at, servers }
async function meteredServers() {
  if (!METERED.app || !METERED.apiKey) return [];
  if (meteredCache && Date.now() - meteredCache.at < 10 * 60 * 1000) return meteredCache.servers;
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), 8000);
    const res = await fetch(`https://${METERED.app}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(METERED.apiKey)}`, { signal: ctrl ? ctrl.signal : undefined });
    clearTimeout(timer);
    const list = res.ok ? await res.json() : [];
    const servers = Array.isArray(list) ? list.filter((s) => s && s.urls) : [];
    meteredCache = { at: Date.now(), servers };
    return servers;
  } catch (err) {
    console.warn('Metered kimlikleri alınamadı', err);
    return [];
  }
}

/** The STUN/TURN servers to use right now (own account first, then the shared-secret fallback). */
export async function getIceServers() {
  const servers = [...STUN_SERVERS, ...STATIC_TURN.filter((s) => s && s.urls)];
  servers.push(...await meteredServers());
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const { username, credential } = await turnRestCredentials(OPEN_RELAY_STATIC_AUTH.secret, 'oyungecesi', OPEN_RELAY_STATIC_AUTH.ttlSec);
      const h = OPEN_RELAY_STATIC_AUTH.host;
      servers.push({ urls: [`turn:${h}:80`, `turn:${h}:443`, `turn:${h}:443?transport=tcp`, `turns:${h}:443?transport=tcp`], username, credential });
    }
  } catch (err) {
    console.warn('TURN kimliği üretilemedi', err);
  }
  return servers;
}

const peerOptions = (iceServers) => ({ debug: 1, config: { iceServers } });

let loadPromise = null;
function loadPeerJs() {
  if (typeof window !== 'undefined' && window.Peer) return Promise.resolve(window.Peer);
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PEERJS_URL.href;
      script.async = true;
      script.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS yüklenemedi')));
      script.onerror = () => { loadPromise = null; reject(new Error('PeerJS yüklenemedi (bağlantı yok?)')); };
      document.head.append(script);
    });
  }
  return loadPromise;
}

const ERROR_TEXT = {
  'browser-incompatible': 'Bu tarayıcı WebRTC desteklemiyor',
  network: 'Eşleştirme sunucusuna ulaşılamadı; internet bağlantını kontrol et',
  'server-error': 'Eşleştirme sunucusunda hata oluştu, biraz sonra tekrar dene',
  'socket-error': 'Eşleştirme sunucusuyla bağlantı koptu',
  'socket-closed': 'Eşleştirme sunucusuyla bağlantı kapandı',
  'peer-unavailable': 'Bu kodla açık bir oda bulunamadı',
  'invalid-id': 'Geçersiz oda kodu',
  'unavailable-id': 'Bu oda kodu kullanımda',
  disconnected: 'Bağlantı koptu',
  webrtc: 'Telefonlar arasında bağlantı kurulamadı (ağ engeli): "Bağlantı testi" ile TURN satırını kontrol edin ya da aynı Wi-Fi\'ye bağlanın',
};

function describe(err) {
  const type = err && err.type;
  return ERROR_TEXT[type] || (err && err.message) || 'Bağlantı hatası';
}

/** Wrap a Peer + DataConnection into the transport interface. */
function makeTransport(role, code, peer) {
  const messageHandlers = [];
  const openHandlers = [];
  const closeHandlers = [];
  let conn = null;
  let open = false;
  let closed = false;
  const queue = [];

  const emitClose = () => {
    if (closed) return;
    closed = true;
    closeHandlers.forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible' && peer && peer.disconnected && !peer.destroyed) {
      try { peer.reconnect(); } catch (e) { console.warn(e); }
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  peer.on('disconnected', () => {
    // lost the signalling server; the data channel may still work. Try to get back.
    if (!peer.destroyed) {
      setTimeout(() => { if (!peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch (e) { console.warn(e); } } }, 1500);
    }
  });
  peer.on('close', emitClose);
  peer.on('error', (err) => {
    console.warn('PeerJS hatası', err);
    if (err && (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') && open) return; // P2P still alive
    if (open) emitClose();
  });

  const attach = (c) => {
    const old = conn;
    conn = c;
    if (old && old !== c) {
      // a replacement connection (the other side reconnected): drop the old one quietly
      open = false;
      try { old.close(); } catch { /* ignore */ }
    }
    const current = () => conn === c; // events from superseded connections are ignored
    c.on('data', (data) => {
      if (!current()) return;
      messageHandlers.forEach((fn) => { try { fn(data); } catch (e) { console.warn(e); } });
    });
    c.on('open', () => {
      if (!current()) return;
      open = true;
      openHandlers.forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
      while (queue.length) c.send(queue.shift());
    });
    c.on('close', () => { if (current()) emitClose(); });
    c.on('error', (err) => { if (!current()) return; console.warn('Bağlantı hatası', err); emitClose(); });
    if (c.open) {
      open = true;
      openHandlers.forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
    }
  };

  return {
    role,
    code,
    attach,
    get connected() { return open && !closed; },
    send(message) {
      if (closed) return;
      if (conn && open) conn.send(message);
      else queue.push(message);
    },
    onMessage(fn) { messageHandlers.push(fn); },
    onOpen(fn) { openHandlers.push(fn); if (open) fn(); },
    onClose(fn) { closeHandlers.push(fn); },
    close() {
      document.removeEventListener('visibilitychange', onVisibility);
      closed = true;
      try { if (conn) conn.close(); } catch { /* ignore */ }
      try { peer.destroy(); } catch { /* ignore */ }
    },
    /** Test helper: this side alone believes the link is gone (the other phone notices nothing until
     *  the replacement connection arrives), as when a phone switches networks. */
    simulateSilentDrop() {
      closed = true;
      closeHandlers.forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
    },
    /** Test helper: drop the data channel as if the network failed (handlers do fire). */
    simulateDrop() {
      try { if (conn) conn.close(); } catch { /* ignore */ }
      emitClose();
    },
  };
}

/**
 * Open a room. Resolves once the room code is registered (before the guest connects).
 * @param {string} code
 * @param {{ onStatus?: (text: string) => void, attempts?: number }} [opts]
 */
export async function createHost(code, opts = {}) {
  const Peer = await loadPeerJs();
  const PEER_OPTIONS = peerOptions(await getIceServers());
  const attempts = opts.attempts ?? 3;
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    const roomCode = i === 0 ? code : generateRoomCode();
    opts.onStatus && opts.onStatus(i === 0 ? 'Oda açılıyor…' : 'Yeni kod deneniyor…');
    try {
      return await new Promise((resolve, reject) => {
        const peer = new Peer(ID_PREFIX + roomCode, PEER_OPTIONS);
        let settled = false;
        const fail = (err) => { if (!settled) { settled = true; try { peer.destroy(); } catch { /* ignore */ } reject(err); } };
        peer.on('open', () => {
          settled = true;
          const transport = makeTransport('host', roomCode, peer);
          peer.on('connection', (conn) => {
            // a second connection replaces the first: the guest may be reconnecting after a
            // drop the host has not noticed yet (two players only, so there is no third party)
            transport.attach(conn);
          });
          resolve(transport);
        });
        peer.on('error', (err) => {
          if (settled) return;
          const e = new Error(describe(err));
          e.type = err && err.type;
          fail(e);
        });
        setTimeout(() => fail(Object.assign(new Error('Eşleştirme sunucusu yanıt vermedi'), { type: 'timeout' })), 15000);
      });
    } catch (err) {
      lastError = err;
      if (err.type !== 'unavailable-id' || opts.keepCode) throw err;
    }
  }
  throw lastError || new Error('Oda açılamadı');
}

/**
 * Join a room by code. Resolves once the data channel to the host is open.
 * @param {string} code
 * @param {{ onStatus?: (text: string) => void }} [opts]
 */
export async function joinRoom(code, opts = {}) {
  const Peer = await loadPeerJs();
  const PEER_OPTIONS = peerOptions(await getIceServers());
  const roomCode = normalizeRoomCode(code);
  if (roomCode.length < 4) throw new Error('Oda kodu en az 4 karakter olmalı');
  opts.onStatus && opts.onStatus('Eşleştirme sunucusuna bağlanılıyor…');
  return new Promise((resolve, reject) => {
    const peer = new Peer(PEER_OPTIONS);
    let settled = false;
    let transport = null;
    const fail = (err) => { if (!settled) { settled = true; try { peer.destroy(); } catch { /* ignore */ } reject(err); } };
    const timer = setTimeout(() => fail(new Error('Odaya bağlanılamadı (zaman aşımı). Kod doğru mu, ikiniz de internete bağlı mısınız? Farklı ağlardaysanız ikiniz de "Bağlantı testi" yapıp TURN satırına bakın.')), 25000);
    peer.on('open', () => {
      opts.onStatus && opts.onStatus('Odaya bağlanılıyor…');
      transport = makeTransport('guest', roomCode, peer);
      const conn = peer.connect(ID_PREFIX + roomCode, { reliable: true, serialization: 'json' });
      transport.attach(conn);
      transport.onOpen(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(transport);
      });
      transport.onClose(() => {
        if (!settled) fail(new Error('Bağlantı kurulamadı'));
      });
    });
    peer.on('error', (err) => {
      if (settled) return;
      const e = new Error(describe(err));
      e.type = err && err.type;
      clearTimeout(timer);
      fail(e);
    });
  });
}
