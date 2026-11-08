import { test, assert } from './runner.js';
import { stripSecret } from '../js/session.js';

test('session: stripSecret gizli alanı siler, diğerlerini bırakır', () => {
  assert.deepEqual(stripSecret({ type: 'setSecret', secret: { word: 'kalem' } }), { type: 'setSecret' });
  assert.deepEqual(stripSecret({ type: 'guess', word: 'kalem' }), { type: 'guess', word: 'kalem' });
  assert.equal(stripSecret(null), null);
});

import { Session } from '../js/session.js';
import gizliKelime from '../games/gizli-kelime.js';
import { dictionaryFrom } from '../js/lib/words.js';

/** Two sessions wired back to back through an in-memory, ordered transport. */
function pair(game, options, ctx) {
  const inbox = [[], []];
  const make = (self) => {
    const transport = { send: (msg) => inbox[1 - self].push(JSON.parse(JSON.stringify(msg))) };
    const container = { firstChild: null, append() {}, removeChild() {} };
    const quiet = { ...game, render: () => null };
    return new Session({ game: quiet, options, players: ['Ayşe', 'Ali'], container, mode: 'online', self, transport, ctx });
  };
  const sessions = [make(0), make(1)];
  const deliver = () => {
    let moved = true;
    while (moved) {
      moved = false;
      for (const p of [0, 1]) {
        while (inbox[p].length) { sessions[p].receive(inbox[p].shift()); moved = true; }
      }
    }
  };
  return { sessions, deliver, inbox };
}

const ctx = { dict: dictionaryFrom(['kalem', 'tahta', 'kitap', 'abla', 'kara']), common: { 5: ['kalem', 'tahta'] } };

test('session (online): her iki cihaz aynı anda gizli kelime seçince durumlar eşitlenir', () => {
  const { sessions, deliver, inbox } = pair(gizliKelime, { length: 5, secretMode: 'random', feedback: 'wordle', maxGuesses: 6 }, ctx);
  const state0 = gizliKelime.setup({ length: 5, secretMode: 'random', feedback: 'wordle', maxGuesses: 6 });
  sessions[0].start(state0);
  sessions[1].start(JSON.parse(JSON.stringify(state0)));
  // both devices chose their own secret and sent a stripped move with seq 0
  assert.equal(inbox[1].length, 1);
  assert.equal(inbox[0].length, 1);
  assert.equal(inbox[1][0].seq, 0);
  assert.equal(inbox[1][0].move.secret, undefined, 'secret never leaves the device');
  deliver();
  assert.equal(sessions[0].state.phase, 'play');
  assert.equal(sessions[1].state.phase, 'play');
  assert.deepEqual(sessions[0].state.ready, [true, true]);
  assert.ok(sessions[0].state.secrets[0] && !sessions[0].state.secrets[1], 'host knows only its own secret');
  assert.ok(sessions[1].state.secrets[1] && !sessions[1].state.secrets[0], 'guest knows only its own secret');
});

test('session (online): tahmin karşı cihazda puanlanır, iki tarafta aynı sonuç', () => {
  const { sessions, deliver } = pair(gizliKelime, { length: 5, secretMode: 'random', feedback: 'wordle', maxGuesses: 6 }, ctx);
  const state0 = gizliKelime.setup({ length: 5, secretMode: 'random', feedback: 'wordle', maxGuesses: 6 });
  sessions[0].start(state0);
  sessions[1].start(JSON.parse(JSON.stringify(state0)));
  deliver();
  sessions[0].dispatch(0, { type: 'guess', word: 'kitap' });
  assert.equal(sessions[0].state.guesses[0][0].result, null, 'pending on the guesser until the owner scores it');
  deliver(); // guest scores it automatically and sends the feedback back
  assert.ok(Array.isArray(sessions[0].state.guesses[0][0].result));
  assert.deepEqual(sessions[0].state.guesses[0][0].result, sessions[1].state.guesses[0][0].result);
  assert.equal(sessions[0].sent, 2); // setSecret + guess
  assert.equal(sessions[1].sent, 2); // setSecret + feedback
  assert.equal(sessions[0].received, 2);
  // the guest finishes the round and wins or draws; both devices agree on the result
  sessions[1].dispatch(1, { type: 'guess', word: sessions[0].state.secrets[0] });
  deliver();
  assert.equal(sessions[0].ended, true);
  assert.equal(sessions[1].ended, true);
  assert.deepEqual(sessions[0].result, sessions[1].result);
  assert.deepEqual(sessions[0].state.revealed, sessions[1].state.revealed, 'both secrets revealed on both devices');
});

