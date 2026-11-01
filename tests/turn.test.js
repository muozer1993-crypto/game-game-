import { test, assert } from './runner.js';
import { turnRestCredentials, getIceServers } from '../js/net/peer.js';

test('TURN REST kimliği: süreli kullanıcı adı ve HMAC-SHA1 şifre (bilinen değer)', async () => {
  const c = await turnRestCredentials('openrelayprojectsecret', 'oyungecesi', 86400, 1700000000000);
  assert.equal(c.username, '1700086400:oyungecesi');
  assert.equal(c.credential, 'Ao8Bg/Mr6aBvmp0e122IAWi0DCA=', 'matches Python hmac/sha1/base64 for the same input');
  const servers = await getIceServers();
  assert.ok(servers.some((s) => String(s.urls).startsWith('stun:')), 'STUN servers present');
  const relay = servers.find((s) => Array.isArray(s.urls) && s.urls[0].includes('staticauth.openrelay.metered.ca'));
  assert.ok(relay && relay.username.includes(':oyungecesi') && relay.credential.length > 20, 'shared-secret relay with fresh credentials');
  assert.ok(!servers.some((s) => String(s.urls).includes('turn.peerjs.com') || /turn:openrelay\.metered\.ca/.test(String(s.urls))), 'no dead relays');
});
