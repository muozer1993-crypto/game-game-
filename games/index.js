// Game registry. To add a game: create games/<name>.js implementing the game
// interface (see PLAN.md) and add one import + one entry here.
import sonHece from './son-hece.js';
import gizliKelime from './gizli-kelime.js';
import gizliSayi from './gizli-sayi.js';
import adamAsmaca from './adam-asmaca.js';
import harfAvi from './harf-avi.js';
import tabu from './tabu.js';
import beniTani from './beni-tani.js';
import dortBaglanti from './dort-baglanti.js';
import reversi from './reversi.js';
import dokuzTas from './dokuz-tas.js';
import xox from './xox.js';
import noktalarKutular from './noktalar-kutular.js';
import amiralBatti from './amiral-batti.js';
import tavla from './tavla.js';
import satranc from './satranc.js';
import genelKultur from './genel-kultur.js';
import hesapYarisi from './hesap-yarisi.js';
import bilardo from './bilardo.js';
import hafiza from './hafiza.js';
import tasKagitMakas from './tas-kagit-makas.js';
import refleks from './refleks.js';
import mangala from './mangala.js';
import dama from './dama.js';
import pisti from './pisti.js';

export const games = [sonHece, gizliKelime, gizliSayi, adamAsmaca, harfAvi, tabu, beniTani, genelKultur, hesapYarisi, amiralBatti, satranc, tavla, dama, mangala, dokuzTas, pisti, bilardo, dortBaglanti, reversi, noktalarKutular, hafiza, xox, tasKagitMakas, refleks];

/** Menu sections, in display order. A game's meta.group picks its section. */
export const groups = [
  { id: 'kelime', title: 'Kelime oyunları' },
  { id: 'tanisma', title: 'Soru-cevap' },
  { id: 'masa', title: 'Masa oyunları' },
];

export function findGame(id) {
  return games.find((g) => g.id === id) || null;
}
