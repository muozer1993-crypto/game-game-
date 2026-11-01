// Connection self-test for the two-phone mode: which kinds of WebRTC paths this device can use
// (direct, through STUN, through the TURN relay) and whether the signalling server answers. Two
// phones on different networks almost always need the relay, so a missing relay candidate explains
// "my own two devices connect but my friend's phone and mine do not".

/** Sort gathered candidates into host / srflx / relay counts (pure; also used by the tests). */
export function summarizeCandidates(candidates) {
  const out = { host: 0, srflx: 0, prflx: 0, relay: 0, relayTcp: 0, relayUdp: 0 };
  for (const c of candidates) {
    const s = typeof c === 'string' ? c : (c && c.candidate) || '';
    const m = /\btyp\s+(\w+)/.exec(s);
    if (!m) continue;
    const type = m[1];
    if (type in out) out[type] += 1;
    if (type === 'relay') {
      // the leg to the TURN server is what matters on a UDP-blocking network; the candidate string
      // only shows the relay's own transport, RTCIceCandidate.relayProtocol (where supported) the real one
      const proto = c && typeof c === 'object' ? c.relayProtocol : undefined;
      if (proto === 'tcp' || proto === 'tls' || (!proto && /\s(tcp)\s/i.test(s))) out.relayTcp += 1; else out.relayUdp += 1;
    }
  }
  return out;
}

/** The relay is what cross-network games need; without it only same-network pairs work. */
export function verdictFor(summary, signalling) {
  if (!signalling) return { ok: false, text: 'Eşleştirme sunucusuna (0.peerjs.com) ulaşılamıyor: oda açılamaz ya da odaya katılınamaz. İnternet bağlantısını kontrol et.' };
  if (summary.relay > 0) return { ok: true, text: 'TURN aktarma sunucusu çalışıyor: farklı ağlardaki iki telefon da bağlanabilmeli.' };
  if (summary.srflx > 0) return { ok: false, text: 'STUN çalışıyor ama TURN aktarma sunucusuna ulaşılamadı: aynı Wi-Fi\'deki cihazlar bağlanır, farklı ağlardaki (mobil veri) telefonlar büyük ihtimalle bağlanamaz.' };
  return { ok: false, text: 'Ne STUN ne TURN yanıt verdi: bu ağ WebRTC\'yi engelliyor olabilir (kurumsal Wi-Fi, VPN, bazı operatörler). Başka bir ağ dene.' };
}

/**
 * Gather ICE candidates with the given servers and report what came back.
 * @param {RTCIceServer[]} iceServers
 * @param {{ timeoutMs?: number, onProgress?: (summary: object) => void }} [opts]
 * @returns {Promise<{ summary: object, errors: {url: string, code: number, text: string}[], ms: number, complete: boolean }>}
 */
export function gatherCandidates(iceServers, opts = {}) {
  const timeoutMs = opts.timeoutMs || 10000;
  return new Promise((resolve) => {
    const started = Date.now();
    const candidates = [];
    const errors = [];
    let pc;
    let done = false;
    const finish = (complete) => {
      if (done) return;
      done = true;
      try { pc && pc.close(); } catch { /* ignore */ }
      resolve({ summary: summarizeCandidates(candidates), errors, ms: Date.now() - started, complete });
    };
    try {
      pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 0 });
    } catch (err) {
      errors.push({ url: '', code: 0, text: err && err.message ? err.message : 'RTCPeerConnection yok' });
      finish(false);
      return;
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        candidates.push(e.candidate);
        if (opts.onProgress) opts.onProgress(summarizeCandidates(candidates));
      } else finish(true);
    };
    pc.onicecandidateerror = (e) => {
      // 701 = STUN/TURN host unreachable; 401/403 = TURN credentials refused
      errors.push({ url: e.url || '', code: e.errorCode || 0, text: e.errorText || '' });
    };
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') finish(true); };
    pc.createDataChannel('test');
    pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch((err) => {
      errors.push({ url: '', code: 0, text: err && err.message ? err.message : 'offer başarısız' });
      finish(false);
    });
    setTimeout(() => finish(false), timeoutMs);
  });
}

/** Does the PeerJS signalling server answer? (It hands out ids over plain HTTPS.) */
export async function checkSignalling(url = 'https://0.peerjs.com/peerjs/id', timeoutMs = 8000) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl && ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}?ts=${Date.now()}`, { signal: ctrl ? ctrl.signal : undefined, cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
