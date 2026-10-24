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
   üretilmiş sıklık listesi `content/2018/tr/tr_full.txt`. Derlemde en az 20 kez geçen ve
   ek ayrıştırmasıyla zemberek'teki bir köke indirgenebilen çekimli biçimler
   (kitaplar, geldim, evimizde …) listeye alındı.
   Kaynak: https://github.com/hermitdave/FrequencyWords
   Lisans: içerik CC BY-SA 4.0 (kod MIT). Bu dosya türev bir çalışmadır ve aynı
   lisansla (CC BY-SA 4.0) paylaşılır.

## common-tr.json (gizli kelime havuzu: 4/5/6 harfli yaygın kelimeler)

`tr_50k.txt` sıklık sırasına göre, zemberek ana sözlüğünde kök olarak bulunan isim/sıfat
türündeki kelimeler (mastarlar, ünlemler, özel adlar ve `tools/blocklist.txt` +
`tools/common-exclude.txt` içindekiler hariç). Lisans: CC BY-SA 4.0 (FrequencyWords
türevi) + Apache 2.0 (zemberek).

## questions.json

Bu proje için yazılmış özgün sorular. Lisans: MIT (projeyle aynı).

## vendor/peerjs.min.js

PeerJS 1.5.5 — MIT, Copyright (c) 2015 Michelle Bu and Eric Zhang. Lisans metni:
`vendor/peerjs.LICENSE`.
