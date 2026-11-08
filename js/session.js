// A game session: holds the state, applies moves, runs automatic moves, and renders.
// The same class drives single-phone (mode 'local') and online (mode 'online') play.
//
// Online rule: every move is applied locally and sent to the other device with a
// per-sender sequence number; each device applies its own moves immediately and the
// other device's moves as they arrive. The two devices may therefore see concurrent
// moves in different orders, which is safe only when such moves commute (e.g. each
// player choosing their own secret). Everything else is turn-based by the game rules,
// so only one device can make a legal move at a time.
// A move may carry a `secret` field (e.g. the secret word) which is never sent.
//
// Moving on to the next round (a move of type 'next') is the host's call on two phones: the
// guest's phone turns its own 'next' into a request ('ask'), so the two players can never both
// press it and have the second tap land on whatever the new screen shows under the finger. After
// a 'next' or 'start' move (either phone, or one phone) taps are ignored for a moment as well.
import { showHandoff } from './ui/handoff.js';
import { toast } from './ui/dom.js';

const SWITCH_GUARD_MS = 350; // taps ignored this long after the turn passes to the other player (one phone) or to this phone (two phones)
export const ADVANCE_GUARD_MS = 800; // and this long after a new round or screen starts ('next' / 'start')
export const ADVANCE_MOVES = new Set(['next', 'start']);

const say = (message, opts) => { if (typeof document !== 'undefined') toast(message, opts); };

export function stripSecret(move) {
  if (move && typeof move === 'object' && 'secret' in move) {
    const { secret, ...rest } = move; // eslint-disable-line no-unused-vars
    return rest;
  }
  return move;
}

export class Session {
  /**
   * @param {object} opts
   * @param {object} opts.game          game module (see games/README in PLAN.md)
   * @param {object} opts.options       game options (from meta.settings)
   * @param {string[]} opts.players     two player names
   * @param {HTMLElement} opts.container
   * @param {'local'|'online'} [opts.mode]
   * @param {0|1|null} [opts.self]      which player this device is (online only)
   * @param {{send(msg: object): void}|null} [opts.transport]
   * @param {object} [opts.ctx]         extra context for the game (dict, common, questions, ...)
   * @param {(result: object, state: object) => void} [opts.onEnd]
   * @param {(state: object) => void} [opts.onChange]
   * @param {number|string} [opts.tag]  online: identifies this game, so that a request meant for an
   *   earlier game is not taken for this one
   */
  constructor(opts) {
    this.game = opts.game;
    this.options = opts.options || {};
    this.players = opts.players;
    this.container = opts.container;
    this.mode = opts.mode || 'local';
    this.self = opts.self ?? null;
    this.transport = opts.transport || null;
    this.tag = opts.tag ?? null;
    // 'next' requests on two phones: asked (this guest asked the host), peerAsked (the host was
    // asked), nexts ('next' moves applied so far, which tells a request for this screen from a stale one)
    this.ask = { asked: false, peerAsked: false, nexts: 0 };
    this.ctx = {
      ...(opts.ctx || {}),
      players: this.players,
      mode: this.mode,
      self: this.self,
      options: this.options,
      isHost: this.mode !== 'online' || this.self === 0,
      ask: this.ask,
      requestNext: () => this.requestNext(),
    };
    this.onEnd = opts.onEnd || (() => {});
    this.onChange = opts.onChange || (() => {});
    this.state = null;
    this.log = [];
    this.sent = 0;      // moves sent to the other device
    this.received = 0;  // moves received from the other device
    this.ended = false;
    this.destroyed = false;
    this.result = null;
    this.lastTurn = null;
    this.lastViewer = null;
    this.cleanup = null;
  }

  /** Start with a fresh state (or a given initial state received from the host). */
  start(initialState) {
    this.state = initialState ?? this.game.setup(this.options, this.ctx);
    this.log = [];
    this.sent = 0;
    this.received = 0;
    this.ended = false;
    this.result = null;
    this.lastTurn = null;
    this.lastViewer = null;
    Object.assign(this.ask, { asked: false, peerAsked: false, nexts: 0 });
    this.runAuto();
    this.checkEnd();
    this.render();
    return this.state;
  }

