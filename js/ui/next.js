// The button that moves a game on to its next round (or to the result). One phone: an ordinary
// button. Two phones: only the room's host moves the game on (see js/session.js), so the two
// players can never both press it and have the second tap land on whatever the next screen puts
// under the finger. The guest's phone says "ready" instead, and the host's button shows it.
import { el } from './dom.js';
import { nameSuffix } from '../lib/tr.js';

/**
 * @param {object} ctx       the game's render context (players, mode, self, ask, requestNext)
 * @param {(move: object) => void} sendMove
 * @param {string} label     e.g. 'Sonraki el', 'Sonucu gör'
 * @param {object} [opts]
 * @param {object|(() => object)} [opts.move]  the move to send (a function is called at the tap,
 *   for moves that carry what the presser sees, like İsim Şehir's vetoes); default { type: 'next' }
 * @param {object} [opts.style]
 * @param {string} [opts.className]
 */
export function nextButton(ctx, sendMove, label, opts = {}) {
  const { move = { type: 'next' }, style = { marginTop: '12px' }, className = 'btn btn-primary btn-big btn-block' } = opts;
  const players = (ctx && ctx.players) || ['Oyuncu 1', 'Oyuncu 2'];
  const ask = (ctx && ctx.ask) || {};
  const online = !!ctx && ctx.mode === 'online';
  if (!online || ctx.self === 0) {
    const ready = online && !!ask.peerAsked;
    return el('button', {
      type: 'button',
      class: `${className} next-btn${ready ? ' next-ready' : ''}`,
      style,
      onClick: () => sendMove(typeof move === 'function' ? move() : move),
    }, label, ready ? el('span', { class: 'next-ready-tag' }, ` · ${players[1]} hazır`) : null);
  }
  const asked = !!ask.asked;
  return el('div', { class: 'next-ask', style },
    el('button', {
      type: 'button',
      class: `${className.replace('btn-primary', 'btn-secondary')} next-btn`,
      disabled: asked,
      onClick: () => { if (ctx.requestNext) ctx.requestNext(); },
    }, asked ? 'Hazır olduğun iletildi ✓' : 'Hazırım'),
    el('p', { class: 'hint next-ask-note' }, asked
      ? `${players[0]} "${label}" diyecek…`
      : `"${label}" düğmesi ${nameSuffix(players[0], 'de')} (odayı kuran). Hazır olunca haber ver.`),
  );
}
