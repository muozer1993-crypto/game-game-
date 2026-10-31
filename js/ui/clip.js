// Clip player for the song games: plays the first `seconds` of a song's 30-second preview from a
// button, with a progress bar. Spotify preview urls are stable; Deezer previews are fetched by
// track id when the clip is first played (the stored urls expire after a day).
import { el, toast } from './dom.js';

const previewCache = new Map(); // deezer track id -> Promise<string|null>

/** Deezer's public API answers JSONP; the preview url it returns is valid for about a day. */
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = `__dz${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const script = document.createElement('script');
    let timer = null;
    const cleanup = () => { delete window[cb]; script.remove(); clearTimeout(timer); };
    window[cb] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('Ses sunucusuna ulaşılamadı')); };
    timer = setTimeout(() => { cleanup(); reject(new Error('Ses sunucusu yanıt vermedi')); }, 8000);
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${cb}`;
    document.head.append(script);
  });
}

/** The 30-second preview url for a song, or null when there is none. */
export function previewUrl(song) {
  if (song.p) return Promise.resolve(song.p);
  if (!song.dz) return Promise.resolve(null);
  if (!previewCache.has(song.dz)) {
    previewCache.set(song.dz, jsonp(`https://api.deezer.com/track/${encodeURIComponent(song.dz)}?output=jsonp`)
      .then((d) => (d && typeof d.preview === 'string' && d.preview) || null)
      .catch(() => null));
  }
  return previewCache.get(song.dz);
}

/**
 * @param {object} song            { p?, dz? }
 * @param {object} opts
 * @param {number} opts.seconds    how much of the preview plays before it stops (replay allowed)
 * @param {boolean} [opts.pausable]  the button pauses while playing (quiz); default: it is disabled while playing
 * @param {number} [opts.heard]    seconds already listened before this render (carried across re-renders)
 * @param {(heard: number, playing: boolean) => void} [opts.onTick]  called while playing and on stop
 * @param {() => void} [opts.onFail]  no preview, or it could not be loaded
 * @param {string} [opts.note]     text under the bar
 * @returns {{ root: HTMLElement, destroy(): void, heard(): number }}
 */
export function createClipPlayer(song, opts) {
  const seconds = Number(opts.seconds) || 10;
  const label = `▶ ${seconds} saniye çal`;
  const btn = el('button', { type: 'button', class: 'btn btn-primary btn-big ss-play' }, label);
  const fill = el('div', { class: 'ss-fill' });
  const bar = el('div', { class: 'ss-bar', 'aria-hidden': 'true' }, fill);
  const note = el('p', { class: 'hint ss-note' }, opts.note || 'Dinle, istersen tekrar çalabilirsin.');
  const root = el('div', { class: 'ss-clip' }, btn, bar, note);
  let audio = null;
  let failed = false;
  let playing = false;
  let stopTimer = null;
  let raf = null;
  let heard = Number(opts.heard) || 0; // seconds listened in total, replays included
  let lastPos = 0;
  const setFailed = (why) => {
    if (failed) return;
    failed = true;
    btn.disabled = true;
    btn.textContent = 'Ses çalınamadı';
    note.textContent = why;
    if (opts.onFail) opts.onFail();
  };
  const ready = previewUrl(song).then((url) => {
    if (!url) { setFailed('Bu şarkının ses örneği yok.'); return; }
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('error', () => setFailed('Ses yüklenemedi (bağlantı yok mu?).'));
    audio.src = url;
  });
  const tick = () => {
    if (!audio || !playing) return;
    const pos = audio.currentTime;
    if (pos > lastPos) heard += pos - lastPos; // only forward motion counts as listening
    lastPos = pos;
    fill.style.width = `${Math.min(1, pos / seconds) * 100}%`;
    if (opts.onTick) opts.onTick(heard, true);
    if (pos >= seconds) { stop(true); return; }
    raf = requestAnimationFrame(tick);
  };
  const stop = (ended = false) => {
    if (audio) audio.pause();
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (!playing) return;
    playing = false;
    if (ended) fill.style.width = '100%';
    btn.disabled = false;
    btn.textContent = ended ? '↻ Tekrar çal' : (opts.pausable ? '▶ Devam et' : label);
    if (opts.onTick) opts.onTick(heard, false);
  };
  btn.addEventListener('click', async () => {
    if (failed) return;
    if (playing) { if (opts.pausable) stop(false); return; }
    if (!audio) { btn.textContent = 'Yükleniyor…'; await ready; if (!audio) return; }
    try {
      const atEnd = audio.currentTime >= seconds - 0.05;
      if (atEnd || audio.ended) { try { audio.currentTime = 0; } catch { /* not seekable yet */ } }
      lastPos = audio.currentTime;
      await audio.play();
      playing = true;
      btn.disabled = !opts.pausable;
      btn.textContent = opts.pausable ? '⏸ Durdur' : 'Çalıyor…';
      raf = requestAnimationFrame(tick);
      stopTimer = setTimeout(() => stop(true), (seconds - lastPos + 2) * 1000); // buffering may delay the start
    } catch {
      btn.disabled = false;
      btn.textContent = label;
      toast('Çalınamadı; bir daha dokun', { kind: 'error' });
    }
  });
  return {
    root,
    heard: () => heard,
    destroy: () => { stop(false); if (audio) { audio.removeAttribute('src'); audio.load(); audio = null; } },
  };
}
