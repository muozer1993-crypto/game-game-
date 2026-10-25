// Game registry. To add a game: create games/<name>.js implementing the game
// interface (see PLAN.md) and add one import + one entry here.
import sonHece from './son-hece.js';
import gizliKelime from './gizli-kelime.js';
import gizliSayi from './gizli-sayi.js';
import beniTani from './beni-tani.js';
import dortBaglanti from './dort-baglanti.js';
import xox from './xox.js';
import noktalarKutular from './noktalar-kutular.js';
import amiralBatti from './amiral-batti.js';

export const games = [sonHece, gizliKelime, gizliSayi, beniTani, amiralBatti, dortBaglanti, noktalarKutular, xox];

export function findGame(id) {
  return games.find((g) => g.id === id) || null;
}
