// Gizli Kelime — each player holds a secret word for the opponent; players take turns
// guessing. Feedback is either Wordle colours or "+n −m" counts. The same core also
// powers Gizli Sayı (4 distinct digits) via createGame({ kind: 'number' }).
//
// Secrets never leave the owner's device: the `setSecret` move carries the word in a
// `secret` field that the session strips before sending; guesses are scored on the
// owner's device by autoMove(), which sends only the result.
import { el, render as draw } from '../js/ui/dom.js';
import { createKeyboard } from '../js/ui/keyboard.js';
import { normalizeWord, isTurkishWord, upperTR } from '../js/lib/tr.js';

// ----------------------------------------------------------------- scoring
/** Wordle marks with the standard rule for repeated letters. */
export function scoreWordle(secret, guess) {
  const s = [...secret];
  const g = [...guess];
  const marks = new Array(g.length).fill('absent');
  const remaining = {};
  for (let i = 0; i < g.length; i++) {
    if (g[i] === s[i]) marks[i] = 'correct';
    else remaining[s[i]] = (remaining[s[i]] || 0) + 1;
  }
  for (let i = 0; i < g.length; i++) {
    if (marks[i] === 'correct') continue;
    if (remaining[g[i]] > 0) { marks[i] = 'present'; remaining[g[i]]--; }
  }
  return marks;
}

/** Classic "+n −m": n right letters in the right place, m right letters in the wrong place. */
export function scorePlusMinus(secret, guess) {
  const marks = scoreWordle(secret, guess);
  return {
    plus: marks.filter((m) => m === 'correct').length,
    minus: marks.filter((m) => m === 'present').length,
  };
}

export function isSolved(result, length) {
  if (!result) return false;
  if (Array.isArray(result)) return result.length === length && result.every((m) => m === 'correct');
  return result.plus === length;
}

/** Keyboard colouring from a list of scored Wordle guesses (correct > present > absent). */
export function keyStates(guesses) {
  const rank = { absent: 1, present: 2, correct: 3 };
  const out = {};
  for (const g of guesses) {
    if (!Array.isArray(g.result)) continue;
    [...g.word].forEach((ch, i) => {
      const m = g.result[i];
      if (!out[ch] || rank[m] > rank[out[ch]]) out[ch] = m;
    });
  }
  return out;
}

export function randomNumberSecret(length = 4, rnd = Math.random) {
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  if (digits[0] === '0') [digits[0], digits[1]] = [digits[1], digits[0]];
  return digits.slice(0, length).join('');
}

function fail(msg) {
  throw new Error(msg);
}

// ----------------------------------------------------------------- game factory
/**
 * @param {object} cfg
 * @param {'word'|'number'} cfg.kind
 * @param {string} cfg.id
 * @param {object} cfg.meta
 */
