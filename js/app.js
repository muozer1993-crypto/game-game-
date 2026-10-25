// Screen flow: menu -> setup -> play (-> result -> new round) ; menu -> online -> setup/play.
import { games, groups, findGame } from '../games/index.js';
import { Session } from './session.js';
import { el, render, clear, toast } from './ui/dom.js';
import { createScoreboard } from './ui/scoreboard.js';
import { load, save, remove } from './lib/storage.js';
import { loadDictionary, loadCommonWords } from './lib/words.js';
import { randomSeed } from './lib/rng.js';
import { nameSuffix } from './lib/tr.js';
import { generateRoomCode, createHost, joinRoom, normalizeRoomCode } from './net/peer.js';

const app = document.getElementById('app');
const DEFAULT_PLAYERS = ['Oyuncu 1', 'Oyuncu 2'];
const QUESTIONS_URL = new URL('../data/questions.json', import.meta.url);
const TRIVIA_URL = new URL('../data/trivia.json', import.meta.url);
const TABU_URL = new URL('../data/tabu.json', import.meta.url);

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
const jsonCache = new Map();
function loadJson(url) {
  if (!jsonCache.has(url.href)) {
    jsonCache.set(url.href, fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`Veri yüklenemedi (${r.status})`); return r.json(); })
      .catch((err) => { jsonCache.delete(url.href); throw err; }));
  }
  return jsonCache.get(url.href);
}
const loadQuestions = () => loadJson(QUESTIONS_URL);

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
  if (needs.includes('trivia')) ctx.trivia = await loadJson(TRIVIA_URL);
  if (needs.includes('tabu')) ctx.tabu = await loadJson(TABU_URL);
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
    if (online.transport && !online.resuming && !reconnectOverlay) { showOnlineLobby({ notify: true }); return; }
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
  if (online.transport || online.resuming || reconnectOverlay) { closeReconnect(); leaveOnline(); } // tells the other device we left
  setScreen('menu');
  const themeSelect = el('select', { class: 'select', 'aria-label': 'Tema', onChange: (e) => applyTheme(e.target.value) },
    el('option', { value: 'auto' }, 'Tema: Sistem'),
    el('option', { value: 'light' }, 'Tema: Açık'),
    el('option', { value: 'dark' }, 'Tema: Koyu'),
  );
  themeSelect.value = prefs.theme;

  render(app,
    header('Oyun Gecesi', { right: themeSelect }),
    el('p', { class: 'lead' }, 'İki kişilik oyunlar. Tek telefonda elden ele ya da iki telefonda oda koduyla.'),
    gameSections((game) => showSetup(game)),
    el('section', { class: 'section' },
      el('button', { type: 'button', class: 'btn btn-secondary btn-block', onClick: showOnline }, '📶 İki telefonda oyna (oda kodu)'),
    ),
    el('footer', { class: 'footer muted' },
      el('a', { href: 'tests/index.html' }, 'Testler'), ' · ',
      el('a', { href: 'README.md' }, 'Kaynak ve lisanslar'),
    ),
  );
}

/** Game cards grouped into sections (used by the menu and the online lobby). */
function gameSections(onPick) {
  const card = (game) => el('button', { type: 'button', class: 'card game-card', onClick: () => onPick(game) },
    el('div', { class: 'game-icon', 'aria-hidden': 'true' }, game.meta.icon || '🎲'),
    el('div', { class: 'game-text' },
      el('div', { class: 'game-name' }, game.meta.name),
      el('div', { class: 'game-desc' }, game.meta.description),
    ));
  const used = new Set();
  const sections = groups.map((g) => {
    const list = games.filter((game) => game.meta.group === g.id);
    list.forEach((game) => used.add(game.id));
    if (!list.length) return null;
    return el('section', { class: 'section' }, el('h2', { class: 'section-title' }, g.title), el('div', { class: 'game-list' }, list.map(card)));
  });
  const rest = games.filter((game) => !used.has(game.id));
  if (rest.length) sections.push(el('section', { class: 'section' }, el('h2', { class: 'section-title' }, 'Diğer'), el('div', { class: 'game-list' }, rest.map(card))));
  return sections;
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
  const record = onlineHost ? recordView(game, online.players) : recordView(game, names.map((n, i) => n.trim() || DEFAULT_PLAYERS[i]));

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
    el('section', { class: 'section' }, nameFields, record),
    fields.length ? el('section', { class: 'section' }, el('h2', { class: 'section-title' }, 'Ayarlar'), fields) : null,
    extra,
    el('section', { class: 'section' }, startBtn),
  );
}