test('session (online): kendi hamlemizin yankısı yok sayılır', () => {
  const { sessions } = pair(gizliKelime, { length: 5 }, ctx);
  sessions[0].start(gizliKelime.setup({ length: 5 }));
  const before = JSON.stringify(sessions[0].state);
  assert.equal(sessions[0].receive({ t: 'move', seq: 0, player: 0, move: { type: 'setSecret' } }), false);
  assert.equal(JSON.stringify(sessions[0].state), before);
});

test('session (online): kopan bağlantıdan sonra kaçırılan hamleler yeniden gönderilir', () => {
  const { sessions, deliver, inbox } = pair(gizliKelime, { length: 5, secretMode: 'random', feedback: 'wordle', maxGuesses: 6 }, ctx);
  const state0 = gizliKelime.setup({ length: 5, secretMode: 'random', feedback: 'wordle', maxGuesses: 6 });
  sessions[0].start(state0);
  sessions[1].start(JSON.parse(JSON.stringify(state0)));
  deliver();
  // the link drops: host guesses while the guest hears nothing
  inbox[1].length = 0;
  sessions[0].dispatch(0, { type: 'guess', word: 'kitap' });
  inbox[1].length = 0; // lost in transit
  assert.equal(sessions[1].state.guesses[0].length, 0);
  // reconnect: the guest says what it has received; the host replays its own moves from there
  const missed = sessions[0].ownMovesFrom(sessions[1].received);
  assert.equal(missed.length, 1);
  assert.equal(missed[0].move.word, 'kitap');
  for (const m of missed) sessions[1].receive(m);
  assert.equal(sessions[1].state.guesses[0].length, 1);
  deliver(); // the guest scores it and the feedback reaches the host
  assert.deepEqual(sessions[0].state.guesses[0][0].result, sessions[1].state.guesses[0][0].result);
  // a duplicate replay is ignored
  const before = JSON.stringify(sessions[1].state);
  assert.equal(sessions[1].receive(missed[0]), false);
  assert.equal(JSON.stringify(sessions[1].state), before);
});

test('session (online): sıradaki hamle kaybolduysa sonraki hamle uygulanmaz, sayaç ilerlemez', () => {
  const { sessions, deliver } = pair(gizliKelime, { length: 5, secretMode: 'random', feedback: 'wordle', maxGuesses: 6 }, ctx);
  const state0 = gizliKelime.setup({ length: 5, secretMode: 'random', feedback: 'wordle', maxGuesses: 6 });
  sessions[0].start(state0);
  sessions[1].start(JSON.parse(JSON.stringify(state0)));
  deliver();
  const before = sessions[1].received;
  assert.equal(sessions[1].receive({ t: 'move', seq: before + 1, player: 0, move: { type: 'guess', word: 'kitap' } }), false);
  assert.equal(sessions[1].received, before, 'the gap is kept for the resume replay');
  assert.equal(sessions[1].state.guesses[0].length, 0);
});

// ---- moving on to the next round on two phones: the host moves the game on, the guest asks
import { ADVANCE_GUARD_MS } from '../js/session.js';

const rounds = {
  id: 'rounds-test',
  meta: { name: 'Turlar' },
  setup: () => ({ round: 0, phase: 'play', taps: [0, 0] }),
  applyMove(state, player, move) {
    if (move.type === 'tap') { if (state.phase !== 'play') throw new Error('tur bitti'); const taps = state.taps.slice(); taps[player] += 1; return { ...state, taps }; }
    if (move.type === 'end') { if (state.phase !== 'play') throw new Error('zaten bitti'); return { ...state, phase: 'result' }; }
    if (move.type === 'next') { if (state.phase !== 'result') throw new Error('tur bitmedi'); return { ...state, round: state.round + 1, phase: 'play' }; }
    throw new Error('?');
  },
  render: () => null,
  getTurn: (state) => (state.phase === 'play' ? { player: 0, private: false, simultaneous: true } : null),
  getResult: (state) => (state.round >= 3 ? { draw: true } : null),
};

function fakeContainer() {
  const classes = new Set();
  return { style: {}, classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)), has: (c) => classes.has(c) }, firstChild: null, append() {}, removeChild() {} };
}

function pairWith(game, { tag = 1 } = {}) {
  const inbox = [[], []];
  const sessions = [0, 1].map((self) => new Session({
    game, options: {}, players: ['Ayşe', 'Ali'], container: fakeContainer(), mode: 'online', self, tag,
    transport: { send: (msg) => inbox[1 - self].push(JSON.parse(JSON.stringify(msg))) },
  }));
  const deliver = () => {
    let moved = true;
    while (moved) {
      moved = false;
      for (const p of [0, 1]) {
        while (inbox[p].length) {
          const msg = inbox[p].shift();
          if (msg.t === 'ask') sessions[p].receiveAsk(msg); else sessions[p].receive(msg);
          moved = true;
        }
      }
    }
  };
  return { sessions, inbox, deliver };
}

