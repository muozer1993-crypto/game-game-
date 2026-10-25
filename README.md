# Oyun Gecesi

İki kişilik, Türkçe arayüzlü, telefonda rahat oynanan oyun koleksiyonu: 46 oyun; kartlardaki ★ ile favoriler üstte toplanır (kelime, soru-cevap, zekâ ve refleks, tahta, kart/zar/taş).
Düz HTML + CSS + JavaScript (ES modules); framework yok, build adımı yok, npm yok.
Tek telefonda elden ele ya da iki telefonda oda koduyla oynanır. Ana ekrana eklenebilir
(manifest + service worker) ve bir kez yüklendikten sonra tek telefon modu çevrimdışı çalışır.

## Oyunlar

| Oyun | Kısaca |
|---|---|
| **Son Hece** | Her kelime bir öncekinin son hecesiyle başlar (kitap → tapınak → nakış). Süre, itiraz/kabul, ğ kuralı. |
| **Gizli Kelime** | Karşılıklı Wordle. 4–6 harf, renkli ya da "+2 −1" modu. İkisi aynı turda bulursa berabere. |
| **Gizli Sayı** | Rakamları farklı 4 haneli sayı, "+ −" ipuçlarıyla. |
| **Adam Asmaca** | Biri kelimeyi tutar (ya da rastgele gelir), öbürü harf harf bulur; roller her kelimede değişir, kalan can kadar puan. |
| **Harf Avı** | Aynı 4×4/5×5 harf tablosunda süreye karşı komşu harflerden kelime çıkar; ortak kelimeler puan getirmez. |
| **Kelime Türetme** | Aynı 7–9 harften süreye karşı kelime türet; uzun kelime çok puan, ortak kelimeler puan getirmez. |
| **İsim Şehir** | Klasik kâğıt oyunu: aynı harfle isim, şehir, hayvan, bitki, eşya (+ ülke, meslek, yemek). Farklı cevap 10, aynı 5; rakibin uydurmasına "Geçersiz". |
| **Kelime Tahtası** | Scrabble benzeri: 11×11 tahta, katlı kareler, yedişer harf, sözlük denetimi, pas/değiştirme. |
| **Tabu** | Yasaklı beş kelimeyi söylemeden anlat, eşin tahmin etsin; 220+ kart, roller her turda değişir. |
| **Beni Ne Kadar Tanıyorsun?** | Aynı sorular ikinize; önce kendi cevabın, sonra rakibin tahmini; karşılaştırma otomatik. Hazır havuz + kendi sorularınız. |
| **Genel Kültür Düellosu** | Aynı sorular ikinize; doğru sayısı, eşitlikte hız. 240+ soruluk havuz. |
| **Doğruluk mu Cesaret mi?** | Parti klasiği: sırayla doğruluk (1) ya da cesaret (2) seç, rakibin hakem; 60+50 dostça kart (`data/dogruluk.json`), bir kez kart değiştirme. |
| **Hesap Yarışı** | Aynı aritmetik işlemler ikinize (kolay/orta/zor); doğru sayısı, eşitlikte hız. |
| **Hedef Sayı** | Altı sayı, dört işlem, üç basamaklı hedef; aynı bulmacada süreye karşı en yakına ulaş (tam 10, ≤5 uzak 7, ≤10 uzak 5). Tur sonunda çözüm gösterilir. |
| **Renk Tuzağı** | Kelimeye değil yazının rengine dokun (Stroop); süre dolana kadar doğru −yanlış puanı. |
| **Hafıza Dizisi** | Yanan renk dizisini aynı sırayla dokun; her turda bir uzar, uzun hatırlayan kazanır. |
| **Amiral Battı** | Gemilerini gizle, rakibin denizine ateş et; atışlar gemi sahibinin cihazında değerlendirilir. |
| **Satranç** | Klasik satranç: rok, geçerken alma, terfi seçimi, şah mat, pat, yetersiz materyal, elli hamle, üç tekrar. |
| **Go (9×9)** | 9×9 ya da 13×13: esir alma, intihar yasağı, ko; iki pas sonra ölü taş işaretleme ve karşılıklı onayla alan sayımı, beyaza 6,5 komi. |
| **Tavla** | Klasik tavla; kırma, bardan giriş, toplama, mars (2 puan), geri al. |
| **Kızma Birader** | Klasik zar yarışı: altıyla çık, rakibi ez, yıldızlı kareler güvenli, tam sayıyla eve gir; 2 ya da 4 taş. |
| **Bilanço** | Çerezlik Monopoly: 20 karelik şehir tahtası, satın al, kira topla, çifti tamamlayıp ev kur, şans kartları ve kodes; seçilen tur sayısı (6/10/15) dolunca ya da iflasta biter. |
| **Dama** | Türk daması: ileri/yana, atlayarak alma zorunlu, en çok alan dizi, dama. |
| **Mangala** | Türk mangalası (TAZOF/MEB kuralları): ilk taşı aldığın kuyuya bırak, dağıt, çift yakala, boş kuyudan karşıyı al; kuyuları ilk boşalan rakibin kalan taşlarını alır. Ayarlardan ev kuralları: sonraki kuyudan başla, kalan taşlar sahibine. Her hamle taş taş canlandırılır (hız ayarlı, dokununca geçer). Oyun türü olarak **Bantumi** (eski Nokia telefonlarındaki Kalah benzeri sürüm) de seçilebilir. |
| **Domino** | Yedişer taş, uçlardan birine uyanı ekle, yön seç; oynayamazsan kapalıdan çek, bitince pas. Elini bitiren rakibin noktalarını alır, kilitlenince hafif olan farkı. |
| **Dokuz Taş** | Dokuzar taş koy, sür; üçlü yapan rakibin taşını alır. Üç taşta uçma ayarı. |
| **Okey (ikili)** | 106 taş, gösterge ve okey, sahte okey; ortadan çek ya da rakibin attığını al, 14 taşı per/seri ya da yedi çifte diz, 15.yi at. Çifte ve okey atarak bitiş ×2. |
| **Pişti** | Klasik pişti: aynı değer ya da vale alır, pişti 10/20, 151'e kadar. |
| **Durak** | 36 kart, koz; saldır, kır ya da al; deste bitince elinde kart kalan durak olur. |
| **Altmışaltı (66)** | Klasik iki kişilik el oyunu: 24 kart, açık koz, evlilik 20/40, koz 9 değişimi, deste kapatma; 66 puana ulaşan eli alır, 7 oyun puanı. |
| **Sekizler** | Aynı renk ya da aynı sayıyı at, sekiz jokerdir ve renk seçtirir; çek/pas; elini bitiren rakibin kalan kartlarının puanını alır. |
| **Poker** | Texas Hold'em bire bir: körler, bekle/gör/yükselt/pas, rest ve iade, yedi karttan en iyi beşli; fişi biten kaybeder. |
| **Yalancı Zar** | Gizli zarlar, blöf: "masada en az 3 tane 5 var" de ya da "Yalan!" diye yakala; birler joker. Zarı biten kaybeder. |
| **Zar Pokeri** | Beş zar, üç atış, 15 hane (birler–altılar + 63 bonusu, çift, iki çift, üçlü, dörtlü, kentler, full, şans, beşli). |
| **Bilardo** | Istakayı geri çeker gibi nişan al (top parmağın tersi yönüne gider, kesik çizgi ilk değeceği topu gösterir). İki tür: çok top sokan kazanır ya da klasik 8 top (düz/çizgili, faulde top elde, 8 en son). Fizik deterministik, iki cihaz aynı vuruşu aynı görür. |
| **Dört Bağlantı** | 6×7 tahtada taş bırak, dördü yan yana getir. |
| **Beş Taş** | 11–15'lik tahtada sırayla taş koy; beşi yan yana getiren kazanır (gomoku). |
| **Hex** | Altıgen tahtada kendi iki kenarını bağlayan kazanır; berabere olmaz. |
| **Reversi** | Rakibin taşlarını arada bırak, rengine çevir; oynayamayan geçer, çok taşı olan kazanır. |
| **Noktalar ve Kutular** | Çizgi çek, kutuyu kapat, bir daha oyna. 3×3 – 6×6. |
| **Hafıza** | Kart eşleştirme; eşleşen devam eder. 12–36 kart. |
| **Mayın Tarlası** | Aynı tarla ikinize; temizleyen ya da daha çok güvenli kare açan kazanır. Bayrak modu, süre. |
| **Sudoku Düellosu** | Aynı bulmaca ikinize (kolay/orta/zor); önce doğru çözen, yoksa çok doğru dolduran kazanır. |
| **XOX** | Klasik üç taş. |
| **Taş Kağıt Makas** | Gizli seçim, birlikte açılır; beşte üç. |
| **Refleks** | Ekran yeşile dönünce ilk dokunan eli alır, erken dokunan kaybeder; tek telefonda iki bölge, iki telefonda kendi süren ölçülür. |

