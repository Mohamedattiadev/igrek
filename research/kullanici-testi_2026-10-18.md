# God Eye kullanıcı testi: beş kişinin gözünden

**Tarih:** 18 Ekim 2026
**Ortam:**
- Test kopyası: `.godeye-dev`, port 7790.
- Tarayıcı: Chromium (Playwright ile).
- Ekran boyutları: 1366x768 ve 1366x800 (masaüstü), 390x844 (telefon).
- Tema: açık ve koyu.

**Yöntem:** Önce 36 sayfanın hepsi otomatik tarandı (masaüstü ve telefon, toplam 72 görünüm); konsol hataları, yatay taşma, çift kaydırma ve adsız butonlar arandı. Sonra beş kişinin akışı adım adım yürütüldü ve her adımda ekran görüntüsü alınıp incelendi. Kullanım limiti için sadece **bir** gerçek AI sohbeti yapıldı ("Sadece plan" modunda, hiçbir dosya değişmedi). Diğer AI işleri (persona toplantısı, takım akışı, test kullanıcıları, rapor yazdırma) çalıştırılmadı.

## Kişiler

| Kişi | Kim | Ne denedi |
|---|---|---|
| Ayşe | Hiç kod yazmamış, ilk kez açıyor | Tur, ana sayfa kutusundan sohbet, öğrenme merkezi araması, yardımcı |
| Mehmet | Deneyimli geliştirici | Ctrl+K, proje Kod sekmesi, session ayrıntısı, gerçek shell terminali, ayarlar |
| Elif | Takım lideri / CEO | Gelen kutusu, limitler, zamanlanmış işler, takım, personalar, pano, bölümler, izleme |
| Can | Telefondan kullanıyor | Menü çekmecesi, ana sayfa, proje, sohbet, kopya kâğıdı |
| Klavyeyle gezinen biri | Fare kullanmıyor | Tab ile gezinme, odak çerçeveleri |

## İyi çalışanlar

- **Uçtan uca sohbet:**
  - Ana sayfadaki kutuya yazıldı, "Sadece plan" seçilip Enter'a basıldı.
  - Sohbet açıldı ve mesaj kendiliğinden gitti. **17 saniyede** sade ve doğru bir Türkçe cevap geldi.
  - Araç adımı kart olarak, checkpoint "Kayıt alındı" olarak göründü.
