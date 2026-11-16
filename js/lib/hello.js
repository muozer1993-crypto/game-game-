// The greeting two phones exchange when they connect carries what each has shown in earlier games
// (js/app.js histories). PeerJS's JSON channel refuses a message of 16,300 bytes or more and the
// connection dies with it, so past a budget the lists go out without their oldest sightings: the
// newest ones are what keeps the next games fresh.

export const HELLO_MAX_BYTES = 15000;

const jsonBytes = (o) => new TextEncoder().encode(JSON.stringify(o)).byteLength;

/**
 * `base`: the greeting's other fields. `lists`: { tabu, ...others }, each [key, time] oldest first.
 * Tabu's list keeps its own field (older phones read only that one); the others go in `seen`.
 */
export function boundedHello(base, lists, max = HELLO_MAX_BYTES) {
  const msg = (l) => ({ ...base, tabuSeen: l.tabu || [], seen: Object.fromEntries(Object.keys(l).filter((k) => k !== 'tabu').map((k) => [k, l[k]])) });
  let cur = lists;
  for (let size = jsonBytes(msg(cur)); size > max; size = jsonBytes(msg(cur))) {
    const keep = max / size; // < 1: every non-empty list loses at least its oldest entry
    cur = Object.fromEntries(Object.entries(cur).map(([k, l]) => [k, l.slice(l.length - Math.floor(l.length * keep))]));
  }
  return msg(cur);
}