**Oyun gecesi turnuvası**: ana menüden (ya da online lobiden) seçilen oyunlardan rastgele 3/5/7 oyun art arda oynanır; her oyunun kazananı 1 puan alır, sonda turnuva sonucu gösterilir.

Ana menünün altındaki **Skor tablosu**, oyuncu adlarına göre biriken tüm sonuçları (oyun oyun) gösterir ve çift bazında sıfırlanabilir.

## Yerelde çalıştırma

ES modülleri `file://` ile açılmaz; küçük bir statik sunucu gerekir.

```sh
git clone https://github.com/muozer1993-crypto/game-game-.git
cd game-game-
python3 -m http.server 8000
```

Sonra tarayıcıda `http://localhost:8000` adresini aç. Telefonda denemek için bilgisayar ve telefon
aynı Wi-Fi'de olsun, telefondan `http://<bilgisayarın-ip-adresi>:8000` adresine gir
(IP adresi için `ip addr` / `ipconfig`). Python yoksa `npx serve .` ya da VS Code "Live Server" da olur.

Testler: `http://localhost:8000/tests/` sayfasını aç (ya da terminalden `node tests/node.mjs`).

> Service worker dosyaları önbelleğe alır. Geliştirirken değişikliği görmek için tarayıcının
> "Application → Service Workers → Update on reload" seçeneğini açın ya da sert yenileyin.
> Yayınlarken `sw.js` içindeki `VERSION` değerini artırın; yeni sürüm kurulunca ana menüdeki
> sayfalar kendiliğinden yenilenir, oyun ortasındakiler menüye dönünce yenilenir.

