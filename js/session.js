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
import { showHandoff } from './ui/handoff.js';
import { toast } from './ui/dom.js';

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
   */
  constructor(opts) {
    this.game = opts.game;
    this.options = opts.options || {};
    this.players = opts.players;
    this.container = opts.container;
    this.mode = opts.mode || 'local';
    this.self = opts.self ?? null;
    this.transport = opts.transport || null;
    this.ctx = { ...(opts.ctx || {}), players: this.players, mode: this.mode, self: this.self, options: this.options };
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
      else toast(err && err.message ? err.message : 'Geçersiz hamle', { kind: 'error' });
      return false;
    }
    if (!next || next === this.state) return false;
    this.state = next;
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

  /** Our own moves from sequence number `from` on, as wire messages (for resuming after a drop). */
  ownMovesFrom(from) {
    return this.log.filter((e) => e.own && e.seq >= from).map((e) => ({ t: 'move', seq: e.seq, player: e.player, move: e.move }));
  }

  /** A message from the other device. Returns false when it is not a move for this session. */
  receive(msg) {
    if (!msg || msg.t !== 'move') return false;
    if (typeof msg.seq === 'number' && msg.seq < this.received) return false; // duplicate after a resume
    if (typeof msg.seq === 'number' && msg.seq !== this.received) {
      console.warn(`Hamle sırası uyuşmuyor (gelen ${msg.seq}, beklenen ${this.received})`);
    }
    this.received = (typeof msg.seq === 'number' ? msg.seq : this.received) + 1;
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
    if (this.cleanup) {
      try { this.cleanup(); } catch (err) { console.warn(err); }
      this.cleanup = null;
    }
    const turn = this.currentTurn();
    let viewer;
    if (this.mode === 'online') {
      viewer = this.self;
    } else {
      viewer = turn && turn.player != null ? turn.player : (this.lastViewer ?? 0);
      if (!this.ended && turn && turn.player != null) {
        const first = !this.lastTurn && turn.private;
        const changed = this.lastTurn && this.lastTurn.player !== turn.player && (turn.private || this.lastTurn.private);
        if (first || changed) {
          this.lastTurn = turn;
          this.lastViewer = viewer;
          showHandoff(this.container, {
            name: this.players[turn.player],
            note: this.game.meta.handoffNote || null,
            onReady: () => this.render(),
          });
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
    this.destroyed = true;
  }
}
