// Taş Kağıt Makas — both players pick secretly, then the picks are revealed. Best of N rounds.
import { el, render as draw } from '../js/ui/dom.js';
import { nameSuffix } from '../js/lib/tr.js';

export const meta = {
  group: 'masa',
  name: 'Taş Kağıt Makas',
  icon: '✊',
  description: 'Gizlice seç, birlikte aç. Beşte üç alan kazanır.',
  rules: [
    'İkiniz de gizlice taş, kağıt ya da makas seçersiniz; ikiniz de seçince seçimler açılır.',
    'Taş makası, makas kağıdı, kağıt taşı yener. Aynı seçim berabere sayılır ve el tekrarlanmaz, yeni ele geçilir.',
    'Ayarlardaki el sayısının çoğunluğunu alan kazanır (varsayılan beşte üç).',
  ].join('\n'),
  data: [],
  handoffNote: 'Seçimini rakibin görmemeli.',
  settings: [
    { key: 'rounds', label: 'El sayısı', type: 'select', default: 5, options: [{ value: 3, label: 'Üçte iki' }, { value: 5, label: 'Beşte üç' }, { value: 7, label: 'Yedide dört' }] },
  ],
};

export const CHOICES = ['tas', 'kagit', 'makas'];
const LABEL = { tas: 'Taş', kagit: 'Kağıt', makas: 'Makas' };
const ICON = { tas: '✊', kagit: '✋', makas: '✌️' };
const BEATS = { tas: 'makas', makas: 'kagit', kagit: 'tas' };

function fail(msg) {
  throw new Error(msg);
}

export function setup(options = {}) {
  const rounds = [3, 5, 7].includes(Number(options.rounds)) ? Number(options.rounds) : 5;
  return {
    rounds,
    target: Math.ceil(rounds / 2),
    phase: 'pick',          // pick | result | over
    picks: [null, null],    // secret until revealed (only the owner's device knows)
    picked: [false, false], // public: has the player chosen this round?
    shown: [null, null],    // public after reveal
    history: [],            // { picks: [a, b], winner: 0|1|null }
    scores: [0, 0],
    over: false,
  };
}

export function roundWinner(a, b) {
  if (a === b) return null;
  return BEATS[a] === b ? 0 : 1;
}

export function applyMove(state, player, move) {
  if (!move || typeof move !== 'object') fail('Geçersiz hamle');
  if (state.over) fail('Oyun bitti');
  switch (move.type) {
    case 'pick': {
      if (state.phase !== 'pick') fail('Önce sonraki ele geçin');
      if (state.picked[player]) fail('Bu el için zaten seçtin');
      const picks = state.picks.slice();
      if (move.secret && move.secret.choice != null) {
        if (!CHOICES.includes(move.secret.choice)) fail('Geçersiz seçim');
        picks[player] = move.secret.choice;
      }
      const picked = state.picked.slice();
      picked[player] = true;
      return { ...state, picks, picked };
    }
    case 'show': {
      if (!state.picked[0] || !state.picked[1]) fail('Önce ikiniz de seçmelisiniz');
      if (state.shown[player] != null) return state;
      if (!CHOICES.includes(move.choice)) fail('Geçersiz seçim');
      const shown = state.shown.slice();
      shown[player] = move.choice;
      let next = { ...state, shown };
      if (shown[0] != null && shown[1] != null) {
        const w = roundWinner(shown[0], shown[1]);
        const scores = state.scores.slice();
        if (w != null) scores[w] += 1;
        const history = state.history.concat([{ picks: shown.slice(), winner: w }]);
        const over = scores[0] >= state.target || scores[1] >= state.target || history.length >= state.rounds + 4;
        next = { ...next, scores, history, over, phase: over ? 'over' : 'result', picks: [null, null] };
      }
      return next;
    }
    case 'next': {
      if (state.phase !== 'result') fail('Bu el henüz bitmedi');
      return { ...state, phase: 'pick', picked: [false, false], shown: [null, null] };
    }
    default:
      fail(`Bilinmeyen hamle: ${move.type}`);
  }
  return state;
}

export function autoMove(state, player) {
  if (!state.over && state.picked[0] && state.picked[1] && state.shown[player] == null && state.picks[player]) {
    return { type: 'show', choice: state.picks[player] };
  }
  return null;
}

export function getTurn(state) {
  if (state.over || state.phase !== 'pick') return null; // the reveal is looked at together
  const p = state.picked[0] ? (state.picked[1] ? null : 1) : 0;
  return p == null ? null : { player: p, private: true };
}

export function getResult(state) {
  if (!state.over) return null;
  const [a, b] = state.scores;
  if (a === b) return { draw: true };
  return { winner: a > b ? 0 : 1 };
}

export function render(state, viewer, container, sendMove, ctx = {}) {
  const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
  const opp = 1 - viewer;
  const last = state.history[state.history.length - 1];
  const lastView = last
    ? el('div', { class: 'rps-last card' },
      el('div', { class: 'muted' }, `${state.history.length}. el`),
      el('div', { class: 'rps-faces' },
        el('span', {}, `${players[0]} ${ICON[last.picks[0]]}`),
        el('span', { class: 'muted' }, 'vs'),
        el('span', {}, `${ICON[last.picks[1]]} ${players[1]}`)),
      el('div', {}, last.winner == null ? 'Berabere' : `${players[last.winner]} aldı (${LABEL[last.picks[last.winner]]} ${LABEL[last.picks[1 - last.winner]].toLocaleLowerCase('tr-TR')}ı yener)`))
    : null;
  const score = el('div', { class: 'c4-legend' }, el('span', {}, `${players[0]}: ${state.scores[0]}`), el('span', {}, `${players[1]}: ${state.scores[1]}`), el('span', { class: 'muted' }, `hedef ${state.target}`));
  if (state.over) {
    draw(container, el('div', { class: 'status-line' }, el('strong', {}, state.scores[0] === state.scores[1] ? 'Berabere!' : `${players[state.scores[0] > state.scores[1] ? 0 : 1]} kazandı!`)), score, lastView);
    return null;
  }
  if (state.phase === 'result') {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, last.winner == null ? 'Berabere el!' : `${players[last.winner]} bu eli aldı.`)),
      score, lastView,
      el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', style: { marginTop: '12px' }, onClick: () => sendMove({ type: 'next' }) }, 'Sonraki el'),
    );
    return null;
  }
  if (state.picked[viewer]) {
    draw(container,
      el('div', { class: 'status-line' }, el('strong', {}, 'Seçimin alındı.')),
      el('p', { class: 'hint' }, `${players[opp]} seçiyor…`),
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      score, lastView,
    );
    return null;
  }
  draw(container,
    el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}, seçimini yap`)),
    el('div', { class: 'rps-choices' }, CHOICES.map((c) =>
      el('button', { type: 'button', class: 'btn btn-secondary rps-btn', onClick: () => sendMove({ type: 'pick', secret: { choice: c } }) },
        el('span', { class: 'rps-icon' }, ICON[c]), LABEL[c]))),
    score, lastView,
  );
  return null;
}

export default { id: 'tas-kagit-makas', meta, setup, applyMove, autoMove, render, getTurn, getResult };