Ana ekrana eklenen uygulamada simgeye uzun basınca **İki telefonda oyna** ve **Rastgele oyun** kısayolları çıkar
(`manifest.webmanifest` → `shortcuts`; `?ekran=online` / `?ekran=rastgele`).

## GitHub Pages'e yayınlama

Depoda hazır bir iş akışı var: `.github/workflows/pages.yml`. Her `git push` sonrasında
siteyi GitHub Pages'e yayınlar; ilk çalışmada Pages'i de kendisi açmayı dener.

1. Depoyu GitHub'a gönderin (`git push`). **Actions** sekmesinde "GitHub Pages" iş akışı çalışır.
2. Yeşil olunca site `https://<kullanıcı>.github.io/<depo-adı>/` adresinde yayındadır
   (bu depo için `https://muozer1993-crypto.github.io/game-game-/`).
3. İş akışı Pages'i açamazsa (izin hatası) bir kez elle açın: **Settings → Pages →
   Build and deployment → Source: GitHub Actions**. Sonra iş akışını yeniden çalıştırın.
4. İş akışı istemiyorsanız klasik yol da olur: **Settings → Pages → Source: Deploy from a branch**,
   dal `main`, klasör `/ (root)`.
5. Telefonda adresi açın, tarayıcı menüsünden **Ana ekrana ekle** deyin.

Bütün yollar göreli (`./`) olduğu için alt klasörde (`/game-game-/`) yayınlanması sorun çıkarmaz.
Online mod için HTTPS gerekir; GitHub Pages bunu zaten sağlar.

## Online mod (iki telefon)

