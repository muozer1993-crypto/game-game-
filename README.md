# Oyun Gecesi

İki kişilik, Türkçe arayüzlü, telefonda rahat oynanan oyun koleksiyonu.
Düz HTML + CSS + JavaScript (ES modules); framework yok, build adımı yok, npm yok.
Tek telefonda elden ele ya da iki telefonda oda koduyla oynanır. Ana ekrana eklenebilir
(manifest + service worker) ve bir kez yüklendikten sonra tek telefon modu çevrimdışı çalışır.

## Oyunlar

| Oyun | Kısaca |
|---|---|
| **Son Hece** | Her kelime bir öncekinin son hecesiyle başlar (kitap → tapınak → nakış). Süre, itiraz/kabul, ğ kuralı. |
| **Gizli Kelime** | Karşılıklı Wordle. 4–6 harf, renkli ya da "+2 −1" modu. İkisi aynı turda bulursa berabere. |
| **Gizli Sayı** | Rakamları farklı 4 haneli sayı, "+ −" ipuçlarıyla. |
| **Beni Ne Kadar Tanıyorsun?** | Biri kendisi hakkında cevaplar, öteki tahmin eder; sonra roller değişir. Hazır havuz + kendi sorularınız. |

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
> Yayınlarken `sw.js` içindeki `VERSION` değerini artırın; eski önbellek böylece atılır.

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
**Odaya katıl** ile kodu yazar. Ev sahibi oyunu ve ayarları seçer, iki telefon da aynı hamleleri
aynı sırayla uygular.

Bağlantı katmanı **PeerJS** (WebRTC, `vendor/peerjs.min.js`, MIT). Seçilme nedeni: sıfır kurulum.
Hesap, API anahtarı, sunucu, yapılandırma dosyası gerekmez; eşleştirme için PeerJS'in ücretsiz
genel sunucusu (`0.peerjs.com`) kullanılır, oyun verisi doğrudan iki telefon arasında akar.

**Gizli bilgi:** Gizli Kelime'de gizli kelime karşı telefona hiç gönderilmez. Tahmin, kelimenin
sahibinin telefonuna gider; orada puanlanır ve yalnızca sonuç (renkler ya da +/−) geri yazılır.
Beni Ne Kadar Tanıyorsun'da cevaplar da aynı şekilde tahmin aşaması bitene kadar sahibinin
telefonunda kalır.

### PeerJS mi, Firebase mi?

| | PeerJS (seçilen) | Firebase Realtime Database |
|---|---|---|
| Kurulum | Yok. Dosyayı aç, çalışır. | Firebase projesi aç, Realtime Database etkinleştir, güvenlik kuralı yaz, config'i depoya koy. |
| Maliyet | Ücretsiz, kota yok ama SLA/garanti de yok. | Spark planı ücretsiz (1 GB depolama, 10 GB/ay aktarım, 100 eşzamanlı bağlantı). |
| Güvenilirlik | Genel eşleştirme sunucusu tek nokta; nadiren yavaş/kapalı olabilir. İki telefon farklı mobil operatör ağlarındaysa (CGNAT) doğrudan bağlantı kurulamayabilir; PeerJS'in kendi TURN sunucusu şu an çalışmıyor. Aynı Wi-Fi ya da Wi-Fi + mobil genelde sorunsuz. | Her ağda çalışır (sunucu üzerinden). |
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
- PeerJS 1.5.5: MIT (`vendor/peerjs.LICENSE`).

## Heceleme kuralları

`js/lib/syllabify.js`: her hecede tek ünlü; iki ünlü arasındaki tek ünsüz sonraki heceye (ki-tap);
iki ya da daha çok ünsüzde sonuncusu sonraki heceye (an-ne, kar-deş, Türk-çe); yan yana ünlüler
ayrılır (sa-at); baştaki ünsüz kümesi ilk hecede kalır (spor, tren). Yabancı kökenli kelimeler için
tek ek: üç ya da daha çok ünsüzde sondaki "tr/pl/kr…" kümesi birlikte geçer (e-lek-trik, kon-trol).