test('sonraki tur (iki telefon): konuğun "sonraki"si oda kurucuya istek olur, oyunu ilerletmez', () => {
  const { sessions, inbox, deliver } = pairWith(rounds);
  const s0 = rounds.setup();
  sessions[0].start(s0);
  sessions[1].start(JSON.parse(JSON.stringify(s0)));
  sessions[0].dispatch(0, { type: 'end' });
  deliver();
  assert.equal(sessions[1].state.phase, 'result');
  sessions[1].dispatch(1, { type: 'next' }); // the guest presses its button
  assert.equal(sessions[1].state.phase, 'result', 'the guest does not move on by itself');
  assert.equal(sessions[1].sent, 0, 'no move was sent');
  assert.ok(sessions[1].ask.asked);
  assert.equal(inbox[0].length, 1);
  assert.equal(inbox[0][0].t, 'ask');
  assert.equal(sessions[1].requestNext(), false, 'asking twice sends nothing');
  deliver();
  assert.ok(sessions[0].ask.peerAsked, 'the host sees that the guest is ready');
  sessions[0].dispatch(0, { type: 'next' });
  deliver();
  assert.equal(sessions[0].state.round, 1);
  assert.equal(sessions[1].state.round, 1);
  assert.equal(sessions[0].state.phase, 'play');
  assert.ok(!sessions[0].ask.peerAsked && !sessions[1].ask.asked, 'the requests are cleared on both phones');
  assert.equal(sessions[0].ask.nexts, 1);
  assert.equal(sessions[1].ask.nexts, 1);
});

test('sonraki tur (iki telefon): ev sahibinin geçişiyle çaprazlanan eski istek yeni ekranda sayılmaz', () => {
  const { sessions, inbox, deliver } = pairWith(rounds, { tag: 7 });
  const s0 = rounds.setup();
  sessions[0].start(s0);
  sessions[1].start(JSON.parse(JSON.stringify(s0)));
  sessions[0].dispatch(0, { type: 'end' });
  deliver();
  sessions[1].requestNext();          // on its way to the host…
  sessions[0].dispatch(0, { type: 'next' }); // …while the host moves on
  deliver();
  assert.ok(!sessions[0].ask.peerAsked, 'the request was about the previous screen');
  assert.ok(!sessions[1].ask.asked);
  assert.equal(sessions[0].receiveAsk({ t: 'ask', what: 'next', nexts: 1, tag: 6 }), false, 'a request from another game is ignored');
  assert.equal(sessions[0].receiveAsk({ t: 'ask', what: 'next', nexts: 1, tag: 7 }), true);
  assert.equal(inbox[0].length + inbox[1].length, 0);
});

test('sonraki tur: yeni ekran gelince dokunuşlar bir an yok sayılır (iki telefon ve tek telefon)', async () => {
  const { sessions, deliver } = pairWith(rounds);
  const s0 = rounds.setup();
  sessions[0].start(s0);
  sessions[1].start(JSON.parse(JSON.stringify(s0)));
  sessions[0].dispatch(0, { type: 'end' });
  deliver();
  assert.equal(sessions[1].container.style.pointerEvents || '', '', 'an ordinary move does not block anything');
  sessions[0].dispatch(0, { type: 'next' });
  assert.equal(sessions[0].container.style.pointerEvents, 'none', 'the host: a double tap cannot act on the new screen');
  deliver();
  assert.equal(sessions[1].container.style.pointerEvents, 'none', 'the guest: the tap that was coming down is swallowed');
  assert.ok(sessions[1].container.classList.has('screen-new'));
  const local = new Session({ game: rounds, options: {}, players: ['Ayşe', 'Ali'], container: fakeContainer(), mode: 'local' });
  local.start();
  local.dispatch(0, { type: 'end' });
  local.dispatch(0, { type: 'next' });
  assert.equal(local.container.style.pointerEvents, 'none', 'one phone: both players reaching for the button');
  await new Promise((r) => setTimeout(r, ADVANCE_GUARD_MS + 60));
  for (const s of [sessions[0], sessions[1], local]) {
    assert.equal(s.container.style.pointerEvents, '', 'taps work again');
    assert.ok(!s.container.classList.has('tap-guard'));
  }
  local.destroy();
  sessions.forEach((s) => s.destroy());
});