Ana menüden **İki telefonda oyna** → biri **Oda kur** der, 5 karakterlik kodu söyler; diğeri
**Odaya katıl** ile kodu yazar. Ev sahibi **Davet bağlantısını gönder** ile `…?oda=KOD` biçiminde
bir bağlantı da paylaşabilir (WhatsApp vb.); bağlantıyı açan doğrudan kod dolu katılma ekranına gelir.
Ev sahibi oyunu ve ayarları seçer, iki telefon da aynı hamleleri aynı sırayla uygular. Sıra size
geçince telefon kısaca titrer (online ekranından kapatılabilir).

Bağlantı katmanı **PeerJS** (WebRTC, `vendor/peerjs.min.js`, MIT). Seçilme nedeni: sıfır kurulum.
Hesap, API anahtarı, sunucu, yapılandırma dosyası gerekmez; eşleştirme için PeerJS'in ücretsiz
genel sunucusu (`0.peerjs.com`) kullanılır, oyun verisi doğrudan iki telefon arasında akar.
İki telefon da farklı mobil operatör ağındaysa (CGNAT) doğrudan bağlantı kurulamayabilir; bu
durumda veri Open Relay Project'in ücretsiz genel TURN sunucuları üzerinden aktarılır
(`js/net/peer.js` içindeki `iceServers`; sunucu ulaşılamazsa yalnızca doğrudan bağlantı denenir).

Oyun ekranındaki küçük emoji çubuğu (👍 😂 😮 😅 🔥 🤝) rakibin telefonunda büyükçe belirir; sonuç
ekranındaki **Sonucu paylaş** skoru paylaşım menüsüne (ya da panoya) verir.

**Bağlantı koparsa:** iki telefonda da "Bağlantı koptu — Yeniden bağlan" penceresi çıkar. Aynı oda
koduyla yeniden eşleşilir ve kopukluk sırasında yapılan hamleler karşıya aktarılır; oyun kaldığı
yerden sürer. (Sayfa yenilenirse oyun durumu kaybolur; o zaman lobiden yeni oyun kurulur.)

**Gizli bilgi:** Gizli Kelime'de gizli kelime karşı telefona hiç gönderilmez. Tahmin, kelimenin
sahibinin telefonuna gider; orada puanlanır ve yalnızca sonuç (renkler ya da +/−) geri yazılır.
Beni Ne Kadar Tanıyorsun'da cevaplar da aynı şekilde tahmin aşaması bitene kadar sahibinin
telefonunda kalır.

### PeerJS mi, Firebase mi?

| | PeerJS (seçilen) | Firebase Realtime Database |
|---|---|---|
| Kurulum | Yok. Dosyayı aç, çalışır. | Firebase projesi aç, Realtime Database etkinleştir, güvenlik kuralı yaz, config'i depoya koy. |
| Maliyet | Ücretsiz, kota yok ama SLA/garanti de yok. | Spark planı ücretsiz (1 GB depolama, 10 GB/ay aktarım, 100 eşzamanlı bağlantı). |
| Güvenilirlik | Genel eşleştirme sunucusu tek nokta; nadiren yavaş/kapalı olabilir. İki telefon farklı mobil operatör ağlarındaysa (CGNAT) doğrudan bağlantı kurulamayabilir; o zaman Open Relay Project'in ücretsiz TURN sunucusu araya girer (üçüncü taraf, garanti yok). Aynı Wi-Fi ya da Wi-Fi + mobil genelde doğrudan bağlanır. | Her ağda çalışır (sunucu üzerinden). |
| Gizlilik | Veri sunucuda saklanmaz, doğrudan telefonlar arasında. | Hamleler Google sunucusunda durur (kurallarla kısıtlanabilir). |
| Yeniden bağlanma | Sayfa yenilenince oda düşer; yeniden kurmak gerekir. | Oda veritabanında durduğu için yenilemeye dayanıklı. |

