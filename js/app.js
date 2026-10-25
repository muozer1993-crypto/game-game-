// Screen flow: menu -> setup -> play (-> result -> new round) ; menu -> online -> setup/play.
import { games, groups, findGame } from '../games/index.js';
import { APP_VERSION } from './version.js';
import { Session } from './session.js';
import { el, render, clear, toast } from './ui/dom.js';
import { createScoreboard } from './ui/scoreboard.js';
import { load, save, remove, keys } from './lib/storage.js';
import { loadDictionary, loadCommonWords } from './lib/words.js';
import { randomSeed, shuffle, createRng } from './lib/rng.js';
import { nameSuffix, capitalizeTR } from './lib/tr.js';
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
  vibrate: load('vibrate', true) !== false, // buzz when it becomes your turn online
  favorites: (load('favorites', []) || []).filter((id) => typeof id === 'string'), // game ids starred on the menu
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
let tournament = null; // { ids, index, wins, draws, results, players, onlineHost } while a tournament runs

function setScreen(name, cleanupFn) {
  if (teardown) { try { teardown(); } catch (err) { console.warn(err); } }
  teardown = cleanupFn || null;
  currentScreen = name;
  if (location.hash !== `#${name}`) {
    // The history holds at most two entries: the menu and the current screen. Screens reached
    // from another screen replace that entry, so an evening of rounds never piles up stale
    // entries that would turn the back button into a no-op.
    if (name === 'menu') history.replaceState(null, '', '#menu');
    else if (history.state && history.state.app) history.replaceState({ app: true }, '', `#${name}`);
    else history.pushState({ app: true }, '', `#${name}`);
  }
  window.scrollTo(0, 0);
}

