// TURN aktarma sunucusu ayarları: iki telefon farklı ağlardayken (mobil veri, iki ayrı ev) bağlantı
// bu sunucu üzerinden geçer. Ücretsiz genel aktarma sunucuları 2026'da kapandı (openrelay.metered.ca
// park edildi, PeerJS'in sunucuları durduruldu, Metered'ın paylaşılan anahtarlı sunucusu yanıt vermiyor);
// bu yüzden kendi ücretsiz hesabından alacağın bilgiler burada olmalı. Buraya yazdıkların herkese açık
// siteye gider; kota şişerse panelden kimliği silip yenisini oluştur ve burayı güncelle. Bu dosya
// önbelleğe alınmaz: GitHub'da düzenleyince bir sonraki açılışta geçerli olur (sürüm artırmak gerekmez).
//
//  1) Metered (önerilen, 80/443 üzerinden UDP/TCP/TLS sunduğu için mobil ağlarda en güvenilir):
//     https://dashboard.metered.ca/signup — kart istemez, ücretsiz plan ayda 500 MB (yazı tabanlı
//     oyunlar için bol). Panelde bir uygulama oluştur (ad.metered.live), "TURN Server → Credentials →
//     Create Credential" (süre vermeden), sonra "Show ICE Servers Array" listesini STATIC_TURN'e
//     yapıştır ya da "Show API Key" ile aldığın anahtarı METERED'a yaz (oyun bağlanırken listeyi çeker).
//     Kimlik oluşturduktan sonra 1-2 dakika bekle.
//  2) ExpressTURN: https://www.expressturn.com — kart istemez, ücretsiz planda yalnız 3478 portu
//     (UDP/TCP; 80/443 ve TURNS ücretli plandadır, o yüzden bazı operatörlerde çalışmayabilir).
//     Paneldeki kullanıcı adı ve şifreyi STATIC_TURN'e ekle.
//  3) Kendi coturn sunucun varsa (paylaşılan anahtarla): TURN_SECRET'e yaz, kimlik tarayıcıda üretilir.

/** Kendi TURN sunucuların: { urls, username, credential } nesneleri. Örnekler:
 *  { urls: ['turn:global.relay.metered.ca:80', 'turn:global.relay.metered.ca:80?transport=tcp', 'turn:global.relay.metered.ca:443', 'turns:global.relay.metered.ca:443?transport=tcp'], username: '...', credential: '...' }
 *  { urls: ['turn:relay1.expressturn.com:3478?transport=udp', 'turn:relay1.expressturn.com:3478?transport=tcp'], username: 'ef...', credential: '...' }
 */
export const STATIC_TURN = [];

/** Metered hesabı: { app: 'uygulamaadi', apiKey: '...' } — boşsa kullanılmaz. */
export const METERED = { app: '', apiKey: '' };

/** Paylaşılan anahtarlı (TURN REST) sunucu: { urls: ['turn:host:3478', ...], secret: '...', ttlSec: 86400 } — boşsa kullanılmaz. */
export const TURN_SECRET = { urls: [], secret: '', ttlSec: 24 * 3600 };
