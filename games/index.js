// Game registry. To add a game: create games/<name>.js implementing the game
// interface (see PLAN.md) and add one import + one entry here.
import sonHece from './son-hece.js';
import gizliKelime from './gizli-kelime.js';
import gizliSayi from './gizli-sayi.js';
import beniTani from './beni-tani.js';

export const games = [sonHece, gizliKelime, gizliSayi, beniTani];

export function findGame(id) {
  return games.find((g) => g.id === id) || null;
}