Firebase'e geçmek isterseniz `js/net/transport.js` içindeki arayüzü uygulayan bir
`js/net/firebase.js` yazmak yeterlidir; oyun kodu bağlantı katmanını bilmez. Bu durumda Firebase
JS SDK'sını (`https://www.gstatic.com/firebasejs/<sürüm>/firebase-app.js` ve `firebase-database.js`)
ES modülü olarak içe aktarır, oda düğümünü `rooms/<kod>` altında tutar, hamleleri `moves/<seq>`
olarak yazar ve `onChildAdded` ile dinlersiniz. Gizli kelime yine cihazda kalır; yalnızca puanlanmış
sonuçlar veritabanına yazılır.

## Yeni oyun ekleme

`games/<oyun>.js` dosyası oluşturup `games/index.js`'e bir satır ekleyin. Arayüz:

```js
export default {
  id: 'dort-baglanti',
  meta: {
    name: 'Dört Bağlantı', icon: '🔴', description: '…', rules: '…',
    data: [],            // 'dictionary' | 'common' | 'questions' — başlamadan önce yüklenir, ctx ile gelir
    settings: [{ key: 'size', label: 'Tahta', type: 'select', default: 7, options: [...] }],
  },
  setup(options, ctx) { return { /* düz JSON */ }; },
  applyMove(state, player, move, ctx) { /* saf; geçersizse Error fırlat */ return newState; },
  render(state, viewer, container, sendMove, ctx) { /* yalnızca viewer'ın görmesi gerekeni çiz */ },
  getResult(state) { return null; /* | { winner: 0|1 } | { draw: true } */ },
  getTurn(state) { return { player: 0, private: false }; }, // ara ekran ve sıra göstergesi için
  autoMove(state, player, ctx) { return null; },            // isteğe bağlı: cihazın kendiliğinden yapacağı hamle
};
```

- `state` düz JSON olmalı; `applyMove` DOM'a dokunmaz ve girdiyi değiştirmez.
- `move.secret` alanı karşı cihaza gönderilmez (gizli kelime, cevaplar). Kelime sahibinin cihazı
  tahmini `autoMove` ile puanlar ve yalnızca sonucu gönderir.
- `getTurn` `private: true` döndürdüğünde oyuncu değişiminde "telefonu ver" ekranı çıkar.
- Türkçe büyük/küçük harf için her zaman `js/lib/tr.js` içindeki `upperTR`/`lowerTR` kullanın.
- Saf fonksiyonlar için `tests/<oyun>.test.js` yazın ve `tests/all.js`'e ekleyin.
- Yeni dosyayı `sw.js` içindeki önbellek listesine de ekleyin.

Sonraki adaylar: genel kültür düellosu, amiral battı, dört bağlantı, noktalar-kutular, tavla.

## Klasör yapısı

Bkz. [PLAN.md](PLAN.md).

## Veri ve lisanslar

- Kod: MIT ([LICENSE](LICENSE)).
- Kelime listeleri: zemberek-nlp (Apache-2.0) + FrequencyWords/OpenSubtitles (CC BY-SA 4.0);
  ayrıntı ve üretim adımları [data/LICENSES.md](data/LICENSES.md) içinde.
  Yeniden üretmek için `python3 tools/build-words.py` (kaynakları kendisi indirir).
- Sorular: bu proje için yazıldı (MIT). `data/questions.json` dosyasını düzenleyerek soru ekleyebilirsiniz.
- Satranç taşı görselleri: Colin M.L. Burnett (Cburnett), Wikimedia Commons, 3 maddeli BSD (`img/chess/LICENSE.txt`).
- PeerJS 1.5.5: MIT (`vendor/peerjs.LICENSE`).

## Heceleme kuralları

`js/lib/syllabify.js`: her hecede tek ünlü; iki ünlü arasındaki tek ünsüz sonraki heceye (ki-tap);
iki ya da daha çok ünsüzde sonuncusu sonraki heceye (an-ne, kar-deş, Türk-çe, Türk-ler, renk-li);
yan yana ünlüler ayrılır (sa-at); baştaki ünsüz kümesi ilk hecede kalır (spor, tren). Kural
yabancı kökenli kelimelere de aynen uygulanır (e-lekt-rik, kont-rol); "tr/pl kümesini birlikte
tut" gibi bir istisna, ekli Türkçe kelimeleri (Türk-ler → tür-kler) bozduğu için bilerek yok.
