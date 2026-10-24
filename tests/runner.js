// Minimal test runner: works in the browser (tests/index.html) and in Node (tests/node.mjs).
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

function fail(msg) {
  throw new Error(msg);
}

function show(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

export const assert = {
  ok(value, msg = 'beklenen: doğru') {
    if (!value) fail(`${msg} — alınan: ${show(value)}`);
  },
  equal(actual, expected, msg = '') {
    if (actual !== expected) fail(`${msg} beklenen: ${show(expected)}, alınan: ${show(actual)}`.trim());
  },
  notEqual(actual, expected, msg = '') {
    if (actual === expected) fail(`${msg} beklenmeyen değer: ${show(actual)}`.trim());
  },
  deepEqual(actual, expected, msg = '') {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) fail(`${msg} beklenen: ${b}, alınan: ${a}`.trim());
  },
  throws(fn, pattern, msg = '') {
    let threw = null;
    try { fn(); } catch (err) { threw = err; }
    if (!threw) fail(`${msg} hata bekleniyordu ama atılmadı`.trim());
    if (pattern && !(pattern instanceof RegExp ? pattern.test(threw.message) : threw.message.includes(pattern))) {
      fail(`${msg} hata mesajı uymuyor: "${threw.message}" (beklenen ${pattern})`.trim());
    }
  },
};

/** Run every registered test. Returns { passed, failed, results: [{name, ok, error}] }. */
export async function runAll(onResult) {
  const results = [];
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    let ok = true;
    let error = null;
    try {
      await t.fn();
    } catch (err) {
      ok = false;
      error = err && err.stack ? err.stack : String(err);
    }
    if (ok) passed++; else failed++;
    const r = { name: t.name, ok, error };
    results.push(r);
    if (onResult) onResult(r);
  }
  return { passed, failed, results };
}