export function createGame(cfg) {
  const kind = cfg.kind;
  const isNumber = kind === 'number';

  function validateWord(state, raw, ctx, what) {
    const word = isNumber ? String(raw || '').trim() : normalizeWord(raw || '');
    if (!word) fail(isNumber ? 'Bir sayı yaz' : 'Bir kelime yaz');
    if (word.length !== state.length) fail(`${state.length} ${isNumber ? 'haneli' : 'harfli'} olmalı`);
    if (isNumber) {
      if (!/^[0-9]+$/.test(word)) fail('Yalnızca rakam kullanılabilir');
      if (new Set(word).size !== word.length) fail('Rakamlar birbirinden farklı olmalı');
      if (word[0] === '0') fail('Sayı 0 ile başlayamaz');
    } else {
      if (!isTurkishWord(word)) fail('Yalnızca Türkçe harfler kullanılabilir');
      if (ctx.dict && !ctx.dict.has(word)) fail(what === 'secret' ? 'Bu kelime listede yok; listeden bir kelime seç' : 'Kelime listesinde yok');
    }
    return word;
  }

  function setup(options = {}) {
    const length = isNumber ? 4 : Math.min(6, Math.max(4, Number(options.length) || 5));
    const maxGuesses = Number(options.maxGuesses);
    return {
      kind,
      length,
      feedback: isNumber ? 'plusminus' : (options.feedback === 'plusminus' ? 'plusminus' : 'wordle'),
      secretMode: options.secretMode === 'manual' ? 'manual' : 'random',
      maxGuesses: Number.isFinite(maxGuesses) && maxGuesses > 0 ? maxGuesses : 0,
      phase: 'secret', // secret | play | over
      ready: [false, false],
      secrets: [null, null],   // only known on the owner's device (both in single-phone mode)
      guesses: [[], []],       // guesses[p] = [{ word, result }] — result null until scored
      solved: [null, null],    // number of guesses it took, or null
      gaveUp: null,
      revealed: [null, null],
    };
  }

  const pendingOf = (state, p) => {
    const list = state.guesses[p];
    const last = list[list.length - 1];
    return last && last.result == null ? list.length - 1 : -1;
  };

  function whoseTurn(state) {
    const [n0, n1] = [state.guesses[0].length, state.guesses[1].length];
    return n0 > n1 ? 1 : 0;
  }

  function checkOver(state) {
    const [n0, n1] = [state.guesses[0].length, state.guesses[1].length];
    if (pendingOf(state, 0) >= 0 || pendingOf(state, 1) >= 0) return state;
    if (n0 !== n1) return state;
    const anySolved = state.solved[0] != null || state.solved[1] != null;
    const exhausted = state.maxGuesses > 0 && n0 >= state.maxGuesses;
    if (anySolved || exhausted) return { ...state, phase: 'over' };
    return state;
  }

  function applyMove(state, player, move, ctx = {}) {
    if (!move || typeof move !== 'object') fail('Geçersiz hamle');
    switch (move.type) {
      case 'setSecret': {
        if (state.phase !== 'secret') fail('Gizli kelime artık değiştirilemez');
        if (state.ready[player]) fail('Gizli kelimen zaten hazır');
        const secrets = state.secrets.slice();
        if (move.secret && move.secret.word != null) {
          secrets[player] = validateWord(state, move.secret.word, ctx, 'secret');
        }
        const ready = state.ready.slice();
        ready[player] = true;
        const next = { ...state, secrets, ready };
        if (ready[0] && ready[1]) next.phase = 'play';
        return next;
      }
      case 'guess': {
        if (state.phase !== 'play') fail('Şu anda tahmin yapılamaz');
        if (player !== whoseTurn(state)) fail('Sıra sende değil');
        if (pendingOf(state, player) >= 0) fail('Önceki tahmin puanlanıyor');
        const word = validateWord(state, move.word, ctx, 'guess');
        if (state.guesses[player].some((g) => g.word === word)) fail('Bunu zaten denedin');
        const guesses = state.guesses.map((l) => l.slice());
        guesses[player].push({ word, result: null });
        return { ...state, guesses };
      }
      case 'feedback': {
        if (state.phase !== 'play') fail('Oyun bu aşamada değil');
        const g = move.guesser;
        if (g !== 0 && g !== 1) fail('Geçersiz hamle');
        if (player !== 1 - g) fail('Puanı kelimenin sahibi verir');
        const idx = pendingOf(state, g);
        if (idx < 0 || idx !== move.index) fail('Puanlanacak tahmin yok');
        const result = move.result;
        const valid = state.feedback === 'wordle'
          ? Array.isArray(result) && result.length === state.length && result.every((m) => ['correct', 'present', 'absent'].includes(m))
          : result && Number.isInteger(result.plus) && Number.isInteger(result.minus) && result.plus >= 0 && result.minus >= 0 && result.plus + result.minus <= state.length;
        if (!valid) fail('Geçersiz puan');
        const guesses = state.guesses.map((l) => l.slice());
        guesses[g][idx] = { ...guesses[g][idx], result };
        const solved = state.solved.slice();
        if (isSolved(result, state.length)) solved[g] = idx + 1;
        return checkOver({ ...state, guesses, solved });
      }
      case 'giveup': {
        if (state.phase !== 'play') fail('Şu anda pes edilemez');
        return { ...state, phase: 'over', gaveUp: player };
      }
      case 'reveal': {
        if (state.phase !== 'over') fail('Oyun bitmeden kelime açıklanamaz');
        if (state.revealed[player] != null) return state;
        const revealed = state.revealed.slice();
        revealed[player] = String(move.word);
        return { ...state, revealed };
      }
      default:
        fail(`Bilinmeyen hamle: ${move.type}`);
    }
    return state;
  }

  function autoMove(state, player, ctx = {}) {
    if (state.phase === 'secret') {
      if (state.ready[player] || state.secretMode !== 'random') return null;
      let word;
      if (isNumber) word = randomNumberSecret(state.length);
      else {
        const pool = ctx.common && ctx.common[String(state.length)];
        if (!pool || !pool.length) return null;
        word = pool[Math.floor(Math.random() * pool.length)];
      }
      return { type: 'setSecret', secret: { word } };
    }
    if (state.phase === 'play') {
      const g = 1 - player;
      const idx = pendingOf(state, g);
      if (idx < 0 || !state.secrets[player]) return null;
      const guess = state.guesses[g][idx].word;
      const result = state.feedback === 'wordle'
        ? scoreWordle(state.secrets[player], guess)
        : scorePlusMinus(state.secrets[player], guess);
      return { type: 'feedback', guesser: g, index: idx, result };
    }
    if (state.phase === 'over') {
      if (state.revealed[player] == null && state.secrets[player]) return { type: 'reveal', word: state.secrets[player] };
    }
    return null;
  }

  function getTurn(state) {
    if (state.phase === 'secret') {
      const p = state.ready[0] ? (state.ready[1] ? null : 1) : 0;
      return p == null ? null : { player: p, private: state.secretMode === 'manual' };
    }
    if (state.phase === 'play') return { player: whoseTurn(state), private: false };
    return null;
  }

  function getResult(state) {
    if (state.phase !== 'over') return null;
    if (state.gaveUp != null) return { winner: 1 - state.gaveUp };
    const [a, b] = state.solved;
    if (a != null && b != null) return { draw: true };
    if (a != null) return { winner: 0 };
    if (b != null) return { winner: 1 };
    return { draw: true };
  }

  // --------------------------------------------------------------- render
  const layout = isNumber ? 'digits' : 'tr';
  const unit = isNumber ? 'rakam' : 'harf';
  const show = (w) => (isNumber ? w : upperTR(w));

  function tileRow(word, result, length, { small = false, pending = false } = {}) {
    const chars = [...(word || '')];
    const tiles = [];
    for (let i = 0; i < length; i++) {
      const ch = chars[i] || '';
      const mark = Array.isArray(result) ? result[i] : '';
      tiles.push(el('span', { class: `tile ${small ? 'small' : ''} ${ch ? 'filled' : ''} ${mark}` }, show(ch)));
    }
    const row = el('div', { class: `tile-row ${small ? 'compact' : ''} ${pending ? 'pending-row' : ''}` }, tiles);
    if (result && !Array.isArray(result)) {
      row.append(el('span', { class: 'pm' },
        el('span', { class: 'pm-plus' }, `+${result.plus}`), ' ',
        el('span', { class: 'pm-minus' }, `−${result.minus}`)));
    } else if (pending) {
      row.append(el('span', { class: 'pm muted' }, '…'));
    }
    return row;
  }

  function board(guesses, state, opts = {}) {
    const rows = guesses.map((g) => tileRow(g.word, g.result, state.length, { small: opts.small, pending: g.result == null }));
    if (!rows.length) rows.push(el('p', { class: 'hint' }, 'Henüz tahmin yok.'));
    return el('div', { class: 'tiles' }, rows);
  }

  function render(state, viewer, container, sendMove, ctx = {}) {
    const players = ctx.players || ['Oyuncu 1', 'Oyuncu 2'];
    const online = ctx.mode === 'online';
    const opp = 1 - viewer;
    const cleanups = [];
    const you = (p) => (p === viewer ? 'Sen' : players[p]);

    // ---- secret phase
    if (state.phase === 'secret') {
      if (state.ready[viewer]) {
        draw(container,
          el('div', { class: 'status-line' }, el('strong', {}, 'Gizli kelimen hazır.')),
          el('p', { class: 'hint' }, `${players[opp]} gizli ${isNumber ? 'sayısını' : 'kelimesini'} seçiyor…`),
          el('div', { class: 'spinner', 'aria-hidden': 'true' }),
        );
        return null;
      }
      if (state.secretMode === 'random') {
        draw(container, el('p', { class: 'hint' }, `Yaygın ${unit} listesi yüklenemediği için gizli ${isNumber ? 'sayı' : 'kelime'} seçilemedi. Ayarlardan "kendim yazayım" seçeneğini dene.`));
        return null;
      }
      let typed = '';
      const rowBox = el('div', { class: 'tiles' });
      const drawRow = () => draw(rowBox, tileRow(typed, null, state.length));
      drawRow();
      const kbBox = el('div');
      const kb = createKeyboard(kbBox, {
        layout,
        onKey: (k) => { if (typed.length < state.length) { typed += k; drawRow(); } },
        onBackspace: () => { typed = typed.slice(0, -1); drawRow(); },
        onEnter: () => sendMove({ type: 'setSecret', secret: { word: typed } }),
      });
      cleanups.push(() => kb.destroy());
      draw(container,
        el('div', { class: 'status-line' }, el('strong', {}, `${players[viewer]}, ${players[opp]} için gizli ${isNumber ? 'bir sayı' : 'bir kelime'} seç`)),
        el('p', { class: 'hint' }, isNumber
          ? 'Rakamları birbirinden farklı 4 haneli bir sayı. Rakibin bunu bulmaya çalışacak.'
          : `${state.length} harfli, kelime listesinde olan bir kelime. Rakibin bunu bulmaya çalışacak.`),
        rowBox,
        kbBox,
      );
      return () => cleanups.forEach((fn) => fn());
    }

    // ---- over
    if (state.phase === 'over') {
      const mySecret = state.secrets[viewer] || state.revealed[viewer];
      const oppSecret = state.secrets[opp] || state.revealed[opp];
      const lines = [];
      if (state.gaveUp != null) lines.push(`${players[state.gaveUp]} pes etti.`);
      else {
        for (const p of [0, 1]) {
          lines.push(state.solved[p] != null ? `${players[p]} ${state.solved[p]}. tahminde buldu.` : `${players[p]} bulamadı.`);
        }
      }
      draw(container,
        el('div', { class: 'status-line' }, el('strong', {}, lines.join(' '))),
        el('div', { class: 'reveal' },
          el('div', { class: 'muted' }, `${players[opp]}'nin tuttuğu ${isNumber ? 'sayı' : 'kelime'} (senin aradığın):`),
          el('div', { class: 'word' }, oppSecret ? show(oppSecret) : '…'),
          el('div', { class: 'muted', style: { marginTop: '8px' } }, `Senin tuttuğun:`),
          el('div', { class: 'word' }, mySecret ? show(mySecret) : '…'),
        ),
        el('div', { class: 'two-col' },
          el('div', {}, el('div', { class: 'col-title' }, `${you(viewer)} (${state.guesses[viewer].length})`), board(state.guesses[viewer], state, { small: true })),
          el('div', {}, el('div', { class: 'col-title' }, `${you(opp)} (${state.guesses[opp].length})`), board(state.guesses[opp], state, { small: true })),
        ),
      );
      return null;
    }

    // ---- play
    const turn = whoseTurn(state);
    const mine = viewer === turn;
    const myPending = pendingOf(state, viewer) >= 0;
    const myGuesses = state.guesses[viewer];
    const oppGuesses = state.guesses[opp];
    const left = state.maxGuesses ? state.maxGuesses - myGuesses.length : null;

    let typed = '';
    const currentRow = el('div', { class: 'tiles' });
    const drawCurrent = () => {
      if (mine && !myPending) draw(currentRow, tileRow(typed, null, state.length));
      else draw(currentRow);
    };
    drawCurrent();

    const kbBox = el('div');
    const kb = createKeyboard(kbBox, {
      layout,
      onKey: (k) => { if (!mine || myPending) return; if (typed.length < state.length) { typed += k; drawCurrent(); } },
      onBackspace: () => { if (!mine || myPending) return; typed = typed.slice(0, -1); drawCurrent(); },
      onEnter: () => { if (!mine || myPending) return; sendMove({ type: 'guess', word: typed }); },
    });
    kb.setDisabled(!mine || myPending);
    if (state.feedback === 'wordle') kb.setKeyStates(keyStates(myGuesses));
    cleanups.push(() => kb.destroy());

    let status;
    if (myPending) status = el('span', { class: 'muted' }, 'Tahminin puanlanıyor…');
    else if (mine) status = el('strong', {}, `Sıra sende, ${players[viewer]}: ${myGuesses.length + 1}. tahmin${left != null ? ` (${left} hak)` : ''}`);
    else status = el('span', { class: 'muted' }, `${players[turn]} tahmin ediyor…`);

    const oppDetails = el('details', { class: 'rules' },
      el('summary', {}, `${online ? players[opp] : players[opp]} — tahminleri (${oppGuesses.length})`),
      board(oppGuesses, state, { small: true }),
    );

    draw(container,
      el('div', { class: 'status-line' }, status),
      el('p', { class: 'hint' }, state.feedback === 'wordle'
        ? 'Yeşil: doğru harf doğru yerde · Sarı: harf var, yeri yanlış · Gri: yok'
        : `+ doğru ${unit} doğru yerde · − doğru ${unit} yanlış yerde`),
      el('div', { class: 'col-title active' }, `${players[viewer]} — ${isNumber ? 'tahminlerin' : 'tahminlerin'}`),
      board(myGuesses, state),
      currentRow,
      kbBox,
      oppDetails,
      mine && !myPending ? el('div', { class: 'row', style: { marginTop: '10px' } },
        el('button', { type: 'button', class: 'btn btn-secondary btn-small', onClick: () => { if (confirm('Pes ediyor musun? Bu turu kaybedersin.')) sendMove({ type: 'giveup' }); } }, 'Pes'),
      ) : null,
    );
    return () => cleanups.forEach((fn) => fn());
  }

  return { id: cfg.id, meta: cfg.meta, setup, applyMove, autoMove, render, getTurn, getResult, whoseTurn };
}

