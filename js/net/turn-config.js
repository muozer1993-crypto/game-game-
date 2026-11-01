// TURN aktarma sunucusu ayarları (iki telefon farklı ağlardayken bağlantı buradan geçer).
//
// Ücretsiz genel aktarma sunucuları (Open Relay'in eski adresi, PeerJS'in kendi sunucuları) 2026'da
// kapandı. Kendi ücretsiz hesabınla alacağın kimlik bilgilerini buraya yazarsan oyun onları kullanır:
//
//  1) ExpressTURN (https://www.expressturn.com, ücretsiz plan, aylık 1000 GB): panelde görünen
//     kullanıcı adı ve şifreyi aşağıdaki STATIC_TURN listesine ekle.
//  2) Metered (https://www.metered.ca, ücretsiz plan, aylık 500 MB — yazı tabanlı oyunlar için bol):
//     ya "TURN Server → Credentials"den aldığın kullanıcı adı/şifreyi STATIC_TURN'e ekle, ya da
//     uygulama adını ve API anahtarını METERED'a yaz; oyun kimlikleri bağlanırken Metered'dan çeker
//     (Metered bu anahtarın tarayıcıdan kullanılmasına izin veriyor; panelden alan adıyla sınırlayabilirsin).
//
// Bu dosyada yazanlar herkese açık siteye gider; kota şişerse paneldeki şifreyi değiştir, burayı güncelle.

/** Kendi TURN sunucuların: { urls, username, credential } nesneleri. Örnek:
 *  { urls: ['turn:relay1.expressturn.com:3478?transport=udp', 'turn:relay1.expressturn.com:3478?transport=tcp'], username: 'ef...', credential: '...' }
 *  { urls: ['turn:standard.relay.metered.ca:80', 'turn:standard.relay.metered.ca:443', 'turns:standard.relay.metered.ca:443?transport=tcp'], username: '...', credential: '...' }
 */
export const STATIC_TURN = [];

/** Metered hesabı: { app: 'uygulamaadi', apiKey: '...' } — boşsa kullanılmaz. */
export const METERED = { app: '', apiKey: '' };