window.addEventListener('popstate', () => {
  // Browser / Android back button.
  if (currentScreen === 'menu') return;
  if (currentScreen === 'play') {
    if (activeSession && !activeSession.ended && !confirm('Oyundan çıkılsın mı?')) {
      history.pushState({ app: true }, '', '#play');
      return;
    }
    if (online.transport && !online.resuming && !reconnectOverlay) { showOnlineLobby({ notify: true }); return; }
  }
  // In a room, the back button does what the header arrow does on that screen: back to the
  // lobby, not out of the room (showMenu would send 'leave' and kick the other phone out too).
  const inRoom = online.transport && online.players && !online.resuming && !reconnectOverlay;
  if (inRoom && (currentScreen.startsWith('setup-') || currentScreen === 'tournament' || currentScreen === 'tournament-result')) {
    showOnlineLobby({ notify: currentScreen === 'tournament-result' });
    return;
  }
  if (currentScreen === 'online-wait' && online.transport) { leaveOnline(); showOnline(); return; }
  if (currentScreen === 'online-lobby' && online.transport && !confirm('Odadan çıkılsın mı? Rakibin bağlantısı kesilir.')) {
    history.pushState({ app: true }, '', '#online-lobby');
    return;
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
  tournament = null;
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
    quickRow((game) => showSetup(game)),
    searchBox(),
    gameSections((game) => showSetup(game)),
    el('section', { class: 'section' },
      el('button', { type: 'button', class: 'btn btn-secondary btn-block', onClick: () => showTournamentSetup() }, '🏆 Oyun gecesi turnuvası (art arda birkaç oyun)'),
      el('button', { type: 'button', class: 'btn btn-secondary btn-block', style: { marginTop: '8px' }, onClick: showOnline }, '📶 İki telefonda oyna (oda kodu)'),
    ),
    el('footer', { class: 'footer muted' },
      el('button', { type: 'button', class: 'linkish', onClick: showRecords }, 'Skor tablosu'), ' · ',
      el('a', { href: 'tests/index.html' }, 'Testler'), ' · ',
      el('a', { href: 'README.md' }, 'Kaynak ve lisanslar'),
    ),
  );
}

/** Game cards grouped into sections (used by the menu and the online lobby). */
/** All-time records between every pair of players, per game. */
export function showRecords() {
  setScreen('records');
  const rows = [];
  for (const key of keys('record:')) {
    const m = key.match(/^record:([^:]+):(.*)\|(.*)$/);
    const rec = load(key, null);
    if (!m || !rec || !Array.isArray(rec.wins)) continue;
    const stored = Array.isArray(rec.names) && rec.names.length === 2;
    const names = stored ? rec.names.map(String) : [capitalizeTR(m[2]), capitalizeTR(m[3])]; // old records: from the key
    rows.push({ key, pair: `${m[2]}|${m[3]}`, stored, game: findGame(m[1]), gameId: m[1], names, wins: rec.wins, draws: rec.draws || 0, rounds: rec.rounds || 0 });
  }
  const pairs = new Map(); // grouped by the lowercased key pair; shown with the stored display names when any record has them
  for (const r of rows) {
    const id = r.pair;
    if (!pairs.has(id)) pairs.set(id, { names: r.names, rows: [], wins: [0, 0], draws: 0, rounds: 0 });
    const pr = pairs.get(id);
    if (r.stored && !pr.stored) { pr.names = r.names; pr.stored = true; }
    pr.rows.push(r);
    pr.wins[0] += r.wins[0]; pr.wins[1] += r.wins[1]; pr.draws += r.draws; pr.rounds += r.rounds;
  }
  const sections = [...pairs.values()].sort((x, y) => y.rounds - x.rounds).map((pr) => el('section', { class: 'section card records-pair' },
    el('h2', { class: 'section-title' }, `${pr.names[0]} ${pr.wins[0]} – ${pr.wins[1]} ${pr.names[1]}`),
    el('p', { class: 'muted' }, `${pr.rounds} tur${pr.draws ? `, ${pr.draws} berabere` : ''}`),
    el('div', { class: 'records-list' }, pr.rows.sort((x, y) => y.rounds - x.rounds).map((r) => el('div', { class: 'records-row' },
      el('span', { class: 'records-game' }, `${r.game ? `${r.game.meta.icon || ''} ${r.game.meta.name}` : r.gameId}`),
      el('span', { class: 'records-score' }, `${r.wins[0]} – ${r.wins[1]}${r.draws ? ` (${r.draws} b.)` : ''}`)))),
    el('button', {
      type: 'button', class: 'btn btn-small', style: { marginTop: '8px' },
      onClick: () => { if (confirm(`${pr.names[0]} – ${pr.names[1]} skorları silinsin mi?`)) { pr.rows.forEach((r) => remove(r.key)); showRecords(); } },
    }, 'Bu çiftin skorlarını sıfırla'),
  ));
  render(app,
    header('Skor tablosu', { onBack: showMenu }),
    sections.length ? sections : el('p', { class: 'lead' }, 'Henüz kayıtlı skor yok. Bir oyun bitince kazanan burada birikir (oyuncu adlarına göre).'),
  );
}

// ---------------------------------------------------------------- tournament
/** Pick several games to play back to back; every game's winner scores a point. */
export function showTournamentSetup({ onlineHost = false } = {}) {
  setScreen('tournament');
  const names = prefs.players.slice();
  const chosen = new Set(games.map((g) => g.id));
  let count = 5;
  const nameFields = onlineHost
    ? el('div', { class: 'field' }, el('div', { class: 'muted' }, `Oyuncular: ${online.players[0]} (sen) ve ${online.players[1]}`))
    : el('div', { class: 'names' }, [0, 1].map((i) => el('div', { class: 'field' },
      el('label', { for: `name-${i}` }, `${i + 1}. oyuncu`),
      el('input', { type: 'text', class: 'input', id: `name-${i}`, maxlength: 20, autocomplete: 'off', value: names[i], onInput: (e) => { names[i] = e.target.value; } }))));
  const countSelect = el('select', { class: 'select', id: 'tour-count', onChange: (e) => { count = Number(e.target.value); } },
    [3, 5, 7].map((n) => el('option', { value: String(n) }, `${n} oyun`)), el('option', { value: '0' }, 'Seçilen oyunların hepsi'));
  countSelect.value = '5';
  const boxes = [];
  const groupBox = (g) => {
    const list = games.filter((game) => game.meta.group === g.id);
    return el('div', { class: 'tour-group' },
      el('div', { class: 'col-title' }, g.title),
      el('div', { class: 'tour-games' }, list.map((game) => {
        const cb = el('input', { type: 'checkbox', id: `tour-${game.id}`, onChange: (e) => { if (e.target.checked) chosen.add(game.id); else chosen.delete(game.id); } });
        cb.checked = true;
        boxes.push(cb);
        return el('label', { class: 'tour-game', for: `tour-${game.id}` }, cb, ` ${game.meta.icon || ''} ${game.meta.name}`);
      })));
  };
  const setAll = (on) => { boxes.forEach((cb) => { cb.checked = on; }); games.forEach((g) => (on ? chosen.add(g.id) : chosen.delete(g.id))); };
  const start = () => {
    const pool = games.filter((g) => chosen.has(g.id));
    if (!pool.length) { toast('En az bir oyun seç', { kind: 'error' }); return; }
    const players = onlineHost ? online.players : names.map((n, i) => n.trim() || DEFAULT_PLAYERS[i]);
    if (!onlineHost) { prefs.players = players; save('players', players); }
    const order = shuffle(createRng(randomSeed()), pool).map((g) => g.id);
    const ids = count ? Array.from({ length: count }, (_, i) => order[i % order.length]) : order;
    tournament = { ids, index: 0, wins: [0, 0], draws: 0, results: [], players, onlineHost };
    startTournamentGame();
  };
  render(app,
    header('Oyun gecesi turnuvası', { onBack: () => (onlineHost ? showOnlineLobby() : showMenu()) }),
    el('p', { class: 'lead' }, 'Seçtiğin oyunlardan rastgele bir sıra kurulur; her oyunun kazananı 1 puan alır, sonda toplam puana bakılır. Her oyun kendi kayıtlı ayarlarıyla başlar.'),
    el('section', { class: 'section' }, nameFields, el('div', { class: 'field' }, el('label', { for: 'tour-count' }, 'Kaç oyun?'), countSelect)),
    el('section', { class: 'section card' },
      el('div', { class: 'row', style: { justifyContent: 'space-between' } },
        el('h2', { class: 'section-title', style: { margin: 0 } }, 'Oyunlar'),
        el('span', {}, el('button', { type: 'button', class: 'btn btn-small', onClick: () => setAll(true) }, 'Hepsi'), ' ', el('button', { type: 'button', class: 'btn btn-small', onClick: () => setAll(false) }, 'Hiçbiri'))),
      groups.map(groupBox)),
    el('button', { type: 'button', class: 'btn btn-primary btn-big btn-block', onClick: start }, 'Turnuvayı başlat'),
  );
}

async function startTournamentGame() {
  const t = tournament;
  if (!t) { showMenu(); return; }
  const game = findGame(t.ids[t.index]);
  if (!game) { showMenu(); return; }
  const options = { ...settingsForm(game).values, seed: randomSeed() };
  try {
    const ctx = await loadGameData(game);
    if (tournament !== t) return; // the user left meanwhile
    const info = { index: t.index, total: t.ids.length, wins: t.wins.slice() };
    if (t.onlineHost) {
      if (!online.transport || online.resuming) { // the link dropped while the data loaded: keep the room
        if (online.resuming || reconnectOverlay) toast('Bağlantı yok; yeniden bağlanınca "Sonraki oyun"a tekrar bas', { kind: 'error', duration: 4000 });
        return;
      }
      startOnlineGame(game, options, ctx, [0, 0], info);
    } else {
      showPlay({ game, options, players: t.players, ctx, mode: 'local', self: null, scores: [0, 0] });
    }
  } catch (err) {
    console.error(err);
    toast(err.message || 'Veri yüklenemedi', { kind: 'error', duration: 4000 });
    showMenu();
  }
}

function showTournamentResult() {
  const t = tournament;
  if (!t) { showMenu(); return; }
  setScreen('tournament-result');
  const [a, b] = t.wins;
  const line = a === b ? `Berabere: ${a}–${b}` : `${t.players[a > b ? 0 : 1]} turnuvayı kazandı: ${Math.max(a, b)}–${Math.min(a, b)}`;
  const onlineHost = t.onlineHost;
  const results = t.results.slice();
  const players = t.players;
  render(app,
    header('Turnuva sonucu', { onBack: () => (onlineHost ? showOnlineLobby({ notify: true }) : showMenu()) }),
    el('div', { class: 'result-banner' }, line),
    el('p', { class: 'muted', style: { textAlign: 'center' } }, `${results.length} oyun${t.draws ? `, ${t.draws} berabere` : ''}`),
    el('section', { class: 'section card' }, el('div', { class: 'records-list' }, results.map((r, i) => {
      const game = findGame(r.id);
      return el('div', { class: 'records-row' }, el('span', {}, `${i + 1}. ${game ? `${game.meta.icon || ''} ${game.meta.name}` : r.id}`), el('span', { class: 'records-score' }, r.winner == null ? 'berabere' : players[r.winner]));
    }))),
    el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px', marginTop: '12px' } },
      el('button', { type: 'button', class: 'btn btn-primary btn-big', onClick: () => showTournamentSetup({ onlineHost }) }, 'Yeni turnuva'),
      el('button', { type: 'button', class: 'btn btn-secondary btn-big', onClick: () => (onlineHost ? showOnlineLobby({ notify: true }) : showMenu()) }, onlineHost ? 'Lobiye dön' : 'Ana menü'),
    ),
  );
}

