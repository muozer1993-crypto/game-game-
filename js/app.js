// Screen flow: menu -> setup -> play (-> result -> new round) ; menu -> online -> setup/play.
import { games, findGame } from '../games/index.js';
import { Session } from './session.js';
import { el, render, clear, toast } from './ui/dom.js';
import { createScoreboard } from './ui/scoreboard.js';
import { load, save } from './lib/storage.js';
import { loadDictionary, loadCommonWords } from './lib/words.js';
import { randomSeed } from './lib/rng.js';
import { nameSuffix } from './lib/tr.js';
import { generateRoomCode, createHost, joinRoom, normalizeRoomCode } from './net/peer.js';

const app = document.getElementById('app');
const DEFAULT_PLAYERS = ['Oyuncu 1', 'Oyuncu 2'];
const QUESTIONS_URL = new URL('../data/questions.json', import.meta.url);

const prefs = {
  players: load('players', DEFAULT_PLAYERS),
  theme: load('theme', 'auto'),
  onlineName: load('online-name', ''),
};

// ---------------------------------------------------------------- theme
function applyTheme(theme) {
  prefs.theme = theme;
  save('theme', theme);
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#15171c' : '#f6f7fb');
}
applyTheme(prefs.theme);

// ---------------------------------------------------------------- data
let questionsPromise = null;
function loadQuestions() {
  if (!questionsPromise) {
    questionsPromise = fetch(QUESTIONS_URL)
      .then((r) => { if (!r.ok) throw new Error(`Sorular yüklenemedi (${r.status})`); return r.json(); })
      .catch((err) => { questionsPromise = null; throw err; });
  }
  return questionsPromise;
}

/** Load whatever data the game declares in meta.data and return the ctx for the session. */
async function loadGameData(game) {
  const needs = game.meta.data || [];
  const ctx = {};
  if (needs.includes('dictionary')) ctx.dict = await loadDictionary();
  if (needs.includes('common')) ctx.common = await loadCommonWords();
  if (needs.includes('questions')) {
    ctx.questions = await loadQuestions();
    ctx.customQuestions = load('custom-questions', []);
  }
  return ctx;
}

// ---------------------------------------------------------------- navigation
let currentScreen = 'menu';
let teardown = null; // called when leaving the current screen

function setScreen(name, cleanupFn) {
  if (teardown) { try { teardown(); } catch (err) { console.warn(err); } }
  teardown = cleanupFn || null;
  currentScreen = name;
  if (location.hash !== `#${name}`) {
    // The menu replaces the current entry so the history does not grow round after round.
    if (name === 'menu') history.replaceState(null, '', '#menu');
    else history.pushState(null, '', `#${name}`);
  }
  window.scrollTo(0, 0);
}

window.addEventListener('popstate', () => {
  // Browser / Android back button.
  if (currentScreen === 'menu') return;
  if (currentScreen === 'play') {
    if (activeSession && !activeSession.ended && !confirm('Oyundan çıkılsın mı?')) {
      history.pushState(null, '', '#play');
      return;
    }
    if (online.transport) { showOnlineLobby({ notify: true }); return; }
  }
  showMenu();
});

function header(title, { onBack, right } = {}) {
  return el('header', { class: 'topbar' },
    onBack ? el('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Geri', onClick: onBack }, '←') : el('span'),
    el('h1', { class: 'topbar-title' }, title),
    right || el('span'),
  );
}

