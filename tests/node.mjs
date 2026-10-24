// Run the same tests in Node:  node tests/node.mjs
import { runAll } from './runner.js';
import './all.js';

const { passed, failed, results } = await runAll((r) => {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
  if (!r.ok) console.log(`    ${r.error.split('\n').slice(0, 3).join('\n    ')}`);
});
console.log(`\n${passed} geçti, ${failed} kaldı`);
process.exit(failed ? 1 : 0);
