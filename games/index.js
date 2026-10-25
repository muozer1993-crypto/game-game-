// Game registry. To add a game: create games/<name>.js implementing the game
// interface (see PLAN.md) and add one import + one entry here.
import sonHece from './son-hece.js';
import gizliKelime from './gizli-kelime.js';
import gizliSayi from './gizli-sayi.js';
import adamAsmaca from './adam-asmaca.js';
import harfAvi from './harf-avi.js';
import kelimeTuretme from './kelime-turetme.js';
import kelimeTahtasi from './kelime-tahtasi.js';
import isimSehir from './isim-sehir.js';
import tabu from './tabu.js';
import beniTani from './beni-tani.js';
import dortBaglanti from './dort-baglanti.js';
import reversi from './reversi.js';
import besTas from './bes-tas.js';
import hex from './hex.js';
import dokuzTas from './dokuz-tas.js';
import xox from './xox.js';
import noktalarKutular from './noktalar-kutular.js';
import amiralBatti from './amiral-batti.js';
import tavla from './tavla.js';
import satranc from './satranc.js';
import genelKultur from './genel-kultur.js';
import hesapYarisi from './hesap-yarisi.js';
import renkTuzagi from './renk-tuzagi.js';
import hafizaDizisi from './hafiza-dizisi.js';
import bilardo from './bilardo.js';
import hafiza from './hafiza.js';
import tasKagitMakas from './tas-kagit-makas.js';
import refleks from './refleks.js';
import mayinTarlasi from './mayin-tarlasi.js';
import sudoku from './sudoku.js';
import mangala from './mangala.js';
import dama from './dama.js';
import pisti from './pisti.js';
import durak from './durak.js';
import yalanciZar from './yalanci-zar.js';
import zarPokeri from './zar-pokeri.js';
import sekizler from './sekizler.js';
import poker from './poker.js';
import kizmaBirader from './kizma-birader.js';

export const games = [sonHece, gizliKelime, gizliSayi, adamAsmaca, harfAvi, kelimeTuretme, kelimeTahtasi, isimSehir, tabu, beniTani, genelKultur, hesapYarisi, renkTuzagi, hafizaDizisi, amiralBatti, satranc, tavla, kizmaBirader, dama, mangala, dokuzTas, pisti, durak, sekizler, poker, yalanciZar, zarPokeri, bilardo, dortBaglanti, besTas, hex, reversi, noktalarKutular, hafiza, mayinTarlasi, sudoku, xox, tasKagitMakas, refleks];

/** Menu sections, in display order. A game's meta.group picks its section. */
export const groups = [
  { id: 'kelime', title: 'Kelime oyunları' },
  { id: 'tanisma', title: 'Soru-cevap' },
  { id: 'masa', title: 'Masa oyunları' },
];

export function findGame(id) {
  return games.find((g) => g.id === id) || null;
}
