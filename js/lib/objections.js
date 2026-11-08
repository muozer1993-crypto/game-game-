// Objections ("itiraz") to words the word list does not have. In the word games such a word can be
// played anyway; it is marked wherever it shows, and when the game is over the other player may
// object to it. These helpers keep the bookkeeping the same everywhere; what an objection costs is
// up to each game (the move's points, the word's points, the game).

/** `list` (ids) with `id` added (on) or removed (off): sorted and without repeats, so both phones agree. */
export function toggled(list, id, on) {
  const set = new Set(Array.isArray(list) ? list : []);
  if (on) set.add(id); else set.delete(id);
  return [...set].sort();
}

/**
 * The objections a finishing 'next' carries: what the presser saw, so that an objection crossing the
 * 'next' on the wire cannot leave the two phones with different results. Unknown ids are dropped; a
 * missing or malformed list means the state's own (`fallback`).
 */
export function carried(list, allowed, fallback) {
  if (!Array.isArray(list)) return fallback;
  const ok = new Set(allowed);
  return [...new Set(list.filter((x) => ok.has(x)))].sort();
}

/**
 * Check an 'object' move against the item it names ({ owner }): online only the owner's opponent may
 * object; on one phone both sit at the screen and the button acts for the owner's opponent.
 */
export function checkObjection(item, player, ctx = {}) {
  if (!item) throw new Error('Bu kelimeye itiraz edilemez');
  if (ctx.mode === 'online' && player !== 1 - item.owner) throw new Error('Kendi kelimene itiraz edemezsin');
}
