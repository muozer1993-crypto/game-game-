# Veri kaynakları ve lisansları

Uygulamanın kodu MIT lisanslıdır (bkz. ../LICENSE). `data/` altındaki dosyalar aşağıdaki
açık lisanslı kaynaklardan `tools/build-words.py` ile türetilmiştir.

## words-tr.txt (doğrulama listesi, ~224 bin kelime)

Birleşimi:

1. **zemberek-nlp** sözlükleri — `master-dictionary.dict` ve `non-tdk.dict`
   (kök/lemma listesi; fiiller mastar halinde, ayrıca mastarsız gövdeler eklendi).
   Kaynak: https://github.com/ahmetaa/zemberek-nlp (commit 037202c7),
   `morphology/src/main/resources/tr/`.
   Lisans: Apache License 2.0 — Copyright 2018 Ahmet A. Akın, Mehmet D. Akın.
   Şapkalı harfler düzleştirildi (kâğıt → kağıt).

2. **FrequencyWords** (Hermit Dave) — OpenSubtitles 2018 Türkçe altyazı derleminden
   üretilmiş sıklık listesi `content/2018/tr/tr_full.txt`. Ek ayrıştırması (ünlü uyumu,
   zemberek'in ünsüz yumuşaması / ünlü düşmesi / ikizleşme öznitelikleri) ile zemberek'teki
   bir köke indirgenebilen çekimli biçimler listeye alındı: tek ekli biçimler (kitaplar) en az
   8, çok ekli biçimler (evimizdekiler) en az 20 kez geçiyorsa. Ünlüsüz diziler, uzatmalar
   (tamaaam) ve İngilizce sıklık listesinin ilk 20 bininde yer alan altyazı artıkları
   (`content/2018/en/en_50k.txt`, yalnızca süzgeç olarak kullanılır, dağıtılmaz) atıldı.
   Türkçe harfsiz yazılmış biçimler (buyuk, degil, icin) Türkçe yazılışları en az 10 kat daha
   sık geçiyorsa, aynı harfin üst üste üç kez geçtiği kelimeler (aaa) de sözlükler dahil atıldı.
   Kaynak: https://github.com/hermitdave/FrequencyWords (master dalı, 24 Ekim 2026'da
   indirildi; depoda etiket/sürüm yok).
   Lisans: içerik CC BY-SA 4.0 (kod MIT). Bu dosya türev bir çalışmadır ve aynı
   lisansla (CC BY-SA 4.0) paylaşılır. Derlem: OPUS OpenSubtitles2018 (opus.nlpl.eu).

## common-tr.json (gizli kelime havuzu: 4/5/6 harfli yaygın kelimeler)

`tr_50k.txt` sıklık sırasına göre, zemberek ana sözlüğünde kök olarak bulunan kelimeler
(fiil mastarları, ünlemler, soru eki ve bağlaçlar hariç; isim, sıfat, zarf, sayı, zamir ve
edat olarak da kullanılan sonra/doğru/başka gibi kelimeler kalır). Ayrıca `tools/blocklist.txt` (kaba/hassas) ve gözden geçirilmiş
`tools/common-exclude.txt` (özel adlar, çekimli biçimler, nadir/yabancı kelimeler, ünlemler)
içindekiler çıkarılır. Lisans: CC BY-SA 4.0 (FrequencyWords türevi) + Apache 2.0 (zemberek).

## questions.json

Bu proje için yazılmış özgün sorular. Lisans: MIT (projeyle aynı).

## trivia.json ve tabu.json

Bu proje için yazılmış özgün genel kültür soruları ve Tabu kartları. Lisans: MIT (projeyle aynı).

## sarkilar.json (Şarkı Süresi)

Şarkı adı, grup ve süre bilgileri: oyuncunun kendi Spotify listesinin dışa aktarımı
(`PAPAZ_MİXLER_TOPLU.csv`), Spotify'ın herkese açık embed sayfasındaki liste verisi ve Deezer'ın
açık API'si (https://developers.deezer.com) — favori grupların (Katatonia, Opeth, Anathema,
Antimatter) stüdyo albümleri de buradan alındı. Dosyada yalnızca üst veri (ad, grup, süre, kimlik,
Spotify örnek bağlantısı) vardır; ses dosyası depoda tutulmaz. Zor modda çalan 10 saniyelik örnek,
Spotify'ın (`p.scdn.co`) ya da Deezer'ın kendi sunucusundan oynatma anında yüklenir.

## vendor/peerjs.min.js

PeerJS 1.5.5 — MIT, Copyright (c) 2015 Michelle Bu and Eric Zhang. Lisans metni:
`vendor/peerjs.LICENSE`.

## Lisans metinleri

- Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0
- CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
- MIT: ../LICENSE

- `dogruluk.json`: Doğruluk mu Cesaret mi? kartları, bu proje için yazıldı (MIT).

- `img/chess/*.svg`: satranç taşları, Colin M.L. Burnett (Cburnett), Wikimedia Commons; 3 maddeli BSD lisansıyla kullanılıyor, tam metin `img/chess/LICENSE.txt`.
