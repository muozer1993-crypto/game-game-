// Small sound effects, synthesised with the Web Audio API (no sound files to download or cache):
// billiard ball clicks and pocket thuds, rattling dice, a short tune at the end of a game.
// One switch for the whole app (the 🔊 button on the menu); everything is silent when it is off
// or when the browser has no audio.

let enabled = true;
let ac = null;
let lastClick = 0;

export function setSoundEnabled(on) {
  enabled = !!on;
  if (!enabled && ac && ac.state === 'running') ac.suspend().catch(() => {});
}

export const soundEnabled = () => enabled;

function audio() {
  if (!enabled) return null;
  try {
    if (!ac) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  } catch {
    return null;
  }
}

/** A short burst of filtered noise (the body of a click or a rattle). */
function noise(a, at, dur, freq, gain) {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 1.2;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(at);
}

function tone(a, at, freq, dur, gain, type = 'sine', toFreq = null) {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, at + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** Two balls touching; `strength` 0..1 sets the loudness. Rapid repeats are thinned out. */
export function playClick(strength = 0.5) {
  const a = audio();
  if (!a) return;
  const now = a.currentTime;
  if (now - lastClick < 0.03) return;
  lastClick = now;
  const v = Math.min(1, Math.max(0.08, strength));
  tone(a, now, 2600, 0.035, 0.18 * v, 'triangle');
  noise(a, now, 0.03, 3200, 0.5 * v);
}

/** A ball dropping into a pocket. */
export function playPocket() {
  const a = audio();
  if (!a) return;
  const now = a.currentTime;
  tone(a, now, 180, 0.22, 0.35, 'sine', 70);
  noise(a, now, 0.12, 400, 0.4);
}

/** Dice rolling on the table. */
export function playDice() {
  const a = audio();
  if (!a) return;
  const now = a.currentTime;
  for (let k = 0; k < 6; k++) {
    const at = now + k * 0.045 + Math.random() * 0.02;
    noise(a, at, 0.035, 1800 + Math.random() * 1400, 0.45 * (1 - k / 8));
  }
}

/** End of a game: a rising arpeggio for a win, two soft notes for a draw. */
export function playEnd(draw = false) {
  const a = audio();
  if (!a) return;
  const now = a.currentTime;
  const notes = draw ? [523.25, 523.25] : [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(a, now + i * 0.11, f, 0.28, 0.16, 'triangle'));
}

const seenRolls = new WeakSet();
let lastRollKey = null;
/**
 * Dice sound once per roll, however often the screen is redrawn: `token` is an object that a new
 * roll replaces (WeakSet) or a string key that changes with every roll.
 */
export function diceOnce(token) {
  if (!token) return;
  if (typeof token === 'object') {
    if (seenRolls.has(token)) return;
    seenRolls.add(token);
  } else {
    if (token === lastRollKey) return;
    lastRollKey = token;
  }
  playDice();
}
