import { test, assert } from './runner.js';
import { clockPause, pausedBetween, activeSince } from '../js/ui/timer.js';

test('sayaç: bağlantı koptu ekranındaki süre sayılmaz (yalnızca sayacın başlangıcından sonrası)', () => {
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const start = now;
    now += 5000;
    clockPause.begin();
    assert.ok(clockPause.active());
    now += 12000;
    assert.equal(pausedBetween(start), 12000, 'counts while it lasts');
    clockPause.begin(); // a second drop while the overlay is up changes nothing
    now += 3000;
    clockPause.end();
    assert.ok(!clockPause.active());
    now += 4000;
    assert.equal(pausedBetween(start), 15000);
    assert.equal(activeSince(start), 9000, '5 s before + 4 s after the overlay');
    assert.equal(pausedBetween(start + 10000), 10000, 'only the part after a later start');
    assert.equal(pausedBetween(now), 0, 'a countdown that starts afterwards is not moved');
    assert.equal(pausedBetween(NaN), 0);
  } finally {
    Date.now = realNow;
  }
});