/** Filters the game cards below by name as you type (43 games are a long list). */
function searchBox() {
  const input = el('input', {
    type: 'search', class: 'input', id: 'game-search', placeholder: 'Oyun ara…', autocomplete: 'off', 'aria-label': 'Oyun ara',
    onInput: (e) => {
      const q = e.target.value.trim().toLocaleLowerCase('tr-TR');
      document.querySelectorAll('.game-card-wrap').forEach((card) => {
        const name = (card.querySelector('.game-name') || {}).textContent || '';
        card.hidden = !!q && !name.toLocaleLowerCase('tr-TR').includes(q);
      });
      document.querySelectorAll('#app section.section').forEach((sec) => {
        const cards = sec.querySelectorAll('.game-card-wrap');
        if (cards.length) sec.hidden = ![...cards].some((c) => !c.hidden);
      });
    },
  });
  return el('div', { class: 'field search-field' }, input);
}

/** Shortcuts above the list: the game played last and a random pick. */
function quickRow(onPick) {
  const last = findGame(load('last-game', null));
  const random = () => onPick(games[Math.floor(Math.random() * games.length)]);
  return el('div', { class: 'quick-row' },
    last ? el('button', { type: 'button', class: 'btn btn-secondary btn-small quick-last', onClick: () => onPick(last) }, `${last.meta.icon || '🎲'} Son oynanan: ${last.meta.name}`) : null,
    el('button', { type: 'button', class: 'btn btn-secondary btn-small quick-random', onClick: random }, '🎲 Rastgele oyun'),
  );
}

