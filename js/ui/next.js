// The button that moves a game on to its next round (or to the result). One phone: an ordinary
// button. Two phones: only the room's host moves the game on (see js/session.js), so the two
// players can never both press it and have the second tap land on whatever the next screen puts
// under the finger. The guest's phone says "ready" instead, and the host's button shows it.
import { el } from './dom.js';
import { nameSuffix } from '../lib/tr.js';

const readyTag = (name) => el('span', { class: 'next-ready-tag' }, ` · ${name} hazır`);

/**
 * @param {object} ctx       the game's render context (players, mode, self, ask, requestNext)
 * @param {(move: object) => void} sendMove
 * @param {string} label     e.g. 'Sonraki el', 'Sonucu gör'
 * @param {object} [opts]
 * @param {object|(() => object)} [opts.move]  the move to send (a function is called at the tap,
 *   for moves that carry what the presser sees, like İsim Şehir's vetoes); default { type: 'next' }
 * @param {boolean} [opts.waitForPeer]  two phones: the guest still has something to do on this
 *   screen (objections); the host is asked to confirm moving on before the guest says it is ready
 * @param {object} [opts.style]
 * @param {string} [opts.className]
 */
export function nextButton(ctx, sendMove, label, opts = {}) {
  const { move = { type: 'next' }, style = { marginTop: '12px' }, className = 'btn btn-primary btn-big btn-block', waitForPeer = false } = opts;
  const players = (ctx && ctx.players) || ['Oyuncu 1', 'Oyuncu 2'];
  const ask = (ctx && ctx.ask) || {};
  const online = !!ctx && ctx.mode === 'online';
  if (!online || ctx.self === 0) {
    const ready = online && !!ask.peerAsked;
    return el('button', {
      type: 'button',
      class: `${className} next-btn${ready ? ' next-ready' : ''}`,
      style,
      onClick: () => {
        if (online && waitForPeer && !ask.peerAsked && typeof confirm === 'function'
          && !confirm(`${players[1]} henüz "Hazırım" demedi; itirazlarını bitirmemiş olabilir. Yine de geçilsin mi?`)) return;
        sendMove(typeof move === 'function' ? move() : move);
      },
    }, label, ready ? readyTag(players[1]) : null);
  }
  const asked = !!ask.asked;
  const note = el('p', { class: 'hint next-ask-note' }, asked
    ? `${players[0]} "${label}" diyecek…`
    : `"${label}" düğmesi ${nameSuffix(players[0], 'de')} (odayı kuran). Hazır olunca haber ver.`);
  const button = el('button', {
    type: 'button',
    class: `${className.replace('btn-primary', 'btn-secondary')} next-btn`,
    disabled: asked,
    onClick: () => {
      // updated in place: redrawing the game would reset whatever else is on this screen
      if (!ctx.requestNext || !ctx.requestNext({ render: false })) return;
      button.disabled = true;
      button.textContent = 'Hazır olduğun iletildi ✓';
      note.textContent = `${players[0]} "${label}" diyecek…`;
    },
  }, asked ? 'Hazır olduğun iletildi ✓' : 'Hazırım');
  return el('div', { class: 'next-ask', style }, button, note);
}

/** Host: the guest said it is ready; mark the "next" buttons on the screen without redrawing it. */
export function markNextReady(container, name) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  for (const b of container.querySelectorAll('.next-btn:not(.next-ready)')) {
    b.classList.add('next-ready');
    b.append(readyTag(name));
  }
}