// ---------------------------------------------------------------- menu
export function showMenu() {
  if (online.transport) leaveOnline(); // tells the other device we left
  setScreen('menu');
  const themeSelect = el('select', { class: 'select', 'aria-label': 'Tema', onChange: (e) => applyTheme(e.target.value) },
    el('option', { value: 'auto' }, 'Tema: Sistem'),
    el('option', { value: 'light' }, 'Tema: Açık'),
    el('option', { value: 'dark' }, 'Tema: Koyu'),
  );
  themeSelect.value = prefs.theme;

  const list = games.map((game) =>
    el('button', { type: 'button', class: 'card game-card', onClick: () => showSetup(game) },
      el('div', { class: 'game-icon', 'aria-hidden': 'true' }, game.meta.icon || '🎲'),
      el('div', { class: 'game-text' },
        el('div', { class: 'game-name' }, game.meta.name),
        el('div', { class: 'game-desc' }, game.meta.description),
      ),
    ),
  );

  render(app,
    header('Oyun Gecesi', { right: themeSelect }),
    el('p', { class: 'lead' }, 'İki kişilik oyunlar. Tek telefonda elden ele ya da iki telefonda oda koduyla.'),
    el('section', { class: 'game-list' }, list),
    el('section', { class: 'section' },
      el('button', { type: 'button', class: 'btn btn-secondary btn-block', onClick: showOnline }, '📶 İki telefonda oyna (oda kodu)'),
    ),
    el('footer', { class: 'footer muted' },
      el('a', { href: 'tests/index.html' }, 'Testler'), ' · ',
      el('a', { href: 'README.md' }, 'Kaynak ve lisanslar'),
    ),
  );
}

// ---------------------------------------------------------------- setup
function settingsForm(game) {
  const stored = load(`settings:${game.id}`, {});
  const values = {};
  const fields = (game.meta.settings || []).map((s) => {
    let value = stored[s.key] !== undefined ? stored[s.key] : s.default;
    // settings saved by an older version may no longer match the options
    if (s.type === 'select' && !s.options.some((o) => String(o.value) === String(value))) value = s.default;
    if (s.type === 'number') value = clamp(Number(value), s);
    if (s.type === 'toggle') value = !!value;
    values[s.key] = value;
    let input;
    if (s.type === 'select') {
      input = el('select', { class: 'select', id: `set-${s.key}`, onChange: (e) => { values[s.key] = coerce(s, e.target.value); } },
        s.options.map((o) => el('option', { value: String(o.value) }, o.label)));
      input.value = String(value);
    } else if (s.type === 'toggle') {
      input = el('input', { type: 'checkbox', id: `set-${s.key}`, onChange: (e) => { values[s.key] = e.target.checked; } });
      input.checked = !!value;
    } else {
      input = el('input', {
        type: 'number', class: 'input', id: `set-${s.key}`, min: s.min, max: s.max, step: s.step || 1, inputmode: 'numeric',
        onChange: (e) => { values[s.key] = e.target.value === '' ? s.default : clamp(Number(e.target.value), s); e.target.value = values[s.key]; },
      });
      input.value = value;
    }
    return el('div', { class: `field ${s.type === 'toggle' ? 'field-toggle' : ''}` },
      el('label', { for: `set-${s.key}` }, s.label),
      input,
      s.help ? el('div', { class: 'help muted' }, s.help) : null,
    );
  });
  return { fields, values };
}

function coerce(setting, raw) {
  const opt = setting.options.find((o) => String(o.value) === String(raw));
  return opt ? opt.value : raw;
}

function clamp(n, s) {
  if (!Number.isFinite(n)) return s.default;
  if (s.min !== undefined) n = Math.max(s.min, n);
  if (s.max !== undefined) n = Math.min(s.max, n);
  return n;
}

/**
 * Setup screen for a game. In online mode (host) the players are fixed and the
 * options are sent to the guest when the game starts.
 */