const isFavorite = (game) => prefs.favorites.includes(game.id);
function toggleFavorite(game) {
  prefs.favorites = isFavorite(game) ? prefs.favorites.filter((id) => id !== game.id) : prefs.favorites.concat([game.id]);
  save('favorites', prefs.favorites);
}

/** Game cards grouped into sections; starred games sit in a "Favoriler" section on top. */
function gameSections(onPick) {
  const wrap = el('div', { class: 'game-sections' });
  const build = () => {
    const card = (game) => {
      const fav = isFavorite(game);
      return el('div', { class: 'game-card-wrap' },
        el('button', { type: 'button', class: 'card game-card', onClick: () => onPick(game) },
          el('div', { class: 'game-icon', 'aria-hidden': 'true' }, game.meta.icon || '🎲'),
          el('div', { class: 'game-text' },
            el('div', { class: 'game-name' }, game.meta.name),
            el('div', { class: 'game-desc' }, game.meta.description),
          )),
        el('button', {
          type: 'button', class: `fav-btn ${fav ? 'on' : ''}`, 'aria-label': fav ? 'Favorilerden çıkar' : 'Favorilere ekle', 'aria-pressed': fav ? 'true' : 'false',
          onClick: () => { toggleFavorite(game); build(); const q = document.getElementById('game-search'); if (q && q.value) q.dispatchEvent(new Event('input')); },
        }, fav ? '★' : '☆'),
      );
    };
    const section = (title, list) => el('section', { class: 'section' }, el('h2', { class: 'section-title' }, title), el('div', { class: 'game-list' }, list.map(card)));
    const favs = games.filter(isFavorite);
    const used = new Set(favs.map((g) => g.id));
    const sections = favs.length ? [section('Favoriler', favs)] : [];
    groups.forEach((g) => {
      const list = games.filter((game) => game.meta.group === g.id && !used.has(game.id));
      list.forEach((game) => used.add(game.id));
      if (list.length) sections.push(section(g.title, list));
    });
    const rest = games.filter((game) => !used.has(game.id));
    if (rest.length) sections.push(section('Diğer', rest));
    wrap.replaceChildren(...sections);
  };
  build();
  return wrap;
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
    save('last-game', game.id);
    startBtn.disabled = true;
    startBtn.textContent = 'Yükleniyor…';
    try {
      const ctx = await loadGameData(game);
      const options = { ...values, seed: randomSeed() };
      if (onlineHost && (!online.transport || online.resuming)) { // the room dropped while the data loaded
        if (currentScreen === `setup-${game.id}`) { // otherwise the room was left meanwhile: nothing to say
          toast('Bağlantı yok; yeniden bağlanınca tekrar dene', { kind: 'error', duration: 4000 });
          startBtn.disabled = false;
          startBtn.textContent = 'Başla';
        }
        return;
      }
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
const recordName = (n) => String(n).trim().toLocaleLowerCase('tr-TR').replace(/[|:]/g, ' ');
// records are stored with the pair in alphabetical order so that both seat orders share one key
const recordSwapped = (players) => recordName(players[0]) > recordName(players[1]);
function recordKey(gameId, players) {
  const [a, b] = players.map(recordName);
  return a <= b ? `record:${gameId}:${a}|${b}` : `record:${gameId}:${b}|${a}`;
}
function loadRecord(gameId, players) {
  const rec = load(recordKey(gameId, players), null);
  if (!rec || !Array.isArray(rec.wins)) return null;
  const swapped = recordSwapped(players);
  return { wins: swapped ? [rec.wins[1], rec.wins[0]] : rec.wins.slice(), draws: rec.draws || 0, rounds: rec.rounds || 0 };
}
function bumpRecord(gameId, players, result) {
  const rec = loadRecord(gameId, players) || { wins: [0, 0], draws: 0, rounds: 0 };
  rec.rounds += 1;
  if (result.draw) rec.draws += 1; else rec.wins[result.winner] += 1;
  const swapped = recordSwapped(players);
  const names = players.map((n) => String(n).trim());
  // the display names travel with the record: the key is lowercased and cannot restore "Ayşe N."
  save(recordKey(gameId, players), { wins: swapped ? [rec.wins[1], rec.wins[0]] : rec.wins, draws: rec.draws, rounds: rec.rounds, names: swapped ? [names[1], names[0]] : names });
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
    // simultaneous games: online nobody is 'on turn'; on one phone only the player holding it (private turn)
    const highlight = turn && !(turn.simultaneous && (isOnline || !turn.private)) ? turn.player : null;
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
    ctx: { ...p.ctx, vibrate: prefs.vibrate },
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
      // tournament bookkeeping: the host (or the single phone) keeps the tally; the guest shows what the host sent
      const t = tournament && (!isOnline || p.self === 0) ? tournament : null;
      let tally = null;
      if (t) {
        if (result.draw) t.draws += 1; else t.wins[result.winner] += 1;
        t.results.push({ id: p.game.id, winner: result.draw ? null : result.winner });
        t.index += 1;
        tally = { index: t.index, total: t.ids.length, wins: t.wins };
      } else if (isOnline && p.self === 1 && online.tournament) {
        const info = online.tournament;
        const wins = Array.isArray(info.wins) ? info.wins.slice() : [0, 0];
        if (!result.draw) wins[result.winner] += 1;
        tally = { index: Number(info.index) + 1, total: Number(info.total), wins };
      }
      const tallyLine = tally ? el('div', { class: 'muted' }, `Turnuva ${tally.index}/${tally.total}: ${p.players[0]} ${tally.wins[0]} – ${tally.wins[1]} ${p.players[1]}`) : null;
      let again;
      if (t) {
        const last = t.index >= t.ids.length;
        const nextGame = last ? null : findGame(t.ids[t.index]);
        again = el('button', { type: 'button', class: 'btn btn-primary btn-big', onClick: () => (last ? showTournamentResult() : startTournamentGame()) },
          last ? 'Turnuva sonucu' : `Sonraki oyun: ${nextGame ? nextGame.meta.name : '?'}`);
      } else if (isOnline && p.self === 1 && online.tournament) {
        again = el('span', { class: 'muted' }, tally && tally.index >= tally.total ? 'Turnuva bitti.' : 'Ev sahibi sonraki oyunu başlatacak…');
      } else {
        again = el('button', { type: 'button', class: 'btn btn-primary btn-big' }, 'Yeni tur');
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
      }
      const shareText = `${p.game.meta.name}: ${p.players[0]} ${scores[0]} – ${scores[1]} ${p.players[1]}${result.draw ? ' (son el berabere)' : ` (son eli ${p.players[result.winner]} aldı)`} · Oyun Gecesi ${location.origin}${location.pathname}`;
      const shareBtn = (navigator.share || (navigator.clipboard && navigator.clipboard.writeText))
        ? el('button', { type: 'button', class: 'btn btn-small linkish-btn', onClick: async () => {
          try {
            if (navigator.share) await navigator.share({ text: shareText });
            else { await navigator.clipboard.writeText(shareText); toast('Sonuç panoya kopyalandı'); }
          } catch (err) { if (!err || err.name !== 'AbortError') toast('Paylaşılamadı', { kind: 'error' }); }
        } }, '📤 Sonucu paylaş')
        : null;
      render(actions,
        el('div', { class: 'result-banner' }, text, tallyLine),
        el('div', { class: 'row' }, again, el('button', { type: 'button', class: 'btn btn-secondary btn-big', onClick: exit }, isOnline ? 'Lobiye dön' : 'Ana menü')),
        shareBtn ? el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '6px' } }, shareBtn) : null,
      );
      actions.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
  });
  activeSession = session;
  online.session = isOnline ? session : null;

  render(app,
    header(p.game.meta.name, { onBack: exit, right: rulesBtn }),
    scoreBox,
    isOnline ? emojiBar() : null,
    gameBox,
    actions,
  );
  session.start(p.initialState);
  if (isOnline) flushOnlineQueue();
}

