# God Eye — Ana Plan

> **Tek cümle:** Hangi AI kod aracını kullanırsan kullan (Claude Code, Codex, Gemini, Antigravity…), tüm projelerini
> tek bir güzel ekrandan gören, anlatan, puanlayan, uzman persona takımıyla geliştiren, kendi kendine öğrenen
> ve hiç teknik bilgisi olmayan birinin bile rahatça kullanabileceği lokal bir "AI yazılım şirketi" uygulaması.

**Durum işaretleri:** `- [ ]` yapılacak · `- [x]` bitti · `🔒` güvenlik kritik · `⭐` MVP için şart

---

## İçindekiler

0. [Temel İlkeler](#0-temel-ilkeler)
1. [Hedef Deneyim (Senaryo)](#1-hedef-deneyim-senaryo)
2. [Benzer Projeler ve Dersler](#2-benzer-projeler-ve-dersler)
3. [Mimari](#3-mimari)
4. [Teknoloji Seçimi](#4-teknoloji-seçimi)
5. [Klasör Yapısı](#5-klasör-yapısı)
6. [Veri Modeli](#6-veri-modeli)
7. [UI/UX Standartları](#7-uiux-standartları)
8. [Fazlar](#8-fazlar)
9. [Açık Sorular ve Riskler](#9-açık-sorular-ve-riskler)
10. [Sonraki Planlar (şimdilik değil)](#10-sonraki-planlar-şimdilik-değil)

**Faz özeti:** 0 Kurulum · 1 Göz (takip + hafıza) · 2 Çalışma Alanı + Sunucular · 3 Hesaplar ve Limitler · 4 Takım Senkronu · 4.5 Prompt Güçlendirici · 5 Kategori Sayfaları · 6 Personalar · 7 Kütüphane ve Öğrenme · 8 Takım Akışları · 9 Zamanlanmış İşler · 10 Canlı Önizleme · 11 Ekstralar · 12 Tam Suit Araçları · 13 İleri Seviye Öneriler

---

## 0. Temel İlkeler

| # | İlke | Anlamı |
|---|---|---|
| 1 | **Lokal ve özel** | Her şey bilgisayarında çalışır. Kodun, hesapların ve kitapların dışarı çıkmaz. |
| 2 | **Login ile, API key'siz** | Claude/Codex/Gemini CLI'ları kendi login'inle kullanılır. API key opsiyoneldir. |
| 3 | **Her şey otomatik** | Hafıza, özet, model seçimi, puanlama ve öğrenme elle değil, sistemin kendisi tarafından yapılır. |
| 4 | **Kanıt, uydurma değil** | Her iddia gerçek bir kaynağa dayanır: test çıktısı, lint, diff, kitap referansı. |
| 5 | **Teyze testi** | Hiç eğitim almamış biri bile ilk 5 dakikada kullanabilmeli. Teknik terim gerekiyorsa açıklaması yanında yazar. |
| 6 | **Temiz ve sade** | JetBrains (New UI) kadar düzenli, Notion kadar sade. Gereksiz hiçbir şey ekranda yok. |
| 7 | **Her dil** | Kullanıcı ilk girişte dilini seçer (Türkçe, İngilizce, Norveççe, Arapça… hangisi olursa). Arayüz ve tüm AI çıktıları o dilde olur. |
| 8 | **Local-first takım** | İşlemler herkesin kendi bilgisayarında yapılır. VPS sadece senkronizasyon yapar, neredeyse hiç CPU ve RAM kullanmaz. Veriler şifreli taşınır. |
| 9 | **Tamamen ücretsiz** | Ücretli API veya servis yok. Her şey açık kaynak. Tek maliyet zaten sahip olduğun AI hesapları ve VPS. |
| 10 | **Kontrol sende** | Kritik işlerde onay istenir. Her değişiklik geri alınabilir. |
| 11 | **Tek komut** | `docker compose up -d` ile kurulur ve çalışır. Az yer kaplar. |
| 12 | **Kendini geliştirir** | Her hata ve her çözüm bir yere kaydedilir, bir daha tekrarlanmaz. |
| 13 | **Yayınlanabilir** | İlk günden "başkaları da kullanacak" kalitesinde yazılır: i18n, ayarlar, dokümantasyon. |

---

## 1. Hedef Deneyim (Senaryo)

1. Tarayıcıda `http://localhost:7777` açılır.
2. **İlk açılışta kurulum sihirbazı:** "Hangi dili istersin?" → "Hangi AI araçlarını kullanıyorsun?" → hesaplar eklenir → proje klasörleri seçilir → (opsiyonel) "Takımına bağlan" (Hub adresi + kullanıcı adı ve şifre). Toplam 4–5 adım.
3. **Ana sayfa:** Tüm projeler kartlar halinde görünür. Her kartta sağlık puanı, son aktivite, çalışan agent'lar ve limit durumu var.
4. Bir projeye tıklanır. **Proje sayfasında sol menü:**
   - 🏠 Genel Bakış: ne durumdayız, sade dille
   - 💬 Session'lar: tüm sohbetler + yeni sohbet (CLI'ın web hali)
   - 🏛️ Mimari · 🎨 UI/UX · 🖥️ Frontend · ⚙️ Backend · 🗄️ Veritabanı · 🚀 DevOps · 🔒 Güvenlik · 🧪 Test
   - 📁 Kod: VS Code gibi dosya gezgini ve editör
   - 👁️ Önizleme: uygulama canlı çalışır, seç ve değiştir
   - 👥 Takım: personalar, toplantılar, görevler
   - ⏰ Zamanlanmış İşler
5. Her kategori sayfasının altında **prompt kutusu** var. Yazılan şey otomatik olarak o alanın uzmanına ve bağlamına gider.
6. Chat'te *"Bu projede cuma sabahı bağımlılıkları güncelle ve testleri çalıştır"* yazılır. Sistem bunu **zamanlanmış iş** olarak anlar, onay ister ve zamanı gelince kendi kendine yapar.
7. Her an `Ctrl+Space` → **⚡ Hızlı Soru**. Ana sohbete dokunmadan cevap gelir.
8. Üst barda **hesap seçici**: aktif hesap, kalan limit, tek tıkla geçiş. **📊 Limitler** sayfasında neyin, nerede, ne zaman harcandığı görülür.
9. Terminale hiç girmeye gerek kalmaz.
10. **Takım:** Arkadaşım kendi bilgisayarında çalışırken onun session'ını canlı izleyebiliyorum, o da benimkini. Proje hafızası ortak. Biri bir karar aldığında diğerinin AI'ı da bunu bilir. Aynı dosyada çalışmaya başlarsak sistem önceden uyarır.
11. **Sunucular:** "195.2.x.x sunucusuna gir, nginx loglarına bak" dediğimde agent SSH ile bağlanıp işi yapar. Riskli komutlarda onay ister ve her komutu kaydeder.

---

## 2. Benzer Projeler ve Dersler

> Amaç: Var olanı tekrar icat etmemek. En iyi fikirlerini almak, eksiklerini kapatmak, hepsinin "kralını" tek uygulamada yapmak.

| Proje | Ne yapıyor | Alacağımız ders | Eksiği (bizim farkımız) |
|---|---|---|---|
| **CloudCLI / Claude Code UI** (siteboon) | Claude/Codex/Gemini/Cursor için web arayüzü; `~/.claude/projects`'i tarayıp mevcut session'ları buluyor; görev kuyruğu ve zamanlayıcı | Mevcut session'ları dosyalardan keşfetme yaklaşımı doğru. Mobil uyumluluk değerli | Hafıza yok, persona yok, puanlama yok, kategori sayfaları yok. GPLv3 lisanslı, kodunu kopyalayamayız |
| **Kanna** | Claude ve Codex için güzel bir web arayüzü; proje odaklı; canlı durum göstergeleri (idle, running, waiting, failed) | Proje odaklı düzen + canlı durum rozetleri = iyi UX | Takım, öğrenme, önizleme yok |
| **Archon** (coleam00) | YAML iş akışı motoru; her iş ayrı git worktree'de; Claude, Codex ve Pi desteği; onay adımları | İş akışı motoru olarak kullanılabilir, sıfırdan yazmayız | Senin manuel session'larını görmüyor, sade dilde özet yok |
| **Vibe Kanban** | Kanban kartı "In Progress"e taşınınca worktree açılıp agent başlıyor; diff ile review | Görev panosu ve agent'ı birleştiren çok sezgisel bir UX | Şirketi kapandı, artık topluluk tarafından sürdürülüyor. Hafıza ve uzmanlık yok |
| **Conductor, Superset, Nimbalyst** | Paralel agent'ları masaüstünde yönetme | Görsel kalite çıtası | Kapalı kaynak veya tek araca bağlı |
| **stagewise** | Çalışan uygulamada element seçip DOM, CSS, ekran görüntüsü ve component bilgisini agent'a veriyor | Seç ve değiştir özelliğinin referansı | AGPLv3; kendi IDE'si; bizim sistemimize gömülü değil |
| **Domscribe** | DOM'dan kaynak koda eşleme | Element → dosya:satır eşlemesi | Tek başına bir parça |
| **claude-swap, clauth, ccswitch** | Claude hesapları arasında çıkış yapmadan geçiş; 5 saatlik ve 7 günlük limit çubukları | İzole config klasörü yöntemi kanıtlanmış ve çalışıyor | Sadece Claude, sadece terminal, ayrı araç |
| **Claude Code'un kendi özellikleri** | `/btw`, subagent'lar, hook'lar, skill'ler, routine'ler (zamanlanmış işler) | Bunları **yeniden yazmayacağız, kullanacağız**: subagent = persona, hook = otomasyon | Dağınık, CLI'a gömülü, görsel değil |

**Sonuç:** Her parçanın bir örneği var ama hepsini birleştiren, hafızalı, öğrenen, uzman takımlı ve sade dilli bir uygulama yok.
**Lisans kuralı:** GPL veya AGPL lisanslı projelerin kodunu kopyalamıyoruz, sadece fikirlerinden ilham alıyoruz. Bizim lisansımız MIT olacak.

---

## 3. Mimari

```
┌────────────────────────────── Tarayıcı (localhost:7777) ──────────────────────────────┐
│  React UI: Projeler · Kategori sayfaları · Chat · Terminal · Kod · Önizleme · Limitler │
└──────────────┬───────────────────────────────── WebSocket + REST ──────────────────────┘
               │
┌──────────────▼──────────────── God Eye Sunucusu (Bun + Hono) ──────────────────────────┐
│  Toplayıcılar   │ Agent Çalıştırıcı │ Hafıza Motoru │ Puanlama   │ Zamanlayıcı         │
│  (watcher)      │ (PTY + headless)  │ + Öğrenme     │ Motoru     │ (cron)              │
│  Hesap Yönetici │ Persona Yönetici  │ Kütüphane/RAG │ Önizleme   │ Bildirim            │
│                 │                   │               │ Proxy      │                     │
└───┬─────────────┴────────┬──────────┴──────┬────────┴─────┬──────┴─────────────────────┘
    │                      │                 │              │
    ▼                      ▼                 ▼              ▼
 ~/.claude, ~/.codex   claude / codex /   SQLite +       God Eye MCP Server
 git repoları          gemini CLI'ları    sqlite-vec     (tüm agent'lar hafızaya,
 (okunur)              (çalıştırılır)     (tek dosya)    kütüphaneye, web'e erişir)
                           │
                           └── Archon (opsiyonel, takım iş akışları)

        Benim bilgisayarım                    VPS (sadece senkron)              Arkadaşımın bilgisayarı
 ┌───────────────────────────┐         ┌──────────────────────────┐         ┌───────────────────────────┐
 │ God Eye (tüm işlemler     │◀──WSS──▶│ God Eye Hub              │◀──WSS──▶│ God Eye (tüm işlemler     │
 │ burada: AI, kod, git)     │ şifreli │ • giriş / kullanıcılar   │ şifreli │ onda: AI, kod, git)       │
 │ Lokal SQLite (tam kopya)  │         │ • şifreli event deposu   │         │ Lokal SQLite (tam kopya)  │
 └─────────────┬─────────────┘         │ • canlı aktarım (relay)  │         └───────────────────────────┘
               │ SSH (onaylı)          │ AI yok, kod çalıştırmaz  │
               ▼                       │ ~50 MB RAM, ~%0 CPU      │
       Yayındaki sunucular             └──────────────────────────┘
```

**Ana fikirler:**
- **Adaptör deseni:** Her AI aracı (Claude, Codex, Gemini, Antigravity…) aynı arayüzü uygular: `discoverSessions`, `parseSession`, `startInteractive`, `runHeadless`, `getUsage`, `accounts`. Yeni bir araç eklemek tek bir dosya yazmaktır.
- **MCP köprüsü:** God Eye bir MCP server sunar. Hangi agent çalışırsa çalışsın hafızaya, kütüphaneye, ders defterine ve proje durumuna erişir.
- **Olay akışı:** Her şey bir `event` olarak kaydedilir (session mesajı, commit, test sonucu, hata). Özetler, puanlar ve öğrenme bu akıştan beslenir.
- **Local-first senkron:** Her kullanıcıda verinin tam kopyası bulunur. Uygulama internet olmadan da çalışır. Hub sadece şifreli değişiklikleri taşır ve saklar (detay: Faz 4).

---

## 4. Teknoloji Seçimi

| Katman | Seçim | Neden |
|---|---|---|
| Runtime | **Bun + TypeScript** | Hızlı, tek binary, Archon ile aynı ekosistem |
| Sunucu | **Hono** + WebSocket | Hafif ve hızlı |
| UI | **React + Vite + Tailwind v4 + shadcn/ui + Framer Motion** | Modern, güzel, animasyonlu |
| Kod editörü | **Monaco** (VS Code'un motoru) + **monaco-vim** | Birebir VS Code deneyimi + tam Vim modu |
| Terminal | **xterm.js** + **node-pty** | Gerçek CLI deneyimi tarayıcıda |
| Veritabanı | **SQLite** (Drizzle ORM) + **sqlite-vec** | Tek dosya, kurulum yok, vektör arama dahil |
| Embedding | **Ollama** `nomic-embed-text` (opsiyonel) / yedek: `fastembed` | Tamamen lokal |
| Grafikler | **Recharts** | Limit ve puan grafikleri |
| Diyagram | **Mermaid** | Otomatik mimari çizimleri |
| Zamanlayıcı | **croner** | Hafif cron |
| i18n | **i18next** + AI ile dil paketi üretimi | Her dil; RTL (Arapça, Farsça, İbranice) desteği |
| Senkron (veri) | **Event log replikasyonu** (append-only, ULID) | Çakışma olmaz: kimse kimsenin kaydını değiştirmez, sadece yeni kayıt ekler |
| Senkron (ortak dokümanlar) | **Yjs** (CRDT) | Hafıza, plan ve görevler aynı anda düzenlense bile otomatik ve çakışmasız birleşir |
| Şifreleme | **libsodium** (XChaCha20-Poly1305, uçtan uca) | Hub verileri okuyamaz, sadece şifreli halini taşır |
| Hub | **Bun + Hono + SQLite**, önünde **Caddy** (otomatik HTTPS) | Tek küçük binary, ~50 MB RAM |
| Parola | **argon2id** + opsiyonel TOTP (2FA) | Güvenli giriş |
| SSH | Sistem `ssh` + **ssh-agent** | Anahtarlar God Eye'a veya AI'a hiç verilmez |
| Paketleme | **Docker** (`oven/bun:slim` tabanlı, multi-stage) | Tek komut, hedef imaj < 400 MB |
| Test | **Vitest** + **Playwright** | Birim ve uçtan uca testler |

---

## 5. Klasör Yapısı

```
god-eye/
├── apps/
│   ├── server/              # Bun + Hono API, WebSocket, zamanlayıcı
│   ├── web/                 # React arayüzü
│   └── hub/                 # VPS'te çalışan küçük senkron sunucusu
├── packages/
│   ├── core/                # Ortak tipler, event modeli, i18n metinleri
│   ├── adapters/            # claude/, codex/, gemini/, antigravity/, git/
│   ├── memory/              # Proje hafızası + ders defteri
│   ├── scoring/             # Rubrikler + puanlama
│   ├── personas/            # Persona tanımları + .claude/agents üretici
│   ├── library/             # RAG: parçalama, embedding, arama
│   ├── preview/             # Proxy + element seçici script + kaynak eşleme plugin'i
│   ├── sync/                # Event replikasyonu, Yjs, şifreleme, sır temizleme
│   ├── servers/             # SSH sunucu yönetimi, komut denetimi, izleme
│   ├── i18n/                # Dil paketleri + AI ile çeviri üretici
│   └── mcp/                 # God Eye MCP server
├── rubrics/                 # architecture.md, frontend.md, ...
├── docker/                  # Dockerfile, entrypoint
├── docker-compose.yml
├── plan.md
└── README.md
```

**Kullanıcı verisi:** `~/.godeye/` (veritabanı, hesap profilleri, kütüphane dosyaları, loglar). Docker'da volume olarak bağlanır.

---

## 6. Veri Modeli

| Tablo | Ne tutar |
|---|---|
| `projects` | Yol, isim, tespit edilen kategoriler, varsayılan hesap |
| `sessions` | Araç, hesap, proje, başlangıç/bitiş, özet (TR/EN), durum |
| `events` | Session mesajları, araç kullanımları, commit'ler, test sonuçları, hatalar |
| `phases` / `tasks` | Proje fazları ve görevleri, durum, atanan persona |
| `memory_items` | Kararlar, konvansiyonlar, denenip olmayanlar, açık sorunlar (kaynak event'e bağlı) |
| `lessons` | Ders defteri: hata → sebep → çözüm → nasıl önlenir (embedding'li) |
| `scores` | Kategori, puan, kanıtlar, tarih |
| `personas` | Tanım, model, kütüphane, izinler, skor kartı |
| `library_docs` / `chunks` | Kitaplar, dokümanlar, repolar ve vektör parçaları |
| `accounts` | Sağlayıcı, isim, config klasörü yolu, plan, durum |
| `usage` | Hesap, proje, persona, session, model, token, zaman damgası |
| `schedules` / `runs` | Zamanlanmış işler ve her çalışmanın sonucu |
| `prompts` | Prompt kütüphanesi |
| `settings` | Dil, tema, basit/pro mod, bildirim tercihleri |
| `users` / `devices` | Takım kullanıcıları, cihazları, açık anahtarları (iptal edilebilir) |
| `teams` / `members` | Takımlar, proje bazında roller (sahip, yönetici, üye, izleyici) |
| `sync_state` | Her proje için senkron imleci, bekleyen gönderimler (offline kuyruk) |
| `presence` / `claims` | Kim çevrimiçi, kim hangi proje/kategori/dosya üzerinde çalışıyor |
| `servers` | SSH sunucuları: isim, adres, kullanıcı, etiket (prod/test), izin kuralları |
| `remote_audit` | Sunucularda çalıştırılan her komut: kim, hangi agent, ne zaman, sonuç |
| `comments` | Session, karar ve kategori sayfalarına yorumlar, @bahsetmeler |
| `workspaces` | Çalışma alanları: Lokal, Sunucu (SSH), Takım (Hub); her proje tek bir alana ait |
| `environments` | Proje ortamları: Local, Staging, Prod; adres, sunucu, sürüm, sağlık |
| `apis` / `api_usage` | Bulunan dış ve iç API'ler, kodda kullanıldığı yerler, kullanım istatistikleri |
| `env_keys` | `.env` anahtar isimleri, açıklamaları, değişiklik geçmişi (**değerler değil**) |
| `persona_opinions` | Personaların "Görüşlerim" defteri: iddia, kanıt, güven, tarih, değişiklik geçmişi |
| `feeds` / `feed_items` | Bilgi motoru kaynakları ve önemli haberler |
| `test_runs` | Test kullanıcısı ve uzman test sonuçları, kayıtlar, bulunan sorunlar |

**Not:** Senkron edilen her kayıtta `author_id`, `device_id` ve `ulid` bulunur. Kayıtlar değiştirilmez, düzeltme yeni bir kayıt olarak eklenir. Bu sayede çakışma oluşmaz.

---

## 7. UI/UX Standartları

> Çıta: **JetBrains New UI + Notion** (yardımcı referanslar: Linear, Raycast). "Temiz ve kolay" bir istek değil, bir gereklilik.

### 7.0 Tasarım yönü: "Sakin arayüz"
- [ ] ⭐ **Notion gibi sade:** bol beyaz alan, az renk, içerik ön planda. Süs yok, gölge çok az, çizgiler ince
- [ ] ⭐ **JetBrains gibi düzenli:** sol tarafta ince ikon şeridi (tool window bar), açılır kapanır paneller, sekmeli editör, alt durum çubuğu. Her şeyin sabit ve tahmin edilebilir bir yeri var
- [ ] ⭐ Nötr gri palet + **tek vurgu rengi**. Renk sadece anlam taşıdığında kullanılır (🟢 başarılı, 🔴 hata, 🟡 uyarı)
- [ ] Sakin tipografi: Inter (arayüz), JetBrains Mono (kod), net bir başlık hiyerarşisi
- [ ] Yoğunluk ayarı: **Rahat** (Notion gibi ferah) / **Kompakt** (JetBrains gibi sıkı)
- [ ] Paneller sürüklenip yeniden düzenlenebilir; düzen kaydedilir
- [ ] "Zen modu": tek tıkla tüm paneller gizlenir, sadece içerik kalır
- [ ] Hazır temalar: Açık, Koyu, JetBrains Darcula benzeri, Notion benzeri açık tema
- [ ] Kural: bir ekranda aynı anda en fazla bir ana aksiyon butonu
- [x] ⭐ **Emoji yok, gerçek ikonlar:** arayüzde hiç emoji kullanılmaz; her ikon SVG'dir (lucide), ekran okuyucu için etiketlidir ya da `aria-hidden` ile gizlidir. Terminal çıktısında da emoji yok
- [x] ⭐ **Her yerde ipucu (tooltip):** her ikon butonun ve her seçeneğin üzerine gelince ne işe yaradığı sade dille yazar, varsa kısayolu da gösterir. Klavyeyle odaklanınca da çıkar, Esc ya da herhangi bir tuş kapatır — *tek global katman: `data-tip`, `title` ve ikon butonlardaki `aria-label` otomatik ipucuna dönüşür*

### 7.1 Tasarım sistemi
- [ ] ⭐ Renk token'ları (açık ve koyu tema), tipografi (Inter + JetBrains Mono), boşluk ölçeği, köşe yarıçapları, gölgeler
- [ ] ⭐ shadcn/ui tabanlı ortak bileşen kütüphanesi: kart, rozet, puan halkası, durum noktası, boş durum, yükleniyor iskeleti
- [ ] Mikro animasyonlar: sayfa geçişleri, canlı durum nabzı, puan dolma animasyonu (Framer Motion)
- [ ] İkon seti: Lucide
- [ ] Tasarım vitrini sayfası (`/design`): tüm bileşenler tek sayfada

### 7.2 Teyze testi (herkes kullanabilsin)
- [ ] ⭐ **Basit Mod / Pro Mod** anahtarı. Basit modda sadece büyük kartlar, sade dil ve "Ne yapmak istiyorsun?" kutusu görünür
- [ ] ⭐ Her teknik terimin yanında `?` balonu ile tek cümlelik açıklama
- [ ] Hata mesajları suçlamaz, çözüm önerir: "Bağlantı koptu. **Tekrar dene** butonuna bas."
- [ ] Hiçbir ekran boş kalmaz: her boş durumda "şunu yaparak başla" önerisi
- [ ] İlk açılışta kurulum sihirbazı (ilk soru: dil) + 60 saniyelik tur
- [ ] Geri al (Undo) her yerde

### 7.3 Erişilebilirlik ve kalite
- [ ] Klavye ile tam kullanım, `Ctrl+K` komut paleti
- [ ] WCAG AA kontrast, ekran okuyucu etiketleri
- [ ] Büyük yazı seçeneği
- [ ] Her ekran 1280px ve üstünde kusursuz; 768px'te kullanılabilir
- [ ] Performans: ilk açılış < 1 sn, sayfa geçişi < 100 ms

### 7.4 Her dil
- [ ] ⭐ Onboarding'in ilk adımı dil seçimi; aranabilir liste, dünyadaki tüm diller
- [ ] ⭐ Hazır paketler: Türkçe ve İngilizce (elle kontrol edilmiş)
- [ ] Diğer diller: seçilince **dil paketi AI ile üretilir** (bir kere, birkaç dakika), `~/.godeye/i18n/` altına kaydedilir. Sonra çevrimdışı da çalışır
- [ ] Paket kalitesini düzeltme: arayüzde "bu çeviri yanlış" → düzeltme kaydedilir
- [ ] RTL (sağdan sola) yerleşim desteği
- [ ] Tarih, saat, sayı ve para formatları seçilen dile göre
- [ ] Tüm AI çıktıları (özetler, persona cevapları, raporlar) kullanıcının dilinde
- [ ] Takımda herkes kendi dilinde görür: arkadaşımın Norveççe notu bana Türkçe çevrilmiş görünür, "orijinali göster" seçeneği de olur

---

## 8. Fazlar

> Her faz **tek başına işe yarar** ve sonunda "Bitti sayılır" kriterleri vardır. Sıra önemlidir.

---

### Faz 0 — Kurulum, Docker ve Temel ⭐

**Hedef:** `docker compose up -d` → `localhost:7777` → boş ama güzel bir uygulama.

- [x] ⭐ Monorepo iskeleti (Bun workspaces), lint (Biome), TypeScript strict
- [x] ⭐ Hono sunucusu + Vite React arayüzü + WebSocket bağlantısı
- [x] ⭐ SQLite + Drizzle şeması + migration'lar
- [x] ⭐ Tasarım sistemi temeli (bkz. UI/UX Standartları 7.1) + uygulama iskeleti (sol menü, üst bar, komut paleti kabuğu)
- [x] ⭐ i18n altyapısı (TR/EN hazır, diğer diller için paket sistemi), RTL hazırlığı
- [ ] ⭐ **Docker**
  - [x] Multi-stage Dockerfile, `oven/bun:slim` tabanlı, hedef < 400 MB (ölçülen: ~321 MB açılmış katman)
  - [x] İçinde `git`, `claude`, `codex` CLI'ları kurulu (build argümanıyla seçilebilir) — *`GODEYE_INSTALL_CLAUDE` / `GODEYE_INSTALL_CODEX`; Codex ~300 MB ekler*
  - [x] Volume'lar: `~/.godeye`, `~/.claude`, `~/.codex`, proje klasörleri (kullanıcı seçer)
  - [x] Container içinde kullanıcının UID/GID'si ile çalışır, dosya sahipliği bozulmaz
  - [x] Healthcheck, otomatik yeniden başlama
- [ ] Docker'sız alternatif: `bunx god-eye` (Docker kurmak istemeyenler için)
- [x] 🔒 Sunucu sadece `127.0.0.1`'e bağlanır; oturum token'ı; Origin ve Host kontrolü (DNS rebinding koruması)
- [x] 🔒 **Prompt güvenlik duvarı:** kullanıcının yazdığı prompt'ta şifre, API key veya kişisel veri varsa AI'a gitmeden önce uyarır ve maskeler — *chat ve Hızlı Soru'da; güçlendirici ve senkron zaten temizler*
- [ ] 🔒 **Prompt injection koruması:** web sayfaları, dokümanlar, issue'lar ve loglar gibi dışarıdan okunan içerik **veri** olarak işaretlenir, talimat olarak uygulanmaz. Dışarıdan içerik okuyan agent'ların tehlikeli araçları kapalıdır — *agent çalıştırma gelince (Faz 2) yapılacak*
- [ ] 🔒 **Sandbox:** auto moddaki agent'lar izole bir ortamda çalışır (worktree + kısıtlı dosya ve ağ erişimi) — *agent çalıştırma gelince (Faz 2) yapılacak*
- [x] 🛑 **Acil Durdur butonu:** tüm çalışan agent'ları, zamanlanmış işleri ve uzak komutları tek tıkla durdurur (üst barda her zaman görünür) — buton + durdurma kaydı hazır; çalışan her yeni iş buna kaydolacak
- [x] `godeye doctor`: kurulum sorunlarını sade dille anlatır ve çözüm önerir
- [x] CI: GitHub Actions ile lint + test + Docker build

**Bitti sayılır:** Temiz bir makinede tek komutla açılıyor, dil değişiyor, koyu ve açık tema çalışıyor, imaj < 400 MB.

---

### Faz 1 — Göz: Session Toplama, Hafıza ve Özetler ⭐

**Hedef:** Tüm AI çalışmalarını görmek ve her şeyi otomatik hatırlamak.

#### 1.1 Adaptörler (araçtan bağımsız toplama)
- [x] ⭐ Ortak adaptör arayüzü (`packages/adapters/types.ts`) — *`apps/server/src/adapters/types.ts`*
- [x] ⭐ **Claude Code:** `~/.claude/projects/*/*.jsonl` watcher + parser (mesajlar, araç kullanımları, token'lar) — *artımlı okuma: sadece yeni satırlar işlenir; alt-agent kayıtları şimdilik atlanıyor*
- [x] ⭐ **Git:** commit ve diff izleyici. Hangi araç kullanılırsa kullanılsın değişiklikler yakalanır — *commit geçmişi her dakika okunuyor; branch, önde/geride, değişiklikler, son commit*
- [x] **Codex:** `~/.codex/sessions` watcher + parser — *bilinen rollout formatına göre yazıldı ve testli; gerçek Codex dosyalarıyla henüz doğrulanmadı (bilgisayarda Codex yok)*
- [x] **Gemini CLI** ve **Antigravity** adaptörleri (format araştırması: bkz. Açık Sorular) — *Gemini CLI: yayınlanan formata göre (tüm dosya JSON, proje klasörü sha256 ile eşleşir), gerçek kurulumla doğrulanmadı; Antigravity'nin açık bir dosya formatı yok*
- [x] Ortak `event` formatına dönüştürme + tekrar eden kayıtları ayıklama — *tüm araçlar aynı mesaj/sayaç yapısına dönüşüyor*

#### 1.2 Projeler
- [x] ⭐ Proje keşfi: session'lardan ve seçilen klasörlerden otomatik bulma
- [x] ⭐ Proje ekleme, çıkarma, yeniden adlandırma, gizleme — *klasör ekleme, yeniden adlandırma, gizleme*
- [x] Proje kartı: sağlık puanı, son aktivite, aktif session sayısı, dil ve framework rozetleri
- [x] Her projenin **kendine ait** hafızası, session'ları, dersleri ve puanları vardır. Projeler birbirine karışmaz

#### 1.2b 🗂️ Çalışma Alanları ve Ortamlar (Lokal / Sunucu / Takım)

> Örnek: Bilgisayarımda 9 proje var, her birinin kendi session'ları ve hafızası var. Bir VPS'te yayında 2 proje var ve arkadaşım da onlara bağlı. Bunların hepsi tek uygulamada ama **birbirinden bağımsız** görünmeli.

- [x] ⭐ Sol üstte **çalışma alanı seçici:** — *Tüm alanlar · Bilgisayarım · Takım · her sunucu*
  - 💻 **Bilgisayarım (Lokal):** sadece benim bilgisayarımdaki projeler. Varsayılan olarak **özel**, kimseyle paylaşılmaz
  - 🖧 **Sunucu: `prod-vps-1`:** o sunucudaki projeler (SSH ile bağlı), sunucunun sağlık durumu, kim bağlı
  - 🤝 **Takım: `Ekip Adı`:** Hub üzerinden paylaşılan projeler, üyeler ve kim online
- [x] ⭐ Her proje tek bir çalışma alanına aittir. Lokal projeler, sunucu ve takım projelerinden tamamen bağımsızdır. Biri bozulsa diğeri etkilenmez
- [x] ⭐ **Ortamlar (proje içinde):** bir projenin birden fazla ortamı olabilir: **Local · Staging · Prod** — *Ortamlar sekmesi: sunucu, klasör, branch, commit, son deploy, .env (Bölümler → .env)*
  - Ortam sekmesinde her ortamın adresi, sunucusu, son deploy'u, çalışan sürümü, sağlığı ve `.env`'i ayrı görünür
  - "Local'de çalışan sürüm ile Prod'daki sürüm arasındaki fark" (commit farkı, `.env` anahtar farkı)
- [x] **Bağlama (opsiyonel):** aynı projenin lokal kopyası ile sunucudaki kopyası aynı git reposundan geliyorsa God Eye bunu fark eder ve "Bunlar aynı proje, ortamları bağlayayım mı?" diye sorar. Bağlanınca tek proje + iki ortam olur, hafıza ortak kalır. Bağlanmazsa ikisi tamamen ayrı kalır — *sunucudaki klasör ortam olarak eklenir; commit'leri lokal repoyla karşılaştırılır*
- [x] Sunucudaki projelerde kodun asıl kaynağı git'tir. Önerilen akış: lokalde geliştir → test → deploy. Acil durumda doğrudan sunucuda düzeltme (SSH, onaylı, kayıtlı, önce yedek alınır) — *sunucu dosya gezgini: kaydetmeden önce yedek; sunucuda git dışı değişiklik deploy'u durdurur*
- [x] **Sunucu CPU'su harcanmaz:** AI agent'ı her zaman kendi bilgisayarında çalışır, sunucuya sadece SSH komutları gider
- [x] Çalışma alanları arası genel bakış: "Tüm alanlarda bugün ne oldu" ekranı — *Projeler sayfasında "Bugün" satırı*

#### 1.2c 🔀 Proje Kimliği, Git ve Deploy Akışı

> Örnek akış (PoultryCare): Ben PC'de yazıyorum → GitHub'a push → arkadaşım pull → VPS'te pull → deploy.
> **God Eye bu akışı değiştirmez ve bozmaz.** Kod her zaman git ile taşınır. God Eye kodu kopyalamaz, senkron etmez, kendiliğinden push etmez.
> Yaptığı tek şey bu akışı **görünür ve güvenli** yapmak.

- [x] ⭐ **Proje kimliği = git remote adresi** (ör. `github.com/ben/poultrycare`). Benim PC'mdeki, arkadaşımın PC'sindeki ve VPS'teki kopya otomatik olarak **aynı proje** olarak tanınır. Hafıza, session'lar ve kararlar tek projede birleşir; her kopya ayrı bir **ortam/konum** olarak görünür — *SSH ve HTTPS adresleri aynı kimliğe dönüşüyor*
- [x] ⭐ **Akış görünümü (pipeline):** — *Ortamlar: bu bilgisayar (commit edilmemiş/push edilmemiş) → her sunucu (commit, geride/ileride, git dışı değişiklik)*
  ```
  💻 Mohamed PC ──push──▶ 🐙 GitHub main ──pull──▶ 💻 Kerim PC
     a1b2c3 (2 commit önde)    d4e5f6                   d4e5f6 ✅
                                  │
                                  └──pull+deploy──▶ 🖧 VPS (prod)
                                                     c7d8e9 ⚠️ 3 commit geride
  ```
  Her konumun hangi commit'te olduğu, kimin önde veya geride olduğu, commit edilmemiş değişiklikler
- [x] ⭐ **Erken uyarılar:** — *geride/commit/push uyarıları + sunucuda git dışı değişiklik, farklı branch, gelecek migration'lar, sunucu .env'inde eksik anahtarlar*
  - "Kerim 3 commit push etti, sen geridesin. Önce pull yap" (çakışmayı başlamadan önler)
  - "Kerim'in de değiştirdiği `auth.ts` dosyasını değiştiriyorsun" (pull öncesi çakışma tahmini)
  - "VPS'te commit edilmemiş değişiklik var (biri sunucuda doğrudan düzenleme yapmış). Pull bunu bozabilir" (**drift tespiti**)
  - "Bu commit'lerde veritabanı migration'ı var, deploy sırasında dikkat"
  - "Testler bu commit'te başarısız, deploy etme"
- [x] **Güvenli Deploy butonu:** ön kontroller (testler geçti mi, VPS temiz mi, migration var mı, `.env`'de yeni anahtar gerekiyor mu) → onay → SSH ile `git pull` + build/yeniden başlatma — *prod'da ortam adını yazarak onay*
- [x] Deploy geçmişi: kim, ne zaman, hangi commit, sonuç
- [x] Önerilen git düzeni (ayarlanabilir): herkes kendi branch'inde çalışır → PR → `main` → sadece `main` deploy edilir. Sunucuda doğrudan düzenleme yapılmaz (acil durum hariç) — *açıkken main'e doğrudan commit öncesi sorulur*
- [x] (Opsiyonel) GitHub Actions ile otomatik deploy kurulumu: God Eye workflow dosyasını hazırlar
- [ ] 🔒 **AI agent'ları asla kendiliğinden `push` etmez veya deploy etmez.** Agent'lar izole worktree/branch'te çalışır, birleştirme ve push her zaman onaylıdır — *agent çalıştırma ile (Faz 2/8)*

#### 1.3 Otomatik hook'lar
- [x] ⭐ Proje eklenince hook'lar otomatik kurulur. **Repoya commit edilmeyen** dosyalara yazılır (`.claude/settings.local.json`, Codex eşdeğeri) → arkadaşının reposu ve VPS etkilenmez — *karar: güvenlik için proje başına tek tık + onay (Kurulum sekmesi)*
- [x] ⭐ God Eye repoya hiçbir dosya eklemez. Gerekirse `.git/info/exclude` kullanılır, `.gitignore` bile değişmez
- [x] ⭐ `SessionStart`: proje hafızasının kısa özetini yeni session'a enjekte eder (≤ 1.5k token)
- [x] ⭐ `Stop` / `SessionEnd`: özet üretme + hafıza güncelleme + puan yeniden hesaplama tetiklenir — *SessionEnd ile; watcher zaten yeni satırları 3 sn içinde alıyor*
- [x] `PostToolUse`: değişen dosyaları ilgili kategoriye işaretler — *değişen dosyalar session'a yazılır, bölüm sayfasında o bölümün session'ları olarak görünür ve yeniden taramayı tetikler*
- [x] Hook'lar devre dışı kalırsa watcher yedek olarak aynı işi yapar

#### 1.4 Proje hafızası
- [x] ⭐ Bölümler: **Kararlar · Fazlar/Durum · Denenip Olmayanlar · Konvansiyonlar · Açık Sorunlar**
- [x] ⭐ Her session sonunda otomatik güncelleme (ucuz model) — *Haiku ile, kullanıcının login'i; ayarlardan kapatılabilir*
- [x] Her hafıza maddesi kaynağına bağlı ("bu karar şu session'da, şu mesajda alındı")
- [x] Çelişki tespiti: yeni bilgi eskisiyle çelişirse kullanıcıya sorulur — *çelişen bilgi "hangisi doğru?" kartıyla bekler, çözülene kadar session'lara gitmez*
- [x] Hafıza düzenleme arayüzü (elle düzeltme ve silme) — *ekle, düzenle, unut*
- [x] MCP aracı: `memory_get(proje, bölüm)`, `memory_search(soru)` — *`godeye_project_memory`, `godeye_search`, `godeye_recent_sessions`; Ayarlar'dan Claude'a tek tıkla eklenir*

#### 1.5 İnsan dilinde özetler
- [x] ⭐ Session özeti TR + EN: **Ne yapıldı · Neden · Ne kaldı · Risk var mı** — *kullanıcının dili + İngilizce*
- [x] Günlük ve haftalık proje özeti — *aktivite olan günler için otomatik; istenince anında*
- [x] Zaman tüneli: projenin baştan bugüne hikâyesi, tıklanabilir — *session'lar ve commit'ler gün gün*
- [x] Özet tonu ayarı: "Teknik" / "Sade"

#### 1.6 Otomatik model yönlendirme
- [x] Görev sınıflandırıcı: özet ve etiketleme → Haiku; normal iş → Sonnet; mimari ve zor hata → Opus (Codex için eşdeğerleri) — *arka plan işleri Haiku'da; chat'te yazdığına göre Opus/Haiku önerisi çıkar, tek tıkla geçilir (session devam eder)*
- [ ] Persona bazlı varsayılan model + görev bazlı üst sınır — *Faz 6*
- [x] Kullanıcı her zaman elle değiştirebilir

#### 1.7 Arama
- [x] ⭐ Global arama (`Ctrl+K`): session'lar, kararlar, dosyalar, dersler — *SQLite FTS5; prompt'lar, cevaplar ve araç adımları*
- [x] Doğal dilde arama: "giriş sayfasını hangi gün yapmıştık?" — *dolgu kelimeler atlanır, eşleşme azsa her kelime aranır; ayrıca "AI'a sor" kaynaklı cevap verir*

#### 1.8 🩺 Session Sağlığı (halüsinasyonun kök sebebine karşı)

> Çok uzun session'lar halüsinasyonun ve unutmanın en büyük sebebidir. Sistem bunu ölçer ve önler.

- [x] ⭐ **Bağlam doluluk göstergesi:** her session'da context penceresinin ne kadar dolu olduğu (🟢 %0–50 · 🟡 %50–80 · 🔴 %80+)
- [x] ⭐ **Sağlık puanı:** uzunluk, tekrarlanan hatalar, kendisiyle çelişme, aynı dosyayı tekrar tekrar bozma, "unuttum" belirtileri
- [x] ⭐ **"Temiz sayfa" önerisi:** sağlık düşünce *"Bu session yoruldu. Özetleyip yeni bir session'da devam edeyim mi?"* → tek tıkla devir özeti + yeni session (hafıza ile birlikte)
- [x] Otomatik sıkıştırma (compact) önerisi, ne zaman gerektiğinin açıklamasıyla
- [x] Session'da hangi dosyaların ve kararların bağlamda olduğunu gösteren "AI şu an neyi biliyor" paneli — *son okunan/düzenlenen dosyalar + hafızanın verilip verilmediği*

#### 1.9 🔎 Halüsinasyon Dedektörü
- [x] ⭐ AI'ın bahsettiği **dosya, fonksiyon, değişken ve komutlar gerçekten var mı?** Otomatik kontrol edilir, yoksa uyarı verilir — *düzenlenen ve cevaplarda bahsedilen dosyalar diskte kontrol ediliyor; fonksiyon düzeyi kontrol Faz 5 kod analizi ile*
- [x] ⭐ **Paket kontrolü:** AI'ın önerdiği npm/pip paketleri gerçekten var mı, popüler mi, yeni açılmış şüpheli bir paket mi? (uydurma paket adlarıyla yapılan saldırılara, yani "slopsquatting"e karşı) — *npm ve PyPI; olmayan ve az kullanılan paketler işaretlenir*
- [x] "Testler geçti" ve "build başarılı" gibi iddialar gerçek çıktı ile karşılaştırılır — *başarısız adımdan hemen sonra gelen "çalıştı/geçti" iddiaları işaretlenir*
- [ ] API ve kütüphane kullanımı, kurulu sürümün dokümanıyla karşılaştırılır ("bu fonksiyon v5'te kaldırıldı") — *kütüphane/dokümanlar ile (Faz 7)*
- [x] Proje hafızasıyla çelişen ifadeler işaretlenir ("hafızaya göre DB PostgreSQL, AI MySQL diyor") — *özetin "Kontrol et" kısmında ⚠ ile*
- [x] Her session'ın sonunda "Doğrulanmamış iddialar" listesi

**Bitti sayılır:** Mevcut tüm Claude session'larım projelere ayrılmış, her birinin TR/EN özeti var, yeni bir session açtığımda proje hafızası otomatik geliyor.

---

### Faz 2 — Çalışma Alanı: Terminal, Chat, Kod, Sunucular, Hızlı Soru ⭐

**Hedef:** Terminale ve VS Code'a hiç girmeden her şeyi tarayıcıdan yapmak.

#### 2.1 Gömülü terminal (tam uyumluluk)
- [x] ⭐ xterm.js + node-pty: gerçek `claude`, `codex` ve `gemini` TUI'leri tarayıcıda çalışır — *node-pty yerine Bun'ın yerleşik PTY'si; kullanıcının gerçek login kabuğu*
- [x] ⭐ Sekmeli çoklu session; her sekmede proje, araç, hesap ve durum rozeti — *JetBrains tarzı sekmeler, proje adı ve durum noktası*
- [x] ⭐ Sayfa kapansa bile session arka planda yaşar, tekrar açınca kaldığı yerden devam eder — *son 512 KB çıktı tekrar bağlanınca geri gelir; God Eye yeniden başlarsa terminaller kapanır*
- [x] Canlı durum: çalışıyor, bekliyor, onay bekliyor, hata — *"cevabını bekliyor" durumu menüde rozet olarak görünür*
- [x] Session'ı kopyalama (fork) ve devam ettirme (resume) — *session sayfasında: devam et, kopyala ve devam et, özetle temiz başla*

#### 2.2 Chat görünümü (rahat arayüz)
- [x] ⭐ `claude -p --output-format stream-json` ve `codex exec --json` üzerinden zengin chat — *Claude için uzun ömürlü stream-json süreci, canlı yazma; Codex chat'i kalan iş (Codex terminalde tam çalışıyor)*
- [x] ⭐ İzin onayları butonla: "Bu dosyayı düzenleyebilir mi?" ✅ ❌ "Hep izin ver" — *İzin ver · Hep izin ver · Reddet; Claude Code'un stdio izin protokolüyle*
- [x] Araç kullanımları katlanabilir kartlar halinde (okunan dosya, çalıştırılan komut) — *Bash, Read, Edit, Write, Grep, WebFetch, TodoWrite (yapılacaklar listesi olarak)*
- [x] Değişiklikler diff görünümünde, dosya bazında kabul veya red — *izin kartında ve araç kartında satır diff'i; dosya bazında red = izni reddetmek*
- [x] Resim ve ekran görüntüsü yapıştırma, dosya sürükle bırak — *yapıştırma veya seçme; dosya sürükle bırak kalan iş*
- [x] Mesaj kutusunun altında araç, hesap, model ve persona seçici — *model seçici + öneri, yeni sohbeti seçilen hesapta başlatma; persona Faz 6*
- [x] Slash komutları için otomatik tamamlama — *chat'te `/`: projenin ve kullanıcının Claude komutları + kayıtlı prompt'lar*
- [x] **Mod seçici:** Normal (her şeye onay) · Düzenlemeleri kabul et · **Auto** (izole worktree'de otomatik, sonunda özet ve onay) — *Bana sor · Düzenlemeleri kabul et · Otomatik · Sadece plan; izole worktree Faz 8*

#### 2.3 Kod görünümü (VS Code gibi)
- [x] ⭐ Dosya ağacı + Monaco editör: sekmeler, sözdizimi renklendirme, arama, mini harita — *Monaco lokal paketli (CDN yok); sekmeler, Ctrl+S, "diskte değişti" koruması*
- [x] ⭐ **Vim modu** (ayarlardan aç/kapat): normal, insert ve visual modlar, `:w`, `:q`, `/arama`, makrolar, register'lar, `.vimrc` benzeri özel tuş eşlemeleri, durum çubuğunda mod göstergesi — *monaco-vim; durum çubuğunda mod göstergesi; özel tuş eşlemeleri kalan iş*
- [x] Vim tarzı gezinme uygulamanın geneline de yayılır (opsiyonel): listelerde `j/k`, `gg/G`, `/` ile arama, `Esc` ile geri — *j/k, gg/G, /*
- [x] Hazır tuş düzenleri: VS Code, JetBrains, Vim, Emacs
- [x] Dosyada "Bunu AI'a sor" ve "Bunu açıkla" sağ tık menüsü — *editörde sağ tık → "Bunu AI'a sor" (seçim ya da satır)*
- [x] Dosya içinde ve projede arama/değiştirme — *projede bul-değiştir: önizleme, regex/büyük-küçük harf, uygulamadan önce otomatik anlık görüntü*
- [x] Git paneli: değişiklikler, diff, commit, branch, worktree listesi — *branch oluşturma/geçiş (commit edilmemiş değişiklik varsa durur)*
- [x] Git checkpoint: her AI işinden önce otomatik kayıt, tek tıkla geri alma — *chat'te her turdan önce ve AI terminali açılırken; gizli git ref'lerinde, branch/index/geçmişe dokunmadan; geri yüklemenin kendisi de geri alınabilir*
- [x] Hangi satırı hangi session'ın değiştirdiğini gösterme ("AI blame") — *git blame + o dosyayı o saatlerde değiştiren session; satır sonunda not*

#### 2.4 Bilgisayar ve internet erişimi
- [x] 🔒 Dosya erişimi izinli klasörlerle sınırlı (ayarlardan eklenir); Docker'da volume olarak bağlanır — *projeler + Ayarlar/Dosyalar'dan eklenen klasörler; symlink ve ../ ile dışarı çıkılamaz*
- [x] ⭐ **📂 Dosya Yöneticisi** (izinli klasörler içinde, Finder/Dolphin gibi): — *liste/ızgara, yeni klasör, yeniden adlandırma, çöp kutusu + geri yükleme, yükleme (sürükle bırak), indirme, isim arama, disk kullanımı, önizleme ve düzenleme; çift panel ve sunucu (SFTP) kalan iş*
  - Liste, ızgara ve ağaç görünümü; çift panel modu (iki klasör yan yana; biri sunucu olabilir)
  - Kopyala, taşı, yeniden adlandır, yeni klasör/dosya, sürükle bırak
  - Silinenler önce **God Eye çöp kutusuna** gider (geri alınabilir)
  - Yükleme, indirme, zip açma/sıkıştırma
  - Hızlı arama (isim + içerik), filtreler (tür, boyut, tarih), son kullanılanlar, favoriler
  - Her dosyada önizleme (bkz. 2.9) ve "AI'a sor / açıkla / özetle"
  - Sunucu dosyaları SFTP ile aynı arayüzde (bkz. 2.5); lokal ↔ sunucu arası sürükle bırak
  - Toplu işlemler: çoklu seçim, toplu yeniden adlandırma
  - Disk kullanımı görünümü: hangi klasör ne kadar yer kaplıyor
  - Vim tuşlarıyla gezinme (`j/k`, `h/l`, `/`)
- [x] Agent'lar için web arama ve web sayfası okuma araçları (MCP üzerinden) — *Claude Code'un kendi WebSearch/WebFetch araçları; ayrı MCP gerekmedi*
- [x] 🔒 Hassas klasörlerin **dosya olarak okunması** varsayılan olarak yasak (`~/.ssh` içindeki anahtarlar, tarayıcı profilleri vb.). Bu, SSH ile bağlanmayı engellemez (bkz. 2.5)

#### 2.5 🖧 Sunucular (SSH ile uzaktaki makinelerde iş yapma)
- [x] ⭐ Doğal dille komut: *"195.2.x.x'e gir, disk doluluğuna bak ve nginx'i yeniden başlat"* → agent SSH ile bağlanıp yapar — *Claude, MCP aracı `godeye_server_run` ile ister; okuma hemen çalışır, değiştiren komutlar Gelen Kutusu'nda onay bekler*
- [x] ⭐ Sunucular sayfası: kayıtlı sunucular (isim, adres, kullanıcı, etiket: **prod** / test), bağlantı testi — *sağlık kartları, disk/bellek, container'lar, çöken servisler, SSH terminali*
- [x] Mevcut `~/.ssh/config` içindeki sunucuları otomatik içeri alma — *sadece config okunur, anahtarlar asla*
- [x] 🔒 Bağlantı **ssh-agent** üzerinden yapılır. Özel anahtar dosyası God Eye tarafından okunmaz ve AI'a asla gösterilmez — *sistem ssh'ı çağrılır; hedefler ssh seçeneği enjekte edilemeyecek şekilde doğrulanır*
- [x] 🔒 Komut sınıflandırma: **okuma** komutları (log, durum, disk) serbest; **değiştiren** komutlar (restart, deploy, config) onaylı; **tehlikeli** komutlar (`rm -rf`, `DROP`, `mkfs`, firewall) çift onaylı — *tanınmayan her komut "değiştirir" sayılır; tehlikeli komutta sunucu adını yazmak gerekir*
- [x] 🔒 Prod etiketli sunucularda her değiştiren komut önce "Ne yapacağım ve neden" açıklamasıyla gösterilir, sonra çalıştırılır — *onay penceresinde komut, risk ve "canlı sunucu" uyarısı; agent istekleri gerekçesiyle gelir*
- [x] Denetim kaydı: her uzak komut, kimin hangi persona ile çalıştırdığı, çıktısı ve zamanıyla kaydedilir (takımla paylaşılır) — *kim (sen / AI), komut, risk, çıktı, süre; takımla paylaşım Faz 4*
- [x] Hafif izleme (sunucuya hiçbir şey kurmadan): belirli aralıklarla SSH üzerinden uptime, disk, RAM, `docker ps`, son hatalar — *5 dakikada bir, sadece okuyan tek komut*
- [x] Sunucu kartı: sağlık durumu, son deploy, son hatalar, "DevOps'a sor" butonu — *sağlık + son deploy'lar; "DevOps'a sor" Faz 6*
- [x] Sunucudaki bir projeyi God Eye projesine bağlama: kod git'ten gelir, canlı ortam SSH ile izlenir
- [x] Sunucu dosyalarını görüntüleme ve düzenleme (SFTP), değişiklikten önce otomatik yedek — *SSH üzerinden; anahtar ve kimlik klasörleri hiç açılmaz*

#### 2.6 ⚡ Hızlı Soru (btw)
- [x] ⭐ Her ekranda `Ctrl+Space` ile açılan yan panel — *editörde Ctrl+Shift+Space (orada Ctrl+Space otomatik tamamlama)*
- [x] ⭐ Ayrı session: ana chat'e dokunmaz, onun geçmişini bozmaz
- [x] Ana session'ın bağlamını salt okunur alır, yani "şu an ne yapıyorduk" bilgisini bilir — *"Hızlı": hafıza + özet + son mesajlar (Haiku); "Tam bağlam": session'ın kaydedilmeyen, araçsız kopyası*
- [x] Varsayılan model hızlı ve ucuz olanıdır, istenirse yükseltilir
- [x] Cevap tek tıkla ana session'a not olarak gönderilebilir — *açık terminale yazar (Enter'a basmaz), değilse panoya kopyalar*
- [x] Hızlı soru geçmişi — *proje başına*

#### 2.6b 📥 Gelen Kutusu (dikkatini isteyen her şey tek yerde)
- [ ] ⭐ Onay bekleyen agent'lar, @bahsetmeler, başarısız testler, düşen puanlar, limit uyarıları, zamanlanmış iş raporları, deploy sonuçları, takımdan öneriler — *cevap bekleyen terminaller ve hafıza çelişkileri hazır; diğer kaynaklar ilgili fazlarla eklenecek*
- [x] Öncelik sıralaması: 🔴 acil · 🟡 bugün · ⚪ bilgi — *onaylar (acil) · cevap bekleyen session'lar (bugün) · hafıza kararları (bilgi)*
- [x] Tek tıkla aksiyon: onayla, reddet, aç, ertele — *onayla, reddet, aç, ertele (4 saat)*
- [ ] Ayrıca "Sıfır gelen kutusu" hedefi: her şey ya halledilir ya ertelenir

#### 2.6c 💡 Fikir Kutusu (çok fikir gelen biri için)
- [x] ⭐ Aklına gelen her fikri tek satırla at (her ekrandan `Ctrl+I`, sesli de olabilir) — *Ctrl+I; sesli giriş Faz 11*
- [x] PM personası fikirleri otomatik sınıflandırır: hangi proje, hangi faz, ne kadar iş, ne kadar değerli — *tek tıkla: proje, tür, iş büyüklüğü, değer, kısa not*
- [ ] Haftalık fikir değerlendirmesi: CEO Danışmanı ile "Hangilerini yapalım, hangilerini bırakalım?" — *CEO Danışmanı personasıyla (Faz 6)*
- [ ] Onaylanan fikir tek tıkla plana ve görev panosuna eklenir — *durumlar (Yapılacak/Sonra/Bırakıldı) hazır; görev panosu Faz 8*
- [x] Hiçbir fikir kaybolmaz, ama hiçbir fikir de odağı bozmaz

#### 2.7 Prompt kütüphanesi
- [x] Prompt kaydetme, etiketleme, değişkenli şablonlar (`{dosya}`, `{proje}`)
- [x] Chat'te `/` ile hızlı çağırma
- [ ] Personalar da bu kütüphaneyi kullanabilir — *Faz 6*
- [x] En çok işe yarayan prompt'ları otomatik öne çıkarma — *kullanım sayısına göre*

#### 2.8 Session devri
- [x] Bir session'ı bağlamıyla birlikte başka araca veya hesaba devretme (Claude → Codex) — *session sayfasında "Codex'e / Claude'a devret"; hesap değiştirme Faz 3*
- [x] Devir özeti otomatik hazırlanır: ne yapıldı, nerede kalındı, sıradaki adım

#### 2.9 📄 Dosya önizleyici (her şeyi uygulama içinde aç)
- [x] PDF görüntüleyici: sayfa küçük resimleri, arama, yakınlaştırma, "bu sayfayı AI'a sor"
- [x] Markdown: canlı önizleme + düzenleme (Mermaid diyagramları, tablolar, kod blokları dahil)
- [x] Resim (PNG, JPG, SVG, WebP), video ve ses — *güvenlik için sandbox içinde sunuluyor*
- [x] CSV ve Excel → tablo görünümü (sıralama, filtre) — *CSV/TSV ve .xlsx (sayfa seçimi); sıralama/filtre sonra*
- [x] JSON, YAML ve TOML → ağaç görünümü
- [x] Word ve PowerPoint → salt okunur önizleme — *.docx biçimli, .pptx slayt metinleri*
- [x] Log dosyaları → renkli, filtrelenebilir, canlı takip (`tail -f` gibi) — *seviye renkleri, filtre, sadece hatalar, canlı takip*
- [x] Her önizlemede "Bunu açıkla" ve "Bunu özetle" butonları — *dosya yöneticisinde ve kod görünümünde*

**Bitti sayılır:** Bir gün boyunca terminal açmadan, sadece God Eye ile bir projede çalışabiliyorum.

---

### Faz 3 — Hesaplar ve Limitler ⭐

**Hedef:** `/login` derdine son vermek ve neyin nereye harcandığını görmek.

#### 3.1 Hesap yöneticisi
- [x] ⭐ Sağlayıcı başına birden fazla hesap: Claude, Codex, Gemini, Antigravity (adaptörle genişler) — *Claude ve Codex; Gemini/Antigravity araçları kurulunca*
- [x] ⭐ Her hesap kendi izole config klasöründe tutulur (Claude: `CLAUDE_CONFIG_DIR`, Codex: `CODEX_HOME`). Çıkış yapıp tekrar giriş yapmaya gerek kalmaz — *mevcut ~/.claude otomatik "Ana" hesap; yeniler ~/.godeye/accounts altında; her hesabın session'ları da izlenir*
- [x] ⭐ Hesap ekleme sihirbazı: login bir kere web terminalinde yapılır, sonra hep hazırdır — *login web terminalinde `claude auth login` / `codex login`; gerçek giriş akışı henüz denenmedi (tarayıcı açtığı için)*
- [x] ⭐ Üst barda aktif hesap + tek tıkla geçiş; yeni session'lar seçilen hesapla açılır — *hesap adı + 5 saatlik doluluk; terminal, sohbet, özet ve hızlı soru seçili hesapla açılır; devam edilen session kendi hesabında açılır*
- [x] Proje bazında varsayılan hesap (ör. iş projeleri iş hesabıyla) — *proje Kurulum sekmesinde*
- [x] Hesap sağlık kontrolü: oturum düşmüş mü, token yenilenmeli mi — *`claude auth status` ile 30 dakikada bir: giriş var mı, e-posta, plan*
- [x] 🔒 Credential dosyaları `chmod 600`; hiçbir yere gönderilmez, loglara yazılmaz

#### 3.2 📊 Limitler sayfası
- [x] ⭐ Her hesap için 5 saatlik ve haftalık limit çubukları + sıfırlanma geri sayımı — *Claude'un kendi bildirdiği gerçek doluluk; her God Eye Claude çağrısında ek maliyetsiz güncellenir*
- [x] ⭐ **Ne, nerede, ne zaman:** zaman çizelgesi grafiği; proje, persona, session ve model bazında kırılım — *14 günlük proje kırılımlı grafik, proje/model/saat dağılımı; persona kırılımı Faz 6*
- [x] "En çok harcayan 10 session" listesi; tıklayınca session açılır
- [x] Günlük, haftalık ve aylık raporlar — *aylık tablo + CSV indirme*
- [x] Tahmin: "Bu hızla limit saat 16:40'ta dolar" — *son ölçümlerden saatlik hız; sıfırlanmadan önce dolacaksa saatini söyler*
- [x] Uyarılar: limitin %80 ve %95'inde bildirim + "şu hesaba geç" önerisi — *%80 ve üstü Gelen Kutusu'nda acil + üst bar renk değişimi + "başka hesaba geç / Codex'e devret" önerisi; masaüstü bildirimi Faz 11*
- [ ] Bütçe kuralları: persona veya zamanlanmış iş başına üst sınır — *zamanlanmış işler (Faz 9) ve personalar (Faz 6) ile*

**Bitti sayılır:** Hesaplar arasında tek tıkla geçiyorum, hangi projenin limitimi ne zaman yediğini grafikte görüyorum.

---

### Faz 4 — 🤝 Takım ve Senkronizasyon (Hub)

**Hedef:** Ben ve arkadaşlarım aynı projeleri, session'ları ve hafızayı **canlı ve aynı şekilde** görelim. Herkesin işlemi kendi bilgisayarında yapılsın. VPS sadece taşıyıcı olsun, neredeyse hiç kaynak kullanmasın. Çakışma ve veri sızıntısı olmasın.

#### 4.0 Nasıl çalışıyor (kısaca)
1. Her kullanıcının bilgisayarında God Eye çalışır. **AI, kod, git ve terminal işlemlerinin hepsi oradadır.**
2. Bir şey olduğunda (prompt yazıldı, agent cevap verdi, karar alındı), bu bir **event** olarak önce lokal SQLite'a yazılır. Uygulama hemen bunu gösterir ve beklemez.
3. Event bilgisayarda **şifrelenir** ve WebSocket ile Hub'a gönderilir.
4. Hub şifreli event'i saklar ve o projenin diğer üyelerine **anında iletir**. İçeriğini okuyamaz.
5. Arkadaşımın God Eye'ı event'i alır, şifresini çözer ve kendi lokal SQLite'ına yazar. Ekranında **1 saniyeden kısa sürede** görünür.
6. İnternet giderse her şey çalışmaya devam eder. Bağlantı gelince bekleyen event'ler gönderilir ve alınır.

#### 4.1 Neden çakışma olmaz
| Veri türü | Yöntem | Neden çakışmaz |
|---|---|---|
| Session mesajları, prompt'lar, araç kullanımları, commit'ler, test sonuçları, dersler | **Append-only event log** (ULID + `author_id` + `device_id`) | Kimse başkasının kaydını değiştirmez, herkes sadece yeni kayıt ekler. Sıra ULID ile belirlenir |
| Proje hafızası, plan, görev panosu, prompt kütüphanesi, persona tanımları | **Yjs CRDT** | İki kişi aynı anda düzenlese bile değişiklikler matematiksel olarak çakışmasız birleşir (Google Docs gibi) |
| Basit ayarlar (proje adı, etiketler) | **Son yazan kazanır** (hybrid logical clock ile) | Nadiren değişir; değişiklik geçmişi tutulur |
| **Kodun kendisi** | **Git** (GitHub/Gitea) | Hub kod taşımaz. Git zaten doğru araç. God Eye çakışmaları **önceden** haber verir (bkz. 4.4) |

- [x] ⭐ Event log replikasyonu: "şu imleçten sonrakileri ver" protokolü, toplu gönderim, sıkıştırma — *imleç + toplu gönderim var; sıkıştırma sonra*
- [ ] ⭐ Yjs entegrasyonu: ortak dokümanlar için senkron + offline düzenleme — *şimdilik hafızada "son yazan kazanır"; plan/görev panosu gelince Yjs*
- [x] Çevrimdışı kuyruk + yeniden bağlanınca otomatik eşitleme
- [x] Bütünlük kontrolü: hash zinciri ile eksik veya bozuk event tespiti ve otomatik onarım — *her cihaz event'lerini proje başına numaralar ve bir öncekinin hash'ine bağlar (şifrelemenin içine mühürlü); boşluk önce hub'dan tekrar alınır, hub'da da yoksa gönderen cihaz durumunu yeniden gönderir*
- [x] Senkron durumu göstergesi: güncel · eşitleniyor · çevrimdışı (bekleyen: 12) — *üst barda*

#### 4.2 🔒 Sızıntısız güvenlik
- [x] ⭐ **Uçtan uca şifreleme:** veri bilgisayardan şifreli çıkar. Hub ele geçirilse bile içerik okunamaz — *AES-GCM (WebCrypto), proje başına anahtar; testte hub DB'sinde düz metin olmadığı doğrulandı*
- [x] ⭐ Takım anahtarı her üyenin cihaz anahtarıyla sarılarak dağıtılır. Üye çıkarılınca anahtar yenilenir (rotation) — *ECDH P-256 cihaz anahtarları; davet kodunda artık anahtar yok, admin cihazı onaylar; üye çıkarılınca yenileme önerilir*
- [x] ⭐ **Asla senkron edilmeyenler:** AI hesap bilgileri (Claude/Codex login'leri), SSH anahtarları, `.env` dosyaları, izinli olmayan klasörler
- [x] ⭐ **Sır temizleyici:** event çıkmadan önce API key, token, şifre ve özel anahtar desenleri (gitleaks kuralları) otomatik maskelenir: `sk-ant-••••`
- [x] Proje bazında paylaşım seviyesi: **Kapalı** (hiç paylaşılmaz) · **Özet** (sadece özetler, hafıza ve kararlar) · **Tam** (tüm session'lar canlı)
- [x] Session bazında "Bu session gizli" anahtarı — *gizli yapınca takım arkadaşlarının kopyası da silinir*
- [x] "Ne paylaşılıyor?" önizlemesi: dışarı giden veriyi görebilme
- [x] TLS (Caddy ile otomatik HTTPS), argon2id parola, opsiyonel 2FA, oturum ve cihaz listesi, uzaktan cihaz iptali — *TOTP 2FA (her doğrulama uygulamasıyla)*
- [x] Hub erişim logları ve şüpheli giriş uyarısı — *15 dk'da 5 başarısız deneme ve yeni adresten giriş adminlere anında bildirilir*
- [x] Kurtarma anahtarı: tüm cihazlar kaybolursa veriye erişim için (kullanıcı saklar)

#### 4.3 👤 Kullanıcılar ve yetkiler
- [x] ⭐ Hub yöneticisi kullanıcıları oluşturur: kullanıcı adı + şifre (sen belirlersin), veya **davet linki** (e-posta veya mesajla gönderilir, süreli, tek kullanımlık) — *tek kopyala-yapıştır davet kodu (hub + kullanıcı + geçici şifre + takım anahtarı); ilk girişte şifre değişir*
- [x] ⭐ Davet ederken rol ve projeler seçilir: "Kerim → PoultryCare (Üye), Ayşe → PoultryCare (İzleyici)" — *davette hub rolü; proje bazında erişim tablosu admin panelinde*
- [ ] ⭐ **İki tür üye:**
  - 💻 **God Eye kurulu üye:** kendi bilgisayarında çalışır, paylaşır, her şeyi yapar
  - 🌐 **Web üyesi (kurulumsuz):** tarayıcıdan Hub adresine girer. **Arayüz birebir aynıdır** (projeler, session'lar, kategori sayfaları, kim online), sadece AI çalıştırma ve kod düzenleme yoktur. Yorum yazabilir, öneri ve görev bırakabilir
- [ ] 🔒 Web üyesinde de uçtan uca şifreleme korunur: şifre çözme **tarayıcıda** yapılır (WebCrypto). Hub yine hiçbir şey okuyamaz
- [x] Takım boyutu: 1 kişiden (tek başına) 10 kişiye kadar sorunsuz; daha fazlası için de ölçeklenebilir
- [x] Roller (proje bazında): **Sahip · Yönetici · Üye · İzleyici**
- [x] İzleyici sadece görür; Üye kendi bilgisayarında çalışır ve paylaşır; Yönetici kullanıcı ve ayar yönetir — *hub izleyicinin yayın yapmasını reddeder; listede olmayan projeye abone olunamaz*
- [x] Profil: isim, avatar, dil (herkes kendi dilinde görür) — *isim, renk (veya küçük resim), dil*

#### 4.3b 👑 Süper Admin Paneli
- [x] ⭐ Hub ilk kurulduğunda süper admin hesabı oluşturulur (kurulum sihirbazında e-posta + güçlü şifre + 2FA önerisi) — *VPS'te CLI ile (`create-admin`); ağ üzerinden kimse boş bir hub'ı sahiplenemez*
- [x] ⭐ **Kullanıcı yönetimi:** kullanıcı ekleme ve silme, **e-posta ve şifre belirleme/değiştirme**, şifre sıfırlama, geçici dondurma, rol değiştirme — *e-posta yerine kullanıcı adı*
- [x] ⭐ İlk girişte şifre değiştirme zorunluluğu (opsiyonel, admin seçer) — *davetle gelen herkes için zorunlu*
- [x] Proje erişimi: hangi kullanıcı hangi projeyi hangi rolle görür (tablo görünümü, tek tıkla değiştirme)
- [x] Cihaz yönetimi: her kullanıcının cihazları, son görülme zamanı, uzaktan çıkış yaptırma ve iptal
- [x] Oturumlar: aktif oturumlar, IP, konum, "hepsini kapat" — *cihaz listesi + IP; kendi diğer cihazların ve admin için kullanıcı başına "her yerden çıkış"*
- [x] Güvenlik politikaları: minimum şifre uzunluğu, 2FA zorunluluğu, oturum süresi, IP kısıtlaması (opsiyonel)
- [x] Denetim kaydı (audit log): kim, ne zaman, ne yaptı (giriş, rol değişikliği, silme, deploy, `.env` değişikliği) — *hub tarafı: giriş, kullanıcı ve şifre işlemleri*
- [x] Hub sağlığı: RAM, CPU, disk, bağlı kullanıcılar, senkron kuyruğu — *RAM, depolama, çevrimiçi sayısı, event sayısı*
- [x] Yedek ve geri yükleme, saklama süresi ayarları — *günlük şifreli yedek (HUB_BACKUP_KEY), CLI ile geri yükleme, saklama süresi politikası*
- [x] **E-posta (ücretsiz):** davet ve şifre sıfırlama mailleri için kendi SMTP'n (ör. Gmail uygulama şifresi). SMTP yoksa admin linki kopyalayıp WhatsApp vb. ile gönderir — *`SMTP_*` ortam değişkenleri; davet ve sıfırlama kodu e-postayla gider, "şifremi unuttum" 30 dk geçerli tek kullanımlık kod gönderir; e-posta adresleri takım arkadaşlarına gösterilmez*
- [x] Admin devri ve ikinci admin ekleme (tek kişiye bağımlı kalmamak için) — *son admin silinemez/düşürülemez*
- [x] 🔒 Şifre sıfırlama girişi açar ama şifreli veriye erişim için kullanıcının yeni cihazı admin veya mevcut bir cihazı tarafından onaylanır (uçtan uca şifreleme korunur)
- [x] 🔒 Admin bile kullanıcıların şifrelerini **göremez** (sadece yenisini belirleyebilir); şifreler argon2id ile saklanır

#### 4.4 Canlı birlikte çalışma (halüsinasyonu ve çakışmayı bitiren kısım)
- [x] ⭐ **Canlı session izleme:** arkadaşımın session'ını gerçek zamanlı görürüm (prompt'lar, agent cevapları, değişen dosyalar) — *"Tam" paylaşımda ~3 sn gecikmeyle*
- [x] ⭐ **Ortak hafıza:** biri karar alınca herkesin yeni session'ına bu karar otomatik enjekte edilir. Herkesin AI'ı aynı gerçeği bilir — *hafıza öğeleri senkron, son yazan kazanır; mevcut hook bağlamı bunları içerir*
- [x] ⭐ **Kim ne yapıyor (presence):** proje ve kategori sayfalarında "🟢 Ali şu an Backend → auth modülünde" rozeti — *proje sayfası ve Takım sayfası; kategori sayfaları Faz 5'te*
- [x] ⭐ **Erken çakışma uyarısı:** aynı dosya veya modülde çalışmaya başlarsam *"Ali 10 dk önce `auth.ts`'i değiştirdi, henüz push etmedi"* uyarısı + AI'a da bu bilgi verilir — *aynı dosyalarda çalışınca sarı rozet; AI'a iletme sonra*
- [ ] Görev sahiplenme (claim): "Bu işi ben alıyorum". Diğerleri görür, aynı iş iki kez yapılmaz
- [x] **Prompt önerme:** arkadaşımın session'ına prompt veya not gönderebilirim. Onun ekranında öneri olarak çıkar, kabul ederse session'ına eklenir. Kimsenin session'ı izinsiz değiştirilmez
- [x] **Session devralma:** "Bu işi sen devam ettir". Özet ve bağlam karşı tarafa geçer, iş kendi bilgisayarında devam eder
- [x] Çapraz çelişki tespiti: iki kişinin aldığı kararlar çelişirse ikisine de haber verilir — *takım arkadaşının yeni kararı seninkilerle Haiku ile karşılaştırılır (otomatik özet açıkken); çelişki işareti senkronla karşıya da gider, kart kimin kararı olduğunu gösterir*
- [x] Yorumlar ve @bahsetme: session'lara, kararlara ve kategori sayfalarına — *@ yazınca isim önerisi çıkar; bahsedilen kişinin Gelen kutusuna düşer*
- [ ] Ortak görev panosu: görev bir insana veya bir personaya atanabilir
- [x] Takım aktivite akışı: "Bugün takımda ne oldu" (her kullanıcının kendi dilinde)
- [ ] Ortak ders defteri: birinin yaptığı hatadan herkesin AI'ı öğrenir

#### 4.5 Hub (VPS tarafı)
- [x] ⭐ Tek küçük binary / Docker imajı (< 80 MB), `docker compose up -d` ile kurulum — *tek dosyalık binary (`bun build --compile`) + distroless taban: 52 MB indirme (eskisi 260 MB). Diskte açılmış hali ~115 MB, çünkü Bun çalışma zamanı tek başına ~90 MB; kabuk ve paket yöneticisi yok*
- [x] ⭐ İşleri sadece şunlar: giriş, yetki, şifreli event saklama, canlı iletme, presence. **AI çalıştırmaz, kod çalıştırmaz, şifre çözmez**
- [x] Hedef kaynak kullanımı: boştayken ~50 MB RAM, ~%0 CPU; 10 kullanıcıda bile birkaç % — *ölçülen: boşta 14 MB (konteyner) / 42 MB RSS; 10 kullanıcı yük testi henüz yapılmadı*
- [x] Depolama: SQLite (şifreli bloblar); eski event'ler için sıkıştırma ve saklama süresi ayarı — *1 KB üstü içerik şifrelemeden önce gzip'lenir*
- [x] Otomatik yedek (şifreli halde, örneğin S3 uyumlu bir depoya) — *AWS S3 / R2 / MinIO / Backblaze (SigV4)*
- [x] Aynı VPS'te yayındaki projelerinle yan yana sorunsuz çalışır (port ve kaynak sınırları, `mem_limit`) — *`docker/hub-compose.yml`: sadece 127.0.0.1, 256 MB, salt okunur, root değil*
- [x] Hub yönetim paneli (kullanıcılar, cihazlar, depolama kullanımı) — *God Eye'ın Takım sayfasında*
- [x] Hub opsiyoneldir: tek başına kullanan biri hiç kurmaz

#### 4.6 👤 "Kim yaptı, kim yapıyor" (her yerde isim)
- [x] ⭐ Canlı durum rozetleri: **"Mohamed şu an çalışıyor: Backend → ödeme modülü"**, "Kerim beklemede", "Ayşe çevrimdışı (2 saat önce)" — *yeşil/sarı/gri nokta + ipucu*
- [x] ⭐ Her kayıtta yapan kişi: **"Kerim yaptı · Claude ile · 14:32"**. Session'larda, commit'lerde, kararlarda, görevlerde, sunucu komutlarında ve dosya değişikliklerinde — *şimdilik session'lar ve hafıza*
- [ ] İnsan + agent birlikte gösterilir: "Mohamed → 🤖 Backend Senior persona → `payment.ts` değiştirildi"
- [ ] Kod görünümünde satır bazında: "Bu satırı Kerim, 3 gün önce, Codex ile, şu session'da yazdı"
- [x] Proje kartında üye avatarları ve kimin aktif olduğu
- [x] Kişi sayfası: "Kerim bu hafta ne yaptı" (özet, kendi dilimde)
- [x] Bildirim: "Mohamed, senin çalıştığın `auth.ts` dosyasını değiştirdi" — *Gelen Kutusu: canlı ve son 2 saatteki ortak dosyalar*

#### 4.7 ✅ Alınan kararlar (önerilen varsayılanlar)
- [x] **Uçtan uca şifreleme: AÇIK** (kapatılamaz). Güvenliğin temeli
- [x] **Kurtarma anahtarı:** onboarding'de gösterilir, kaydetmek zorunludur (indir veya yazdır). Ayrıca yönetici, üyenin erişimini yeni bir cihaza tekrar verebilir (yeni cihaz, mevcut cihazlardan biri tarafından onaylanır) — *kopyalamadan/indirmeden kapanmaz; tüm anahtar sürümlerini içerir*
- [ ] **Paylaşım varsayılanları:**
  - 💻 Lokal projeler → **Kapalı** (hiçbir şey çıkmaz)
  - 🤝 Takım projeleri → **Tam** (session'lar canlı paylaşılır; sır temizleyici her zaman çalışır). Takımın birbirini görmesi bu sistemin asıl amacı
  - Session bazında "🔒 Gizli" anahtarı her zaman mevcuttur
- [x] **AI hesapları:** asla paylaşılmaz, herkes kendi hesabını kullanır

**Bitti sayılır:** Ben bir prompt yazdığımda arkadaşım 1 saniye içinde görüyor; ikimiz aynı hafızayı aynı anda düzenleyince hiçbir şey kaybolmuyor; Hub'ın veritabanı açıldığında içerik okunamıyor; VPS'te Hub'ın RAM kullanımı 100 MB'ın altında.

---

### Faz 4.5 — ✨ Prompt Güçlendirici ("doğrusunu yap" → profesyonel prompt)

**Hedef:** Üşendiğimde *"şunu düzelt"*, *"doğrusunu yap"*, *"bu çalışmıyor bak"* gibi kısa ve zayıf bir prompt yazayım. God Eye bunu, projeyi bilen birinin yazacağı **net ve eksiksiz bir prompt'a** çevirsin. Ben sadece bakıp onaylayayım.

> Örnek:
> **Benim yazdığım:** `login bozuk düzelt`
> **God Eye'ın hazırladığı:**
> *Hedef:* `/login` sayfasında doğru şifreyle giriş yapılınca 401 hatası dönüyor, bunu düzelt.
> *Bağlam:* Son session'da `auth.ts` içinde token süresi değiştirildi (commit `a1b2c3`). Son test çıktısında `auth.test.ts › refresh token` başarısız. Proje kararı: "Session cookie HttpOnly kalacak".
> *Kısıtlar:* Sadece auth akışına dokun, cookie ayarlarını değiştirme, yeni paket ekleme.
> *Bitti sayılır:* Testler geçiyor, elle giriş çalışıyor, ne değiştiğini kısaca anlat.
> *Varsayımlar (silinebilir):* Sorun sadece web girişinde, mobil etkilenmiyor.

#### 4.5.1 Temel güçlendirme (ilk sürüm) ⭐
- [x] ⭐ Chat, terminal ve Hızlı Soru giriş kutularında **"Güçlendir"** butonu + kısayol (`Ctrl+Shift+Enter`) — *terminalde çok satırlı yapıştırma, Enter'ı sen basarsın*
- [x] ⭐ Sonuç yan yana gösterilir: **benim yazdığım ↔ güçlendirilmiş hali**. Üç seçenek: *Güçlendirilmişi gönder* · *Düzenle* · *Orijinali gönder* — *düzenleme doğrudan güçlendirilmiş metin kutusunda*
- [x] ⭐ Sabit, okunaklı yapı: **Hedef · Bağlam · Kısıtlar · Bitti sayılır · Varsayımlar**. Gereksiz uzunluk yok, küçük işler için kısa kalır
- [x] ⭐ **Ücretsiz:** kendi Claude girişimle Haiku kullanılır (`claude -p`, özetlerdeki gibi). Limit dolarsa AI'sız şablon moduna düşer (bağlamı ekler, yapıyı kurar) — *sonuç anında (şablon) gelir, AI sürümü arka planda gelip yerine geçer*
- [x] ⭐ **Uydurmaz:** sadece God Eye'ın gerçekten bildiği bilgileri ekler (hafıza, git, loglar). Tahmin ettiği her şey **"Varsayımlar"** bölümüne yazılır, tek tıkla silinebilir — *ayrıca AI işleri artık üstteki git reposunu göremiyor (GIT_CEILING_DIRECTORIES); boş projede bağlam boş geliyor*
- [x] ⭐ **Kapsamı büyütmez:** "login'i düzelt" dediysem prompt'a "ayrıca testleri yeniden yaz" gibi istemediğim işler eklenmez
- [x] Çok belirsizse (bağlam da yoksa) tahmin etmek yerine **1–3 kısa soru** sorar, cevaplar tıklanabilir seçenek olarak gelir: *"Hangi login? Web · Mobil · Admin paneli"* — *"Diğer…" ile serbest cevap ve "Sorusuz devam et" de var*
- [x] Dil: ben Türkçe (veya herhangi bir dilde) yazarım. Prompt AI için en iyi sonucu veren dilde hazırlanır (ayarlanabilir: benim dilim / İngilizce). Açıklamayı her zaman kendi dilimde görürüm
- [x] 🔒 Sır temizleyici burada da çalışır. `.env` değerleri ve anahtarlar prompt'a asla eklenmez

#### 4.5.2 Bağlamı otomatik toplama
- [x] ⭐ **Proje hafızası:** ilgili kararlar, kurallar ve "denendi, işe yaramadı" notları eklenir. Böylece AI eski hatayı tekrarlamaz
- [x] ⭐ **Aktif session:** son mesajlar, son hata, değişen dosyalar. *"bu çalışmıyor"* derken "bu"nun ne olduğu buradan anlaşılır — *gerçek testte "bunu hallet" son hatayı doğru buldu*
- [x] ⭐ **Git:** branch, commit edilmemiş değişiklikler, son commit'ler
- [x] Kod sekmesinde açık dosya ve seçili satırlar ("burayı düzelt" → hangi dosya, hangi satırlar) — *editörde sağ tık → "Bunun için prompt yaz" veya Ctrl+Shift+Enter; sonuç chat'e taslak olarak gider*
- [x] Son test ve log çıktıları (sunucular, önizleme logları), çalışmayan komutun hata mesajı — *projenin terminallerindeki son hata satırları*
- [x] Takım (Faz 4): arkadaşım aynı dosyada çalışıyorsa prompt'a not düşülür: *"Kerim de `auth.ts` üzerinde çalışıyor, onun değişikliklerini bozma"*
- [x] Hangi bağlamın eklendiği küçük etiketlerle gösterilir (🧠 hafıza · 🌿 git · 📄 dosya · ❌ hata). Her biri tek tıkla çıkarılabilir
- [x] Bağlam boyutu sınırı: context'i şişirmez, sadece ilgili parçalar eklenir (session sağlığı ile uyumlu)

#### 4.5.3 Akıllı davranışlar
- [x] **Zayıf prompt tespiti:** prompt çok kısa veya belirsizse gönderirken nazikçe *"✨ Güçlendireyim mi?"* önerisi (zorla değil)
- [x] Mod ayarı: **Kapalı · Öner · Otomatik** (otomatikte bile göndermeden önce kısa önizleme)
- [x] **İş büyüklüğü tahmini:** büyük işlerde *"Bu iş büyük, önce Plan modunda başlayalım mı?"* veya *"Bunu 3 adıma bölelim mi?"* — *Plan moduna geçiş butonu var; adımlara bölme sonra*
- [x] Araca göre ayar: Claude ve Codex için en iyi çalışan biçim (ör. Codex'e daha net dosya listesi)
- [x] Hazır niyet kalıpları: *düzelt · ekle · yeniden düzenle · açıkla · test yaz · gözden geçir · deploy'a hazırla*. Her biri kendi "Bitti sayılır" maddeleriyle gelir
- [ ] Personalar (Faz 6) gelince: prompt seçilen personaya göre hazırlanır (ör. "Güvenlik uzmanı" için risk kontrolü maddeleri)

#### 4.5.4 Benden öğrenme
- [x] Hangi güçlendirilmiş prompt'ların iyi sonuç verdiğini takip eder (az hata, az tekrar deneme, session sağlığı iyi, kabul edildi) — *gönderilen sürüm session'a bağlanır; sonraki 30 dk'daki hatalar güçlendirilmiş/orijinal olarak karşılaştırılır*
- [x] Benim yazma tarzımı ve sık kullandığım kısaltmaları öğrenir (*"dyy" = "doğrusunu yap"* gibi) — *kendi kısaltmaların + sık yazdığın kısa kelimeler öneri olarak çıkar*
- [x] Sonuç alan prompt'lar tek tıkla **Prompt kütüphanesine** (2.7) kaydedilir
- [x] Haftalık küçük not: *"Bu hafta 14 prompt'u güçlendirdin; en çok eksik kalan şey 'bitti sayılır' maddesiydi"* — *Ayarlar → Prompt güçlendirici*

**Bitti sayılır:** `login bozuk düzelt` yazıp `Ctrl+Shift+Enter`'a bastığımda 3 saniye içinde projemin gerçek bağlamıyla dolu, uydurma bilgi içermeyen bir prompt görüyorum; tek tıkla gönderiyorum ve AI ilk denemede doğru işe odaklanıyor.

---

### Faz 5 — Kategori Sayfaları ve Puanlama

**Hedef:** Projenin her bölümünü anlaşılır şekilde anlatmak ve iyi mi kötü mü kanıtla göstermek.

#### 5.1 Kategori tespiti
- [x] Repoyu tarayıp kategorileri otomatik tespit et: Mimari, UI/UX, Frontend, Backend, Veritabanı, DevOps, Güvenlik, Test, Performans, Dokümantasyon, Bağımlılıklar — *JS/TS, Python, Go, Rust, Ruby manifest'lerinden ve dosya yapısından*
- [x] Her dosya, session ve commit ilgili kategoriye bağlanır — *dosyalar ve session'lar bağlı; commit'lerde dosya listesi tutulmadığı için commit bağlantısı sonra*
- [x] Projede olmayan kategori gösterilmez (ör. DB yoksa DB sayfası da yok)

#### 5.2 Kategori sayfası
- [x] **Sade anlatım:** "Bu bölüm nasıl çalışıyor?" (TR/EN) — *Haiku ile, dosyalar değişene kadar önbellekte*
- [x] **Otomatik diyagram:** mimari, DB şeması, API akışı, deploy akışı (Mermaid) — *mimari (import grafiği) ve DB şeması var; API ve deploy akışı API Haritası ile gelecek*
- [x] **İlgili her şey:** dosyalar, session'lar, kararlar, açık sorunlar, fazlar, görevler — *dosyalar, session'lar, sorunlar ve bölümün dosyalarından bahseden kararlar/notlar; görevler Faz 8 panosuyla*
- [x] **Puan halkası (0–100) + not (A–F):** neden bu puan, ne düzelirse kaç puan artar
- [x] **Trend grafiği:** puan zaman içinde nasıl değişti
- [x] **"Düzelt" butonları:** her sorunun yanında, tek tıkla ilgili personaya görev olarak gider — *şimdilik hazır prompt'la chat açar (gönderilmez); personalar Faz 6'da*
- [x] Sayfa altında bağlama duyarlı prompt kutusu

#### 5.3 Kanıta dayalı puanlama
- [x] Önce deterministik araçlar: `tsc`, eslint/biome, testler + coverage, `npm audit` / `osv-scanner`, semgrep, gitleaks, bundle size, Lighthouse — *44 statik kontrol + projenin kendi tip kontrolü/linter/testleri/denetimi (bun/npm/pnpm/yarn/pip-audit), komutlar gösterilip onayla çalışır; Lighthouse canlı önizlemeyle (Faz 10)*
- [x] LLM bu çıktıları ve kodu rubriğe göre yorumlar; her puanın yanında kanıt linki zorunlu — *her bulgu dosya:satır kanıtlı (araç çıktısındaki hatalar dahil); LLM sadece açıklamayı yazar, puanı değil*
- [x] Açık rubrik dosyaları (`rubrics/*.md`), düzenlenebilir — *`rubrics/` kontrolleri, ağırlıkları ve çözümlerini anlatır; proje bazında Bölümler → Puanlama'dan değiştirilir*
- [x] Genel sağlık puanı = kategori ağırlıklı ortalaması (ağırlıklar ayarlanabilir)
- [x] Puanlama otomatik tetiklenir (session bitince, commit sonrası), zorunlu olmadıkça pahalı model kullanılmaz — *session'lar değişince 3 dk sonra yeniden taranır (worker); puanlar için AI hiç kullanılmaz*

#### 5.4 Mevcut projeyi içeri alma
- [x] "Projeyi Tara" → geçmiş session'lar okunur, ilk hafıza, kategori sayfaları ve puanlar üretilir
- [x] İlerleme çubuğu + tahmini süre ve token maliyeti önceden gösterilir

#### 5.5 🔌 API Haritası
- [x] ⭐ Projede kullanılan **tüm API'ler** otomatik bulunur: — *31 bilinen servis (Stripe, iyzico, OpenAI, Firebase, ZITADEL…) + bilinmeyenler URL adresinden; kendi endpoint'ler Express/Hono/Fastify/NestJS/FastAPI/Flask/Next.js'ten*
  - **Dış servisler:** Stripe, OpenAI, Google Maps, e-posta, SMS… (koddaki SDK'lardan, URL'lerden ve `.env` anahtarlarından)
  - **Kendi API'lerin:** projedeki endpoint'ler (route dosyaları, OpenAPI şemaları)
- [x] Her API için kart: — *ne işe yaradığı, doküman linki, kodda nerede, `.env` anahtarları; kendi endpoint'ler için sağlık kontrolü. Sağlayıcı kullanım/maliyet istatistiği ücretli API gerektirdiği için yok*
  - **Ne işe yarıyor** (sade dille), **nereden geliyor** (sağlayıcı, doküman linki)
  - **Kodda nerede kullanılıyor** (dosya:satır listesi, tıklanabilir)
  - **Hangi `.env` anahtarını kullanıyor**
  - **Ne kadar kullanıldı:** lokalde dev proxy'den, prod'da SSH ile log analizinden (istek sayısı, hata oranı, ortalama süre). Sağlayıcının kullanım API'si varsa maliyet bilgisi
  - Sağlık: anahtar geçerli mi, endpoint cevap veriyor mu, deprecated sürüm kullanılıyor mu
- [x] Endpoint akış diyagramı: "Frontend → `/api/pay` → Stripe → webhook → DB" — *frontend → endpoint grupları → dış servisler, koddaki çağrılardan*
- [x] Yerleşik API test aracı (Postman gibi): endpoint seç, istek gönder, cevabı gör
- [x] Kullanılmayan API'ler ve anahtarlar için uyarı ("bu anahtar hiçbir yerde kullanılmıyor") — *anahtarlar için; compose/script referansları da kullanım sayılıyor*

#### 5.6 🔑 `.env` ve Sır Yönetimi
- [x] ⭐ Ortam bazında `.env` editörü: Local · Staging · Prod (prod dosyası SSH ile okunur ve yazılır) — *sunucudaki .env bağlanır, SSH ile okunur/yazılır, sunucuda tarihli yedek alınır*
- [x] ⭐ Değerler varsayılan olarak maskeli (`sk-••••3f2a`), göz ikonuyla gösterilir — *gösterilen değer 20 sn sonra yine gizlenir*
- [x] ⭐ Değiştirmeden önce otomatik yedek; değişiklik geçmişi; tek tıkla geri alma — *yedekler God Eye'ın veri klasöründe, 600 izinli; çok satırlı değerler (private key) tek parça düzenleniyor*
- [x] Doğrulama: eksik anahtar ("kod `STRIPE_KEY` istiyor ama `.env`'de yok"), hatalı format, ortamlar arası fark tablosu
- [x] Her anahtarın yanında: ne işe yaradığı, hangi API'ye ait olduğu, kodda nerede kullanıldığı — *hangi servise ait ve kodda nerede okunduğu; servis açıklaması API Haritası'nda*
- [x] `.env.example` dosyasını otomatik güncel tutma — *tek tıkla: sadece adlar eklenir, değerler asla kopyalanmaz*
- [x] Prod `.env` değişikliği sonrası "servisi yeniden başlatayım mı?" önerisi (onaylı)
- [x] 🔒 `.env` değerleri **asla** AI'a gönderilmez (sadece anahtar isimleri gider), asla Hub ile senkron edilmez, asla loglara yazılmaz
- [x] 🔒 Takımda sadece anahtar isimleri ve "kim, ne zaman değiştirdi" bilgisi görünür, değerler görünmez

**Bitti sayılır:** Bir projeye girdiğimde her bölümün ne olduğunu, puanını ve nasıl iyileşeceğini 1 dakikada anlıyorum.

---

### Faz 6 — Persona Takımı

**Hedef:** Her alanda uzman, ömrü boyunca o işi yapmış gibi davranan bir takım.

#### 6.1 Personalar

> Her persona, **ömrü boyunca o alanda çalışmış dünya çapında bir uzman** gibi tasarlanır: alanın tarihini baştan bugüne bilir, klasik kitapları ve güncel en iyi pratikleri tanır, kendi deneyiminden konuşur, gerektiğinde itiraz eder ve kaynak gösterir.

**Persona profil standardı (her persona için):**
- [ ] Biyografi: "30+ yıl deneyim, şu dönemleri yaşadı, şu tip sistemleri kurdu"
- [ ] Alan tarihi zaman çizelgesi (ilk günden bugüne kilometre taşları)
- [ ] Temel okuma listesi + kütüphane bağlantısı (Faz 7)
- [ ] Düşünme tarzı ve kontrol listesi (review yaparken neye bakar)
- [ ] Bilinen tuzaklar ve anti-pattern'ler
- [ ] Güncel kalma: kendi alanındaki yeni gelişmeleri otomatik takip eder (bkz. 7.3 Bilgi Motoru)

**Gerçek uzman gibi davranma kuralları (tüm personalar için zorunlu):**
- [ ] ⭐ **Tutarlılık:** her personanın bir **"Görüşlerim" defteri** vardır (iddia, gerekçe, kanıt, güven seviyesi, tarih). Cevap vermeden önce kendi geçmiş görüşlerine bakar. "Dün başka, bugün başka" olmaz
- [ ] ⭐ **Fikir değiştirme kuralı:** sadece yeni kanıtla ve açıkça: *"Mart'ta X demiştim. Şu yeni veri yüzünden artık Y diyorum."*
- [ ] ⭐ **Kanıtsız iddia yok:** her önemli iddiada kaynak bulunur (kitap, makale, resmi doküman, gerçek vaka, istatistik). Kaynak yoksa "bu benim tahminim, güvenim düşük" der
- [ ] **İstatistik ve trend:** geçmiş veriler ve geleceğe dönük projeksiyonlar kaynağıyla birlikte verilir (anket, rapor, benimseme oranları). Tahmin ile kesin bilgi her zaman ayrılır, rakam uydurulmaz
- [ ] **Vaka bilgisi:** benzer ürünlerin ve şirketlerin geçmişini bilir (ne denediler, ne işe yaradı, neden battılar) ve bunları karşılaştırır
- [ ] **Önem sıralaması:** neyin kritik, neyin "olsa iyi olur", neyin hiç önemli olmadığını açıkça söyler. Her şeyi önemliymiş gibi göstermez
- [ ] **Abartı yok:** sakin, net, kendinden emin ama mütevazı. Bilmediğini bilmediğini söyler
- [ ] **Güven göstergesi:** her önerinin yanında 🟢 yüksek / 🟡 orta / 🔴 düşük güven

**Personalar:**
- [ ] 🤖 **AI Engineer:** 1950'den bugüne yapay zekânın tamamı: Turing testi, Dartmouth (1956), perceptron, sembolik AI ve uzman sistemler, AI kışları, backpropagation, SVM, istatistiksel öğrenme, derin öğrenme (AlexNet), RNN/LSTM, Transformer (2017), BERT/GPT, RLHF, LLM'ler, agent'lar, RAG, tool use, MCP, eval'ler, fine-tuning, quantization, MLOps, prompt ve context engineering, AI güvenliği
- [ ] 🧭 PM / Takım Lideri: işi böler, atar, takip eder
- [ ] 🏛️ Mimar
- [ ] 🎨 UI/UX Tasarımcı
- [ ] 🖥️ Frontend Senior
- [ ] ⚙️ Backend Senior
- [ ] 🗄️ DB Uzmanı
- [ ] 🚀 DevOps / SRE Senior: sunucular, SSH, CI/CD, Docker, Kubernetes, izleme, olay yönetimi
- [ ] 📱 Mobil Senior: iOS, Android, React Native, Flutter
- [ ] 📊 Data Engineer: veri hatları, ETL, analitik, veri ambarları
- [ ] 🧪 QA: "yaptım" denen işi doğrular
- [ ] 🔒 Security
- [ ] ⚡ Performans
- [ ] 😈 Şeytanın Avukatı: planın zayıf noktalarını bulur
- [ ] 📝 Teknik Yazar: dokümantasyon ve özetler

**Liderlik ve strateji personaları:**
- [ ] 👔 **CEO Danışmanı / Executive Coach:** CEO'yu güçlendiren kişi. Strateji, önceliklendirme, odak, karar verme, "şu an neye hayır demelisin"
- [ ] 🗂️ **Chief of Staff:** tüm projelerin genel durumu, takip edilmeyen işler, haftalık yönetici raporu
- [ ] 📦 **Ürün Yöneticisi (Product Manager):** kullanıcı ihtiyacı, yol haritası, özellik önceliklendirme, metrikler
- [ ] 📈 **Büyüme ve Pazarlama:** konumlandırma, lansman, SEO, içerik, fiyatlandırma
- [ ] 💰 **Finans ve Maliyet:** sunucu, API ve AI maliyetleri, gelir modeli, birim ekonomisi
- [ ] ⚖️ **Hukuk ve Uyumluluk:** KVKK, GDPR, lisanslar, kullanım şartları (bilgilendirme amaçlı, avukat yerine geçmez)

**Araştırma personaları:**
- [ ] 🔬 **Araştırmacı:** bir konuyu derinlemesine araştırır, kaynakları karşılaştırır, raporlar
- [ ] 🧪 **Ar-Ge Mühendisi:** yeni teknolojileri dener, prototip ve kıyaslama (benchmark) yapar, "bunu kullanmalı mıyız?" sorusuna kanıtla cevap verir
- [ ] 🕵️ **Rakip Analisti:** benzer ürünleri takip eder, özellik ve fiyat karşılaştırması, "onlar bunu yaptı, biz ne yapmalıyız"

#### 6.1b 👵 Test Kullanıcıları Paneli (gerçek insanlar gibi test eden personalar)

> Amaç: Uygulamayı uzmanlar değil, **gerçek ve sıradan insanlar** nasıl kullanır, onu görmek. "Teyze testi"nin otomatik hali.

- [ ] ⭐ Test kullanıcıları, uygulamayı **gerçek bir tarayıcıda** kullanır (Playwright ile tıklar, yazar, kaybolur) ve kullanırken sesli düşünür: *"Bu buton ne işe yarıyor? Korktum, basmıyorum."*
- [ ] ⭐ Hazır profiller:
  - 👵 Teknolojiyle arası olmayan 70 yaşında bir teyze
  - 👴 Gözleri zayıf, büyük yazı kullanan 75 yaşında bir amca
  - 🧒 10 yaşında bir çocuk (sabırsız, her yere tıklar)
  - 🧑 İlk kez akıllı telefon kullanan biri
  - 👩‍💼 Çok meşgul ve aceleci bir yönetici
  - 🌍 Türkçeyi az bilen biri (dil ve kültür testi)
  - ♿ Ekran okuyucu kullanan görme engelli biri
  - 🎨 Renk körü biri
  - 📶 Yavaş internetli, eski telefonlu biri
  - 😤 Sinirli ve hiç sabrı olmayan bir kullanıcı
  - 🦹 Kötü niyetli kullanıcı: formlara saçma şeyler yazar, sistemi bozmaya çalışır
  - 🧠 Uzman (power user): kısayolları ve hızı arar
- [ ] Profiller **demografik çeşitlilik** için tasarlanır (yaş, cinsiyet, eğitim, dil, engellilik, cihaz). Klişe değil, gerçek kullanıcı araştırmalarına dayanır
- [ ] Kendi profilini oluşturma: "Hedef kitlem 25–35 yaş arası, Almanya'da yaşayan Türk anneler"
- [ ] **Paralel test:** tek tıkla 10–50 test kullanıcısı aynı anda (her biri ayrı tarayıcı oturumunda)
- [ ] Rapor: nerede takıldılar, ne kadar sürede başardılar, nerede vazgeçtiler, ekran kayıtları, en sık şikâyetler, "teyze puanı"
- [ ] Bulunan sorunlar tek tıkla UI/UX veya Frontend personasına görev olarak gider
- [ ] Her önemli değişiklikten sonra otomatik tekrar test (regresyon)

#### 6.1c 🧪 Uzman Test Takımı
- [ ] Birim test yazarı, entegrasyon testçisi, uçtan uca (E2E) testçisi
- [ ] Yük testçisi: "1000 kişi aynı anda girerse ne olur?"
- [ ] Güvenlik testçisi (pentest): OWASP Top 10 kontrolleri, sadece kendi projelerinde ve lokal/staging ortamında
- [ ] Erişilebilirlik testçisi (WCAG)
- [ ] Çapraz tarayıcı ve cihaz testçisi
- [ ] Kaos testçisi: "veritabanı giderse, internet koparsa ne olur?"
- [ ] Test kapsamı haritası: hangi kısım test edilmiş, hangisi edilmemiş

#### 6.2 Altyapı
- [ ] Persona tanımı: karakter, uzmanlık, kurallar, izinli araçlar, model, kütüphane, rubrik
- [ ] Tanımlardan `.claude/agents/*.md` ve Codex eşdeğerinin otomatik üretilmesi ve senkronlanması
- [ ] Persona düzenleme arayüzü + sıfırdan persona oluşturma sihirbazı
- [ ] Her persona işe başlamadan hafızayı, ders defterini ve kendi kategori sayfasını okur; bitirince günceller (otomatik)
- [ ] 🔒 İzin sınırları: Security sadece okur; DevOps onaysız deploy edemez; kimse onaysız `git push` yapamaz

#### 6.3 Etkileşim
- [ ] Birebir sohbet: "DevOps, bunu nasıl deploy ederim?"
- [ ] Kategori sayfasından "Bu bölümü review et"
- [ ] **Takım toplantısı:** bir fikir tüm ilgili personalara sorulur, her biri kendi açısından görüş ve itiraz yazar, PM karar özeti çıkarır, karar hafızaya işlenir
- [ ] **Şeytanın avukatı modu:** her planın altında "Zayıf noktaları bul" butonu

#### 6.4 Skor kartı
- [ ] Persona başına: tamamlanan iş, yakalanan hata, kabul ve red oranı, token harcaması, ortalama süre

**Bitti sayılır:** Bir fikri takım toplantısına sokuyorum, 5 uzmanın görüşü ve bir karar özeti geliyor.

---

### Faz 7 — Kütüphane ve Kendi Kendine Öğrenme

**Hedef:** Personalar en iyi kitaplardan ve kendi hatalarından öğrensin.

#### 7.1 Kütüphane (RAG)
- [ ] Persona başına kütüphane: kitap (PDF/EPUB), doküman, makale, web sayfası, GitHub repo
- [ ] Sürükle bırak ile ekleme; GitHub URL'si ile repo ekleme
- [ ] Parçalama + lokal embedding + sqlite-vec indeksi; arka planda, ilerleme çubuklu
- [ ] MCP aracı: `library_search(persona, soru)` → kaynaklı en iyi 3–5 parça
- [ ] Cevaplarda kaynak gösterme zorunlu: "Accelerate, Bölüm 4"
- [ ] Önerilen başlangıç kütüphaneleri (persona başına okuma listesi; kitapları kullanıcı kendisi ekler)
- [ ] Kullanıcının eski projeleri otomatik olarak "örnek proje" kütüphanesine eklenir

#### 7.1b 📰 Bilgi Motoru (personalar her zaman güncel)
- [ ] ⭐ Persona başına otomatik bilgi kaynakları:
  - **Haber ve sosyal (tamamen ücretsiz):** Hacker News, Reddit (RSS), Bluesky, Mastodon, Lobsters, Product Hunt. X/Twitter'daki büyük haberler zaten birkaç saat içinde bu kaynaklara ve bloglara düşer; önde gelen isimlerin çoğu blog, bülten veya Bluesky'de de yazar
  - **X linki ekleme:** önemli bir tweet görürsen linkini yapıştırırsın, kütüphaneye eklenir (otomatik X taraması yok, çünkü ücretsiz yasal yolu yok)
  - **Teknik:** GitHub trending, yeni sürüm notları (release notes), RFC'ler, resmi bloglar ve changelog'lar
  - **Akademik:** arXiv, Papers with Code, konferanslar
  - **Sektör:** raporlar ve anketler (Stack Overflow Survey, State of JS, Gartner özetleri vb.), bültenler (newsletter), podcast transkriptleri
- [ ] Günlük veya haftalık otomatik tarama (zamanlanmış iş olarak, düşük maliyetli modelle)
- [ ] **Filtre:** gürültü değil sinyal. Önem puanı, tekrar eden haberlerin birleştirilmesi, "hype mı gerçek mi?" değerlendirmesi
- [ ] Önemli gelişmeler persona kütüphanesine **tarihli ve kaynaklı** eklenir
- [ ] Görüş güncellemesi: yeni bilgi bir personanın eski görüşünü etkiliyorsa "Görüşlerim" defteri güncellenir ve sana bildirilir
- [ ] **Trend paneli:** "Bu hafta alanında neler oldu", yükselen ve düşen teknolojiler, senin projelerini etkileyen haberler ("kullandığın kütüphanenin yeni sürümü çıktı, şu değişiklik seni etkiler")
- [ ] Karşılaştırma: "React mi Svelte mi?" gibi sorularda güncel verilerle tablo (benimseme, performans, topluluk, trend)

#### 7.2 📒 Ders Defteri (kendini geliştiren sistem)
- [ ] Her hata otomatik yakalanır: başarısız test, build hatası, geri alınan değişiklik, kullanıcının "yanlış" dediği cevap
- [ ] Kayıt: **Ne oldu → Neden oldu → Nasıl çözüldü → Bir daha nasıl önlenir**
- [ ] Benzer bir iş başladığında ilgili dersler otomatik olarak bağlama eklenir
- [ ] Tekrar eden dersler kurala dönüşür ve proje konvansiyonlarına veya persona kurallarına eklenir (kullanıcı onayıyla)
- [ ] Proje sonu retrospektifi: personalar "ne öğrendik" notu yazar ve bu not kütüphaneye eklenir
- [ ] Ders defteri sayfası: arama, filtre, "bu ders kaç kez işe yaradı"

**Bitti sayılır:** Aynı hata ikinci kez yapılmıyor; bir persona cevabında kitaptan kaynak gösteriyor.

---

### Faz 8 — Takım İş Akışları ve Auto Mod

**Hedef:** "Bu özelliği yap" deyince takımın baştan sona kendi başına çalışması.

- [ ] Archon kurulumu ve login ile çalıştığının doğrulanması (bkz. Açık Sorular)
- [ ] Archon adaptörü: iş başlatma, izleme, logları ve sonucu God Eye'a alma
- [ ] Archon yoksa yerleşik basit akış motoru (aynı YAML formatıyla)
- [ ] Hazır akış: PM → Mimar (onay ✋) → Backend ‖ Frontend (ayrı worktree'lerde) → QA (✗ ise geri döner) → Security + DevOps review → PM özeti → onay → merge
- [ ] **"Yaptım" doğrulaması:** build ve testlerden geçmeyen iş bitti sayılmaz
- [ ] **Auto mod:** onaysız çalışır ama sadece izole worktree'de; sonunda tek bir özet ve onay ekranı gelir
- [ ] Görev panosu (Kanban): Yapılacak → Devam Ediyor → Review → Bitti. Kart taşınınca agent başlar
- [ ] Görsel akış ekranı: hangi persona şu an ne yapıyor, canlı

**Bitti sayılır:** "Kullanıcı girişi ekle" diyorum, takım planlıyor, yazıyor, test ediyor, review ediyor ve bana tek bir onay ekranı geliyor.

---

### Faz 9 — ⏰ Zamanlanmış İşler

**Hedef:** Chat'te söylediğim işi zamanı gelince kendi kendine yapsın.

- [ ] Doğal dilden zamanlama: *"Bu projede cuma sabahı bağımlılıkları güncelle"* → sistem anlar, özetler ("Her cuma 09:00, Proje X, Görev: …") ve onay ister
- [ ] Tek seferlik ("yarın 15:00'te") ve tekrarlı ("her gece") işler
- [ ] Çalışma her zaman auto modda ve izole worktree'de olur; sonuç raporu + onay bekleyen değişiklikler
- [ ] Hazır şablonlar: gece test ve güvenlik taraması, haftalık bağımlılık güncellemesi, günlük özet
- [ ] Zamanlanmış işler sayfası: liste, sonraki çalışma zamanı, geçmiş çalışmalar ve sonuçları, duraklat ve sil
- [ ] Bilgisayar kapalıyken kaçırılan işler: açılınca "kaçırılanları çalıştırayım mı?" diye sorar
- [ ] Bütçe sınırı: iş başına maksimum token/süre

**Bitti sayılır:** Chat'e cümleyle bir iş yazıyorum, zamanı gelince yapılıyor, raporu sabah önümde.

---

### Faz 10 — 👁️ Canlı Önizleme ve Seç-Değiştir

**Hedef:** Uygulamayı canlı görmek, bir yere tıklamak, ne istediğini yazmak ve anında değişmesi.

- [ ] Dev sunucuyu otomatik başlatma (`package.json` script tespiti, boş port bulma, log paneli)
- [ ] Önizleme paneli: proxy + iframe; sayfaya seçici script enjekte edilir
- [ ] Element seçimi: hover'da vurgulama, tıklayınca seçme, üst/alt elemente geçme
- [ ] Seçilen elementin yorumlanması: hangi component, **hangi dosya:satır**, stiller, prop'lar, ekran görüntüsü
- [ ] Kaynak eşleme plugin'i: Vite ve Next için `data-source` ekleyen dev plugin'i (React; sonra Vue ve Svelte)
- [ ] Prompt kutusu + persona seçimi: "Frontend, bunu düzelt" / "Security, bu form güvenli mi?"
- [ ] Değişiklik sonrası otomatik yenileme + önce/sonra karşılaştırması
- [ ] Cihaz boyutları: masaüstü, tablet, mobil
- [ ] Görsel regresyon kontrolü (Playwright ekran görüntüleri)
- [ ] Konsol ve ağ hatalarını yakalayıp "bunu düzelt" önerisi

**Bitti sayılır:** Önizlemede bir butona tıklayıp "yeşil yap" yazıyorum, 10 saniye içinde değişmiş görüyorum.

---

### Faz 11 — Ekstralar

- [ ] **Sabah brifingi:** dün ne yapıldı, bugün ne var, nerede takıldık (TR/EN, istenirse sesli)
- [ ] **Proje şablonları:** "Yeni SaaS" → senin en iyi pratiklerinle iskelet
- [ ] **Bildirimler:** session bitti, takıldı, onay bekliyor, puan düştü, limit doluyor (tarayıcı/masaüstü)
- [ ] **Sesli prompt:** mikrofonla konuşarak komut verme
- [ ] **Bağımlılık izleyici:** güncel olmayan veya açığı olan paketler
- [ ] **Sır taraması:** commit'lerde API key veya şifre yakalama
- [ ] **Yedekleme ve dışa aktarma:** hafıza, ders defteri ve kütüphanenin tek dosyalık yedeği
- [ ] **Kendi kendini güncelleme:** yeni sürüm bildirimi + tek tıkla güncelleme

---

### Faz 12 — 🧰 Tam Suit Araçları (başka uygulamaya gerek kalmasın)

- [ ] 🗄️ **Veritabanı gezgini:** tablolar, satırlar, şema diyagramı, sorgu editörü (PostgreSQL, MySQL, SQLite, MongoDB); prod'da varsayılan olarak salt okunur, sorgular "DB Uzmanı'na açıklat"
- [ ] 🐳 **Docker yöneticisi:** container'lar, loglar, yeniden başlatma, kaynak kullanımı (lokal ve SSH)
- [ ] 📜 **Log merkezi:** lokal ve sunucu logları tek yerde, arama, hata gruplama, "bu hatayı düzelt" butonu
- [ ] 🚨 **Hata takibi:** uygulamanın hatalarını yakalama (Sentry benzeri, hafif), hangi commit'ten sonra başladı
- [ ] 📡 **Uptime izleme:** sitelerin açık mı, ne kadar hızlı; kapanınca bildirim
- [ ] 🌐 **Domain ve SSL takibi:** süresi dolacak alan adları ve sertifikalar için uyarı, DNS kayıtları
- [ ] 💾 **Yedekleme yöneticisi:** veritabanı ve dosya yedekleri, zamanlama, geri yükleme testi
- [ ] 💸 **Maliyet paneli:** sunucu, AI, API ve SaaS abonelikleri, aylık toplam ve trend
- [ ] 📝 **Proje wiki'si ve notlar:** her projeye doküman alanı (Markdown + diyagram); hafıza ile bağlantılı
- [ ] 🧭 **Beyaz tahta:** mimari çizimleri ve fikir haritaları (Excalidraw benzeri)
- [ ] 🐙 **GitHub/GitLab entegrasyonu:** issue'lar, PR'lar, CI durumu; issue'dan tek tıkla persona görevi
- [ ] 📅 **Takvim görünümü:** zamanlanmış işler, fazlar, son tarihler, deploy'lar
- [ ] 🔐 **Sır kasası:** tüm projelerin anahtarları tek yerde, şifreli, rotasyon hatırlatıcısı
- [ ] 📊 **Ürün analitiği özeti:** (varsa) kullanıcı sayısı, en çok kullanılan özellikler; PM personasına girdi olur
- [ ] 🔌 **Eklenti sistemi:** eksik kalan her şey için eklenti yazılabilsin (ileride market)

---

### Faz 13 — 🚀 İleri Seviye Öneriler

#### 13.1 AI ve agent'lar
- [ ] 🆓 **Lokal model desteği (Ollama):** limit dolunca veya basit işlerde ücretsiz lokal modelle devam etme (özet, sınıflandırma, çeviri)
- [ ] ⏳ **Limit kuyruğu:** limit dolunca işler kaybolmaz. Kuyruğa girer ve limit sıfırlanınca otomatik devam eder (hesap değiştirmeye yasal ve güvenli bir alternatif)
- [ ] 🥊 **Model arenası:** aynı görevi Claude ve Codex'e ver, sonuçları yan yana karşılaştır, kazananı seç. Hangi modelin hangi işte daha iyi olduğu istatistiğe dönüşür
- [ ] ✍️ **Prompt koçu:** yazdığın prompt'u göndermeden önce iyileştirme önerisi ("şu bilgiyi eklersen daha iyi sonuç alırsın")
- [ ] 📐 **Spec odaklı geliştirme:** büyük bir özellik önce gereksinim → tasarım → görevler → kabul kriterleri olarak yazılır, onaylanır, sonra kodlanır
- [ ] 🔁 **Agent tekrar oynatma:** bir agent'ın yaptığı her adımı video gibi geri sarıp izleme
- [ ] 🧩 Kendi araçlarını ve MCP server'larını God Eye'a ekleme (marketten veya elle)

#### 13.2 Proje yönetimi ve odak
- [ ] 🎯 **Odak modu:** aynı anda çok fazla aktif proje varsa uyarır ("6 proje aktif, 2 tanesine odaklanmayı öner"). Kullanıcının asıl sorunu buydu
- [ ] 🗓️ Yol haritası, kilometre taşları, sprint görünümü, Gantt
- [ ] 🧾 **Otomatik changelog ve sürüm notları:** commit ve session'lardan, kullanıcıların anlayacağı dilde
- [ ] 🕐 **Zaman takibi:** session'lardan otomatik olarak hangi projeye ne kadar zaman harcandığı
- [ ] 📚 **ADR (mimari karar kayıtları):** kararları standart formatta dışa aktarma
- [ ] 💤 Proje durumları: Aktif · Beklemede · Arşiv (arşivlenen proje kaynak tüketmez)
- [ ] ☀️ **Gün sonu devri:** çevrimdışı olurken "bugün ne yaptım, yarın ne var" notu otomatik olarak takıma paylaşılır

#### 13.3 Takım
- [ ] 💬 **Takım sohbeti:** proje bazında kanallar (WhatsApp'a gerek kalmaz). AI ile "bu kanalda dün ne konuşuldu" özeti
- [ ] 👀 **İnsanlar arası kod review:** PR'ları uygulama içinde inceleme, yorum ve onay
- [ ] 🔔 Ücretsiz bildirim köprüleri: Telegram, Discord, e-posta (kendi SMTP'n)
- [ ] 🏆 Takım panosu: kim neye katkı verdi (suçlamak için değil, görünürlük için)

#### 13.4 Operasyon (prod)
- [ ] 🚨 **Olay modu (incident):** site çökünce tek tıkla "savaş odası" açılır. SRE personası logları ve son deploy'ları toplar, zaman çizelgesi çıkarır, çözüm önerir. Sonunda otomatik postmortem raporu hazırlanır
- [ ] 🔄 Staging ortamı oluşturma ve preview deploy
- [ ] 🗃️ Deploy öncesi otomatik DB yedeği + migration kontrolü
- [ ] 📉 Basit performans izleme: yanıt süreleri, yavaş endpoint'ler

#### 13.5 İş ve ürün (CEO tarafı)
- [ ] 📮 **Kullanıcı geri bildirim kutusu:** ürünlerinin kullanıcılarından gelen geri bildirimleri toplama; PM personası sınıflandırır
- [ ] 🌍 Ürün dokümantasyon sitesi üretme
- [ ] 📣 Lansman materyalleri: landing page metni, duyuru yazısı, ekran görüntüleri
- [ ] 📊 Haftalık CEO raporu: tüm projelerin durumu, riskler, kararlar, öneriler (tek sayfa)

#### 13.6 God Eye'ın kendisi
- [ ] 🧭 **Uygulama içi rehber:** "God Eye'ı nasıl kullanırım?" sorularına cevap veren yardımcı + etkileşimli turlar
- [ ] 🧪 **Demo proje:** ilk kurulumda güvenle denemek için hazır bir örnek proje
- [ ] 🔧 Yerel API ve `godeye` CLI: her şey script ile de yapılabilsin
- [ ] 📦 Diğer araçlardan içe aktarma: Linear, Jira, Trello, Notion, GitHub Projects
- [ ] 🧹 Veri saklama politikası: eski session'ların sıkıştırılması, disk kullanım paneli
- [ ] 🕵️ **Sıfır telemetri:** hiçbir kullanım verisi dışarı gönderilmez
- [ ] 🐶 **Dogfooding:** God Eye, God Eye ile geliştirilir. Her eksik ilk önce bizim tarafımızdan hissedilir
- [ ] ⚙️ Hafiflik hedefi: boşta lokal RAM kullanımı < 300 MB

---

## 9. Açık Sorular ve Riskler

| # | Konu | Not / Karar |
|---|---|---|
| 1 | Archon Claude için login mi API key mi kullanıyor? | Faz 8 başında test edilecek |
| 2 | Codex, Gemini ve Antigravity session dosya formatları | Faz 1'de araştırılacak |
| 3 | Claude limit bilgisinin en doğru kaynağı | Session loglarındaki token sayıları + CLI limit mesajları; claude-swap ve clauth yöntemleri incelenecek |
| 4 | ⚠️ Limit dolunca **otomatik** hesap değiştirme | Sağlayıcı şartlarına aykırı olabilir (limit aşma). **Varsayılan: manuel tek tık geçiş + uyarı. Otomatik geçiş kapalı.** |
| 5 | Aynı hesabın hem God Eye'da hem başka yerde kullanılması | Token yenilemesi diğer oturumu düşürebilir; hesap başına ayrı login önerilir |
| 6 | Docker içinde CLI login akışı | Tarayıcıyla OAuth yönlendirmesi container'da nasıl çalışacak test edilecek; gerekirse host'taki login klasörü bağlanır |
| 7 | GPL/AGPL lisanslı projeler | Kod kopyalanmaz, sadece fikirleri kullanılır |
| 8 | Kitapların telif hakkı | Kullanıcı kendi satın aldığı kitapları kişisel kullanım için ekler; uygulama kitap dağıtmaz |
| 9 | Kategori puan ağırlıkları | Varsayılanlar belirlenip ayarlardan değiştirilebilir yapılacak |
| 10 | Kapsam şişmesi | Faz sırasına sadık kalınır; yeni fikirler önce bu dosyaya yazılır, sonra sıraya konur |
| 11 | Uçtan uca şifrelemenin bedeli | Hub arama veya özet yapamaz (zaten yapmaması gerekiyor; tüm bunlar lokalde). Tüm cihazlar ve kurtarma anahtarı kaybolursa veri kurtarılamaz → kurtarma anahtarı onboarding'de zorunlu gösterilir |
| 12 | Tam session paylaşımı | ✅ Karar (bkz. 4.7): Lokal projeler **Kapalı**, takım projeleri **Tam** + sır temizleyici + session bazında "Gizli" anahtarı |
| 17 | X/Twitter erişimi | ✅ Karar: **her şey ücretsiz.** Otomatik X taraması yok (API ücretli, scraping şartlara aykırı). Yerine HN, Reddit, Bluesky, Mastodon, bloglar, bültenler, arXiv, GitHub + elle X linki ekleme |
| 21 | Git akışını bozma riski | ✅ God Eye kodu taşımaz, repoya dosya eklemez, kendiliğinden push/deploy etmez. Sadece okur, uyarır ve onaylı deploy yapar |
| 22 | Ücretsizlik ilkesi | Tüm bağımlılıklar açık kaynak ve ücretsiz. Tek maliyet: kullanıcının zaten sahip olduğu AI abonelikleri ve VPS |
| 18 | Persona "uzmanlığı"nın sınırı | Personalar bir LLM + kütüphane + kurallardır. Gerçek uzman kadar iyi olmaları kanıt zorunluluğuna ve kütüphane kalitesine bağlıdır. Bu yüzden kanıt ve güven göstergesi zorunlu |
| 19 | Test kullanıcılarının maliyeti | 50 paralel test kullanıcısı çok token harcar. Varsayılan 5, bütçe sınırı ve ucuz model |
| 20 | Prod `.env` düzenleme | Yanlış bir değer siteyi çökertebilir. Önce yedek, sonra doğrulama, sonra onay. Değişiklikten sonra sağlık kontrolü yapılır, başarısız olursa geri alma önerilir |
| 13 | AI hesaplarının paylaşılmaması | Her kullanıcı **kendi** AI hesabını kullanır. Hesap bilgileri asla senkron edilmez (sağlayıcı şartları + güvenlik) |
| 14 | SSH ile prod sunucularda AI | En büyük risk burası. Okuma serbest, değiştirme onaylı, tehlikeli komut çift onaylı, her şey denetim kaydında. İlk sürümde prod'da auto mod **kapalı** |
| 15 | AI ile üretilen dil paketleri | Kalite değişken olabilir. Kullanıcı düzeltmeleri kaydedilir. İleride topluluk paketleri |
| 16 | Yjs dokümanlarının büyümesi | Periyodik sıkıştırma (snapshot) yapılacak |

---

## 10. Sonraki Planlar (şimdilik değil)

- [ ] 📱 Telefondan erişim (Tailscale + mobil arayüz)
- [ ] Tauri masaüstü uygulaması + işletim sistemi genelinde `Ctrl+Space`
- [ ] Persona ve iş akışı marketi (paylaşılabilir paketler)
- [ ] Herkese açık yayın: web sitesi, kurulum betiği, dokümantasyon sitesi
- [ ] Cursor ve diğer IDE adaptörleri