// ---------------------------------------------------------------- all-time record per game and player pair
function recordKey(gameId, players) {
  const [a, b] = players.map((n) => n.trim().toLocaleLowerCase('tr-TR'));
  return a <= b ? `record:${gameId}:${a}|${b}` : `record:${gameId}:${b}|${a}`;
}
function loadRecord(gameId, players) {
  const rec = load(recordKey(gameId, players), null);
  if (!rec || !Array.isArray(rec.wins)) return null;
  const swapped = players[0].trim().toLocaleLowerCase('tr-TR') > players[1].trim().toLocaleLowerCase('tr-TR');
  return { wins: swapped ? [rec.wins[1], rec.wins[0]] : rec.wins.slice(), draws: rec.draws || 0, rounds: rec.rounds || 0 };
}
function bumpRecord(gameId, players, result) {
  const rec = loadRecord(gameId, players) || { wins: [0, 0], draws: 0, rounds: 0 };
  rec.rounds += 1;
  if (result.draw) rec.draws += 1; else rec.wins[result.winner] += 1;
  const swapped = players[0].trim().toLocaleLowerCase('tr-TR') > players[1].trim().toLocaleLowerCase('tr-TR');
  save(recordKey(gameId, players), { wins: swapped ? [rec.wins[1], rec.wins[0]] : rec.wins, draws: rec.draws, rounds: rec.rounds });
}
function recordView(game, players) {
  const rec = loadRecord(game.id, players);
  if (!rec || !rec.rounds) return null;
  const box = el('div', { class: 'record muted' });
  render(box,
    el('span', {}, `Bu oyunda şimdiye kadar: ${players[0]} ${rec.wins[0]} – ${players[1]} ${rec.wins[1]}${rec.draws ? `, ${rec.draws} berabere` : ''} (${rec.rounds} tur)`),
    ' ',
    el('button', { type: 'button', class: 'btn btn-small', onClick: () => { remove(recordKey(game.id, players)); box.remove(); } }, 'Sıfırla'),
  );
  return box;
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
    const highlight = turn && !(turn.simultaneous && isOnline) ? turn.player : null;
    render(scoreBox, createScoreboard({ players: p.players, scores, turn: highlight, self: p.self }));
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
      bumpRecord(p.game.id, p.players, result);
      let text;
      if (result.draw) text = 'Berabere!';
      else {
        const pts = Number(result.points) > 0 ? Number(result.points) : 1;
        scores[result.winner] += pts;
        text = `${p.players[result.winner]} kazandı!${pts > 1 ? ` (+${pts} puan)` : ''}`;
      }
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
  code: null,       // room code (kept for reconnecting)
  resuming: false,  // a reconnect is in progress: 'hello' is replaced by 'resume'
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
  online.code = null;
  online.resuming = false;
  online.players = null;
  online.session = null;
  online.queue = [];
  online.busy = false;
  online.round++;
}

/** The link a friend opens to land on the join screen with the code filled in. */
export function inviteLink(code) {
  const url = new URL(location.pathname, location.href);
  url.search = `?oda=${code}`;
  return url.href;
}