export const meta = {
  name: 'Gizli Kelime',
  icon: '🟩',
  description: 'Karşılıklı Wordle: rakibinin tuttuğu kelimeyi ondan önce bul.',
  rules: [
    'Her oyuncu rakibi için gizli bir kelime tutar (rastgele seçilir ya da kendisi yazar). Sırayla rakibin kelimesi tahmin edilir; önce bulan kazanır.',
    'İki oyuncu aynı turda bulursa berabere sayılır; ilk başlayanın avantajı yoktur.',
    'Renkli mod: yeşil doğru harf doğru yerde, sarı harf var ama yeri yanlış, gri harf yok. Tekrar eden harflerde Wordle kuralı uygulanır.',
    '"+ −" modu: yalnızca sayılar söylenir (+2 −1 gibi), hangi harfin doğru olduğu söylenmez. Daha zordur.',
    'Tahminler kelime listesiyle doğrulanır. Tahmin hakkı biten iki oyuncu da bulamazsa berabere.',
  ].join('\n'),
  data: ['dictionary', 'common'],
  settings: [
    { key: 'length', label: 'Harf sayısı', type: 'select', default: 5, options: [{ value: 4, label: '4 harf' }, { value: 5, label: '5 harf' }, { value: 6, label: '6 harf' }] },
    { key: 'feedback', label: 'Geri bildirim', type: 'select', default: 'wordle', options: [{ value: 'wordle', label: 'Renkli (Wordle)' }, { value: 'plusminus', label: '+ − sayıları (zor)' }] },
    { key: 'secretMode', label: 'Gizli kelime', type: 'select', default: 'random', options: [{ value: 'random', label: 'Rastgele yaygın kelime' }, { value: 'manual', label: 'Rakip için kendim yazayım' }] },
    { key: 'maxGuesses', label: 'Tahmin hakkı', type: 'select', default: 8, options: [{ value: 6, label: '6' }, { value: 8, label: '8' }, { value: 10, label: '10' }, { value: 0, label: 'Sınırsız' }] },
  ],
};

export default createGame({ kind: 'word', id: 'gizli-kelime', meta });