- **Tur:** 9 adım. Aydınlatılan alan net, geri kalan bulanık; adımlar numaralı ve ilerleme çubuğu var.
- **Shell terminali:** Gerçek komut çalıştı (`git log` renkli çıktı verdi).
- **Proje sayfası:** Kod sekmesi (JSON ağaç görünümü) ve session ayrıntısı (sağlık, token, model, AI'ın gördükleri) bilgilendirici ve düzgün.
- **Bölümler sayfası:** Proje sağlığı (70/C), kontrol sonuçları ve API haritası anlaşılır.
- **Klavye:** Her odaklanabilir öğede odak çerçevesi görünüyor; Tab sırası mantıklı.
- **Konsol:** 72 görünümde uygulamadan gelen hiç konsol hatası yok.

## Bulunanlar ve düzeltilenler

| # | Kim buldu | Sorun | Durum |
|---|---|---|---|
| 1 | Can | **Telefonda neredeyse her sayfa yana taşıyordu.** Yazılı menü ekranın yarısını kaplıyordu; başlıklar, sekmeler, seçiciler ve tablolar sığmıyordu. | Düzeltildi. Telefonda menü artık çekmece. 72 görünümün hiçbirinde taşma yok |
| 2 | Kullanıcı (ekran görüntüsü) | **Ayarlar'da iki kaydırma çubuğu.** Seçicilerin içindeki görünmez radio düğmeleri sayfayı 4 kat uzatıyordu. | Düzeltildi |
| 3 | Ayşe | Öğrenme merkezinde **"son commiti geri almak" hiçbir şey bulmuyordu**; Türkçe ekler aramayı bozuyordu. | Düzeltildi. Eklere dayanıklı kök eşleştirme; test eklendi |
| 4 | Ayşe | Yardımcı "az önceki sohbetime nasıl dönerim" sorusunu tanımıyor, yavaş yapay zekâ yoluna gidiyordu. | Düzeltildi. Anında bağlantıyla cevap |
| 5 | Ayşe | Üst çubuktaki "Main %2" ne demek, belli değildi. | Düzeltildi. Üzerine gelince tam cümle |
| 6 | Mehmet | Ctrl+K'de "termin" yazınca Terminaller sayfası çıkmıyordu; sayfalar listenin sonundaydı. | Düzeltildi. Sayfalar önce geliyor; kılavuz da palette |
| 7 | Elif | **Gelen kutusu sahte "sır var" uyarılarıyla doluydu.** Öğrenme içeriğindeki örnek satırlar ("paste-the-key-here", "PASSWORD", yerel `postgres:postgres` şifreleri) gerçek sır sanılıyordu. | Düzeltildi. Yer tutucular ve koddaki değişkenler tanınıyor; dokümanlarda sadece gerçek sağlayıcı anahtarları sayılıyor; eski uyarılar bir kez yeniden kontrol edildi; uyarılar commit başına tek satır. Gelen kutusundaki sır uyarıları 20 satırdan 11'e indi; God Eye'ın kendi reposunda 0 kaldı (ilk düzeltmeden sonra ölçünce 3 yanlış alarm daha çıktı, onlar da düzeltildi) |
| 8 | Klavye | Sohbet kutusuna ulaşmak için 22 kez Tab gerekiyordu. | Düzeltildi. "İçeriğe atla" bağlantısı |
| 9 | Can | Sunucu yeniden başlayınca eski sohbet boş bir sayfa olarak açılıyor ve sonsuza dek yeniden bağlanmaya çalışıyordu. | Düzeltildi. "Bu sohbet bitti" ekranı, "Kaldığım yerden devam et" ve "Konuşmayı oku" |
| 10 | Can | Telefonda sohbet kutusunda Gönder butonu görünmüyordu; yardımcı butonu kutunun üstüne biniyordu. | Düzeltildi |
| 11 | Can | Dar ekranda buton yazıları iki satıra kırılıyordu. | Düzeltildi |

## Hâlâ eksik ya da zor olanlar (dürüstçe)

1. **Sohbetler sunucuda kalıcı değil.** Sunucu yeniden başlayınca çalışan sohbet nesnesi kayboluyor. Artık kullanıcıya düzgün bir yol gösteriliyor, ama bu bilgi sadece o tarayıcıda tutuluyor. Başka bir tarayıcıda "Kaldığım yerden devam et" çıkmaz. Kalıcı çözüm: sohbet listesini (proje, session, başlık) veritabanında tutmak.
2. **Dosyalar sayfası telefonda sıkışık.** İki panelli düzen 390 pikselde zor kullanılıyor. Telefonda tek panel ve geri butonu gerekir.
3. **Yeni biri için jargon hâlâ var:**
   - "Yoruluyor" ve "Dinç" rozetleri,
   - model adları ("Opus", "Varsayılan"),
   - "Session" kelimesi,
   - "Sabah brifingi" / "Gün sonu" kartlarının arka plan AI kapalıyken boş durması.

   Ayşe bunların çoğunu anlamaz. Her birine bir cümlelik açıklama ya da Basit modda gizleme önerilir.
4. **Ana sayfa kalabalık.** Sohbet kutusunun altında özet önerisi, sabah brifingi, gün sonu, "Bugün" şeridi ve odak uyarısı üst üste. Yeni biri için önce sadece kutu ve projeler görünmeli, diğerleri katlanabilir olmalı.
5. **Telefonda tur menü adımını atlıyor.** Menü çekmecede olduğu için "Her şey tek menüde" adımı geçiliyor ve menü butonu hiç tanıtılmıyor. Telefonda ayrı bir adım gerekir.
6. **Öğrenme merkezindeki başlıklar sadece İngilizce** ("Web basics", "Linux server", "SQL and PostgreSQL"). Başlıklar tek dil alanı; TR karşılığı eklenmeli.
7. **Diğer projelerdeki gizli bilgi uyarıları:** Gelen kutusunda başka projelerden 11 uyarı kalıyor (`docker-compose.yml`, CI dosyaları ve `scripts/verify-*.ts`). Bunlar test değerleri olabilir, ama gerçek de olabilirler. Bakmak gerekiyor; God Eye otomatik kapatmadı.
8. **Dosyalar sayfasında İngilizce `aria-label="Up"`.** Ekran okuyucu için Türkçe olmalı. Başka sabit İngilizce erişilebilirlik etiketleri de olabilir; sistematik tarama yapılmadı.
9. **Ölçülmedi:** Gerçek sayfa açılış süreleri (testte her sayfaya sabit 2 saniye beklendi), çok uzun sohbetlerde performans, ekran okuyucu ile gerçek kullanım ve renk kontrastının otomatik denetimi (axe benzeri bir araç kurulmadı).

## Test edilmeyenler

- **Maliyetli AI özellikleri:** Persona sohbeti ve toplantısı, takım akışı (Pano → "Takımı başlat"), test kullanıcıları, haftalık ve günlük rapor yazdırma, prompt güçlendirici, "Bu adımı bana yaptır" ve özetleme.
- **Dış bağlantılar:** Takım senkronu (Hub), sunucu SSH bağlantıları, deploy, izleme alarmları ve köprüler (e-posta, Telegram).
- **İlk kurulum ekranı (Onboarding):** Test kopyası zaten kurulu olduğu için görülmedi.
- **Gerçek bir acemi:** Bu test bir insan yerine bir model tarafından, kişilerin gözünden yapıldı. Gerçek bir acemiyle deneme hâlâ gerekli.

## Öneri sırası

1. Sohbet listesini sunucuda kalıcı yapmak (#1).
2. Ana sayfayı sadeleştirmek ve Basit modda jargonu gizlemek (#3, #4).
3. Telefon için Dosyalar sayfası ve tur adımı (#2, #5).
4. Öğrenme başlıklarının Türkçesi (#6).
5. Erişilebilirlik taraması: axe ile kontrast ve etiketler (#8, #9).