async function shareInvite(code) {
  const url = inviteLink(code);
  const text = `Oyun Gecesi: odaya katıl, kod ${code}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Oyun Gecesi', text, url }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Davet bağlantısı kopyalandı; arkadaşına gönder');
  } catch {
    toast('Kopyalanamadı: bağlantıyı elle seçip kopyala', { kind: 'error' });
  }
}

export function showOnline({ code: presetCode = '' } = {}) {
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
  if (presetCode) codeInput.value = normalizeRoomCode(presetCode);
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
    el('p', { class: 'lead' }, presetCode
      ? `Davet bağlantısıyla geldin: oda kodu ${normalizeRoomCode(presetCode)}. Adını yaz ve "Odaya katıl"a bas.`
      : 'Biriniz oda kurar, kodu söyler ya da davet bağlantısını gönderir; diğeri katılır. İkiniz de internete bağlı olmalısınız.'),
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

function wireTransport(myName, { resume = false } = {}) {
  const t = online.transport;
  online.myName = myName;
  online.code = t.code;
  if (!resume) online.players = null;
  if (online.session) online.session.transport = t;
  t.onMessage((msg) => handleOnlineMessage(msg));
  t.onClose(() => {
    if (online.transport !== t) return; // an old transport we already replaced
    // Mid-game (or in the lobby with a known opponent) offer to reconnect instead of dropping everything.
    const inRoom = online.players && (online.session || currentScreen === 'online-lobby' || (online.role === 'host' && currentScreen.startsWith('setup-')));
    if (inRoom) {
      if (reconnectOverlay) { if (reconnectRetry) reconnectRetry(); } else showReconnect();
      return;
    }
    leaveOnline({ silent: true });
    toast('Bağlantı koptu', { kind: 'error', duration: 4000 });
    showMenu();
  });
  t.onOpen(() => {
    if (resume && online.session) t.send({ t: 'resume', received: online.session.received, name: myName });
    else t.send({ t: 'hello', name: myName });
  });
}

/** Overlay shown when the connection drops mid-game; both sides re-establish the same room. */
let reconnectOverlay = null;
let reconnectRetry = null; // restarts the attempt loop while the overlay is open
function showReconnect() {
  if (reconnectOverlay) return;
  const status = el('p', { class: 'muted', style: { minHeight: '1.4em' } }, 'Bağlantı koptu.');
  const retryBtn = el('button', { type: 'button', class: 'btn btn-primary btn-block' }, 'Yeniden bağlan');
  const exitBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-block', onClick: () => { closeReconnect(); leaveOnline({ silent: true }); showMenu(); } }, 'Çık');
  reconnectOverlay = el('div', { class: 'overlay' },
    el('div', { class: 'card overlay-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Bağlantı koptu' },
      el('h2', {}, 'Bağlantı koptu'),
      el('p', {}, `Oda kodu ${online.code}. İkiniz de "Yeniden bağlan" deyince oyun kaldığı yerden sürer.`),
      status, retryBtn, el('div', { style: { height: '8px' } }), exitBtn));
  document.body.append(reconnectOverlay);
  let attempting = false;
  const myOverlay = reconnectOverlay;
  const attempt = async () => {
    if (attempting) return;
    attempting = true;
    retryBtn.disabled = true;
    const old = online.transport;
    online.transport = null;
    if (old) { try { old.close(); } catch { /* ignore */ } }
    online.resuming = true;
    const code = online.code;
    const role = online.role;
    const deadline = Date.now() + 120000;
    let t = null;
    while (!t && Date.now() < deadline && reconnectOverlay === myOverlay) {
      try {
        if (role === 'host') t = await createHost(code, { keepCode: true, attempts: 1, onStatus: (s) => { status.textContent = s; } });
        else t = await joinRoom(code, { onStatus: (s) => { status.textContent = s; } });
      } catch (err) {
        status.textContent = `${err.message || 'Bağlanılamadı'} — tekrar deneniyor…`;
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
    attempting = false;
    // the player left (Çık / back) while we were connecting: throw the late result away
    if (reconnectOverlay !== myOverlay || online.code !== code) { if (t) { try { t.close(); } catch { /* ignore */ } } return; }
    if (!t) { retryBtn.disabled = false; status.textContent = 'Bağlanılamadı. Tekrar dene ya da çık.'; return; }
    online.transport = t;
    wireTransport(online.myName, { resume: true });
    status.textContent = role === 'host' ? 'Oda yeniden açıldı, rakip bekleniyor…' : 'Bağlandı, oyun eşitleniyor…';
  };
  reconnectRetry = attempt;
  retryBtn.addEventListener('click', attempt);
  attempt();
}
function closeReconnect() {
  if (reconnectOverlay) { reconnectOverlay.remove(); reconnectOverlay = null; }
  reconnectRetry = null;
  online.resuming = false;
}
if (typeof window !== 'undefined' && load('debug', false)) {
  window.__oyun = { online, drop: () => { if (online.transport) online.transport.simulateDrop(); } };
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
        ? el('p', {}, 'Kodu arkadaşına söyle ya da davet bağlantısını gönder. Katılınca oyun seçimi açılacak.')
        : el('p', {}, 'Bağlanıldı, ev sahibinin oyun seçmesi bekleniyor…'),
      isHost ? el('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: () => shareInvite(code) }, 'Davet bağlantısını gönder') : null,
      isHost ? el('div', { class: 'invite-link muted' }, inviteLink(code)) : null,
      el('div', { class: 'spinner', 'aria-hidden': 'true' }),
    ),
  );
}

function showOnlineLobby({ notify = false } = {}) {
  if (!online.transport || !online.players) { showMenu(); return; }
  if (notify) online.transport.send({ t: 'lobby' });
  if (online.role === 'host') {
    setScreen('online-lobby');
    render(app,
      header('Oyun seç', { onBack: () => { leaveOnline(); showMenu(); } }),
      el('p', { class: 'lead' }, `${online.players[1]} bağlandı. Bir oyun seç.`),
      gameSections((game) => showSetup(game, { onlineHost: true })),
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
      if (online.resuming) {
        // the other side started over: our game cannot continue
        closeReconnect();
        if (activeSession) { activeSession.destroy(); activeSession = null; }
        online.session = null;
        online.transport.send({ t: 'hello', name: online.myName }); // it never got our greeting
        toast('Rakip yeniden başladı; oyun baştan kurulacak', { duration: 4000 });
      }
      showOnlineLobby();
      return;
    }
    case 'resume': {
      // the other device reconnected mid-game: send it the moves it missed, and ask for ours
      if (!online.session) {
        // we have no game to resume (fresh page): treat it as a greeting
        const other = String(msg.name || 'Oyuncu').slice(0, 20);
        online.players = online.role === 'host' ? [online.myName, other] : [other, online.myName];
        online.transport.send({ t: 'hello', name: online.myName });
        showOnlineLobby();
        return;
      }
      online.transport.send({ t: 'resumeMoves', moves: online.session.ownMovesFrom(Number(msg.received) || 0), received: online.session.received });
      return;
    }
    case 'resumeMoves': {
      if (!online.session) return;
      for (const m of msg.moves || []) online.session.receive(m);
      if (online.resuming) {
        // reply with what the other side missed, then both are in sync
        online.transport.send({ t: 'resumeMoves', moves: online.session.ownMovesFrom(Number(msg.received) || 0), received: online.session.received, final: true });
      }
      closeReconnect();
      if (online.session) online.session.render();
      toast('Bağlantı yeniden kuruldu', { duration: 2500 });
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

// A friend's invite link (…?oda=KOD) opens the join screen with the code filled in.
const invitedCode = new URLSearchParams(location.search).get('oda');
if (invitedCode) {
  history.replaceState(null, '', location.pathname);
  showOnline({ code: invitedCode });
} else {
  showMenu();
}