export function showSetup(game, { onlineHost = false } = {}) {
  setScreen(`setup-${game.id}`);
  const { fields, values } = settingsForm(game);
  const names = prefs.players.slice();

  const nameFields = onlineHost
    ? el('div', { class: 'field' }, el('div', { class: 'muted' }, `Oyuncular: ${online.players[0]} (sen) ve ${online.players[1]}`))
    : el('div', { class: 'names' },
      [0, 1].map((i) => el('div', { class: 'field' },
        el('label', { for: `name-${i}` }, `${i + 1}. oyuncu`),
        el('input', {
          type: 'text', class: 'input', id: `name-${i}`, maxlength: 20, autocomplete: 'off',
          value: names[i], onInput: (e) => { names[i] = e.target.value; },
        }),
      )),
    );

  const extra = el('div');
  if (game.setupExtra) {
    try { game.setupExtra(extra, { load, save }); } catch (err) { console.warn(err); }
  }

  const startBtn = el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block' }, 'Başla');
  startBtn.addEventListener('click', async () => {
    const players = onlineHost ? online.players : names.map((n, i) => n.trim() || DEFAULT_PLAYERS[i]);
    if (!onlineHost) { prefs.players = players; save('players', players); }
    save(`settings:${game.id}`, values);
    startBtn.disabled = true;
    startBtn.textContent = 'Yükleniyor…';
    try {
      const ctx = await loadGameData(game);
      const options = { ...values, seed: randomSeed() };
      if (onlineHost) startOnlineGame(game, options, ctx);
      else showPlay({ game, options, players, ctx, mode: 'local', self: null });
    } catch (err) {
      console.error(err);
      toast(err.message || 'Veri yüklenemedi', { kind: 'error', duration: 4000 });
      startBtn.disabled = false;
      startBtn.textContent = 'Başla';
    }
  });

  render(app,
    header(game.meta.name, { onBack: onlineHost ? showOnlineLobby : showMenu }),
    el('p', { class: 'lead' }, game.meta.description),
    el('details', { class: 'rules' }, el('summary', {}, 'Kurallar'), rulesBody(game)),
    el('section', { class: 'section' }, nameFields),
    fields.length ? el('section', { class: 'section' }, el('h2', { class: 'section-title' }, 'Ayarlar'), fields) : null,
    extra,
    el('section', { class: 'section' }, startBtn),
  );
}

function rulesBody(game) {
  const text = game.meta.rules || '';
  return el('div', { class: 'rules-body' }, text.split('\n').filter(Boolean).map((line) => el('p', {}, line)));
}

// ---------------------------------------------------------------- play
let activeSession = null;

/**
 * @param {object} p
 * @param {object} p.game
 * @param {object} p.options
 * @param {string[]} p.players
 * @param {object} p.ctx
 * @param {'local'|'online'} p.mode
 * @param {0|1|null} p.self
 * @param {object} [p.initialState]   guest side: state received from the host
 * @param {number[]} [p.scores]
 */
export function showPlay(p) {
  const scores = p.scores || [0, 0];
  const isOnline = p.mode === 'online';
  const gameBox = el('div', { class: 'game-box' });
  const scoreBox = el('div');
  const actions = el('div', { class: 'play-actions' });

  const exit = () => {
    if (activeSession && !activeSession.ended && !confirm('Oyundan çıkılsın mı?')) return;
    if (isOnline) { showOnlineLobby({ notify: true }); } else showMenu();
  };

  const rulesBtn = el('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Kurallar', onClick: () => showRulesOverlay(p.game) }, '?');

  setScreen('play', () => {
    if (activeSession) { activeSession.destroy(); activeSession = null; }
  });

  const updateScore = () => {
    const turn = activeSession ? activeSession.currentTurn() : null;
    render(scoreBox, createScoreboard({ players: p.players, scores, turn: turn ? turn.player : null, self: p.self }));
  };

  const session = new Session({
    game: p.game,
    options: p.options,
    players: p.players,
    container: gameBox,
    mode: p.mode,
    self: p.self,
    transport: isOnline ? online.transport : null,
    ctx: p.ctx,
    onChange: updateScore,
    onEnd: (result) => {
      let text;
      if (result.draw) text = 'Berabere!';
      else { scores[result.winner] += 1; text = `${p.players[result.winner]} kazandı!`; }
      updateScore();
      const again = el('button', { type: 'button', class: 'btn btn-primary btn-big' }, 'Yeni tur');
      if (isOnline && p.self !== 0) {
        again.textContent = 'Yeni tur iste';
        again.addEventListener('click', () => { online.transport.send({ t: 'rematch' }); again.disabled = true; again.textContent = 'İstek gönderildi'; });
      } else {
        again.addEventListener('click', () => {
          const options = { ...p.options, seed: randomSeed() };
          if (isOnline) startOnlineGame(p.game, options, p.ctx, scores);
          else showPlay({ ...p, options, scores });
        });
      }
      render(actions,
        el('div', { class: 'result-banner' }, text),
        el('div', { class: 'row' }, again, el('button', { type: 'button', class: 'btn btn-secondary btn-big', onClick: exit }, isOnline ? 'Lobiye dön' : 'Ana menü')),
      );
      actions.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
  });
  activeSession = session;
  online.session = isOnline ? session : null;

  render(app,
    header(p.game.meta.name, { onBack: exit, right: rulesBtn }),
    scoreBox,
    gameBox,
    actions,
  );
  session.start(p.initialState);
  if (isOnline) flushOnlineQueue();
}