  /** Does this device act for the given player? */
  controls(player) {
    return this.mode === 'local' || this.self === player;
  }

  // Moves are still accepted after the result is known (e.g. revealing the secret word);
  // the game's applyMove decides what is legal at that point.
  apply(player, move, { remote = false } = {}) {
    if (this.destroyed || !this.state) return false;
    let next;
    try {
      next = this.game.applyMove(this.state, player, move, remote ? { ...this.ctx, remote: true } : this.ctx);
    } catch (err) {
      if (remote) console.warn('Karşı cihazdan gelen hamle reddedildi:', err);
      else say(err && err.message ? err.message : 'Geçersiz hamle', { kind: 'error' });
      return false;
    }
    if (!next || next === this.state) return false;
    this.state = next;
    if (move.type === 'next') Object.assign(this.ask, { asked: false, peerAsked: false, nexts: this.ask.nexts + 1 });
    if (ADVANCE_MOVES.has(move.type)) this.guardPending = true; // a new screen: see renderNow
    const publicMove = stripSecret(move);
    if (!remote && this.mode === 'online') {
      const seq = this.sent++;
      this.log.push({ player, move: publicMove, own: true, seq });
      if (this.transport) this.transport.send({ t: 'move', seq, player, move: publicMove });
    } else {
      this.log.push({ player, move: publicMove, own: false });
    }
    return true;
  }

  /** Apply a move for a player, then run automatic moves, check the result and re-render. */
  dispatch(player, move, opts) {
    // two phones: the guest does not move the game on, it asks the host to (any game's 'next')
    if (move && move.type === 'next' && !(opts && opts.remote) && this.mode === 'online' && this.self !== 0) {
      this.requestNext();
      return;
    }
    if (this.apply(player, move, opts)) {
      this.runAuto();
      this.checkEnd();
      this.render();
    }
  }

  /** Let the game emit moves this device must make on its own (e.g. scoring a guess). */
  runAuto() {
    if (!this.game.autoMove) return;
    for (let guard = 0; guard < 50; guard++) {
      let did = false;
      for (const p of [0, 1]) {
        if (!this.controls(p)) continue;
        const move = this.game.autoMove(this.state, p, this.ctx);
        if (move && this.apply(p, move)) { did = true; break; }
      }
      if (!did) return;
    }
  }

  /** Guest (two phones): tell the host this player is ready for the next round. */
  requestNext() {
    if (this.mode !== 'online' || this.self === 0 || this.destroyed || this.ended || this.ask.asked) return false;
    this.ask.asked = true;
    if (this.transport) this.transport.send({ t: 'ask', what: 'next', nexts: this.ask.nexts, tag: this.tag });
    this.render();
    return true;
  }

  /** Host (two phones): the guest is ready for the next round. False for a request about another screen. */
  receiveAsk(msg) {
    if (this.mode !== 'online' || this.self !== 0 || this.destroyed || this.ended) return false;
    if (!msg || msg.what !== 'next' || (msg.tag ?? null) !== this.tag) return false;
    if (Number(msg.nexts) !== this.ask.nexts || this.ask.peerAsked) return false; // asked before our last 'next', or again
    this.ask.peerAsked = true;
    this.render();
    return true;
  }

  /**
   * Ignore taps on the game for `ms`: the screen just changed under a finger that may still be
   * coming down. `fresh` (a new round) also fades the new screen in, so the change is seen.
   */
  blockTaps(ms, fresh = false) {
    const c = this.container;
    if (!c || !c.style) return;
    if (fresh && c.classList) c.classList.add('screen-new');
    const until = Date.now() + ms;
    if (this.tapsBlockedUntil && this.tapsBlockedUntil >= until) return;
    this.tapsBlockedUntil = until;
    c.style.pointerEvents = 'none';
    if (c.classList) c.classList.add('tap-guard');
    clearTimeout(this.tapGuard);
    this.tapGuard = setTimeout(() => this.unblockTaps(), ms);
  }

  unblockTaps() {
    clearTimeout(this.tapGuard);
    this.tapsBlockedUntil = 0;
    const c = this.container;
    if (c && c.style) c.style.pointerEvents = '';
    if (c && c.classList) c.classList.remove('tap-guard', 'screen-new');
  }

