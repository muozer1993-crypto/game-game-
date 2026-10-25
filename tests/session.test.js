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
