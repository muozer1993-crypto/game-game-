// Transport interface used by the online mode. Any adapter (PeerJS, Firebase, ...) must
// return an object with this shape:
//
//   {
//     role: 'host' | 'guest',
//     code: 'ABCDE',                 // room code shown to the players
//     send(message: object): void,   // deliver a JSON-serialisable message to the other device
//     onMessage(fn): void,           // fn(message) for each message from the other device
//     onOpen(fn): void,              // fn() once the two devices are connected (immediately if already)
//     onClose(fn): void,             // fn() when the connection is lost or closed
//     close(): void,
//   }
//
// Messages are delivered in order. The app (js/app.js) decides what the messages mean.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

export function generateRoomCode(length = 5) {
  const out = [];
  const n = ROOM_CODE_ALPHABET.length;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    for (let i = 0; i < length; i++) out.push(ROOM_CODE_ALPHABET[buf[i] % n]);
  } else {
    for (let i = 0; i < length; i++) out.push(ROOM_CODE_ALPHABET[Math.floor(Math.random() * n)]);
  }
  return out.join('');
}

export function normalizeRoomCode(code) {
  return String(code || '').toLocaleUpperCase('tr-TR').replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1');
}
