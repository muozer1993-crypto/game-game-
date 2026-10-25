# Oyun Gecesi — Plan ve Klasör Yapısı

İki kişilik, Türkçe arayüzlü, telefonda oynanan oyun koleksiyonu.
Statik site: düz HTML + CSS + JavaScript (ES modules). Framework yok, build yok,
npm bağımlılığı yok. (Online mod için PeerJS tek dosya olarak `vendor/` altına kopyalandı.)

## Klasör yapısı

```
index.html              Uygulama kabuğu (tek sayfa)
manifest.webmanifest    Ana ekrana ekleme
sw.js                   Basit service worker (önbellek)
css/app.css             Tema (koyu/açık), bileşen stilleri
js/app.js               Ekran akışı: menü → kurulum → oyun → sonuç
js/session.js           Oyun oturumu: state tutar, hamleleri uygular, render çağırır
                        (tek telefon ve online aynı sınıfı kullanır)
js/lib/tr.js            Türkçe büyük/küçük harf, harf seti, ad eki (Ayşe'de)
js/lib/syllabify.js     Kural tabanlı Türkçe heceleme
js/lib/words.js         Kelime listesi yükleyici (büyük liste + yaygın kelimeler)
js/lib/rng.js           Tohumlu rastgele sayı (iki cihazda aynı sonuç için)
js/lib/storage.js       localStorage ayarları (tema, oyuncu adları, özel sorular)
js/ui/dom.js            Küçük DOM yardımcıları (el, clear)
js/ui/keyboard.js       Türkçe ekran klavyesi (Q düzeni)
js/ui/timer.js          Sayaç
js/ui/handoff.js        "Telefonu ver" ara ekranı
js/ui/scoreboard.js     Skor tablosu
js/net/transport.js     Bağlantı arayüzü (send / onMessage)
js/net/peer.js          PeerJS adaptörü (oda kodu = peer id)
js/version.js           Uygulama sürümü (sw.js VERSION ile birlikte artırılır; iki telefon karşılaştırır)
games/index.js          Oyun kaydı (yeni oyun = yeni dosya + bir import satırı)
games/*.js              33 oyun, her biri tek dosya (aşağıdaki liste)
data/words-tr.txt       Büyük kelime listesi (doğrulama)
data/common-tr.json     4/5/6 harfli yaygın kelimeler (gizli kelime seçimi)
data/questions.json     Beni Ne Kadar Tanıyorsun soru havuzu
data/trivia.json        Genel kültür soruları
data/tabu.json          Tabu kartları
data/LICENSES.md        Veri lisansları ve kaynakları
tests/index.html        Tarayıcıda açılan test sayfası (kütüphane yok)
tests/*.test.js         Saf mantık testleri (node ile de çalışır)
README.md               Yerelde çalıştırma ve GitHub Pages adımları
```

## Oyun arayüzü (her games/<oyun>.js)

```js
export default {
  id: 'son-hece',
  meta: { name, description, rules, settings: [...], handoff: 'auto' },
  setup(options, ctx)                 // -> state (düz JSON)
  applyMove(state, player, move)      // -> yeni state; saf, DOM yok; geçersiz hamlede Error fırlatır
  render(state, viewer, container, sendMove, ctx)
  getResult(state)                    // -> null | { winner } | { draw: true }
  getTurn(state)                      // -> { player, private, simultaneous? } — kimin cihazı aktif; ara ekran için
                                      //   (simultaneous: iki oyuncu aynı anda oynar; online'da sıra vurgusu yok)
  autoMove(state, player)             // (isteğe bağlı) cihazın kendiliğinden göndereceği hamle
                                      //   (ör. gizli kelime sahibinin tahmini puanlaması)
}
```

- State düz JSON. Oyun mantığı bağlantı katmanını bilmez.
- Hamle (`move`) içinde `secret` alanı varsa ağ katmanı bunu karşı cihaza göndermeden siler.
  Böylece Gizli Kelime'de kelime sahibinin cihazı tahmini kendisi puanlar, karşıya yalnızca sonucu yazar.
- Tek telefon: `Session` iki oyuncuyu da yönetir. `getTurn` değişince ve faz "private" ise
  "Sıra Ayşe'de — telefonu ona ver → Hazırım" ekranı çıkar.
- Online: aynı `Session`; `self` = bu cihazın oyuncusu. Hamleler sıra numarasıyla karşıya gider,
  iki cihaz aynı hamleleri aynı sırayla uygular. Ev sahibi başlangıç state'ini gönderir.

## Sıra

1. İskelet + ana menü + ortak bileşenler (klavye, sayaç, ara ekran, skor) + test sayfası
2. Son Hece (heceleme, sözlük, itiraz/kabul, ğ kuralı, süre)
3. Gizli Kelime (Wordle renkleri / +− modu, 4–6 harf, sayı varyantı)
4. Beni Ne Kadar Tanıyorsun (hazır havuz + özel sorular, Tuttu/Yakın/Tutmadı)
5. Online mod (oda kodu, PeerJS; Firebase alternatifi README'de artı/eksi ile)

## Uygulama akışı (durum)

- Ana menü: oyun listesi (bölümlü), "Son oynanan" ve "Rastgele oyun" kısayolları,
  Oyun gecesi turnuvası (seçilen oyunlardan rastgele 3/5/7 oyun art arda, puan tablosu),
  İki telefonda oyna (oda kodu, davet bağlantısı `?oda=KOD`), Skor tablosu (oyuncu çiftine göre
  birikmiş sonuçlar).
- Online: PeerJS üzerinden doğrudan bağlantı; sıra numaralı hamleler, kopunca yeniden bağlanma ve
  kaldığı yerden sürme, sürüm farkı uyarısı, sıra gelince titreşim.
- Kurulum ekranındaki ayarlar oyun başına saklanır; turnuva bu ayarlarla başlar.
- Testler: `node tests/node.mjs` (saf mantık, 140+ test) ve `tests/index.html` (aynı testler
  tarayıcıda). Tarayıcı akış testleri geliştirme sırasında Playwright ile koşuldu (depoda değil).

## Oyunlar (33)
Faz 1: Son Hece, Gizli Kelime, Gizli Sayı, Beni Ne Kadar Tanıyorsun? (`data/questions.json`).
Faz 2: Genel Kültür Düellosu (`data/trivia.json`), Amiral Battı, Tavla, Dama, Mangala, Bilardo,
Dört Bağlantı, Noktalar ve Kutular, Hafıza, XOX, Taş Kağıt Makas, Adam Asmaca, Harf Avı,
Kelime Türetme, Kelime Tahtası, Tabu (`data/tabu.json`), Reversi, Beş Taş, Hex, Dokuz Taş,
Refleks, Satranç, Pişti, Durak, Hesap Yarışı, Renk Tuzağı, Hafıza Dizisi, Mayın Tarlası,
Sudoku Düellosu — her biri `games/` altında tek dosya; `games/index.js` kaydı ve `sw.js`
önbellek listesi. Ana menü `meta.group` ile bölümlere ayrılır (kelime / soru-cevap / masa).