  /** Our own moves from sequence number `from` on, as wire messages (for resuming after a drop). */
  ownMovesFrom(from) {
    return this.log.filter((e) => e.own && e.seq >= from).map((e) => ({ t: 'move', seq: e.seq, player: e.player, move: e.move }));
  }

  /** A message from the other device. Returns false when it is not a move for this session. */
  receive(msg) {
    if (!msg || msg.t !== 'move') return false;
    if (typeof msg.seq === 'number' && msg.seq < this.received) return false; // duplicate after a resume
    if (typeof msg.seq === 'number' && msg.seq > this.received) {
      // a move was lost in between (link dropped): wait for the resume replay to fill the gap
      console.warn(`Hamle sırası uyuşmuyor (gelen ${msg.seq}, beklenen ${this.received}); bekleniyor`);
      return false;
    }
    this.received += 1;
    if (this.self !== null && msg.player === this.self) return false; // never accept moves "from us"
    const move = { ...msg.move };
    // Timers are based on the local clock: stamp remote moves with our own time.
    if (typeof move.at === 'number') move.at = Date.now();
    this.dispatch(msg.player, move, { remote: true });
    return true;
  }

  checkEnd() {
    if (this.ended) return;
    const result = this.game.getResult(this.state);
    if (result) {
      this.ended = true;
      this.result = result;
      this.onEnd(result, this.state);
    }
  }

  currentTurn() {
    return this.game.getTurn ? this.game.getTurn(this.state) : null;
  }

  render() {
    // a game must never dispatch from inside its render; if one does, finish this render
    // first and then draw again with the newer state
    if (this.rendering) { this.renderAgain = true; return; }
    this.rendering = true;
    try {
      this.renderNow();
    } finally {
      this.rendering = false;
      if (this.renderAgain) { this.renderAgain = false; this.render(); }
    }
  }

  renderNow() {
    if (this.cleanup) {
      try { this.cleanup(); } catch (err) { console.warn(err); }
      this.cleanup = null;
    }
    const turn = this.currentTurn();
    // a new round or screen ('next' / 'start', from either phone): the tap that was still on its way
    // to the old button must not press what the new screen puts in its place
    if (this.guardPending) { this.guardPending = false; this.blockTaps(ADVANCE_GUARD_MS, true); }
    let viewer;
    if (this.mode === 'online') {
      viewer = this.self;
      // a short buzz when the turn passes to this device (not on the first render)
      const mine = !!(turn && turn.player === this.self && !turn.simultaneous && !this.ended);
      if (mine && this.lastMine === false) {
        this.blockTaps(SWITCH_GUARD_MS); // the board just changed under this player's finger
        if (this.ctx.vibrate && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try { navigator.vibrate(80); } catch { /* ignore */ }
        }
      }
      this.lastMine = mine;
    } else {
      viewer = turn && turn.player != null ? turn.player : (this.lastViewer ?? 0);
      // one phone, the other player's turn now: ignore taps for a moment, so that a double tap
      // on the move just made cannot also act for the next player (cards, cells under the finger)
      if (this.lastViewer != null && viewer !== this.lastViewer) this.blockTaps(SWITCH_GUARD_MS);
      if (!this.ended && turn && turn.player != null) {
        const first = !this.lastTurn && turn.private;
        const changed = this.lastTurn && this.lastTurn.player !== turn.player && (turn.private || this.lastTurn.private);
        if (first || changed) {
          this.lastTurn = turn;
          this.lastViewer = viewer;
          showHandoff(this.container, {
            name: this.players[turn.player],
            note: turn.note || this.game.meta.handoffNote || null, // a turn may carry its own note
            onReady: () => this.render(),
          });
          this.onChange(this.state);
          return;
        }
      }
    }
    this.lastTurn = turn;
    this.lastViewer = viewer;
    const send = (move) => this.dispatch(viewer, move);
    const out = this.game.render(this.state, viewer, this.container, send, this.ctx);
    if (typeof out === 'function') this.cleanup = out;
    this.onChange(this.state);
  }

  destroy() {
    if (this.cleanup) {
      try { this.cleanup(); } catch { /* ignore */ }
      this.cleanup = null;
    }
    this.unblockTaps();
    this.destroyed = true;
  }
}