// ---------------------------------------------------------------- emoji reactions (two phones)
const EMOJIS = ['👍', '😂', '😮', '😅', '🔥', '🤝'];
let lastEmojiAt = 0;
function emojiBar() {
  return el('div', { class: 'emoji-bar', role: 'group', 'aria-label': 'Tepki gönder' }, EMOJIS.map((e) => el('button', {
    type: 'button', class: 'emoji-btn', 'aria-label': `tepki ${e}`,
    onClick: () => {
      if (!online.transport || Date.now() - lastEmojiAt < 1200) return; // no flooding
      lastEmojiAt = Date.now();
      online.transport.send({ t: 'emoji', e });
      showReaction(e, null);
    },
  }, e)));
}
let reactionTimer = null;
function showReaction(e, name) {
  let box = document.getElementById('reaction');
  if (!box) { box = el('div', { id: 'reaction', class: 'reaction', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  box.replaceChildren(el('span', { class: 'reaction-emoji' }, e), name ? el('span', { class: 'reaction-name' }, name) : null);
  box.classList.add('show');
  clearTimeout(reactionTimer);
  reactionTimer = setTimeout(() => box.classList.remove('show'), 1600);
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
  tournament: null, // guest side: { index, total, wins } carried by the host's 'start'
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
  online.tournament = null;
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
  const vibrateInput = el('input', { type: 'checkbox', id: 'pref-vibrate', onChange: (e) => { prefs.vibrate = e.target.checked; save('vibrate', prefs.vibrate); } });
  vibrateInput.checked = prefs.vibrate;
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
    el('section', { class: 'section' },
      el('div', { class: 'field' }, el('label', { for: 'online-name' }, 'Adın'), nameInput),
      el('div', { class: 'field field-toggle' },
        el('label', { for: 'pref-vibrate' }, 'Sıra bana gelince telefon titresin'),
        vibrateInput),
    ),
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
    const inRoom = online.players && (online.session || currentScreen === 'online-lobby' || (online.role === 'host' && (currentScreen.startsWith('setup-') || currentScreen === 'tournament' || currentScreen === 'tournament-result')));
    if (inRoom) {
      if (reconnectOverlay) { if (reconnectRetry) reconnectRetry(); } else showReconnect();
      return;
    }
    leaveOnline({ silent: true });
    toast('Bağlantı koptu', { kind: 'error', duration: 4000 });
    showMenu();
  });
  t.onOpen(() => {
    // Decided when the channel opens, not when the handler was registered: the host keeps its
    // handlers across a replacement connection (the guest reconnecting after a drop the host never
    // noticed) and must then offer a resume, not a fresh greeting that would reset the guest.
    if (online.session && !online.session.destroyed) t.send({ t: 'resume', received: online.session.received, name: online.myName, gameNo: online.gameNo || 0 });
    else t.send({ t: 'hello', name: online.myName, v: APP_VERSION });
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
  window.__oyun = { online, drop: () => { if (online.transport) online.transport.simulateDrop(); }, dropSilently: () => { if (online.transport) online.transport.simulateSilentDrop(); } };
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
  tournament = null;
  online.tournament = null;
  online.session = null; // the lobby has no game: a torn-down session must never be offered for resume
  if (notify) online.transport.send({ t: 'lobby' });
  if (online.role === 'host') {
    setScreen('online-lobby');
    render(app,
      header('Oyun seç', { onBack: () => { leaveOnline(); showMenu(); } }),
      el('p', { class: 'lead' }, `${online.players[1]} bağlandı. Bir oyun seç.`),
      el('button', { type: 'button', class: 'btn btn-secondary btn-block', style: { marginBottom: '12px' }, onClick: () => showTournamentSetup({ onlineHost: true }) }, '🏆 Turnuva (art arda birkaç oyun)'),
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

function startOnlineGame(game, options, ctx, scores, tournamentInfo = null) {
  if (!online.transport) return;
  const state0 = game.setup(options, { ...ctx, players: online.players, mode: 'online', self: 0, options });
  online.gameNo = (online.gameNo || 0) + 1; // identifies this game in resume messages
  online.lastStart = { t: 'start', gameId: game.id, options, state0, players: online.players, scores: scores || [0, 0], tournament: tournamentInfo, gameNo: online.gameNo };
  online.transport.send(online.lastStart);
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
      // a stale cached build on one phone would desync the games: say so before anything starts
      if (msg.v && msg.v !== APP_VERSION) toast(`Uygulama sürümleri farklı (sende ${APP_VERSION}, rakipte ${msg.v}): ikiniz de ana menüye dönüp sayfayı yenileyin`, { kind: 'error', duration: 8000 });
      if (online.resuming) {
        const hadGame = !!(activeSession && !activeSession.destroyed);
        closeReconnect();
        if (activeSession) { activeSession.destroy(); activeSession = null; }
        online.session = null;
        online.transport.send({ t: 'hello', name: online.myName, v: APP_VERSION }); // it never got our greeting
        // with a game running the other side evidently started over; from the lobby it is just the link coming back
        toast(hadGame ? 'Rakip yeniden başladı; oyun baştan kurulacak' : 'Bağlantı yeniden kuruldu', { duration: hadGame ? 4000 : 2500 });
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
        online.transport.send({ t: 'hello', name: online.myName, v: APP_VERSION });
        showOnlineLobby();
        return;
      }
      if ((Number(msg.gameNo) || 0) !== (online.gameNo || 0)) {
        // the other side is in a different game (a new round started while it was away): the host's
        // current game is authoritative, so it re-sends the start; the guest just waits for it
        if (online.role === 'host' && online.lastStart) { online.transport.send(online.lastStart); closeReconnect(); }
        return;
      }
      online.transport.send({ t: 'resumeMoves', moves: online.session.ownMovesFrom(Number(msg.received) || 0), received: online.session.received, gameNo: online.gameNo || 0 });
      return;
    }
    case 'resumeMoves': {
      if (!online.session) return;
      if ((Number(msg.gameNo) || 0) !== (online.gameNo || 0)) { closeReconnect(); return; } // moves of another game
      for (const m of msg.moves || []) online.session.receive(m);
      if (online.resuming) {
        // reply with what the other side missed, then both are in sync
        online.transport.send({ t: 'resumeMoves', moves: online.session.ownMovesFrom(Number(msg.received) || 0), received: online.session.received, final: true, gameNo: online.gameNo || 0 });
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
      online.gameNo = Number(msg.gameNo) || 0;
      closeReconnect();               // a start also answers a pending resume
      online.queue = [];
      online.busy = true;
      online.session = null;
      if (activeSession) { activeSession.destroy(); activeSession = null; }
      try {
        const ctx = online.ctxCache[game.id] || (online.ctxCache[game.id] = await loadGameData(game));
        if (round !== online.round || !online.transport) return; // a newer start/lobby/leave won
        online.busy = false;
        online.tournament = msg.tournament && typeof msg.tournament === 'object' ? msg.tournament : null;
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
    case 'emoji': {
      if (!EMOJIS.includes(msg.e) || !online.players) return;
      showReaction(msg.e, online.players[online.role === 'host' ? 1 : 0]);
      return;
    }
    case 'lobby': {
      online.round++;        // cancels a start that is still loading
      online.queue = [];
      online.busy = false;
      // a finished tournament's summary stays on the host's screen until the host leaves it
      const tournamentDone = currentScreen === 'tournament-result' || (tournament && tournament.index >= tournament.ids.length);
      if (currentScreen !== 'online-lobby' && !tournamentDone) {
        toast('Rakip oyundan ayrıldı', { duration: 3000 });
        // answer with our own 'lobby' so that a guest whose message crossed our 'start' comes back too
        showOnlineLobby({ notify: true });
      } else if (tournamentDone && currentScreen !== 'online-lobby') toast('Rakip lobiye döndü', { duration: 3000 });
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
