// PeerJS adapter: direct WebRTC data channel between the two phones. The room code is
// the host's peer id (namespaced so that it cannot collide with other apps on the public
// PeerJS server). PeerJS itself is loaded lazily from vendor/peerjs.min.js (MIT).
import { generateRoomCode, normalizeRoomCode } from './transport.js';

export { generateRoomCode, normalizeRoomCode };

const PEERJS_URL = new URL('../../vendor/peerjs.min.js', import.meta.url);
const ID_PREFIX = 'oyungecesi-';
const PEER_OPTIONS = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      // Two phones on mobile data usually sit behind carrier NATs that STUN alone cannot
      // punch through; the Open Relay Project's free public TURN servers (static credentials,
      // published for exactly this use) relay the data channel in that case. Unreachable
      // servers are simply ignored by ICE.
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ],
  },
};

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
  webrtc: 'Telefonlar arasında doğrudan bağlantı kurulamadı (ağ engeli); aynı Wi-Fi\'ye bağlanmayı deneyin',
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
  const roomCode = normalizeRoomCode(code);
  if (roomCode.length < 4) throw new Error('Oda kodu en az 4 karakter olmalı');
  opts.onStatus && opts.onStatus('Eşleştirme sunucusuna bağlanılıyor…');
  return new Promise((resolve, reject) => {
    const peer = new Peer(PEER_OPTIONS);
    let settled = false;
    let transport = null;
    const fail = (err) => { if (!settled) { settled = true; try { peer.destroy(); } catch { /* ignore */ } reject(err); } };
    const timer = setTimeout(() => fail(new Error('Odaya bağlanılamadı (zaman aşımı). Kod doğru mu? İkiniz de internete bağlı mısınız?')), 25000);
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