function showRulesOverlay(game) {
  const opener = document.activeElement;
  const close = () => {
    overlay.remove();
    window.removeEventListener('keydown', onKey, true);
    if (opener && opener.focus) opener.focus();
  };
  const onKey = (e) => {
    // Swallow keys while the dialog is open (the game keyboard listens on window too).
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  const okBtn = el('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: close }, 'Tamam');
  const overlay = el('div', { class: 'overlay', onClick: (e) => { if (e.target === overlay) close(); } },
    el('div', { class: 'card overlay-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${game.meta.name} kuralları`, tabindex: '-1' },
      el('h2', {}, `${game.meta.name} — Kurallar`),
      rulesBody(game),
      okBtn,
    ),
  );
  window.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  okBtn.focus();
}

// ---------------------------------------------------------------- online
const online = {
  transport: null,
  role: null,       // 'host' | 'guest'
  self: null,       // 0 host, 1 guest
  players: null,
  session: null,
  queue: [],        // moves that arrived while the guest was still loading the game
  busy: false,      // guest is loading data for a 'start'
  round: 0,         // bumped on every 'start'/'lobby' so stale loads and moves are dropped
  ctxCache: {},
};

function leaveOnline({ silent = false } = {}) {
  if (online.transport) {
    if (!silent) { try { online.transport.send({ t: 'leave' }); } catch { /* ignore */ } }
    online.transport.close();
  }
  online.transport = null;
  online.role = null;
  online.self = null;
  online.players = null;
  online.session = null;
  online.queue = [];
  online.busy = false;
  online.round++;
}

export function showOnline() {
  setScreen('online');
  let name = prefs.onlineName;
  const nameInput = el('input', {
    type: 'text', class: 'input', id: 'online-name', maxlength: 20, value: name, placeholder: 'Adın',
    onInput: (e) => { name = e.target.value; },
  });
  const codeInput = el('input', {
    type: 'text', class: 'input input-code', id: 'room-code', maxlength: 5, autocapitalize: 'characters', autocomplete: 'off',
    placeholder: 'ODA KODU', onInput: (e) => { e.target.value = e.target.value.toLocaleUpperCase('tr-TR').replace(/[^A-Z0-9]/g, ''); },
  });
  const status = el('p', { class: 'muted status' });
  const getName = () => { const n = name.trim() || 'Oyuncu'; prefs.onlineName = n; save('online-name', n); return n; };

  const hostBtn = el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block' }, 'Oda kur');
  const joinBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-big btn-block' }, 'Odaya katıl');

  hostBtn.addEventListener('click', async () => {
    const myName = getName();
    hostBtn.disabled = true; joinBtn.disabled = true;
    status.textContent = 'Oda açılıyor…';
    try {
      const code = generateRoomCode();
      online.transport = await createHost(code, { onStatus: (s) => { status.textContent = s; } });
      online.role = 'host'; online.self = 0;
      wireTransport(myName);
      showOnlineWaiting(online.transport.code);
    } catch (err) {
      console.error(err);
      status.textContent = '';
      toast(err.message || 'Oda açılamadı', { kind: 'error', duration: 4000 });
      hostBtn.disabled = false; joinBtn.disabled = false;
    }
  });

  joinBtn.addEventListener('click', async () => {
    const myName = getName();
    const code = normalizeRoomCode(codeInput.value);
    if (code.length < 4) { toast('Oda kodunu gir', { kind: 'error' }); codeInput.focus(); return; }
    hostBtn.disabled = true; joinBtn.disabled = true;
    status.textContent = 'Bağlanılıyor…';
    try {
      online.transport = await joinRoom(code, { onStatus: (s) => { status.textContent = s; } });
      online.role = 'guest'; online.self = 1;
      wireTransport(myName);
      showOnlineWaiting(online.transport.code);
    } catch (err) {
      console.error(err);
      status.textContent = '';
      toast(err.message || 'Bağlanılamadı', { kind: 'error', duration: 4000 });
      hostBtn.disabled = false; joinBtn.disabled = false;
    }
  });

  render(app,
    header('İki telefonda oyna', { onBack: showMenu }),
    el('p', { class: 'lead' }, 'Biriniz oda kurar, kodu söyler; diğeri kodu yazıp katılır. İkiniz de internete bağlı olmalısınız.'),
    el('section', { class: 'section' }, el('div', { class: 'field' }, el('label', { for: 'online-name' }, 'Adın'), nameInput)),
    el('section', { class: 'section card' }, el('h2', { class: 'section-title' }, 'Oda kur'), hostBtn),
    el('section', { class: 'section card' },
      el('h2', { class: 'section-title' }, 'Odaya katıl'),
      el('div', { class: 'field' }, el('label', { for: 'room-code' }, 'Oda kodu'), codeInput),
      joinBtn,
    ),
    status,
    el('details', { class: 'rules' }, el('summary', {}, 'Nasıl çalışır?'),
      el('div', { class: 'rules-body' },
        el('p', {}, 'Bağlantı PeerJS ile doğrudan iki telefon arasında kurulur (WebRTC). Oda kodu yalnızca eşleşme için kullanılır; oyun verisi bir sunucuda saklanmaz.'),
        el('p', {}, 'Gizli Kelime\'de gizli kelime karşı telefona hiç gönderilmez: tahminler kelimenin sahibinin telefonunda puanlanır, karşıya yalnızca sonuç gider.'),
        el('p', {}, 'Bazı mobil operatör ağlarında doğrudan bağlantı kurulamayabilir; o zaman ikiniz de aynı Wi-Fi\'ye bağlanmayı deneyin.'),
      )),
  );
}

function wireTransport(myName) {
  const t = online.transport;
  online.myName = myName;
  online.players = null;
  t.onMessage((msg) => handleOnlineMessage(msg));
  t.onClose(() => {
    if (!online.transport) return;
    leaveOnline({ silent: true });
    toast('Bağlantı koptu', { kind: 'error', duration: 4000 });
    showMenu();
  });
  t.onOpen(() => { t.send({ t: 'hello', name: myName }); });
}

function showOnlineWaiting(code) {
  setScreen('online-wait');
  const isHost = online.role === 'host';
  render(app,
    header('Oda', { onBack: () => { leaveOnline(); showOnline(); } }),
    el('section', { class: 'section card center' },
      el('div', { class: 'muted' }, 'Oda kodu'),
      el('div', { class: 'room-code' }, code),
      isHost
        ? el('p', {}, 'Kodu arkadaşına söyle. Katılınca oyun seçimi açılacak.')
        : el('p', {}, 'Bağlanıldı, ev sahibinin oyun seçmesi bekleniyor…'),
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
    ),
  );
}

function showOnlineLobby({ notify = false } = {}) {
  if (!online.transport || !online.players) { showMenu(); return; }
  if (notify) online.transport.send({ t: 'lobby' });
  if (online.role === 'host') {
    setScreen('online-lobby');
    const list = games.map((game) =>
      el('button', { type: 'button', class: 'card game-card', onClick: () => showSetup(game, { onlineHost: true }) },
        el('div', { class: 'game-icon', 'aria-hidden': 'true' }, game.meta.icon || '🎲'),
        el('div', { class: 'game-text' }, el('div', { class: 'game-name' }, game.meta.name), el('div', { class: 'game-desc' }, game.meta.description)),
      ));
    render(app,
      header('Oyun seç', { onBack: () => { leaveOnline(); showMenu(); } }),
      el('p', { class: 'lead' }, `${online.players[1]} bağlandı. Bir oyun seç.`),
      el('section', { class: 'game-list' }, list),
    );
  } else {
    setScreen('online-lobby');
    render(app,
      header('Oda', { onBack: () => { leaveOnline(); showMenu(); } }),
      el('section', { class: 'section card center' },
        el('p', {}, `${online.players[0]} oyun seçiyor…`),
        el('div', { class: 'spinner', 'aria-hidden': 'true' }),
      ),
    );
  }
}

function startOnlineGame(game, options, ctx, scores) {
  const state0 = game.setup(options, { ...ctx, players: online.players, mode: 'online', self: 0, options });
  online.transport.send({ t: 'start', gameId: game.id, options, state0, players: online.players, scores: scores || [0, 0] });
  showPlay({ game, options, players: online.players, ctx, mode: 'online', self: 0, initialState: state0, scores });
}

function flushOnlineQueue() {
  const q = online.queue;
  online.queue = [];
  for (const msg of q) handleOnlineMessage(msg);
}

async function handleOnlineMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  switch (msg.t) {
    case 'hello': {
      const other = String(msg.name || 'Oyuncu').slice(0, 20);
      online.players = online.role === 'host' ? [online.myName, other] : [other, online.myName];
      if (online.role === 'host') showOnlineLobby();
      else showOnlineLobby();
      return;
    }
    case 'start': {
      if (online.role !== 'guest') return;
      const game = findGame(msg.gameId);
      if (!game) { toast('Bu oyun bu sürümde yok', { kind: 'error' }); return; }
      const round = ++online.round;   // moves of an earlier round must not reach the new session
      online.queue = [];
      online.busy = true;
      online.session = null;
      if (activeSession) { activeSession.destroy(); activeSession = null; }
      try {
        const ctx = online.ctxCache[game.id] || (online.ctxCache[game.id] = await loadGameData(game));
        if (round !== online.round || !online.transport) return; // a newer start/lobby/leave won
        online.busy = false;
        showPlay({ game, options: msg.options, players: msg.players || online.players, ctx, mode: 'online', self: 1, initialState: msg.state0, scores: msg.scores });
      } catch (err) {
        if (round !== online.round) return;
        online.busy = false;
        online.queue = [];
        console.error(err);
        toast(err.message || 'Veri yüklenemedi', { kind: 'error', duration: 4000 });
      }
      return;
    }
    case 'move': {
      if (online.busy) { online.queue.push(msg); return; }
      if (!online.session) return; // no game on this device: drop it
      online.session.receive(msg);
      return;
    }
    case 'rematch': {
      toast(`${online.players ? online.players[1] : 'Rakip'} yeni tur istiyor`, { duration: 3000 });
      return;
    }
    case 'lobby': {
      online.round++;        // cancels a start that is still loading
      online.queue = [];
      online.busy = false;
      if (currentScreen !== 'online-lobby') {
        toast('Rakip oyundan ayrıldı', { duration: 3000 });
        showOnlineLobby();
      }
      return;
    }
    case 'leave': {
      leaveOnline({ silent: true });
      toast('Rakip odadan ayrıldı', { kind: 'error', duration: 4000 });
      showMenu();
      return;
    }
    default:
      console.warn('Bilinmeyen mesaj', msg);
  }
}

// ---------------------------------------------------------------- boot
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch((err) => console.warn('SW kaydı başarısız', err));
  });
  // A new version has installed and taken over: reload on the menu, otherwise tell the user.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; } // first install, nothing to refresh
    if (currentScreen === 'menu' && !online.transport) location.reload();
    else toast('Yeni sürüm hazır: ana menüye dönünce sayfa yenilenecek', { duration: 4000 });
  });
}

showMenu();
