import { test, assert } from './runner.js';
import { summarizeCandidates, verdictFor } from '../js/net/icetest.js';

test('bağlantı testi: adaylar türlerine ayrılır, karar aktarma sunucusuna göre verilir', () => {
  const s = summarizeCandidates([
    'candidate:1 1 udp 2122260223 192.168.1.5 50000 typ host generation 0',
    'candidate:2 1 udp 1686052607 85.1.2.3 50000 typ srflx raddr 192.168.1.5 rport 50000',
    { candidate: 'candidate:3 1 udp 41885439 1.2.3.4 50000 typ relay raddr 85.1.2.3 rport 50000' },
    'candidate:4 1 tcp 25108223 1.2.3.4 443 typ relay raddr 0.0.0.0 rport 0 tcptype passive',
    'not a candidate', null,
  ]);
  assert.deepEqual(s, { host: 1, srflx: 1, prflx: 0, relay: 2, relayTcp: 1, relayUdp: 1 });
  assert.ok(verdictFor(s, true).ok);
  assert.ok(!verdictFor(s, false).ok && verdictFor(s, false).text.includes('Eşleştirme'));
  const noRelay = verdictFor({ host: 2, srflx: 1, relay: 0 }, true);
  assert.ok(!noRelay.ok && noRelay.text.includes('TURN'));
  const nothing = verdictFor({ host: 1, srflx: 0, relay: 0 }, true);
  assert.ok(!nothing.ok && nothing.text.includes('engelliyor'));
});

test('bağlantı testi: TURN-TCP üzerinden gelen aday relayProtocol ile ayrılır', () => {
  const s = summarizeCandidates([
    { candidate: 'candidate:3 1 udp 41885439 1.2.3.4 50000 typ relay raddr 85.1.2.3 rport 50000', relayProtocol: 'tcp' },
    { candidate: 'candidate:4 1 udp 41885439 1.2.3.4 50001 typ relay raddr 85.1.2.3 rport 50000', relayProtocol: 'tls' },
    { candidate: 'candidate:5 1 udp 41885439 1.2.3.4 50002 typ relay raddr 85.1.2.3 rport 50000', relayProtocol: 'udp' },
    { candidate: 'candidate:6 1 udp 41885439 1.2.3.4 50003 typ relay raddr 85.1.2.3 rport 50000' },
  ]);
  assert.deepEqual([s.relay, s.relayTcp, s.relayUdp], [4, 2, 2]);
});

test('bağlantı testi: kimlik reddi (401/403) ve kota (486) ağ sorunundan ayrı açıklanır', () => {
  const none = { host: 1, srflx: 1, prflx: 0, relay: 0, relayTcp: 0, relayUdp: 0 };
  const denied = verdictFor(none, true, [{ url: 'turn:global.relay.metered.ca:80', code: 401, text: 'Unauthorized' }]);
  assert.ok(!denied.ok && denied.text.includes('turn-config.js'), 'points at the credentials file');
  const quota = verdictFor(none, true, [{ url: 'turn:global.relay.metered.ca:443', code: 486, text: 'Allocation Quota Reached' }]);
  assert.ok(!quota.ok && quota.text.includes('kota'));
  const unreachable = verdictFor(none, true, [{ url: 'turn:global.relay.metered.ca:80', code: 701, text: 'TURN host lookup received error.' }]);
  assert.ok(!unreachable.ok && unreachable.text.includes('TURN aktarma sunucusuna ulaşılamadı'), 'a 701 is still a network problem');
  assert.ok(verdictFor({ host: 1, srflx: 1, relay: 1 }, true, [{ code: 401 }]).ok, 'a working relay wins over a stray error from another port');
});
