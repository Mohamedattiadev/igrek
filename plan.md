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
- [x] ⭐ **Notion gibi sade:** bol beyaz alan, az renk, içerik ön planda. Süs yok, gölge çok az, çizgiler ince
- [x] ⭐ **JetBrains gibi düzenli:** sol tarafta ince ikon şeridi (tool window bar), açılır kapanır paneller, sekmeli editör, alt durum çubuğu. Her şeyin sabit ve tahmin edilebilir bir yeri var — *ikon şeridi, üst bar, durum çubuğu, Kod sekmesinde sekmeli editör*
- [x] ⭐ Nötr gri palet + **tek vurgu rengi**. Renk sadece anlam taşıdığında kullanılır (🟢 başarılı, 🔴 hata, 🟡 uyarı)
- [x] Sakin tipografi: Inter (arayüz), JetBrains Mono (kod), net bir başlık hiyerarşisi — *iki font da uygulamayla birlikte gelir (internetsiz çalışır)*
- [x] Yoğunluk ayarı: **Rahat** (Notion gibi ferah) / **Kompakt** (JetBrains gibi sıkı)
- [x] Paneller sürüklenip yeniden düzenlenebilir; düzen kaydedilir — *Kod ve Dosyalar yan panelleri sürüklenerek ya da ok tuşlarıyla boyutlanır, boyut hatırlanır*
- [x] "Zen modu": tek tıkla tüm paneller gizlenir, sadece içerik kalır — *Ctrl+Alt+Z veya komut paleti; köşedeki küçük düğmeyle çıkılır*
- [x] Hazır temalar: Açık, Koyu, JetBrains Darcula benzeri, Notion benzeri açık tema — *dördü de WCAG AA kontrastında (her metin rengi 4.5:1 üstü, hesapla doğrulandı)*
- [x] Kural: bir ekranda aynı anda en fazla bir ana aksiyon butonu — *tüm sayfalar tarandı; Bölümler sekmesindeki iki fazla ana buton ikincil yapıldı*
- [x] ⭐ **Emoji yok, gerçek ikonlar:** arayüzde hiç emoji kullanılmaz; her ikon SVG'dir (lucide), ekran okuyucu için etiketlidir ya da `aria-hidden` ile gizlidir. Terminal çıktısında da emoji yok
- [x] ⭐ **Her yerde ipucu (tooltip):** her ikon butonun ve her seçeneğin üzerine gelince ne işe yaradığı sade dille yazar, varsa kısayolu da gösterir. Klavyeyle odaklanınca da çıkar, Esc ya da herhangi bir tuş kapatır — *tek global katman: `data-tip`, `title` ve ikon butonlardaki `aria-label` otomatik ipucuna dönüşür*

### 7.1 Tasarım sistemi
- [x] ⭐ Renk token'ları (açık ve koyu tema), tipografi (Inter + JetBrains Mono), boşluk ölçeği, köşe yarıçapları, gölgeler
- [x] ⭐ shadcn/ui tabanlı ortak bileşen kütüphanesi: kart, rozet, puan halkası, durum noktası, boş durum, yükleniyor iskeleti — *shadcn yerine kendi küçük bileşen kütüphanemiz (`components/ui.tsx`), aynı parçalar*
- [x] Mikro animasyonlar: sayfa geçişleri, canlı durum nabzı, puan dolma animasyonu (Framer Motion) — *Framer Motion yerine saf CSS (ek bağımlılık yok); sistem "daha az hareket" derse kapanır*
- [x] İkon seti: Lucide
- [x] Tasarım vitrini sayfası (`/design`): tüm bileşenler tek sayfada

### 7.2 Teyze testi (herkes kullanabilsin)
- [x] ⭐ **Basit Mod / Pro Mod** anahtarı. Basit modda sadece büyük kartlar, sade dil ve "Ne yapmak istiyorsun?" kutusu görünür
- [x] ⭐ Her teknik terimin yanında `?` balonu ile tek cümlelik açıklama — *25 terimlik sözlük (TR/EN); bölüm başlığında terim geçince `?` kendiliğinden çıkar, diğer yerlerde `<Term>`*
- [x] Hata mesajları suçlamaz, çözüm önerir: "Bağlantı koptu. **Tekrar dene** butonuna bas." — *bağlantı, oturum, bulunamadı, sunucu hataları sade dille; sayfalarda "Tekrar dene" düğmesi*
- [x] Hiçbir ekran boş kalmaz: her boş durumda "şunu yaparak başla" önerisi — *boş bir kurulumla tüm sayfalar gezildi; Limitler ve Dosyalar'a öneri eklendi*
- [x] İlk açılışta kurulum sihirbazı (ilk soru: dil) + 60 saniyelik tur — *kurulum bitince 6 adımlık tur kendiliğinden açılır; Ayarlar'dan ve komut paletinden tekrar başlatılır; Esc/oklarla kullanılır*
- [x] Geri al (Undo) her yerde — *silmeler 6 sn bekler, "Silindi · Geri al"; hafıza, fikir, prompt, sunucu*

### 7.3 Erişilebilirlik ve kalite
- [x] Klavye ile tam kullanım, `Ctrl+K` komut paleti — *Ctrl+K, vim tarzı liste gezinme, odak halkaları, klavyeyle boyutlanan paneller, okla gezilen tur*
- [x] WCAG AA kontrast, ekran okuyucu etiketleri — *axe-core ile 18 sayfa, açık ve koyu temada: 0 ihlal*
- [x] Büyük yazı seçeneği — *Normal / Büyük / Daha büyük; tüm arayüz ölçeklenir, editörde tıklama doğruluğu test edildi*
- [x] Her ekran 1280px ve üstünde kusursuz; 768px'te kullanılabilir — *768px'te taşma testi: tüm sayfalar ve proje sekmeleri temiz*
- [x] Performans: ilk açılış < 1 sn, sayfa geçişi < 100 ms — *ölçülen: ilk açılış 0,63–0,77 sn; sayfa geçişi 14–50 ms (Ayarlar ilk açılışta 112 ms, sonra 59 ms)*

### 7.4 Her dil
- [x] ⭐ Onboarding'in ilk adımı dil seçimi; aranabilir liste, dünyadaki tüm diller — *ISO 639-1'in tamamı (183 dil), adlar kendi dilinde*
- [x] ⭐ Hazır paketler: Türkçe ve İngilizce (elle kontrol edilmiş)
- [x] Diğer diller: seçilince **dil paketi AI ile üretilir** (bir kere, birkaç dakika), `~/.godeye/i18n/` altına kaydedilir. Sonra çevrimdışı da çalışır — *Haiku ile parça parça (3 paralel), {{yer tutucular}} ve çoğul biçimler (ör. Rusça few/many) kontrol edilir; yeni metinler eklenince sadece eksikler çevrilir*
- [x] Paket kalitesini düzeltme: arayüzde "bu çeviri yanlış" → düzeltme kaydedilir — *Ayarlar → Dil → "Bir çeviriyi düzelt"; Türkçe/İngilizce için de çalışır, anında uygulanır*
- [x] RTL (sağdan sola) yerleşim desteği — *sağdan sola dillerde `dir=rtl`, yön ikonları çevrilir*
- [x] Tarih, saat, sayı ve para formatları seçilen dile göre — *Intl ile*
- [x] Tüm AI çıktıları (özetler, persona cevapları, raporlar) kullanıcının dilinde — *özetler, sorular, prompt güçlendirici ve raporlar kullanıcının dilinde; personalar Faz 6'da aynı kuralla*
- [x] Takımda herkes kendi dilinde görür: arkadaşımın Norveççe notu bana Türkçe çevrilmiş görünür, "orijinali göster" seçeneği de olur — *takım arkadaşının profil dili seninkinden farklıysa yorum, karar, öneri, oturum başlığı ve özet otomatik çevrilir (bir kere, önbellekte); "orijinali" bağlantısı; arka plan AI kapalıysa "Çevir" düğmesi*

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
- [x] ⭐ **Docker**
  - [x] Multi-stage Dockerfile, `oven/bun:slim` tabanlı, hedef < 400 MB (ölçülen: ~321 MB açılmış katman)
  - [x] İçinde `git`, `claude`, `codex` CLI'ları kurulu (build argümanıyla seçilebilir) — *`GODEYE_INSTALL_CLAUDE` / `GODEYE_INSTALL_CODEX`; Codex ~300 MB ekler*
  - [x] Volume'lar: `~/.godeye`, `~/.claude`, `~/.codex`, proje klasörleri (kullanıcı seçer)
  - [x] Container içinde kullanıcının UID/GID'si ile çalışır, dosya sahipliği bozulmaz
  - [x] Healthcheck, otomatik yeniden başlama
- [ ] Docker'sız alternatif: `bunx god-eye` (Docker kurmak istemeyenler için) — *Karar (Ekim 2026): şimdilik npm'e yayınlanmıyor; repo özel kalıyor*
- [x] 🔒 Sunucu sadece `127.0.0.1`'e bağlanır; oturum token'ı; Origin ve Host kontrolü (DNS rebinding koruması)
- [x] 🔒 **Prompt güvenlik duvarı:** kullanıcının yazdığı prompt'ta şifre, API key veya kişisel veri varsa AI'a gitmeden önce uyarır ve maskeler — *chat ve Hızlı Soru'da; güçlendirici ve senkron zaten temizler*
- [x] 🔒 **Prompt injection koruması:** web sayfaları, dokümanlar, issue'lar ve loglar gibi dışarıdan okunan içerik **veri** olarak işaretlenir, talimat olarak uygulanmaz. Dışarıdan içerik okuyan agent'ların tehlikeli araçları kapalıdır **Yapıldı:** God Eye'ın kendi AI işleri hiç araçsız çalışır (`--tools ""`), okudukları metin bir şey yaptıramaz. Sohbet internetten içerik okuyunca (WebFetch/WebSearch/tarayıcı MCP) soran moda döner, riskli araçlar her seferinde sorulur ve "her zaman izin ver" onları kapsamaz.
- [x] 🔒 **Sandbox:** auto moddaki agent'lar izole bir ortamda çalışır (worktree + kısıtlı dosya ve ağ erişimi) **Yapıldı:** auto modda sohbet reponun ayrı bir worktree kopyasında, kendi dalında çalışır; değişiklikler incelenip tıklayarak birleştirilir ya da atılır. bubblewrap + socat kuruluysa Claude Code sandbox'ı da açılır (dosya ve ağ sınırı); bu bilgisayarda socat yok, o yüzden ağ sınırı burada test edilemedi. Docker içinde bubblewrap ayrıcalık istediği için imaja eklenmedi.
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
- [x] 🔒 **AI agent'ları asla kendiliğinden `push` etmez veya deploy etmez.** Agent'lar izole worktree/branch'te çalışır, birleştirme ve push her zaman onaylıdır **Yapıldı:** push, merge, publish ve deploy komutları (git, gh, npm/bun, docker, vercel, fly, kubectl, terraform, rsync/scp ile sunucuya…) her modda her seferinde sorulur; "her zaman izin ver" bunları kapsamaz; Claude Code'a da "ask" kuralı olarak verilir.

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
- [x] Persona bazlı varsayılan model + görev bazlı üst sınır — *her personanın kendi modeli (Güvenlik/Mimar Opus, Teknik Yazar Haiku…) ve mesaj başına adım sınırı (`--max-turns`); sohbette elle değiştirilebilir*
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
- [x] API ve kütüphane kullanımı, kurulu sürümün dokümanıyla karşılaştırılır ("bu fonksiyon v5'te kaldırıldı") — *AI'ın session'da düzenlediği dosyalar, projede kurulu sürümle karşılaştırılır: Öğrenme Merkezi'ndeki maddelerin "şu sürümde geldi" bilgisi (resmi dokümandan) ve kod işaretleri kullanılır; ör. React 18.3 kurulu projede `useActionState(` → "19'da geldi; bu projede 18.3.1 var", kopya kâğıdı ve resmi doküman bağlantısıyla. Şimdilik 21 belirgin API (React, Next.js, Vue, TypeScript, Django, Flask, FastAPI, Laravel); kaldırılan API'ler ve her fonksiyonun tam dokümanla karşılaştırılması henüz yok*
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
- [x] Mesaj kutusunun altında araç, hesap, model ve persona seçici — *model seçici + öneri, yeni sohbeti seçilen hesapta başlatma; persona seçici yeni sohbette (konuşma başlayınca persona sabit kalır)*
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
- [x] Sunucu kartı: sağlık durumu, son deploy, son hatalar, "DevOps'a sor" butonu — *sağlık + son deploy'lar; "DevOps'a sor" DevOps personasıyla sohbet açar, sunucunun son durumu taslakta bekler*
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
- [x] ⭐ Onay bekleyen agent'lar, @bahsetmeler, başarısız testler, düşen puanlar, limit uyarıları, zamanlanmış iş raporları, deploy sonuçları, takımdan öneriler — *cevap bekleyen terminaller ve hafıza çelişkileri hazır; diğer kaynaklar ilgili fazlarla eklenecek. Ekim 2026 itibarıyla hepsi Gelen Kutusu'nda: onaylar ve cevap bekleyen sohbetler, @bahsetmeler, başarısız kontroller ve testçi gerilemeleri, düşen puan ve artan bulgular, limit uyarıları, zamanlanmış işlerin raporları ve kaçanlar, takımdan öneriler ve çakışmalar; son eklenen deploy sonuçları (başarısızlar 3 gün, başarılılar 1 gün)*
- [x] Öncelik sıralaması: 🔴 acil · 🟡 bugün · ⚪ bilgi — *onaylar (acil) · cevap bekleyen session'lar (bugün) · hafıza kararları (bilgi)*
- [x] Tek tıkla aksiyon: onayla, reddet, aç, ertele — *onayla, reddet, aç, ertele (4 saat)*
- [x] Ayrıca "Sıfır gelen kutusu" hedefi: her şey ya halledilir ya ertelenir — *her öğe tıklayınca ilgili yere gider (halletmek), "Bugün sonra" ile 4 saat ertelenir; kendiliğinden kaybolmayan bildirimler (başarılı deploy, AI'ın sayfası gibi) "Halledildi" ile kalıcı gizlenir; hepsi bitince "Her şey yolunda" görünür. Erteleme ve gizleme tarayıcı başına*

#### 2.6c 💡 Fikir Kutusu (çok fikir gelen biri için)
- [x] ⭐ Aklına gelen her fikri tek satırla at (her ekrandan `Ctrl+I`, sesli de olabilir) — *Ctrl+I; sesli giriş mikrofon düğmesiyle (Faz 11)*
- [x] PM personası fikirleri otomatik sınıflandırır: hangi proje, hangi faz, ne kadar iş, ne kadar değerli — *tek tıkla: proje, tür, iş büyüklüğü, değer, kısa not*
- [x] Haftalık fikir değerlendirmesi: CEO Danışmanı ile "Hangilerini yapalım, hangilerini bırakalım?" — *Fikirler sayfasında tek tık: şimdi / sonra / bırak + odak cümlesi; "Uygula" deyince durumlar değişir. Otomatik haftalık hatırlatma zamanlanmış işlerle (Faz 9)*
- [x] Onaylanan fikir tek tıkla plana ve görev panosuna eklenir — *"Yapılacak" fikirlerde "Panoya ekle"*
- [x] Hiçbir fikir kaybolmaz, ama hiçbir fikir de odağı bozmaz

#### 2.7 Prompt kütüphanesi
- [x] Prompt kaydetme, etiketleme, değişkenli şablonlar (`{dosya}`, `{proje}`)
- [x] Chat'te `/` ile hızlı çağırma
- [x] Personalar da bu kütüphaneyi kullanabilir — *persona sohbetlerinde prompt seçici ve `/` menüsü aynen çalışır*
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
- [x] ⭐ **Ne, nerede, ne zaman:** zaman çizelgesi grafiği; proje, persona, session ve model bazında kırılım — *14 günlük proje kırılımlı grafik, proje/model/saat dağılımı ve persona bazında token*
- [x] "En çok harcayan 10 session" listesi; tıklayınca session açılır
- [x] Günlük, haftalık ve aylık raporlar — *aylık tablo + CSV indirme*
- [x] Tahmin: "Bu hızla limit saat 16:40'ta dolar" — *son ölçümlerden saatlik hız; sıfırlanmadan önce dolacaksa saatini söyler*
- [x] Uyarılar: limitin %80 ve %95'inde bildirim + "şu hesaba geç" önerisi — *%80 ve üstü Gelen Kutusu'nda acil + üst bar renk değişimi + "başka hesaba geç / Codex'e devret" önerisi; tarayıcı bildirimi de geliyor (Faz 11)*
- [x] Bütçe kuralları: persona veya zamanlanmış iş başına üst sınır — *persona başına adım sınırı (Faz 6), zamanlanmış iş başına süre ve adım sınırı (Faz 9)*

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
- [x] Görev sahiplenme (claim): "Bu işi ben alıyorum". Diğerleri görür, aynı iş iki kez yapılmaz — *panodaki her kartta "Ben alıyorum" (takıma bağlıyken); alan kişinin adı kartta görünür ve takıma gider, başkası aldığı kartı alamaz, "Bırak" ile geri verilir. İki cihaz ve gerçek hub ile testle denendi*
- [x] **Prompt önerme:** arkadaşımın session'ına prompt veya not gönderebilirim. Onun ekranında öneri olarak çıkar, kabul ederse session'ına eklenir. Kimsenin session'ı izinsiz değiştirilmez
- [x] **Session devralma:** "Bu işi sen devam ettir". Özet ve bağlam karşı tarafa geçer, iş kendi bilgisayarında devam eder
- [x] Çapraz çelişki tespiti: iki kişinin aldığı kararlar çelişirse ikisine de haber verilir — *takım arkadaşının yeni kararı seninkilerle Haiku ile karşılaştırılır (otomatik özet açıkken); çelişki işareti senkronla karşıya da gider, kart kimin kararı olduğunu gösterir*
- [x] Yorumlar ve @bahsetme: session'lara, kararlara ve kategori sayfalarına — *@ yazınca isim önerisi çıkar; bahsedilen kişinin Gelen kutusuna düşer*
- [x] Ortak görev panosu: görev bir insana veya bir personaya atanabilir — *pano kartları paylaşılan projelerde takıma gider (son yazan kazanır, silme de gider; arkadaşın akış kaydı gitmez, akışlar başlatan bilgisayarda çalışır). Kart bir takım arkadaşına ya da bir personaya atanır; personaya atanan kart "Devam ediyor"a çekilince adı belirtilmemiş adımlar o persona olarak çalışır. Sadece alınan projede kişinin kendi kartları gitmez, arkadaşların kartlarına yaptığı düzenlemeler gider. Kartı ekleyen arkadaşın adı kartta görünür*
- [x] Takım aktivite akışı: "Bugün takımda ne oldu" (her kullanıcının kendi dilinde)
- [x] Ortak ders defteri: birinin yaptığı hatadan herkesin AI'ı öğrenir — *paylaşılan projelerin dersleri takıma gider (gizli bilgi temizlenerek, son yazan kazanır; tekrar sayısı ve kurala dönüşme de gider, kullanım sayıları ve vektörler her bilgisayarda kalır). Arkadaştan gelen ders "Takımdan: Kerim" olarak görünür ve o projede AI'a verilen derslerin içine girer. Projeye bağlı olmayan genel dersler bilgisayardan çıkmaz; sadece alınan projede kişinin kendi dersleri gitmez. İki cihaz ve gerçek hub ile testle denendi. Bir dersi silmek sadece kendi bilgisayarından siler*

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
- [x] İnsan + agent birlikte gösterilir: "Mohamed → 🤖 Backend Senior persona → `payment.ts` değiştirildi" — *oturum listesinde persona olarak çalışan oturumlar "Mohamed → Backend persona" diye görünüyordu (Faz 6.3); panoda da kartı alan kişi ve atandığı persona birlikte görünür ("Kerim → Güvenlik"). Commit ve satır bazında "kim yazdı" görünümünde persona adı henüz yok, sadece kişi ve araç*
- [x] Kod görünümünde satır bazında: "Bu satırı Kerim, 3 gün önce, Codex ile, şu session'da yazdı" — *Kod sekmesinde "Kim yazdı": satır sonunda kişi · araç · oturum · zaman; üzerine gelince commit ve oturuma bağlantı*
- [x] Proje kartında üye avatarları ve kimin aktif olduğu
- [x] Kişi sayfası: "Kerim bu hafta ne yaptı" (özet, kendi dilimde)
- [x] Bildirim: "Mohamed, senin çalıştığın `auth.ts` dosyasını değiştirdi" — *Gelen Kutusu: canlı ve son 2 saatteki ortak dosyalar*

#### 4.7 ✅ Alınan kararlar (önerilen varsayılanlar)
- [x] **Uçtan uca şifreleme: AÇIK** (kapatılamaz). Güvenliğin temeli
- [x] **Kurtarma anahtarı:** onboarding'de gösterilir, kaydetmek zorunludur (indir veya yazdır). Ayrıca yönetici, üyenin erişimini yeni bir cihaza tekrar verebilir (yeni cihaz, mevcut cihazlardan biri tarafından onaylanır) — *kopyalamadan/indirmeden kapanmaz; tüm anahtar sürümlerini içerir*
- [x] **Paylaşım varsayılanları:** — *takım arkadaşının paylaştığı bir repo sende de varsa onların işi gelir ama seninkiler sen "paylaş" diyene kadar gitmez (yorum ve önerilerin gider)*
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
- [x] Personalar (Faz 6) gelince: prompt seçilen personaya göre hazırlanır (ör. "Güvenlik uzmanı" için risk kontrolü maddeleri) — *sohbet bir personayla açıldıysa güçlendirici o personanın kontrol listesini kullanır: model, listeden bu isteğe uyan maddeleri "Bitti sayılır"a ekler; modelsiz anlık sürümde listenin ilk dört maddesi eklenir. Testle denendi (şablon yolu); model yolu gerçek bir modelle denenmedi*

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
- [x] **"Düzelt" butonları:** her sorunun yanında, tek tıkla ilgili personaya görev olarak gider — *hazır prompt'la o bölümün sahibi personayla sohbet açar (gönderilmez); sahibi sadece okuyorsa (Güvenlik, Mimar) normal sohbet açılır*
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
- [x] Biyografi: "30+ yıl deneyim, şu dönemleri yaşadı, şu tip sistemleri kurdu"
- [x] Alan tarihi zaman çizelgesi (ilk günden bugüne kilometre taşları) — *sadece belgelenmiş olaylar; yılı belirsiz olan yazılmadı*
- [x] Temel okuma listesi + kütüphane bağlantısı (Faz 7) — *gerçek kitaplar, yazar ve yılıyla; kütüphanede olanlar işaretli, olmayanlar tek tıkla eklenir*
- [x] Düşünme tarzı ve kontrol listesi (review yaparken neye bakar)
- [x] Bilinen tuzaklar ve anti-pattern'ler
- [x] Güncel kalma: kendi alanındaki yeni gelişmeleri otomatik takip eder (bkz. 7.3 Bilgi Motoru) — *Gündem (7.1b)*

**Gerçek uzman gibi davranma kuralları (tüm personalar için zorunlu):**
- [x] ⭐ **Tutarlılık:** her personanın bir **"Görüşlerim" defteri** vardır (iddia, gerekçe, kanıt, güven seviyesi, tarih). Cevap vermeden önce kendi geçmiş görüşlerine bakar. "Dün başka, bugün başka" olmaz — *defter her sohbet ve toplantının başında prompt'a girer; persona yeni görüşünü cevabın sonuna `<notebook>` bloğuyla yazar, God Eye bloğu gizleyip kaydeder*
- [x] ⭐ **Fikir değiştirme kuralı:** sadece yeni kanıtla ve açıkça: *"Mart'ta X demiştim. Şu yeni veri yüzünden artık Y diyorum."* — *eski görüşü değiştiren kayıt "yeni kanıt" alanı olmadan kabul edilmez, eski görüş kalır ve sohbette "kaydedilmedi" notu çıkar; değişiklikler defterde geçmişiyle görünür*
- [x] ⭐ **Kanıtsız iddia yok:** her önemli iddiada kaynak bulunur (kitap, makale, resmi doküman, gerçek vaka, istatistik). Kaynak yoksa "bu benim tahminim, güvenim düşük" der — *bu ve aşağıdaki davranış kuralları her personanın prompt'unda; modelin her seferinde uyduğu otomatik olarak doğrulanamaz, gerçek toplantıda cevaplar kaynak verdi*
- [x] **İstatistik ve trend:** geçmiş veriler ve geleceğe dönük projeksiyonlar kaynağıyla birlikte verilir (anket, rapor, benimseme oranları). Tahmin ile kesin bilgi her zaman ayrılır, rakam uydurulmaz
- [x] **Vaka bilgisi:** benzer ürünlerin ve şirketlerin geçmişini bilir (ne denediler, ne işe yaradı, neden battılar) ve bunları karşılaştırır
- [x] **Önem sıralaması:** neyin kritik, neyin "olsa iyi olur", neyin hiç önemli olmadığını açıkça söyler. Her şeyi önemliymiş gibi göstermez
- [x] **Abartı yok:** sakin, net, kendinden emin ama mütevazı. Bilmediğini bilmediğini söyler
- [x] **Güven göstergesi:** her önerinin yanında yüksek / orta / düşük güven — *emoji yerine yazıyla ve renkli rozetle*

**Personalar:**
- [x] 🤖 **AI Engineer:** 1950'den bugüne yapay zekânın tamamı: Turing testi, Dartmouth (1956), perceptron, sembolik AI ve uzman sistemler, AI kışları, backpropagation, SVM, istatistiksel öğrenme, derin öğrenme (AlexNet), RNN/LSTM, Transformer (2017), BERT/GPT, RLHF, LLM'ler, agent'lar, RAG, tool use, MCP, eval'ler, fine-tuning, quantization, MLOps, prompt ve context engineering, AI güvenliği
- [x] 🧭 PM / Takım Lideri: işi böler, atar, takip eder
- [x] 🏛️ Mimar
- [x] 🎨 UI/UX Tasarımcı
- [x] 🖥️ Frontend Senior
- [x] ⚙️ Backend Senior
- [x] 🗄️ DB Uzmanı
- [x] 🚀 DevOps / SRE Senior: sunucular, SSH, CI/CD, Docker, Kubernetes, izleme, olay yönetimi
- [x] 📱 Mobil Senior: iOS, Android, React Native, Flutter
- [x] 📊 Data Engineer: veri hatları, ETL, analitik, veri ambarları
- [x] 🧪 QA: "yaptım" denen işi doğrular
- [x] 🔒 Security
- [x] ⚡ Performans
- [x] 😈 Şeytanın Avukatı: planın zayıf noktalarını bulur
- [x] 📝 Teknik Yazar: dokümantasyon ve özetler

**Liderlik ve strateji personaları:**
- [x] 👔 **CEO Danışmanı / Executive Coach:** CEO'yu güçlendiren kişi. Strateji, önceliklendirme, odak, karar verme, "şu an neye hayır demelisin"
- [x] 🗂️ **Chief of Staff:** tüm projelerin genel durumu, takip edilmeyen işler, haftalık yönetici raporu
- [x] 📦 **Ürün Yöneticisi (Product Manager):** kullanıcı ihtiyacı, yol haritası, özellik önceliklendirme, metrikler
- [x] 📈 **Büyüme ve Pazarlama:** konumlandırma, lansman, SEO, içerik, fiyatlandırma
- [x] 💰 **Finans ve Maliyet:** sunucu, API ve AI maliyetleri, gelir modeli, birim ekonomisi
- [x] ⚖️ **Hukuk ve Uyumluluk:** KVKK, GDPR, lisanslar, kullanım şartları (bilgilendirme amaçlı, avukat yerine geçmez)

**Araştırma personaları:**
- [x] 🔬 **Araştırmacı:** bir konuyu derinlemesine araştırır, kaynakları karşılaştırır, raporlar
- [x] 🧪 **Ar-Ge Mühendisi:** yeni teknolojileri dener, prototip ve kıyaslama (benchmark) yapar, "bunu kullanmalı mıyız?" sorusuna kanıtla cevap verir
- [x] 🕵️ **Rakip Analisti:** benzer ürünleri takip eder, özellik ve fiyat karşılaştırması, "onlar bunu yaptı, biz ne yapmalıyız"

#### 6.1b 👵 Test Kullanıcıları Paneli (gerçek insanlar gibi test eden personalar)

> Amaç: Uygulamayı uzmanlar değil, **gerçek ve sıradan insanlar** nasıl kullanır, onu görmek. "Teyze testi"nin otomatik hali.

- [x] ⭐ Test kullanıcıları, uygulamayı **gerçek bir tarayıcıda** kullanır (Playwright ile tıklar, yazar, kaybolur) ve kullanırken sesli düşünür: *"Bu buton ne işe yarıyor? Korktum, basmıyorum."* — *Personalar → Test kullanıcıları: her biri Playwright MCP (0.0.83) ile kendi izole Chromium'unda, sadece tarayıcı araçlarıyla çalışan bir Claude oturumu; bilgisayarda kod çalıştıran ve dosya yükleyen araçlar kapalı, dosya/kabuk araçları yok. Ekran okuyucu kullanıcısı sadece erişilebilirlik ağacı + klavye, renk körü sayfayı renk filtresiyle görür, az gören en büyük yazıyla, yavaş telefon "Slow 3G" + 4 kat yavaş CPU ile. Gerçek testte telefonda üst çubuğun sayfayı genişletip pencereleri tıklanamaz yaptığını buldular; düzeltildi. Bilgisayarda Chromium gerekir; Docker imajında küçük kalsın diye yok*
- [x] ⭐ Hazır profiller: — *12'si de var*
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
- [x] Profiller **demografik çeşitlilik** için tasarlanır (yaş, cinsiyet, eğitim, dil, engellilik, cihaz). Klişe değil, gerçek kullanıcı araştırmalarına dayanır — *10–75 yaş, kadın ve erkek, Türkçe ve Arapça okuyan, farklı cihaz ve engel durumları; her profil dayandığı araştırmayı yazar (NN/g yaşlılar ve çocuklar raporları, WebAIM ekran okuyucu anketi, WCAG 2.2, renk körlüğü yaygınlığı vb.)*
- [x] Kendi profilini oluşturma: "Hedef kitlem 25–35 yaş arası, Almanya'da yaşayan Türk anneler" — *bir cümleden AI üç farklı kişi çıkarır, listeye eklenir ve silinebilir*
- [x] **Paralel test:** tek tıkla 10–50 test kullanıcısı aynı anda (her biri ayrı tarayıcı oturumunda) — *bir testte en fazla 50 kişi (profil × kopya), aynı anda en fazla 10; her biri ayrı izole tarayıcı. Bu bilgisayarda 3'ü aynı anda denendi; 10'u aynı anda CPU ve Claude limitine bağlı*
- [x] Rapor: nerede takıldılar, ne kadar sürede başardılar, nerede vazgeçtiler, ekran kayıtları, en sık şikâyetler, "teyze puanı" — *sonuç, kolaylık, süre, takıldıkları yerler, sesli düşünme adımları, ekran görüntüleri, sorunlar, şikâyetler, teyze puanı. Video kaydı yok: Playwright MCP bu sürümde video seçeneği sunmuyor; takıldıkları anlarda ekran görüntüsü alınıyor*
- [x] Bulunan sorunlar tek tıkla UI/UX veya Frontend personasına görev olarak gider — *sorunun yanında "UI/UX'e / Frontend'e gönder": o personayla sohbet açılır, sorun taslakta bekler (görev panosu Faz 8)*
- [x] Her önemli değişiklikten sonra otomatik tekrar test (regresyon) — *"Tekrar test et": aynı kişiler, aynı görev; teyze puanı ve her kişinin kolaylığı öncekiyle karşılaştırılır (gerçek denemede 20 → 60). Test sayfasında "Her yeni commit'ten sonra kendiliğinden tekrar test et": projeye yeni commit gelince aynı test kendiliğinden başlar (en fazla iki saatte bir, başka test çalışırken asla; her test model kullanımı harcar). Teyze puanı ya da başarı oranı düşerse gelen kutusuna "Otomatik tekrar test kötüleşti" düşer. "Önemli değişiklik" = yeni commit; birim testle denendi, gerçek bir uygulamada uzun süre çalıştırılmadı*

#### 6.1c 🧪 Uzman Test Takımı
- [x] Birim test yazarı, entegrasyon testçisi, uçtan uca (E2E) testçisi — *Personalar → Test grubu; aynı profil standardı (geçmiş, alan tarihi, kitaplar, kontrol listesi), dosya düzenleyebilirler, push/deploy yine sorulur*
- [x] Yük testçisi: "1000 kişi aynı anda girerse ne olur?" — *kuralı: sadece bu bilgisayar ya da staging, her çalıştırmadan önce sorar*
- [x] Güvenlik testçisi (pentest): OWASP Top 10 kontrolleri, sadece kendi projelerinde ve lokal/staging ortamında — *bu sınır prompt kuralı olarak var ve komutlar "Bana sor" modunda tek tek onay bekler; adresin gerçekten lokal olduğu teknik olarak zorlanmıyor*
- [x] Erişilebilirlik testçisi (WCAG)
- [x] Çapraz tarayıcı ve cihaz testçisi
- [x] Kaos testçisi: "veritabanı giderse, internet koparsa ne olur?"
- [x] Test kapsamı haritası: hangi kısım test edilmiş, hangisi edilmemiş — *Bölümler → Testler: klasör başına çubuk, testi olmayan en büyük dosyalar. Projenin kapsam raporu (coverage/lcov.info, coverage-summary.json) varsa satır kapsamı; yoksa "bir test bu dosyayı içe aktarıyor ya da adını taşıyor mu". Statik harita paket adıyla yapılan içe aktarmaları (ör. `@godeye/core`) izlemez*

#### 6.2 Altyapı
- [x] Persona tanımı: karakter, uzmanlık, kurallar, izinli araçlar, model, kütüphane, rubrik — *`packages/core/src/personas.ts`; araç izni (okur / düzenler / internet), model, adım sınırı ve insight bölümleri (rubrikler bölüm başına) var; kütüphane Faz 7*
- [x] Tanımlardan `.claude/agents/*.md` ve Codex eşdeğerinin otomatik üretilmesi ve senkronlanması — *"Dışa aktar" ile: projeye `.claude/agents/<id>.md` (araçlar ve model ön bilgide) ya da Codex hesabına `prompts/<id>.md`; tekrar dışa aktarınca güncellenir. Kendiliğinden yazmaz; Codex dosyası bu bilgisayarda Codex olmadığı için Codex'te denenmedi*
- [x] Persona düzenleme arayüzü + sıfırdan persona oluşturma sihirbazı — */personas: düzenleyici (yerleşikler de değiştirilip sıfırlanabilir), "bir cümleyle tarif et" → AI taslağı → kontrol et ve kaydet*
- [x] Her persona işe başlamadan hafızayı, ders defterini ve kendi kategori sayfasını okur; bitirince günceller (otomatik) — *hafıza, kendi bölümlerinin puanı/açık kontrolleri/açıklaması ve kendi defteri prompt'a girer; bitince defter güncellenir, oturum özeti hafızaya her zamanki gibi akar; ders defteri de prompt'a girer*
- [x] 🔒 İzin sınırları: Security sadece okur; DevOps onaysız deploy edemez; kimse onaysız `git push` yapamaz — *sadece okuyan personalar `--tools Read,Grep,Glob` ve MCP'siz çalışır; push/merge/deploy her modda ve "hep izin ver"e rağmen sorulur (testli)*

#### 6.3 Etkileşim
- [x] Birebir sohbet: "DevOps, bunu nasıl deploy ederim?" — *mevcut sohbet + `--append-system-prompt` + araç izni + `--max-turns`; oturumlarda "Sen → Backend Senior personası" görünür, devam ettirilen oturum aynı personayla açılır. Gerçek Claude ile denendi*
- [x] Kategori sayfasından "Bu bölümü review et" — *bölümün sahibi personayla sohbet, inceleme isteği taslakta*
- [x] **Takım toplantısı:** bir fikir tüm ilgili personalara sorulur, her biri kendi açısından görüş ve itiraz yazar, PM karar özeti çıkarır, karar hafızaya işlenir — *sorudan ~5 persona önerilir (her zaman bir Şeytanın Avukatı), en fazla 5'i aynı anda araçsız çalışır, Takım Lideri anlaşılan/ayrılan/sonraki adımlarla kararı yazar, "Hafızaya işle" proje kararı yapar. Gerçek Claude ile 5 personalı toplantı uçtan uca denendi*
- [x] **Şeytanın avukatı modu:** her planın altında "Zayıf noktaları bul" butonu — *toplantı kararının ve sohbette bitmiş uzun cevabın altında; kritik/önemli/küçük ve "nasıl denenir"*

#### 6.4 Skor kartı
- [x] Persona başına: tamamlanan iş, yakalanan hata, kabul ve red oranı, token harcaması, ortalama süre — *sohbet, toplantı, hafızaya işlenen karar, görüş, fikir değiştirme, token, ortalama süre. takım işlerinden biten adım, yakalanan sorun (işi geri gönderen inceleme/kontrol) ve birleştirilen/atılan oranı da var*

**Bitti sayılır:** Bir fikri takım toplantısına sokuyorum, 5 uzmanın görüşü ve bir karar özeti geliyor.

---

### Faz 7 — Kütüphane ve Kendi Kendine Öğrenme

**Hedef:** Personalar en iyi kitaplardan ve kendi hatalarından öğrensin.

#### 7.1 Kütüphane (RAG)
- [x] Persona başına kütüphane: kitap (PDF/EPUB), doküman, makale, web sayfası, GitHub repo — *Kütüphane sayfası; her kayıt bütün personalara ya da seçilen birine; X gönderisi ücretsiz oEmbed ile. Taranmış (resim) PDF'ler OCR olmadan okunamaz*
- [x] Sürükle bırak ile ekleme; GitHub URL'si ile repo ekleme — *repo sığ klonlanır, .env ve anahtar dosyaları hiç okunmaz*
- [x] Parçalama + lokal embedding + sqlite-vec indeksi; arka planda, ilerleme çubuklu — *kelime (FTS5) + anlam (multilingual-e5-small, ONNX, bu bilgisayarda; 118 MB bir kez indirilir) birleşik arama. Model dil yanlılığı gösteriyor; kelime ağırlığı ve dolgu kelime filtresiyle Türkçe soru İngilizce kitabın doğru bölümünü buldu. sqlite-vec yüklenemezse vektörler bellekte taranır. Docker imajı budamayla 389 MB*
- [x] MCP aracı: `library_search(persona, soru)` → kaynaklı en iyi 3–5 parça — *persona sohbetlerine God Eye MCP'si otomatik verilir; toplantılarda ilgili pasajlar doğrudan prompt'a girer*
- [x] Cevaplarda kaynak gösterme zorunlu: "Accelerate, Bölüm 4" — *uzman kuralı; gerçek denemede DevOps personası aracı kendisi çağırdı ve "(Google SRE, The Four Golden Signals)" diye kaynak gösterdi, kaynakta olmayanı kendi pratiği olarak ayırdı. Her cevapta uyulduğu otomatik doğrulanamaz*
- [x] Önerilen başlangıç kütüphaneleri (persona başına okuma listesi; kitapları kullanıcı kendisi ekler) — *persona sayfasında her kitabın yanında "Kütüphanede" ya da "Ekle"*
- [x] Kullanıcının eski projeleri otomatik olarak "örnek proje" kütüphanesine eklenir — *her lokal proje: README, kararlar, başarısız denemeler, son işler; günde bir güncellenir, sırlar temizlenir*

#### 7.1b 📰 Bilgi Motoru (personalar her zaman güncel)
- [x] ⭐ Persona başına otomatik bilgi kaynakları: — *Kütüphane → Gündem: Hacker News (Algolia), Reddit RSS, Lobsters, Mastodon, Bluesky, arXiv, GitHub konuları, Product Hunt, Hugging Face günlük makaleleri (Papers with Code 2025'te kapandı), RSS/Atom (blog, changelog, bülten, podcast); persona başına düzenlenebilir, hesap gerekmez. Reddit hız sınırı koyuyor, istekler sıraya alındı; anketler/raporlar (Stack Overflow Survey vb.) link olarak kütüphaneye eklenir, otomatik çekilmez*
  - **Haber ve sosyal (tamamen ücretsiz):** Hacker News, Reddit (RSS), Bluesky, Mastodon, Lobsters, Product Hunt. X/Twitter'daki büyük haberler zaten birkaç saat içinde bu kaynaklara ve bloglara düşer; önde gelen isimlerin çoğu blog, bülten veya Bluesky'de de yazar
  - **X linki ekleme:** önemli bir tweet görürsen linkini yapıştırırsın, kütüphaneye eklenir (otomatik X taraması yok, çünkü ücretsiz yasal yolu yok)
  - **Teknik:** GitHub trending, yeni sürüm notları (release notes), RFC'ler, resmi bloglar ve changelog'lar
  - **Akademik:** arXiv, Papers with Code, konferanslar
  - **Sektör:** raporlar ve anketler (Stack Overflow Survey, State of JS, Gartner özetleri vb.), bültenler (newsletter), podcast transkriptleri
- [x] Günlük veya haftalık otomatik tarama (zamanlanmış iş olarak, düşük maliyetli modelle) — *Kapalı / Günlük / Haftalık (varsayılan haftalık), saatte bir kontrol; arka plan AI kapalıysa bekler. Gerçek tarama 15 persona için ~10 dakika sürdü*
- [x] **Filtre:** gürültü değil sinyal. Önem puanı, tekrar eden haberlerin birleştirilmesi, "hype mı gerçek mi?" değerlendirmesi — *aynı adres ya da çok benzer başlık birleşir (kaç kaynakta geçtiği sayılır), persona 0–10 puan ve gerçek/hype/belirsiz verir, 6 altı atılır, görülen haber tekrar puanlanmaz*
- [x] Önemli gelişmeler persona kütüphanesine **tarihli ve kaynaklı** eklenir
- [x] Görüş güncellemesi: yeni bilgi bir personanın eski görüşünü etkiliyorsa "Görüşlerim" defteri güncellenir ve sana bildirilir — *persona defterine bakar; sadece gerçek ve yeni kanıt olan haberle, defter kuralıyla değişir; Gelen Kutusu'na düşer (testli; gerçek taramada değişen görüş olmadı)*
- [x] **Trend paneli:** "Bu hafta alanında neler oldu", yükselen ve düşen teknolojiler, senin projelerini etkileyen haberler ("kullandığın kütüphanenin yeni sürümü çıktı, şu değişiklik seni etkiler") — *projelerine dokunan haberler, package.json'daki paketlerin yeni ana sürümleri ve GitHub sürüm notundan "seni ne etkiler" özeti (Gelen Kutusu'na da düşer). Yükselen/düşen için en az bir haftalık geçmiş gerekiyor; ilk taramada boş. Şimdilik sadece npm paketleri*
- [x] Karşılaştırma: "React mi Svelte mi?" gibi sorularda güncel verilerle tablo (benimseme, performans, topluluk, trend) — *npm haftalık indirme ve bir yıl öncesi, GitHub yıldız/açık issue, son sürüm, son 90 gün HN haberi; kaynakları altta. Performans ölçümü yok (güvenilir ücretsiz kaynak yok)*

#### 7.2 📒 Ders Defteri (kendini geliştiren sistem)
- [x] Her hata otomatik yakalanır: başarısız test, build hatası, geri alınan değişiklik, kullanıcının "yanlış" dediği cevap — *oturumlardaki test/build hataları, "yanlış/olmadı" diyen mesajlar, Revert commit'leri, geri yüklenen kayıt noktaları, başarısız proje kontrolleri; 10 dakikada bir (arka plan AI açıkken) küçük modelle yazılır, önemsizler atlanır*
- [x] Kayıt: **Ne oldu → Neden oldu → Nasıl çözüldü → Bir daha nasıl önlenir**
- [x] Benzer bir iş başladığında ilgili dersler otomatik olarak bağlama eklenir — *yeni `UserPromptSubmit` hook'u isteğe uyan dersleri ekler (anlam + ortak terim), oturum başında en önemli dersler, personalar başlamadan okur, MCP aracı `godeye_lessons`. Gerçek denemede ders olmadan `grid-cols-2`, dersle `minmax(0,1fr)` yazıldı*
- [x] Tekrar eden dersler kurala dönüşür ve proje konvansiyonlarına veya persona kurallarına eklenir (kullanıcı onayıyla) — *aynı hata tekrar yazılınca ilk derse sayılır; tekrar edenler "kurala dönüştür" diye öne çıkar*
- [x] Proje sonu retrospektifi: personalar "ne öğrendik" notu yazar ve bu not kütüphaneye eklenir — *Ders defterinde proje seçip "Retrospektif yaz"; dersler, kararlar ve son işlerden tek bir not (küçük model) — birden çok personanın ayrı ayrı yazması değil*
- [x] Ders defteri sayfası: arama, filtre, "bu ders kaç kez işe yaradı"

**Bitti sayılır:** Aynı hata ikinci kez yapılmıyor; bir persona cevabında kitaptan kaynak gösteriyor.

---

### Faz 8 — Takım İş Akışları ve Auto Mod

**Hedef:** "Bu özelliği yap" deyince takımın baştan sona kendi başına çalışması.

- [x] Archon kurulumu ve login ile çalıştığının doğrulanması (bkz. Açık Sorular) — *kaynak koddan scratch klasörde kurulup denendi: `CLAUDE_USE_GLOBAL_AUTH=true` ile Claude Code girişiyle çalışıyor, API anahtarı yok. Kullanıcının sistemine God Eye kurmaz (curl|bash); kurmak isteyen kendisi kurar*
- [x] Archon adaptörü: iş başlatma, izleme, logları ve sonucu God Eye'a alma — *Archon kuruluysa akışları panodaki listeye gelir; çalışırken "[adım] Started/Completed" satırlarından düğümler canlı görünür. Push eden ya da PR açan Archon akışları reddedilir. Kurulu bir Archon ikilisiyle uçtan uca denenmedi; satır biçimi denemedeki gerçek çıktıdan alındı*
- [x] Archon yoksa yerleşik basit akış motoru (aynı YAML formatıyla) — *Archon'un `nodes / prompt / bash / depends_on / model` alanları + God Eye alanları (persona, kendi kopyası, kontrol kapısı, inceleme kararı, geri gönderme); projenin `.godeye/flows` ve `.archon/workflows` YAML'ları da okunur (desteklenmeyen Archon özellikleri olan akışlar listelenmez)*
- [x] Hazır akış: PM → Mimar (onay) → Backend ‖ Frontend (ayrı worktree'lerde) → QA (✗ ise geri döner) → Security + DevOps review → PM özeti → onay → merge — *"Yeni özellik" akışı; ayrıca "Hata düzelt"*
- [x] **"Yaptım" doğrulaması:** build ve testlerden geçmeyen iş bitti sayılmaz — *kontrol düğümü projenin typecheck/lint/test komutlarını çalıştırır; kalırsa iş, hata çıktısıyla geliştiricilere geri döner (en fazla 2 kez). Projede test komutu yoksa bunu açıkça yazar*
- [x] **Auto mod:** onaysız çalışır ama sadece izole worktree'de; sonunda tek bir özet ve onay ekranı gelir — *her iş kendi kopyasında, kendi dalında; push/merge/deploy komutları tamamen yasak; onaylayınca sadece bu bilgisayarda birleşir. Değişiklik yoksa (rapor) doğrudan biter*
- [x] Görev panosu (Kanban): Yapılacak → Devam Ediyor → Review → Bitti. Kart taşınınca agent başlar — *proje sayfasında Pano sekmesi; sürükle bırak ya da ok; iş hazır olunca kart Review'a, birleşince Bitti'ye kendiliğinden geçer*
- [x] Görsel akış ekranı: hangi persona şu an ne yapıyor, canlı — *sütunlu akış; her düğümde persona, durum, şu anki araç adımı, deneme sayısı, karar ve çıktı*

**Bitti sayılır:** "Kullanıcı girişi ekle" diyorum, takım planlıyor, yazıyor, test ediyor, review ediyor ve bana tek bir onay ekranı geliyor. — *Gerçek Claude ile örnek bir uygulamada denendi: plan → tasarım → onay → backend ‖ frontend → build/test → QA, güvenlik, DevOps → özet → tek onay ekranı (8 dosya, 16 test geçti, şifreler argon2id) → birleştirildi*

---

### Faz 9 — ⏰ Zamanlanmış İşler

**Hedef:** Chat'te söylediğim işi zamanı gelince kendi kendine yapsın.

- [x] Doğal dilden zamanlama: *"Bu projede cuma sabahı bağımlılıkları güncelle"* → sistem anlar, özetler ("Her cuma 09:00, Proje X, Görev: …") ve onay ister — *Zamanlanmış sayfasında cümleyle ya da sohbette: her sohbete verilen God Eye MCP aracı `godeye_schedule` öneri oluşturur; onaylanana kadar hiçbir şey çalışmaz*
- [x] Tek seferlik ("yarın 15:00'te") ve tekrarlı ("her gece") işler — *bir kez, saatlik, günlük, hafta içi, haftalık, aylık*
- [x] Çalışma her zaman auto modda ve izole worktree'de olur; sonuç raporu + onay bekleyen değişiklikler — *Faz 8 akış motoruyla (tek iş, gece kontrolü, bağımlılık, rapor, düzeltme, özellik); değişiklik varsa onay ekranı, yoksa rapor olarak biter*
- [x] Hazır şablonlar: gece test ve güvenlik taraması, haftalık bağımlılık güncellemesi, günlük özet
- [x] Zamanlanmış işler sayfası: liste, sonraki çalışma zamanı, geçmiş çalışmalar ve sonuçları, duraklat ve sil
- [x] Bilgisayar kapalıyken kaçırılan işler: açılınca "kaçırılanları çalıştırayım mı?" diye sorar — *15 dakikadan geç kalan çalışma kendiliğinden başlamaz; sayfada ve Gelen Kutusu'nda "şimdi çalıştır / atla"*
- [x] Bütçe sınırı: iş başına maksimum token/süre — *süre (dakika, aşılınca durur) ve AI adımı başına en fazla adım; Claude CLI token sınırı vermediği için doğrudan token sınırı yok, adım sınırı onun yerine*

**Bitti sayılır:** Chat'e cümleyle bir iş yazıyorum, zamanı gelince yapılıyor, raporu sabah önümde. — *Gerçek denemede sohbette "bugün 14:26'da testleri çalıştırıp rapor yaz" dedim; Claude öneriyi kendisi oluşturdu, onaylayınca zamanında çalıştı, sonuç Gelen Kutusu'na düştü*

---

### Faz 10 — 👁️ Canlı Önizleme ve Seç-Değiştir

**Hedef:** Uygulamayı canlı görmek, bir yere tıklamak, ne istediğini yazmak ve anında değişmesi.

- [x] Dev sunucuyu otomatik başlatma (`package.json` script tespiti, boş port bulma, log paneli) — *proje sayfasında Önizleme sekmesi; dev/start/serve, paket yöneticisi kilit dosyasından; zaten çalışan bir uygulamanın adresi de verilebilir*
- [x] Önizleme paneli: proxy + iframe; sayfaya seçici script enjekte edilir — *127.0.0.1'de küçük bir vekil, sadece projenin kendi dev sunucusuna gider; HMR WebSocket'leri de geçer*
- [x] Element seçimi: hover'da vurgulama, tıklayınca seçme, üst/alt elemente geçme
- [x] Seçilen elementin yorumlanması: hangi component, **hangi dosya:satır**, stiller, prop'lar, ekran görüntüsü — *dosya:satır:sütun, etiket, sınıflar, metin, hesaplanan stiller, HTML ve ekran görüntüsü; component adı ve prop'lar henüz yok*
- [x] Kaynak eşleme plugin'i: Vite ve Next için `data-source` ekleyen dev plugin'i (React; sonra Vue ve Svelte) — *Vite + JSX için: God Eye kendi config sarmalayıcısıyla ekler, projenin vite config'ine dokunmaz (gerçek Vite 8 + React 19 ile denendi). Next.js, Vue ve Svelte için eklenti yok: oralarda AI dosyayı metin ve sınıflardan arayarak bulur*
- [x] Prompt kutusu + persona seçimi: "Frontend, bunu düzelt" / "Security, bu form güvenli mi?" — *Frontend, UI/UX, Erişilebilirlik, Güvenlik; değişiklikten önce kayıt noktası alınır, tek tıkla geri alınır*
- [x] Değişiklik sonrası otomatik yenileme + önce/sonra karşılaştırması — *dev sunucunun kendi sıcak yenilemesi; elemanın önce/sonra görüntüsü*
- [x] Cihaz boyutları: masaüstü, tablet, mobil
- [x] Görsel regresyon kontrolü (Playwright ekran görüntüleri) — *üç boyutta taban kaydı ve piksel karşılaştırması, değişen yerler kırmızı (başlık değişikliğinde %0,2–0,5 değişim yakalandı)*
- [x] Konsol ve ağ hatalarını yakalayıp "bunu düzelt" önerisi — *console.error, yakalanmamış hatalar, promise'ler, 400+ fetch/XHR; "Bunu düzelt" Frontend personasıyla sohbet açar*

**Bitti sayılır:** Önizlemede bir butona tıklayıp "yeşil yap" yazıyorum, 10 saniye içinde değişmiş görüyorum. — *Gerçek denemede değişiklik önizlemede 5,8–7,3 saniyede göründü (Haiku, doğru dosya ve satır)*

---

### Faz 11 — Ekstralar

- [x] **Sabah brifingi:** dün ne yapıldı, bugün ne var, nerede takıldık (TR/EN, istenirse sesli) — *Projeler sayfasında kart; dünkü commit/session'lardan haiku ile yazılır, günde bir kez önbelleğe alınır, "Sesli oku" tarayıcının konuşma sentezini kullanır. Gerçek veriyle denendi (~14 sn). Arka plan AI kapalıysa sadece istenince yazılır*
- [x] **Proje şablonları:** "Yeni SaaS" → senin en iyi pratiklerinle iskelet — *Yeni proje: SaaS / API / tanıtım sayfası / CLI / boş. Klasör + git + CLAUDE.md/AGENTS.md (diğer projelerdeki konvansiyonlar ve dersler), sonra iskeleti takım akışı kendi kopyasında kurar, onayınla birleşir. CLI şablonuyla denendi: 14 testli kelime sayacı iskeleti kuruldu*
- [x] **Bildirimler:** session bitti, takıldı, onay bekliyor, puan düştü, limit doluyor (tarayıcı/masaüstü) — *Ayarlar'dan izin verilir; Gelen Kutusu'ndaki acil kayıtlar sekme arka plandayken tarayıcı bildirimi olarak gelir. Sadece God Eye bir sekmede açıkken çalışır (ayrı masaüstü uygulaması yok)*
- [x] **Sesli prompt:** mikrofonla konuşarak komut verme — *Sohbet, hızlı soru ve fikir yakalamada mikrofon düğmesi (Web Speech API, arayüz dilinde). Chrome/Edge sesi Google/Microsoft sunucusuna gönderir; Firefox'ta yok, düğme gizlenir. Gerçek mikrofonla bu ortamda denenemedi*
- [x] **Bağımlılık izleyici:** güncel olmayan veya açığı olan paketler — *npm (package.json, kurulu sürüm node_modules'tan) ve PyPI (requirements.txt) için OSV.dev açıkları + registry'den son sürüm; Bölümler > Bağımlılıklar kartı, günlük tarama, yeni açık Gelen Kutusu'na. Cargo/Go henüz yok*
- [x] **Sır taraması:** commit'lerde API key veya şifre yakalama — *Bilinen anahtar ve şifre desenleri; her projenin yeni commit'leri 10 dakikada bir okunur, bulunan değer maskeli saklanır (ilk/son birkaç karakter), commit ve satırla Gelen Kutusu'na düşer. İsteğe bağlı pre-commit koruması commit'i durdurur. Bölümler > Güvenlik kartı*
- [x] **Yedekleme ve dışa aktarma:** hafıza, ders defteri ve kütüphanenin tek dosyalık yedeği — *Ayarlar > Yedekleme: tek JSON, isteğe bağlı şifre (AES-256-GCM, PBKDF2 310k). Hesaplar, anahtarlar, .env yedekleri asla içinde değil. Geri yükleme sadece eksikleri ekler; kütüphane vektörleri yeniden üretilir. Şifreli gidiş-dönüş ve yanlış şifre denendi*
- [x] **Kendi kendini güncelleme:** yeni sürüm bildirimi + tek tıkla güncelleme — *Git kopyası 6 saatte bir fetch eder; yeni değişiklik Gelen Kutusu'na. "Güncelle" = pull --ff-only + bun install + build, yerel değişiklik varsa reddeder; sonra yeniden başlat. Docker'da sadece komut gösterilir. Gerçek bir güncelleme çekme denenmedi (repo zaten güncel)*

---

### Faz 12 — 🧰 Tam Suit Araçları (başka uygulamaya gerek kalmasın)

- [x] 🗄️ **Veritabanı gezgini:** tablolar, satırlar, şema diyagramı, sorgu editörü (PostgreSQL, MySQL, SQLite, MongoDB); prod'da varsayılan olarak salt okunur, sorgular "DB Uzmanı'na açıklat" — *Araçlar > Veritabanları: adresler yerel anahtarla şifreli saklanır; projenin .env'indeki DATABASE_URL ve .sqlite dosyaları değeri gösterilmeden önerilir. Prod: salt okunur işlem (SQLite dosyası read-only açılır), yazma her zaman onay ister. Şema Mermaid ER diyagramı. "DB Uzmanı'na açıklat" sorgu + şema + EXPLAIN gönderir, satır asla. Gerçek PostgreSQL 16 (lokal Docker) ve SQLite ile denendi; MySQL ve MongoDB kodu yazıldı ama gerçek sunucuyla denenmedi*
- [x] 🐳 **Docker yöneticisi:** container'lar, loglar, yeniden başlatma, kaynak kullanımı (lokal ve SSH) — *Araçlar > Docker: compose projesi, durum/sağlık, CPU/bellek, loglar; yeniden başlat/durdur/başlat bir kez onay ister, sunucuda denetim kaydına yazılır. Lokalde gerçek container'larla denendi; SSH yolu sahte sunucuyla test edildi, gerçek sunucuda denenmedi*
- [x] 📜 **Log merkezi:** lokal ve sunucu logları tek yerde, arama, hata gruplama, "bu hatayı düzelt" butonu — *Kaynaklar: .log dosyaları (proje ve /var/log), Docker container'ları, systemd servisleri (lokal veya SSH). Sayı/id/zaman ayıklanarak gruplama; "Bunu düzelt" fix akışını projenin kendi kopyasında başlatır. Projenin .log dosyaları ve compose container'ları öneri olarak çıkar*
- [x] 🚨 **Hata takibi:** uygulamanın hatalarını yakalama (Sentry benzeri, hafif), hangi commit'ten sonra başladı — *Proje > Hatalar ve loglar: tarayıcı ve Node/Bun için birkaç satırlık kod, proje anahtarıyla; mesaj+stack ile gruplama, release (commit) yoksa projenin o anki commit'i; önceki release ile arasındaki commit'ler şüpheli olarak listelenir; çözülen hata dönerse tekrar açılır. Başka porttaki gerçek bir sayfadan uçtan uca denendi. Sınır: sadece God Eye'a ulaşabilen (lokal) uygulamalar gönderebilir*
- [x] 📡 **Uptime izleme:** sitelerin açık mı, ne kadar hızlı; kapanınca bildirim — *1/5/15/60 dk aralık; iki ardışık hata = kapalı, Gelen Kutusu + masaüstü bildirimi; 24 saatlik oran, ortanca süre, çubuk grafik. Kontroller bu bilgisayardan yapılır: God Eye kapalıyken izleme yok*
- [x] 🌐 **Domain ve SSL takibi:** süresi dolacak alan adları ve sertifikalar için uyarı, DNS kayıtları — *Günde bir: 443'teki sertifika (veren, kapsadığı adlar, ad uyuşmazlığı), RDAP ile alan adı bitişi ve kayıt firması, A/AAAA/CNAME/MX/NS/TXT. 30/14/7/1 gün kala uyarı. github.com ve süresi geçmiş expired.badssl.com ile denendi. Bazı ülke uzantılarında RDAP yok, "bilinmiyor" görünür*
- [x] 💾 **Yedekleme yöneticisi:** veritabanı ve dosya yedekleri, zamanlama, geri yükleme testi — *Araçlar > Yedekler: günlük/haftalık/elle, son N yedek saklanır. PostgreSQL pg_dump; test = prod değilse geçici veritabanına geri yükleyip tablo/satır sayar ve siler (prod'da sadece listeler). SQLite VACUUM INTO + bütünlük kontrolü, kopya olarak geri yükleme. Klasörler tar.gz (sunucudan SSH ile). MySQL mysqldump, MongoDB sürücüyle JSON. Gerçek Postgres'te 19 tablo/38 satır geri yükleme testi geçti; MySQL/Mongo denenmedi. Yedekler bu bilgisayarda: God Eye kapalıyken çalışmaz*
- [x] 💸 **Maliyet paneli:** sunucu, AI, API ve SaaS abonelikleri, aylık toplam ve trend — *Araçlar > Maliyet: aylık/yıllık/tek sefer kalemler, başlangıç ve iptal ayı, projeye bağlama; seçilen para biriminde bu ay, önümüzdeki 12 ay, kategoriler ve son 12 ay grafiği. Kurlar ECB (frankfurter.dev, günde bir, anahtarsız); çevrimdışıyken çevrilemeyenler ayrıca belirtilir. God Eye'ın bildiği AI hesapları, sunucular ve alan adları tutar girilmek üzere önerilir; fiyatlar otomatik çekilmez (sağlayıcıların ücretsiz fiyat API'si yok)*
- [x] 📝 **Proje wiki'si ve notlar:** her projeye doküman alanı (Markdown + diyagram); hafıza ile bağlantılı — *Proje > Wiki ve tahtalar: Markdown sayfalar, ```mermaid blokları diyagram olur, [[Sayfa]] bağlantıları (yazılmamışlar ayrı listelenir), geri bağlantılar, aynı konudaki hafıza maddeleri yanda. Persona sohbetleri godeye_wiki MCP aracıyla wiki'yi arar. Takım projelerinde hafıza gibi uçtan uca şifreli senkron*
- [x] 🧭 **AI'ın anladığı beyaz tahta (Excalidraw tabanlı, MIT, ücretsiz):** mimari çizimleri, akışlar, fikir haritaları, el çizimi kutu ve oklar
  - [x] Çizim hem **yapı** (kutular, oklar, yazılar, gruplar, bağlantılar = JSON) hem **resim** (PNG) olarak AI'a verilir; AI ikisini birlikte okur, "bu çizimde ne var" sorusuna doğru cevap verir — *Yapı satır satır (şekil+etiket+konum+çerçeve, "A -> B : etiket", serbest yazı, el çizimi sayısı) + PNG tek mesajda (Claude girişinle, görsel girişi). Kaydedilmemiş son hal gönderilir; boş tahtada AI çağrılmaz. 3 kutu/2 oklu tahtada açıklama birebir doğruydu, uydurma yoktu*
  - [x] "Bunu açıkla", "eksik ne var", "bunu koda dök" (ör. çizilen mimariden klasör yapısı, API listesi, DB şeması) butonları — *Ayrıca tahta hakkında serbest soru. "Açıkla" gerçek denendi; "eksik ne var" ve "koda dök" aynı yoldan geçiyor ama ayrıca denenmedi*
  - [x] Ters yön: AI projenin mimarisini, DB şemasını, akışlarını tahtaya **düzenlenebilir** çizim olarak koyar (Mermaid → Excalidraw) — *Mimari: AI dosya listesi + hafızadan Mermaid üretir (~9 sn). DB şeması AI'sız, bağlı veritabanından (PK/FK oklarıyla). Akış: tek cümleden. Hepsi düzenlenebilir kutu/ok olarak mevcut çizimin sağına eklenir*
  - [x] El yazısı ve serbest çizim de anlaşılır (resim olarak); AI anlamını kutu/yazı olarak düzenli hale getirebilir — *"Düzenle": AI resim+yapıdan Mermaid döner, temiz hali yanına çizilir; okuyamadığını söyler. Serbest çizgilerle denendi; gerçek bir el yazısıyla denenmedi*
  - [x] Her proje ve kategori sayfasına bağlı tahtalar; hafızaya ve kararlara bağlantı; takımla senkron (uçtan uca şifreli) — *Kategori sayfalarında o kategorinin tahtaları; AI tahta okurken proje hafızasını da alır. Senkron hafızayla aynı şifreli kanaldan, son yazan kazanır (birim testli; iki cihazla gerçek senkron denenmedi). Aynı anda birlikte çizim (canlı) yok*
  - [x] Sürüm geçmişi, PNG/SVG/`.excalidraw` dışa aktarma, sohbete sürükle-bırak — *Birkaç dakikada bir (veya büyük değişiklikte) sürüm, geri yükleme mevcut hali de saklar. "Sohbete gönder" yeni sohbeti tahtanın yapısıyla açar; tahta kartı sohbet kutusuna sürüklenince adı ve kimliği yazılır (resim değil). Fontlar God Eye'dan sunulur, internet gerekmez (Çince el yazısı fontu hariç)*
- [x] 🐙 **GitHub/GitLab entegrasyonu:** issue'lar, PR'lar, CI durumu; issue'dan tek tıkla persona görevi — *Proje > Issue'lar ve PR'lar: açık issue'lar, PR'lar (taslak, inceleme durumu, kontrol özeti), son CI çalışmaları; kendi gh/glab girişinle okunur, God Eye oraya yazmaz. "Takıma ver": issue panoya kart olur ve takım kendi kopyasında başlar (bug etiketi → fix akışı). GitHub gerçek repoyla denendi (CI listesi); bu repoda açık issue olmadığı için issue → görev gerçek bir issue'yla değil sahte gh çıktısıyla test edildi. GitLab kodu glab ile yazıldı ama glab kurulu olmadığı için denenmedi*
- [x] 📅 **Takvim görünümü:** zamanlanmış işler, fazlar, son tarihler, deploy'lar — *Araçlar > Takvim: ay görünümü (pazartesi başlar); zamanlanmış işler ve yedekler (çalışacakları zamanlar), deploy'lar ve takım çalışmaları (olanlar, başarısızsa işaretli), sertifika/alan adı bitişleri, elle eklenen son tarih / kilometre taşı / not; projeye göre süzme. "Fazlar" için ayrı bir kaynak yok: kilometre taşı olarak eklenir*
- [x] 🔐 **Sır kasası:** tüm projelerin anahtarları tek yerde, şifreli, rotasyon hatırlatıcısı — *Araçlar > Kasa: tüm projelerin .env anahtarları (değer listelenmez; iç içe proje klasörlerinde her dosya bir kez), elle eklenen sırlar yerel anahtarla şifreli. Aynı değerin kaç yerde kullanıldığı hash ile; 30/90/180/365 gün hatırlatıcı, .env'de değer değişince saat kendiliğinden sıfırlanır, zamanı gelen Gelen Kutusu'na. Şifreleme anahtarı veri klasöründe dosya: ev klasörünün tamamına erişen birine karşı korumaz*
- [x] 📊 **Ürün analitiği özeti:** (varsa) kullanıcı sayısı, en çok kullanılan özellikler; PM personasına girdi olur — *Proje > İzleme > Ürün rakamları: kayıtlar projenin veritabanındaki bir tablodan sayılır (metin ya da sayı olarak saklanan zamanlar; sadece count sorguları), aktif kullanıcılar ve en çok kullanılan özellikler uygulamanın godeyeTrack("özellik", kullanıcı) çağrılarından (hatalarla aynı proje anahtarı; kullanıcı kimliği saklanmadan önce hash'lenir). "PM'e sor" sadece bu rakamlarla Product Manager personasıyla sohbet açar. Uygulamanın God Eye'a ulaşabilmesi gerekir (lokal)*
- [x] 🔌 **Eklenti sistemi:** eksik kalan her şey için eklenti yazılabilsin (ileride market) — *Araçlar > Eklentiler: godeye-plugin.json olan bir klasör (yerel yol ya da https git). Kapalı kurulur; izinleri ve komutları okuyup onaylayınca açılır. Sayfaları Araçlar'da ya da her projede, ağı olmayan kum havuzunda (sandbox iframe + CSP: API'ye, internete, çerezlere erişemez, sayfa açamaz); veriyi sadece izin verdiği salt-okunur yöntemlerle köprüden alır. Komutlar proje klasöründe, görünen bir terminalde, tıklayınca. Örnek: examples/plugins/project-pulse. Kötü niyetli bir test eklentisiyle kum havuzu denendi. Market yok (Sonraki Planlar)*

---

### Faz 13 — 🚀 İleri Seviye Öneriler

#### 13.1 AI ve agent'lar
- [x] 🆓 **Lokal model desteği (Ollama):** limit dolunca veya basit işlerde ücretsiz lokal modelle devam etme (özet, sınıflandırma, çeviri) — *Ayarlar > Lokal model: Kapalı / Limit dolunca / Küçük işlerde her zaman; Ollama'nın modelleri listelenir. God Eye'ın kendi küçük işleri (haiku ile yapılan özet, sınıflandırma, çeviri) gider; kod yazan agent'lar ve personalar asla. Limit hatası gelince o iş lokalde bitirilir ve limit sıfırlanana kadar küçük işler lokalde kalır. Ollama bu makinede kurulu olmadığı için sahte bir Ollama sunucusu ve limit hatası veren sahte bir claude ile test edildi*
- [x] ⏳ **Limit kuyruğu:** limit dolunca işler kaybolmaz. Kuyruğa girer ve limit sıfırlanınca otomatik devam eder (hesap değiştirmeye yasal ve güvenli bir alternatif) — *Takım çalışmaları (ve zamanlanmış işlerin çalışmaları) limit mesajında başarısız olmaz: adım bekler, çalışma "Limit bekleniyor" olur, limitin sıfırlanma saati mesajdan okunur (yoksa 1 saat) ve dakikada bir kontrolle kendiliğinden devam eder; adım deneme hakkı yemez. Hesap asla kendiliğinden değişmez. Etkileşimli sohbetler kuyruğa girmez*
- [x] 🥊 **Model arenası:** aynı görevi Claude ve Codex'e ver, sonuçları yan yana karşılaştır, kazananı seç. Hangi modelin hangi işte daha iyi olduğu istatistiğe dönüşür — *Persona takımı > Model arenası: aynı görev iki modele (sonnet/opus/haiku; Codex CLI kuruluysa codex) her biri kendi kopyasında; süre, dosya ve +/- satır, özet ve diff yan yana; "Bu daha iyi" kazananı birleştirir, diğerini atar; iş türüne göre (arayüz, backend, test, hata, doküman…) kazanım istatistiği. Gerçek bir maç (haiku vs sonnet, README) yapılıp kazanan birleştirildi. Codex kurulu olmadığı için Codex tarafı denenmedi*
- [x] ✍️ **Prompt koçu:** yazdığın prompt'u göndermeden önce iyileştirme önerisi ("şu bilgiyi eklersen daha iyi sonuç alırsın") — *Sohbet kutusunun altında yazarken anında (AI'sız, maliyetsiz) en fazla üç somut öneri: hangi dosya, hata mesajı, ne zaman bitmiş sayılır, "bunu" ne, ne değişmemeli, neyi test etsin, staging mi prod mu, tek mesajda çok iş. Faz 4.5'teki prompt güçlendiricinin yanında çalışır; güçlendirici kapalıysa koç da kapalı*
- [x] 📐 **Spec odaklı geliştirme:** büyük bir özellik önce gereksinim → tasarım → görevler → kabul kriterleri olarak yazılır, onaylanır, sonra kodlanır — *Yerleşik "Önce spec" akışı: Product Manager docs/specs/<ad>/requirements.md (WHEN … SHALL …), mimar design.md, takım lideri tasks.md (görevler + "- [ ]" kabul kriterleri); senin onayından sonra backend/frontend kendi kopyalarında kodlar, kontroller geçer, QA her kriteri işaretler; dokümanlar kodla birlikte birleşir. Akış tanımı test edildi; uçtan uca gerçek bir büyük özellikle henüz çalıştırılmadı*
- [x] 🔁 **Agent tekrar oynatma:** bir agent'ın yaptığı her adımı video gibi geri sarıp izleme — *Session sayfasında "Tekrar oynat": oynat/duraklat, adım adım, 1x/2x/4x, sürüklenebilir çubuk, her adımın türü ve metni, o ana kadar değişen dosyalar. Uzun session'larda son 400 mesajla sınırlı (session sayfasının yüklediği kadar). Değişikliklerin kendisi (diff) adım adım gösterilmez, dosya adları gösterilir*
- [x] 🧩 Kendi araçlarını ve MCP server'larını God Eye'a ekleme (marketten veya elle) — *Ayarlar > Kendi MCP sunucuların: ücretsiz sunucular kataloğu (memory, sequential-thinking, fetch, git, playwright, context7; sürümler sabit) ya da elle komut/URL + şifreli ortam değişkenleri. Kapalı eklenir; "Dene" sunucuyu başlatıp araçlarını listeler (sequential-thinking gerçek denendi); açılanlar sohbetlerde God Eye araçlarının yanında sunulur. Otomatik takım çalışmalarına verilmez. Gerçek market yok*

#### 13.2 Proje yönetimi ve odak
- [x] 🎯 **Odak modu:** aynı anda çok fazla aktif proje varsa uyarır ("6 proje aktif, 2 tanesine odaklanmayı öner"). Kullanıcının asıl sorunu buydu — *Projeler sayfasında: son 7 günde 3'ten fazla aktif projede uyarı; yaklaşan kilometre taşı ve son aktiviteye göre 2 proje önerir, diğerlerini tek tıkla beklemeye alır; 7 gün ertelenebilir*
- [x] 🗓️ Yol haritası, kilometre taşları, sprint görünümü, Gantt — *Pano > Yol haritası: kilometre taşları (ulaşıldı işareti), görevler ve takım çalışmaları zaman çizelgesinde (basit Gantt), iki haftalık sprint özeti ve son üç sprintte biten iş sayısı*
- [x] 🧾 **Otomatik changelog ve sürüm notları:** commit ve session'lardan, kullanıcıların anlayacağı dilde — *Wiki'de "Sürüm notları": son etiketten (ya da 2 haftadan) beri commit, session ve birleştirilen çalışmalardan kullanıcı diliyle; wiki'ye kaydet / kopyala. Gerçek projede denendi*
- [x] 🕐 **Zaman takibi:** session'lardan otomatik olarak hangi projeye ne kadar zaman harcandığı — *Araçlar > Zaman: session mesaj zamanlarından 15 dk boşlukla bölünen bloklar; proje/gün grafiği. Sadece AI ile geçen zamanı ölçer*
- [x] 📚 **ADR (mimari karar kayıtları):** kararları standart formatta dışa aktarma — *Hafıza'da "ADR olarak dışa aktar": kararlar Nygard formatında (bağlam ve sonuçlar küçük modelle, bilinmeyen uydurulmaz), docs/adr .zip ya da wiki sayfası*
- [x] 💤 Proje durumları: Aktif · Beklemede · Arşiv (arşivlenen proje kaynak tüketmez) — *Aktif/Beklemede/Arşiv; arşivdekiler sır taraması, bağımlılık, commit eşitleme, günlük rapor ve brifinge girmez; hiçbir şey silinmez*
- [x] ☀️ **Gün sonu devri:** çevrimdışı olurken "bugün ne yaptım, yarın ne var" notu otomatik olarak takıma paylaşılır — *"Günü kapat": bugünkü işten Bugün/Yarın/Takıldığım notu, düzenlenip takıma (şifreli takım mesajı) paylaşılır. Otomatik zamanlı gönderim yok, elle tetiklenir*
- [x] 🌙 **Gün sonu özeti ("naptık ne ettik"):** her akşam o günün özeti kendiliğinden hazır olur: hangi projede ne yapıldı, kaç commit/session, ne kadar zaman, neler bitti, neler yarım kaldı; geçmiş günlere geri bakılabilir — *Projeler sayfasında "Gün sonu: naptık ne ettik" kartı: proje başına süre, commit ve birleştirilen iş sayıları; altında sohbet diliyle ne bitti / ne yarım kaldı / yarın nereden devam. 21:00'den sonra kendiliğinden yazılır (arka plan özetleri açıksa), istenirse elle; her gün saklanır, eski günler seçilip okunur. Bugünün gerçek verisiyle denendi (~30 sn)*

#### 13.3 Takım
- [x] 💬 **Takım sohbeti:** proje bazında kanallar (WhatsApp'a gerek kalmaz). AI ile "bu kanalda dün ne konuşuldu" özeti — *Takım sayfasında Takım sohbeti: paylaşılan her projenin #general kanalı + yeni kanallar; takım yorumlarıyla aynı uçtan uca şifreli kanaldan gider, okunmamış sayısı, @ad bildirimi; "Ne konuştuk" dünden beri olanı küçük modelle özetler. İki cihaz arası iletim senkron testinde doğrulandı; gerçek bir takımla denenmedi*
- [x] 👀 **İnsanlar arası kod review:** PR'ları uygulama içinde inceleme, yorum ve onay — *Proje > Issue'lar ve PR'lar > İncele: PR diff'i uygulamada, yorumla Onayla / Değişiklik iste / Yorum; sadece sen tıklayınca kendi gh/glab girişinle gider. Komutlar sahte gh ile test edildi; bu repoda açık PR olmadığı için gerçek PR'da denenmedi. Satır bazlı yorum yok*
- [x] 🔔 Ücretsiz bildirim köprüleri: Telegram, Discord, e-posta (kendi SMTP'n) — *Ayarlar > Bildirim köprüleri: Telegram (kendi botun), Discord webhook, kendi SMTP'n (nodemailer); olay seçimi (site kapandı, uygulama hatası, yedekleme, onay, takım seni bekliyor), deneme gönderimi; token/şifre şifreli; giden metin sır temizleyiciden geçer, sadece başlık. Telegram/Discord sahte uçlarla, e-posta yerel sahte SMTP sunucusuyla test edildi; gerçek hesaplarla denenmedi*
- [x] 🏆 Takım panosu: kim neye katkı verdi (suçlamak için değil, görünürlük için) — *Takım sayfasında Takım panosu: paylaşılan projelerde kişi başına commit (git yazar adı üyeyle eşleştirilir), AI session, yorum, hafıza katkısı; 7/30/90 gün. Gerçek bir takımla denenmedi*

#### 13.4 Operasyon (prod)
- [x] 🚨 **Olay modu (incident):** site çökünce tek tıkla "savaş odası" açılır. SRE personası logları ve son deploy'ları toplar, zaman çizelgesi çıkarır, çözüm önerir. Sonunda otomatik postmortem raporu hazırlanır — *Proje > İzleme > Olay modunu aç: uptime, uygulama hataları, log hata grupları, son 3 günün deploy'ları ve 24 saatin commit'leri tek zaman çizelgesinde; DevOps/SRE personası (sonnet) ne olduğunu, sıralı olası nedenleri kanıtıyla, önce çalıştırılacak salt-okunur komutları ve hızlı kurtarmayı yazar; notlar zaman çizelgesine eklenir; "Çözüldü" suçlamasız postmortem'i yazıp wiki'ye kaydeder. Gerçek kayıtlı bir hatayla uçtan uca denendi. Sunucuda kendiliğinden komut çalıştırmaz*
- [x] 🔄 Staging ortamı oluşturma ve preview deploy — *Ortamlar: "Staging oluştur" repoyu aynı sunucuda yeni klasöre klonlayıp aynı deploy komutuyla yeni ortam yapar (onaylı tek komut, denetim kaydında); deploy penceresinde dal seçilerek önizleme deploy'u (sadece o sefer, ortam kendi dalında kalır). Sahte sunucuyla test edildi; gerçek sunucuda denenmedi. Ayrı alan adı/port ayarı yapmaz*
- [x] 🗃️ Deploy öncesi otomatik DB yedeği + migration kontrolü — *Deploy'dan önce projenin veritabanı yedek işleri çalışır, yedek başarısızsa deploy durur; deploy kaydına yedek yazılır. Kontroller: gelecek migration dosyaları + veri kaybettirebilecek SQL (DROP, TRUNCATE, RENAME, tür değişikliği, WHERE'siz DELETE) + yedek kurulu değil uyarısı*
- [x] 📉 Basit performans izleme: yanıt süreleri, yavaş endpoint'ler — *Uygulamanın sunucusuna birkaç satırlık timing() ara katmanı (Uygulamayı bağla); uç nokta başına (id'ler katlanır) günlük histogram; İzleme sekmesinde istek sayısı, p50, p95 (önceki haftaya göre yavaşladı/hızlandı), 5xx sayısı; en yavaş önce. Birim testli; gerçek bir uygulamadan gelen trafikle denenmedi*

#### 13.5 İş ve ürün (CEO tarafı)
- [x] 📮 **Kullanıcı geri bildirim kutusu:** ürünlerinin kullanıcılarından gelen geri bildirimleri toplama; PM personası sınıflandırır — *Uygulamayı bağla kodunda godeyeFeedback(metin, iletişim); gelenler İzleme sekmesinde, PM'in küçük modeli hata/istek/övgü/soru/diğer + tek satır özet + memnuniyet olarak sınıflar (metin sır temizleyiciden geçer, iletişim bilgisi modele gitmez); hata ve istek tek tıkla panoya. Sahte modelle test edildi; gerçek bir ürünün kutusundan denenmedi*
- [x] 🌍 Ürün dokümantasyon sitesi üretme — *Wiki'de "Doküman sitesi": README giriş sayfası + her wiki sayfası bir HTML, [[bağlantılar]], aramalı, açık/koyu tema, Mermaid diyagramları; iç sayfalar (postmortem, lansman taslakları) dışarıda; her statik barındırmaya konacak zip. Mermaid için jsDelivr'den sabit sürüm yüklenir. notes-app'te üretilip tarayıcıda açıldı*
- [x] 📣 Lansman materyalleri: landing page metni, duyuru yazısı, ekran görüntüleri — *Wiki'de "Lansman materyalleri": Growth personası README, wiki ve son sürüm notlarından tanıtım sayfası metni (başlık, 3 fayda, çağrı, SSS), duyuru yazısı, kısa paylaşım ve slogan yazar; adres verilirse masaüstü ve telefon ekran görüntüleri eklenir; hepsi wiki sayfası olur. notes-app'te gerçek denendi (~54 sn)*
- [x] 📊 Haftalık CEO raporu: tüm projelerin durumu, riskler, kararlar, öneriler (tek sayfa) — *Projeler > Haftalık rapor: son 7 günün tüm projeleri (yeşil/sarı/kırmızı ve nedeni), riskler, alınan kararlar, gelecek hafta için en fazla 5 adım; CEO koçu personasıyla; pazartesi sabahı kendiliğinden yazılır, eski haftalar saklanır. Gerçek veriyle denendi (~44 sn)*

#### 13.6 God Eye'ın kendisi
- [x] 🧭 **Uygulama içi rehber:** "God Eye'ı nasıl kullanırım?" sorularına cevap veren yardımcı + etkileşimli turlar — *Üst çubukta soru işareti: aranabilir 26 konuluk rehber (her biri ilgili sayfayı açar), "Sor" kutusu (küçük model sadece rehberden cevaplar ve ilgili konuları önerir) ve "Turu göster". "sunucuya nasıl deploy ederim?" gerçek modelle denendi. Rehber metinleri elle yazıldı; uygulama değiştikçe elle güncellenmeli*
- [x] 🧪 **Demo proje:** ilk kurulumda güvenle denemek için hazır bir örnek proje — *Yeni proje penceresinde ve boş projeler sayfasında "Demo proje oluştur": ~/Projects/godeye-demo'ya küçük bir todo API (3 tarihli commit, bilerek bırakılmış bir hata), TR/EN wiki sayfaları (diyagramlı), 3 pano kartı, 3 hafıza kaydı ve bir kilometre taşı. İnternete çıkmaz. Testle ve tarayıcıda denendi*
- [x] 🔧 Yerel API ve `godeye` CLI: her şey script ile de yapılabilsin — *`godeye` komutu (package.json bin; `bun run godeye …`): status, projects, search, ask, inbox, run <proje> <akış> <istek>, recap, weekly, doctor ve her uç noktaya `godeye api GET /api/...`. Çalışan God Eye'a bu bilgisayardaki oturum anahtarıyla bağlanır (dışarı çıkmaz). Gerçek sunucuya karşı denendi*
- [x] 📦 Diğer araçlardan içe aktarma: Linear, Jira, Trello, Notion, GitHub Projects — *Pano > İçe aktar: Trello JSON, Jira CSV, Linear CSV, Notion CSV dosyası ya da GitHub Projects (gh project item-list ile, kendi girişinle); durumlar Yapılacak/Devam/Review/Bitti'ye eşlenir, aynı başlık iki kez eklenmez, kartlar takımı başlatmaz. Örnek dosya biçimleriyle test edildi; gerçek bir Jira/Linear hesabının dışa aktarımıyla denenmedi*
- [x] 🧹 Veri saklama politikası: eski session'ların sıkıştırılması, disk kullanım paneli — *Ayarlar > Disk ve saklama: God Eye'ın diskteki parçaları (veritabanı, arama modeli, çalışma kopyaları, yedekler…), session/mesaj sayısı; konuşma kopyalarını 30/90/180/365 gün ya da her zaman saklama; temizlik özeti olan eski konuşma kopyalarını, biten çalışmaların kopyalarını ve 30 günden eski ekran görüntülerini siler, sonra VACUUM; seçiliyse günde bir kez kendiliğinden. Özetler ve AI araçlarının kendi dosyaları silinmez*
- [x] 🕵️ **Sıfır telemetri:** hiçbir kullanım verisi dışarı gönderilmez — *Hiçbir kullanım verisi gönderilmiyor; Ayarlar > Ağ bunu gösterir: sunucunun başladığından beri açtığı her internet adresi, kaç kez ve ne için (arama modeli, açık veritabanı, paket sürümleri, RDAP, kurlar, haberler, köprüler); sorgu dizeleri ve token'lar kaydedilmez. claude/git/gh/ssh gibi araçların kendi trafiği kapsam dışı (kendi girişlerinle kendi servislerine)*
- [x] 🐶 **Dogfooding:** God Eye, God Eye ile geliştirilir. Her eksik ilk önce bizim tarafımızdan hissedilir — *Kısmen: God Eye'ın kendi reposu God Eye'da kayıtlı; tekrar oynatma, gün sonu özeti, haftalık rapor, zaman takibi ve CLI bu repo üzerinde denendi ve bulunan eksikler (ör. özetin İngilizce başlıkları, takvim aralığı hatası) düzeltildi. Ama geliştirmenin kendisi hâlâ doğrudan Claude Code terminalinde yapılıyor, God Eye'ın takım akışlarıyla değil*
- [x] ⚙️ Hafiflik hedefi: boşta lokal RAM kullanımı < 300 MB — *Ölçüldü: boşta sunucu ~85 MB (sayfalar gezildikten sonra da ~86 MB). Arama modeli artık ayrı bir alt süreçte çalışır (çalışırken ~400 MB) ve 3 dakika boşta kalınca kapanır; önce ana süreçte yüklenince 467 MB'ta kalıyordu*

### Faz 14 — 📚 Öğrenme Merkezi: Kopya Kâğıtları ve Yol Haritaları

**Hedef:** Kodla ilgili her şey için tek yerde, doğru, güncel ve sade bir başvuru kaynağı. Hiç kod yazmamış biri sıfırdan başlayıp deploy edilmiş bir uygulamaya kadar adım adım gidebilsin.

#### 14.1 🧾 Kopya kâğıtları (cheatsheet) — her şey için
- [x] ⭐ Tek aranabilir merkez (Ctrl+K'den de): diller (JS/TS, Python, Go, Rust, Java, C#, PHP, SQL, Bash…), framework'ler, araçlar (Git, Docker, Kubernetes, Linux komutları, SSH, Nginx, regex, HTTP durum kodları, cron, Vim, tmux…), kavramlar (Big-O, tasarım desenleri, SOLID, REST/GraphQL, OAuth/JWT, CORS, caching) — *44 kopya kâğıdı, 1500 madde: diller, framework'ler, araçlar (Git, Docker, Kubernetes, Linux, SSH, Nginx, regex, HTTP, cron, Vim, tmux…) ve kavramlar (Big-O, tasarım desenleri, SOLID, REST/GraphQL, OAuth/JWT, CORS, caching). /learn sayfası ve Ctrl+K araması; Türkçe karakter yazmadan da bulur. 577 örnek kontrol betiğiyle gerçekten çalıştırılıp çıktısı karşılaştırılıyor (bash, JS, TS, Python, SQLite, PostgreSQL, Go, Rust, Java, C#, PHP)*
- [x] Her madde: ne işe yarar (bir cümle) → en çok kullanılan biçim → kısa örnek → sık hata → "ne zaman kullanılmaz"; kopyala butonu — *her maddede tek cümle açıklama, en çok kullanılan biçim, örnek, sık hata, "ne zaman kullanılmaz", kaynak; her kod bloğunda kopyala butonu*
- [x] **Seviyeler:** temel / orta / ileri; Basit modda sade dil — *her madde temel/orta/ileri; Basit modda kâğıt "temel" seviyede açılır*
- [x] **Projeye bağlı:** projede kullanılan teknolojilerin kopya kâğıtları öne çıkar, kurulu **sürüme** göre (ör. React 19, Next 16, Python 3.13); eski sürüm farkları işaretlenir — *proje seçilince package.json/node_modules, requirements/pyproject, Cargo.toml, composer.json, .csproj, go.mod vb. okunur, kullanılan teknolojilerin kâğıtları öne çıkar ve kurulu sürüm gösterilir; 239 maddede "şu sürümde geldi" ve eski sürüm farkı işaretli. Halüsinasyon dedektörü (1.9) de bu bilgiyi kullanır*
- [x] Doğruluk: içerik resmi dokümanlardan üretilir, her maddede kaynak bağlantısı; Bilgi Motoru (7.1b) ile yeni sürüm çıkınca güncellenir; kullanıcı "yanlış" diye işaretleyebilir — *içerik elle (AI ajanlarla) resmi dokümanlardan yazıldı, her maddede resmi kaynak bağlantısı (kontrol betiği bağlantıları açıp dener); npm, endoflife.date ve PyPI'den yeni sürüm günlük kontrol edilir, kâğıt eski kalınca işaretlenir ("güncelle" otomatik değil, elle); kullanıcı maddeyi "yanlış ya da eski" diye bildirebilir. man.openbsd.org bu makineden açılmadığı için ssh ve tmux bağlantıları yerel kılavuzla doğrulandı*
- [x] Kendi notlarını ekleme, favoriler, yazdırılabilir/PDF tek sayfa sürüm; TR/EN ve diğer diller (dil paketleri gibi AI ile) — *notlar, favoriler, yazdırma/PDF görünümü; TR ve EN elle yazıldı, diğer diller ilk açılışta AI ile çevrilip saklanır (kod çevrilmez)*
- [x] Kod editöründe seçili koda "bu nedir?" → ilgili kopya kâğıdı maddesi açılır — *editörde seçili kod için "Bu nedir?" ilgili maddeleri açar*

#### 14.2 🗺️ Yol haritaları — sıfırdan deploy'a
- [x] ⭐ En çok kullanılan teknolojiler için tam yol haritası: Web temelleri (HTML/CSS/JS), TypeScript, React, Next.js, Vue/Nuxt, Svelte, Angular, Node/Express/Hono/NestJS, Bun, Python (Django, FastAPI, Flask), Go, Rust, Java/Spring, .NET, PHP/Laravel, React Native, Flutter, Swift/iOS, Kotlin/Android, SQL/PostgreSQL, MongoDB, Redis, Docker, Kubernetes, CI/CD (GitHub Actions), Linux sunucu, AWS/GCP/Azure temelleri, AI/LLM uygulamaları (RAG, agent'lar, MCP) — *yazılanlar (31/31): Web temelleri, TypeScript, React, Next.js, Vue, Svelte, Angular, Node/Express, Bun, Python, FastAPI, Django, Flask, Go, Rust, Java/Spring, .NET, PHP/Laravel, React Native (Expo), Flutter, Swift/iOS, Kotlin/Android, SQL/PostgreSQL, MongoDB, Redis, Docker, Kubernetes, CI/CD (GitHub Actions), Linux sunucu, AWS/GCP/Azure temelleri (Google Cloud ile), AI/LLM uygulamaları (RAG, agent, MCP).* *Dürüst not: mobil yol haritalarının (React Native, Flutter, Swift/iOS, Kotlin/Android) ve Kubernetes/cloud kodlarının bir kısmı cihaz, hesap ya da küme gerektirdiği için resmi dokümandan yazıldı, çalıştırılmadı (Swift: 41 kod bloğu sadece `swiftc -parse` sözdizimi denetiminden geçti; SwiftUI/SwiftData kısımları Mac olmadan derlenmedi)*
- [x] Her yol haritası aynı iskelet: **0. Bilgisayarı hazırlama → 1. İlk satır kod → 2. Temel kavramlar → 3. İlk küçük proje → 4. Veri ve API → 5. Test → 6. Güvenlik → 7. Performans → 8. Paketleme → 9. Deploy → 10. İzleme ve bakım → 11. İleri konular** — *12 aşamanın her birinde en az bir adım; doğrulayıcı sırayı ve eksik aşamayı kontrol eder*
- [x] ⭐ Her adımda **tam açıklama:** neden gerekli, ne öğreneceksin, adım adım ne yapacaksın, çalışan örnek kod, sık hatalar ve çözümleri, "anladım mı?" mini testi, tahmini süre — *her adımda neden, ne öğreneceksin, adım adım yapılacaklar, örnek projenin dosyaları, sık hatalar ve çözümleri, mini test ve tahmini süre. Kodlar yazılırken ajanlar örnek projeyi gerçekten kurup testlerini çalıştırdı; hesap gerektiren adımlar (GitHub, Render, Neon, VPS, PyPI) resmi dokümandan yazıldı, çalıştırılmadı*
- [x] Adımlar arasında ön koşul bağlantıları (grafik görünümü); ilerleme takibi (bitirdiğin adımlar işaretlenir) — *ön koşullar grafik olarak çizilir; bitirilen adımlar işaretlenir ve saklanır*
- [x] **Uygulamalı:** her yol haritası gerçek bir örnek projeyle ilerler; "bu adımı bana yaptır" → God Eye ayrı bir kopyada (worktree) örnek projeyi kurar, sen adım adım takip edersin — *her yol haritası tek bir gerçek örnek projeyi adım adım büyütür; "Bu adımı bana yaptır" adımı öğretmen personaya ayrı bir kopyada (worktree) yaptırır*
- [x] Kendi projene uyarlama: "Bu proje hangi adımda?" → eksik adımlar (test yok, izleme yok…) Kategori Sayfaları ve puanlamaya bağlanır — *"Projen hangi adımda?": test, güvenlik, deploy, izleme gibi aşamalar projenin puanlarından, deploy'larından ve izleyicilerinden okunur; bilinmeyen "bilinmiyor" kalır*
- [x] İlgili persona her yol haritasının "öğretmeni" olur (ör. Frontend Senior React yolunu anlatır, sorulara cevap verir) — *her yol haritasının öğretmeni bir persona (frontend, backend, database, devops, ai-engineer)*
- [x] İçerik doğruluğu: resmi dokümanlara dayanır, kaynak gösterilir, sürüm etiketi taşır; Bilgi Motoru ile güncel tutulur; yanlış/eskimiş adım bildirilebilir — *her adımda resmi kaynak, sürüm etiketi ve son kontrol tarihi; adım "yanlış ya da eski" diye bildirilebilir*
- [x] Tüm diller desteklenir (TR/EN elle kontrol edilmiş, diğerleri dil paketi gibi) — *TR ve EN elle yazıldı; diğer diller dil paketi gibi AI ile çevrilip saklanır. Türkçe metinleri ana dili Türkçe olan biri baştan sona okumadı*

**Bitti sayılır:** Hiç kod bilmeyen biri React yol haritasını takip ederek kendi küçük uygulamasını yazıp internete deploy ediyor; her adımda neden yaptığını anlıyor.

*Not (Ekim 2026): Bu ölçüt gerçek bir acemiyle henüz denenmedi. React yol haritasının kodu çalıştırılıp test edildi; bir acemi takip edip deploy etmedi.*

---

### Faz 15 — 🛡️ Kalite Kapısı: Temiz Kod, Doğru Mimari, Sağlam Veritabanı, Hızlı Uygulama

**Hedef:** Hem God Eye'ın kendisinde hem God Eye ile yazılan her projede ölü kod, anti-pattern, mimari ihlal, veritabanı anomalisi ve performans sorunu **yeni girmez**, var olanlar sıfıra iner. Sadece bir persona değil: önce her seferinde aynı sonucu veren araçlar ve kurallar karar verir, personalar açıklar ve düzeltir.

**Neden persona yetmez:** Bir persona fikir verir ama bir şeyi kaçırabilir, her seferinde biraz farklı konuşur. Kapı ise ölçer, kanıt gösterir ve engeller. "Sıfır bug" kimse için garanti edilemez; buradaki ölçülebilir hedef: **tespit edilebilen her sorun türünde sıfır, ve yenisi giremez** ("ratchet": mevcut sorunlar taban çizgisi olur, sayı sadece azalabilir).

#### 15.1 🧹 Kod Temizleyici (ölü kod, anti-pattern, anomali)
- [ ] ⭐ Ölü kod: kullanılmayan dosya, export, fonksiyon, değişken, bağımlılık, `.env` anahtarı, CSS sınıfı, route ve feature flag (ör. knip, vulture, staticcheck, cargo/clippy uyarıları; dile göre ücretsiz araçlar) — *God Eye'ın kendi reposunda başladı (Ekim 2026): knip 6.39 ile 5 dosya, 2 bağımlılık, 49 export/tip bulundu; gereksiz export'lar kapatıldı, ölü kod ve kullanılmayan sayfa silindi, Worker/betik giriş noktaları tanıtıldı; şimdi sıfır ve CI'da `bun run lint:dead` kapısı. Diğer diller ve projeler, `.env` anahtarı, CSS sınıfı, route ve feature flag taraması henüz yok*
- [x] Tekrar eden kod (kopyala-yapıştır blokları), aşırı uzun fonksiyon/dosya, derin iç içe yapı, aşırı parametre, yüksek karmaşıklık (cyclomatic/cognitive) — *God Eye'da `bun run lint:quality`: Biome'un karmaşıklık (bilişsel, 20), fonksiyon uzunluğu (150 satır) ve parametre sayısı (5) kuralları ayrı bir yapılandırmayla, kopyalar 12 anlamlı satırlık pencereyle. Üç yerde kopyalanmış akış okuyucusu tek yardımcıya (`jsonlines.ts`) çıkarıldı; kalan 158 bulgu kural ve dosya başına sayıyla gerekçeli taban çizgisinde (sayı artamaz). Dosya uzunluğu kuralı yok*
- [x] **Kod kokuları ve anti-pattern kataloğu:** refactoring.guru'daki koku → refactoring eşlemesi (Long Method → Extract Method, Feature Envy → Move Method, Shotgun Surgery, God Object, Primitive Obsession…) ve bilinen anti-pattern'ler; her bulguda hangi refactoring'in önerildiği ve kaynak bağlantısı — *Öğrenme merkezinde "Kod kokuları ve refactoring" kâğıdı: refactoring.guru kataloğundaki 23 kokunun hepsi kendi gruplarıyla (şişkinlikler, nesne yönelimini yanlış kullananlar, değişikliği zorlaştıranlar, gereksizler, bağlayıcılar) ve 3 yaygın anti-pattern; her birinde önerilen refactoring'ler, TypeScript örneği, sık yapılan yanlış düzeltme ve God Eye'ın hangi kapısının yakaladığı. Metin kendi cümlelerimle, içerik kopyalanmadı, her madde kaynağına bağlı (29 bağlantının hepsi açılıyor). Kalite kapısının bulguları artık önerilen refactoring'i ve kokunun sayfasını gösteriyor*
- [ ] Hata anomalileri: yutulan hatalar (boş catch), beklenmeyen promise'ler, null/undefined riskleri, yarış durumları, sızan kaynaklar (kapanmayan bağlantı, temizlenmeyen timer/listener), tutarsız dönüş tipleri — *God Eye'da başladı: boş bloklar (5) ve beklenmeyen promise'ler (43) sıfıra indi, ikisi gerçek hataydı (Bölümler sayfasında yakalanmamış yükleme ve tarama hataları); kapı yenilerini engeller. Null riskleri TypeScript strict ile. Sonra eklendi: React efektlerinde sızan kaynak (başlatılıp durdurulmayan timer, dinleyici, soket, observer; şimdi sıfır) ve yarış (girdisi değişen efektin cevabı korumasız state'e yazması: hızlı geçişte eski cevap sonra gelip yanlış veri gösterir) kuralları `lint:quality`'de, react.dev kaynaklı. 46 yarış bulundu; veri bozabilecek ya da yanlış sonuç gösterecek 6'sı düzeltildi (Dosyalar'da önceki dosyanın içeriği yenisine düşüp onun üstüne kaydedilebiliyordu; env geçmişi, tablo satırları, üç arama), kalan 40'ı gerekçeli taban çizgisinde. Tutarsız dönüş için TypeScript `noImplicitReturns` açıldı (2 ara katman düzeltildi). Sunucu tarafında sızıntı ve yarış kontrolü yok, kurallar sezgisel (metin deseni)*
- [x] ⭐ **Güvenli temizlik:** "Temizle" ayrı bir kopyada (worktree) yapılır; testler ve tip kontrolü önce ve sonra çalışır, davranış değişmediği kanıtlanmadan birleştirilmez; her değişiklik tek tek geri alınabilir — *yeni hazır akış "Güvenli temizlik": önce projenin kontrolleri geçmeli (kırıksa hiçbir şeye dokunulmaz), keşifçi ölü kodu kanıtıyla numaralı listeler (sadece okur, araç kurmaz, dışarıdan adıyla çağrılabilecekleri dışarıda bırakır), neyin gideceğini sen seçersin, temizleyici kendi kopyasında her silmeyi ayrı commit yapar (her biri tek başına geri alınabilir; test bozulursa o şey ölü değildir, geri koyar), aynı kontroller yeniden geçmeli, QA kullanıcının fark edeceği hiçbir şeyin değişmediğini doğrular, birleştirme senin onayınla. Testle denendi, gerçek bir ajanla denenmedi*

#### 15.2 🏛️ Mimari Uygunluk (C4 + kitaplar + tasarım desenleri)
- [x] ⭐ **C4 modeli koddan çıkarılır:** Context → Container → Component → Code seviyeleri (Mermaid C4); kod değiştikçe güncellenir. Mimar persona "olması gereken" mimariyi bir kere yazar (ADR'lerle), kapı "olan" ile karşılaştırır (mimari kayma) — *God Eye için `bun run c4` docs/architecture.md'yi yazar: Context elle, Container ve sunucunun Component seviyesi içe aktarma grafiğinden; diyagram koddan eskiyince test kırılır. Sonra eklendi: "olması gereken" mimari docs/adr/0002-server-layers.md'de yazılı (Richards, Layered): temel → oturumlar → bilgi/operasyon/takım → kalite → sohbet → önizleme/ajanlar, en üstte HTTP katmanı (app, index ve her `*-routes.ts`); her alanın neyi kullanabileceği `scripts/c4.ts`'te tablo. Önce sınıflandırma düzeltildi (bus, db, ayarlar, gizli bilgi temizleyici gibi ortak modüller "Temel" alanına, rota dosyaları HTTP katmanına; oturum sağlığı yanlışlıkla operasyondaydı), bir gerçek kayma düzeltildi (veritabanı şeması bir migration'ı sunucu modülünden alıyordu). Diyagram 50 oktan 40'a indi; kurala aykırı 11 ok kırmızı "drift". Arkalarındaki 19 içe aktarma (çoğu alt katmanın üst katmandaki bir servisi kurucuda alması) gerekçeli listede; yenisi testi kırıyor, düzelen listeden çıkmak zorunda. Bilerek eklenen kötü içe aktarmanın yakalandığı denendi. Bu kontrol God Eye'ın kendisinde; kullanıcı projeleri için henüz yok*
- [x] **Mimari kurallar kod olarak:** katman ihlali (ör. UI doğrudan DB'ye erişemez), döngüsel bağımlılık, modül sınırları, izin verilen import yönleri (ör. dependency-cruiser, import-linter, ArchUnit benzeri "fitness function"lar); her kuralın gerekçesi ve kaynağı yazılı — *God Eye'da `scripts/arch-check.ts` (Bun'ın kendi içe aktarma okuyucusu; TypeScript 7'de dependency-cruiser çalışmadığı için): paketler uygulamalara, arayüz sunucuya, sunucu arayüze/hub'a, hub diğerlerine bağımlı olamaz, arayüz veritabanı açamaz, döngüsel içe aktarma yok; her kuralın gerekçesi ve kaynağı (Richards, Layered) yazılı. İlk taramada 3 döngü bulundu, sayfalarda yaşayan ortak yardımcılar taşınarak kırıldı; şimdi sıfır, CI'da ve `bun test`'te kapı. Bilerek yapılan kötü değişiklik (kullanılmayan export, arayüzden sunucuya içe aktarma) yakalandığı denendi*
- [ ] **Mimari desen seçimi ve kontrolü:** Mark Richards, *Software Architecture Patterns* (O'Reilly, 2015): Layered, Event-Driven (mediator/broker), Microkernel, Microservices, Space-Based; projenin hangi desende olduğu tespit edilir, desenin kendi kuralları (ör. layered'da "closed layer", sinkhole anti-pattern'i) kontrol edilir; kitabın "pattern analysis" tablosuyla (çeviklik, deploy kolaylığı, test edilebilirlik, performans, ölçeklenebilirlik, geliştirme kolaylığı) proje ihtiyacına uygunluğu raporlanır
- [ ] **Tasarım desenleri:** refactoring.guru'daki 22 GoF deseni; yanlış ya da gereksiz kullanılan desen (her yere Singleton, tek implementasyonlu Strategy, gereksiz Factory) ve eksik desen fırsatı (büyük switch → Strategy/State) işaretlenir; SOLID ihlalleri
- [ ] Yeni proje başlarken: ihtiyaç sorulur (ekip büyüklüğü, ölçek, deploy sıklığı), kitaptaki analize göre mimari önerilir, C4 iskeleti ve kurallar en baştan kurulur

#### 15.3 🗄️ Veritabanı Uygunluğu ve Anomalileri
- [x] ⭐ **Şema kuralları:** Elmasri & Navathe, *Fundamentals of Database Systems* (7. baskı): her tabloda birincil anahtar, yabancı anahtarlar ve bütünlük kısıtları (NOT NULL, UNIQUE, CHECK), doğru veri tipleri, adlandırma tutarlılığı — *God Eye'da `bun run lint:db` (scripts/db-check.ts): migration'lar boş bir veritabanına uygulanıp incelenir; birincil anahtar, NULL olamayan anahtar (SQLite'ın TEXT anahtara NULL izni), referans sütununda yabancı anahtar ve indeks, tipli sütun, snake_case ve tekrar eden indeks kuralları, her biri Elmasri bölümüyle. İlk taramada 163 ihlal: büyük kısmı (59 NULL alabilen anahtar, 61 kısıtsız referans) SQLite'ta tablo yeniden kurmadan düzeltilemediği için gerekçeli taban çizgisinde (ratchet: yenisi giremez, düzelen listeden çıkmak zorunda); salt okunur veri taraması dev veritabanında NULL anahtar ve yetim kayıt bulmadı. Bilerek kötü bir migration eklenince 5 ihlali yakaladığı denendi*
- [x] **Normalizasyon ve güncelleme anomalileri:** fonksiyonel bağımlılıklara göre 1NF/2NF/3NF/BCNF ihlali şüphesi (tekrarlanan gruplar, aynı bilginin birden fazla yerde tutulması), ekleme/silme/güncelleme anomalisi riskleri; bilerek yapılan denormalizasyon ADR ile belgelenir — *God Eye'da kapı iki şüpheyi arar: sütunda tutulan JSON liste (1NF, 10 tane) ve id'nin yanında başka yerdeki adın kopyası (3NF, 5 tane); ikisi de bilerek yapıldığı için docs/adr/0001-lists-and-name-copies.md ile belgelendi (listelerin içinde sorgu olmadığı kodla doğrulandı). Fonksiyonel bağımlılık çıkarımı yapılmıyor, sadece bu iki yaygın desen*
- [ ] **Veri anomalileri (gerçek veride, sadece okuma):** yetim kayıtlar, kısıtsız sütunlarda tekrarlar, beklenmeyen NULL'lar, tutarsız değerler, aralık dışı veriler; prod'a sadece okuma yetkisiyle ve onayla bağlanır — *Başladı: `bun scripts/db-check.ts --data <dosya>` veritabanını salt okunur açar, NULL anahtarları ve projeye/oturuma/hesaba yetim referansları sayar. Sonra eklendi: kullanıcının bağladığı veritabanlarında (SQLite, PostgreSQL, MySQL) Araçlar > Veritabanları > "Veri sağlığı": sadece SELECT ile yetim kayıtlar (yabancı anahtarın işaret ettiği satır yok), tekil olması beklenen sütunlarda tekrarlar (e-posta, slug, kullanıcı adı...), neredeyse hep dolu sütunlarda nadir boşluklar (%5'in altı), fiyat/miktar/stok gibi sütunlarda negatif değerler; her bulgunun satırlarını listeleyen sorgu tek tıkla sorgu düzenleyicisine gelir. Üretim olarak işaretli veritabanı ayrıca onay ister. Testle ve gerçek bir SQLite dosyasıyla ekranda denendi (4 bulgunun 4'ü). MongoDB ve tutarsız değer (aynı şeyin farklı yazımları) kontrolü yok; PostgreSQL ve MySQL üzerinde denenmedi*
- [ ] **Sorgu ve indeks:** N+1 sorgular, indekssiz yabancı anahtar ve sık filtrelenen sütun, kullanılmayan ya da tekrar eden indeks, `SELECT *`, EXPLAIN ile yavaş planlar; transaction ve kilit riskleri (kitabın eşzamanlılık ve kurtarma bölümleri) — *Başladı: sunucu kodundaki her SQL boş şemada EXPLAIN QUERY PLAN ile çalıştırılır, büyüyen tablolarda WHERE'li tam tarama kapıyı kırar; ilk taramada 44 tarama vardı, 10 indeks eklendi (oturumların tarihi, commit, deploy, kitaplık özeti, yorum ve takım mesajı aramaları), büyüyen tablolarda 2 tasarım gereği tarama kaldı. Sonra eklendi: kullanılmayan indeks (planlarda hiç görünmeyen), `SELECT *` (76), döngü içinde SELECT (N+1, sezgisel; 22 tane, birkaç öğelik döngüler) kuralları; hepsi gerekçeli taban çizgisinde, yenisi giremez*
- [x] **Migration güvenliği:** tabloyu kilitleyen, veri kaybettiren ya da geri alınamayan migration'lar merge'den önce yakalanır (ör. squawk benzeri migration linter'ları); SQL enjeksiyonu riskleri Güvenlik ile birlikte — *God Eye'da başladı: yayınlanmış migration'ların özeti kilit dosyasında, biri değişirse kapı kırılır; DROP/RENAME içeren migration `-- why:` gerekçesi ister. SQL enjeksiyonu: `${}` ile kurulan her SQL bulunur; mevcut 33 tanesi incelendi (sadece şemadan tablo adı, tırnaklı tanımlayıcı, sayı ya da ? listesi) ve yenisi kapıyı kırar*

#### 15.4 ⚡ Hız, Ağ ve Teslimat Uzmanı (webin başından bugüne bilinen sorunlar)
- [x] ⭐ **Sorun kataloğu:** webin ilk yıllarından bugüne bilinen her performans sorunu bir kayıt olarak: nasıl tespit edilir (araç/ölçüm), neden olur, çözümü, kaynağı. Örnekler: çok fazla istek ve büyük dosyalar, render'ı bloklayan CSS/JS, optimize edilmemiş görseller ve fontlar, sıkıştırma yok (gzip/brotli/zstd), cache başlıkları yanlış, CDN yok, HTTP/1.1 head-of-line blocking (HTTP/2/3), DNS/TLS gecikmesi, büyük JS paketi ve gereksiz hydration, layout shift, uzun görevler, üçüncü parti script yükü, bellek sızıntısı, N+1 ve yavaş sorgu, bağlantı havuzu yok, cache stampede, soğuk başlangıç, rate limit eksikliği, WebSocket backpressure — *Öğrenme merkezinde "Web performans sorunları" kâğıdı: 7 bölümde 39 sorun, her birinde nasıl tespit edilir, neden olur, düzeltmesi, en sık yanlış düzeltme ve resmi kaynak (web.dev, Chrome, MDN); Core Web Vitals eşikleri web.dev'den, Lighthouse 13'te değişen denetim adları Chrome'un duyurusundan doğrulandı, 38 bağlantı açılıyor. Kâğıdı bir ajan yazdı, denetimini ben yaptım*
- [ ] **Render stratejisi önerisi:** her sayfa için CSR, SSR, SSG, ISR, streaming, edge seçimi; ne zaman hangisi, kanıtıyla (veri ne sıklıkta değişiyor, SEO gerekiyor mu, kişisel mi)
- [ ] **Ölçüm:** Core Web Vitals (LCP, INP, CLS), Lighthouse (zaten var), paket boyutu bütçesi, sunucu yanıt süreleri; uygulamanın kendi hata SDK'sıyla gerçek kullanıcı ölçümleri (sadece lokale gider); yük testçisi persona (6.1c) ile birlikte — *God Eye'da başladı: Playwright ile LCP/CLS ölçüldü (4 kat yavaş CPU, 10 Mbps). Sayfalar ilk açıldıklarında yükleniyor (React Router lazy), Türkçe metinler seçilince, kabuktaki Markdown gösterilince: ana sayfa LCP 4,0 → 2,9 sn, yükleme 2,7 → 1,5 sn, indirilen JS 2,0 → 1,0 MB, CLS 0,001. İlk ekran paket bütçesi (gzip 339 KB JS) CI'da `bun run lint:bundle` ile korunuyor. Kullanıcı projelerinde ölçüm, INP ve sunucu yanıt süreleri henüz yok*
- [ ] Ağ ve cache katmanları: tarayıcı cache, service worker, CDN, reverse proxy, uygulama cache'i, DB cache; her katmanda doğru TTL ve geçersiz kılma

#### 15.5 🚦 Kapı, Takip ve Kaynaklar
- [x] ⭐ **Kapı noktaları:** AI bir işi "bitti" demeden önce, commit'ten önce (hook, isteğe bağlı), merge ve deploy'dan önce; yeni sorun varsa iş bitmiş sayılmaz, AI'a kanıtla geri gönderilir — *"AI bitti dedi" kapısı her projede çalışıyor (Ayarlar > AI'ın işini kontrol et; varsayılan kapalı, çünkü kullanıcının testlerini kendiliğinden çalıştırır): sohbet açılınca projenin tip kontrolü, lint ve testleri bir kez çalışıp taban çizgisi olur; dosya değiştiren her turdan sonra yeniden çalışır, sadece önce geçip şimdi kırılan sayılır (önceden kırık olan işi tutmaz), sohbette çıktısıyla gösterilir ve "Geri gönder" modunda düzeltmesi için kanıtla AI'a gider (art arda en çok iki kez, sonra kullanıcıya bırakır). Sahte claude ile denendi: AI dosyayı bozdu, kapı yakaladı, geri gönderdi, AI düzeltti, kontroller geçti. Commit'ten önce: projenin Kurulum sekmesinden isteğe bağlı git pre-commit hook'u aynı kontrolleri çalıştırır, kırılırsa commit'i (insan ya da AI) durdurur; projede başka bir hook (husky vb.) varsa dokunulmaz, sadece kendi hook'unu kaldırır; gerçek bir repoda denendi. Merge: takım akışları kendi kopyalarını kontrol adımı geçmeden birleştirmiyordu. Deploy: deploy öncesi kontrol listesi kırık testleri ve veri kaybettirebilecek migration'ları zaten uyarıyordu. Kontrolleri bulamayan bir komut `bun` PATH'te değilse artık God Eye'ı çalıştıran Bun ile çalışıyor*
- [ ] **Ratchet:** ilk taramada mevcut sorunlar taban çizgisi olur; sayı artamaz, sadece azalır. Kategori Sayfaları ve puanlamaya (Faz 5) bağlanır; "sıfıra kadar" ilerleme grafiği — *God Eye'da ölü kod, katman ihlali ve döngü taban çizgisi yerine doğrudan sıfıra indirildi ve CI bunu korur. Kullanıcı projelerinde de: her taramada kategori başına açık bulgu sayısı saklanıyor, kategori sayfasında puanın yanında "Açık bulgular: N (hedef 0)" grafiği var; bir kategoride bulgu sayısı önceki taramadan fazlaysa Gelen Kutusu'na "son taramadan beri yeni sorunlar çıktı" düşer (hangi kategori, kaç → kaç). Testle ve ekranda denendi. Ratchet önceki taramaya göre; ilk taramadaki en düşük sayıya kilitlenmiyor*
- [x] Her kural: neden var, kaynağı (kitap bölümü, refactoring.guru sayfası, resmi doküman), nasıl düzeltilir, ne zaman bilerek kapatılabilir (gerekçe yazmak zorunlu); kurallar proje bazında açılıp kapatılabilir — *proje kontrollerinin 49'unun her birinde nasıl düzeltileceği zaten yazıyordu; şimdi bir de kaynağı var (OWASP, MDN, W3C, Docker, TypeScript, React, Fowler, 12factor gibi resmi ya da yerleşik sayfalar; 49 bağlantının hepsi açılıyor) ve bulgunun yanında "Kaynak" olarak görünüyor. Kaynaksız yeni bir kontrol testi kırar. Kontroller proje başına zaten kapatılabiliyordu; artık kapatmak için gerekçe zorunlu (Puanlama penceresi gerekçesiz kaydetmez, sunucu da reddeder) ve gerekçe saklanır. God Eye'ın kendi kapılarındaki her kuralın gerekçesi ve kaynağı betiklerde yazılı, taban çizgilerinin de gerekçesi var*
- [x] **Personalar ne yapar:** Mimar, Veritabanı Uzmanı, Performans ve Güvenlik personaları bulguları açıklar, düzeltme önerir ve "Düzelt" ile kendi kopyalarında düzeltir; kitaplar kütüphaneden (Faz 7) alıntılanarak kaynak gösterilir — *kategori sayfasında bölümün sahibi persona açıklıyor ve "Bu bölümü incele" diyordu, "Düzelt" ona hazır istekli bir sohbet açıyordu. Yeni: her bulguda "Kopyada" aynı isteği o personaya takım akışı olarak verir; projenin kendi kopyasında çalışır, kontroller geçmeli, birleştirme senin onayınla (akışlar artık adımlarını tek bir personaya verebiliyor; testle denendi). İsteğe kuralın kaynak bağlantısı eklenir; personanın kütüphanesindeki kitaplar MCP'deki kütüphane aramasıyla alıntılanabiliyordu. Gerçek bir ajanla "Kopyada" denenmedi*
- [ ] Önce God Eye'ın kendisinde çalıştırılır (kendi kodumuz örnek olur), sonra her projede
- [ ] Kaynaklar: kullanıcının kendi kitapları kütüphaneye eklenir (kişisel kullanım, dağıtılmaz; Açık Sorular #8); refactoring.guru içeriği kopyalanmaz, katalog adlarıyla eşlenir ve bağlantı verilir; kullanılan tüm araçlar ücretsiz ve açık kaynak (lisansları eklenmeden önce kontrol edilir)

**Bitti sayılır:** God Eye'ın kendi reposunda kapı açık; ölü kod, döngüsel bağımlılık ve şema kuralı ihlali sıfır, C4 diyagramı güncel; bir AI session'ı bilerek kötü bir değişiklik (kullanılmayan export, katman ihlali, indekssiz yabancı anahtar, render'ı bloklayan script) yaptığında kapı her birini kanıtla yakalayıp işi geri gönderiyor.

---

### Faz 16 — 🔭 Açık Kaynak Harness'lardan Öğrenilenler

**Hedef:** t3code, pi, opencode, crush, cline, aider, goose ve OpenUI'de işe yaradığı kanıtlanmış ne varsa God Eye'a almak. Ayrıntı, kaynak dosya yolları ve lisanslar: `research/acik-kaynak-harness-raporu_2026-10-18.md` (ve `research/notes/`). MIT/Apache kod telif notuyla alınır, FSL (crush) sadece fikir; Effect-TS sunucu kodu kopyalanmaz, algoritması yazılır.

#### 16.1 Sohbet deneyimi
- [x] ⭐ Blok blok akan Markdown, artımlı Shiki ve LRU önbellek: uzun cevaplarda takılma yok (rapor #1) — *cevap üst düzey bloklara bölünür, akarken sadece son blok yeniden işlenir ve yarım kalan kalın/satır içi kod geçici kapatılır; akan kod bloğunda sadece biten satırlar renklenir; blok HTML'i ve Shiki çıktısı LRU önbellekte; sohbet sayfası açılınca Shiki boşta önceden yüklenir. Sohbet artık ortak Markdown bileşenini kullanıyor (renkli kod, grafik, uyarı kutuları). Sahte bir claude ile 21 KB'lık akan cevapta, 4 kat yavaşlatılmış CPU'da: ana iş parçacığı 12,9 sn → 6,8 sn, uzun görevler 56 (toplam 6,6 sn) → 6 (toplam 0,87 sn)*
- [x] ⭐ İş günlüğü: ardışık araç çağrıları tek cümlelik satır ("3 dosya okudu, 2 düzenledi"), açılınca ayrıntı; detay seviyeleri (her şey / ayrıntılı / sade / sadece metin) (#2) — *art arda iki ve daha fazla araç çağrısı "3 dosya okudu, 1 dosya düzenledi, 1 arama yaptı" satırı olur, çalışırken o anki adım yanında görünür, tıklayınca tek tek kartlar açılır; başlıkta Ayrıntı seçimi (her adım / gruplu / sade / sadece metin), tarayıcıda hatırlanır, Basit modda sade başlar. Sahte claude ile ekranda denendi*
- [x] ⭐ Ajan çalışırken mesaj yazma: kuyruğa al ya da yönlendir (steer); yeniden başlatmada kuyruk korunur (#3) — *çalışırken Enter mesajı kuyruğa ekler, tur bitince sıradaki kendiliğinden gider; kuyruk besteleyicinin üstünde görünür (kaldır / hemen gönder); "Hemen gönder" turu durdurup mesajı gönderir. Kuyruğun metni sohbet geçmişinde saklanır ve "Kaldığım yerden devam et" ile yeni sohbete taşınır (resimler taşınmaz, kendiliğinden gönderilmez). Sahte claude ile ekranda denendi; "Hemen gönder"in durdurulan turdan sonra devam etmesi gerçek Claude ile denenmedi*
- [x] Onaylar sohbet kutusunda: "her zaman izin ver" kuralları, "reddet ve neden yaz", proje bazında otomatik onay, "süreç bitti, devam edilemez" durumu (#4) — *onay kartında "bu sohbette hep", "bu projede hep" (kalıcı kural; Bash için ilk iki kelime, zincirli komutlara kural yok; push/deploy/web sonrası yine sorulur), "reddet ve nedenini yaz" (neden Claude'a gider) ve sohbet kapanınca "artık cevap verilemez" durumu; kurallar projenin Kurulum sekmesinden görülür ve silinir. Sahte claude ile ekranda denendi*
- [x] Ajanın soru kartı: seçenekler ve JSON şemalı form (#13) — *Seçenekli kısım bitti: Claude AskUserQuestion kullanınca tek/çoklu seçimli ve "kendi cevabın" alanlı kart çıkar, cevap Agent SDK'nin beklediği gibi `updatedInput.answers` ile döner, hap "Cevabını bekliyor" olur, kural ve "hep izin ver" soruları asla otomatik geçmez; sahte claude ile denendi, gerçek Claude ile denenmedi. JSON şemalı form God Eye'ın MCP'sinden geliyor: ajan `godeye_ask_form` ile MCP elicitation'ın izin verdiği düz şemayı (seçenekli ya da serbest metin, sayı, tam sayı, evet/hayır; zorunlular, sınırlar, varsayılanlar) gönderir, form Gelen Kutusu'na düşer, kullanıcı doldurur, cevaplar şemaya göre sunucuda denetlenip ajana döner (en çok 10 dakika bekler). Şemada başka türler atılır, en çok 20 alan. Ekranda denendi, gerçek bir ajanla denenmedi; Claude Code'un sohbet akışı kendi içinde form taşımıyor*
- [x] Diff satırına yorum, bir sonraki prompt'a eklenir (#14) — *düzenleme diff'inde satıra yorum yazılır, yorumlar besteleyicinin üstünde çip olarak birikir ve sonraki mesaja dosya ve satırla eklenir*
- [x] Bağlam ölçer, prompt önbelleği süresi, "önbellek doldu, sıkıştıralım mı?" (#18) — *Claude'un her cevabındaki kullanımdan "Hafıza %34" ölçeri (pencere Claude Code'un bildirdiğinden), son cevaptan beri geçen süre ve 5 dakikadan sonra "önbellek muhtemelen boşaldı" uyarısı (Anthropic'in varsayılan önbellek süresi; Claude Code'un gerçekte hangi süreyi kullandığı bilinmiyor); %70 üstünde "Sıkıştır" /compact gönderir*

#### 16.2 Zengin cevaplar ve raporlar
- [x] ⭐ OpenUI (sadece `react-lang` + `lang-core`) God Eye'ın kendi bileşenleriyle, ` ```openui ` bloğu olarak; önce kendi raporlarımızda, sonra sohbette isteğe bağlı. Telemetri kapalı ve testle doğrulanmış (#7, rapor bölüm 4) — *Deneme bitti (Ekim 2026): `react-lang` ve `lang-core` 0.3.0 (2 haftalık kuralı yüzünden 1.0 değil) ve zod 4.6.5 eklendi; 9 bileşenlik God Eye kütüphanesi (Stack, Card, Text, Stats, Chart, Progress, Table, Callout, Code) mevcut grafik/istatistik/ilerleme parçalarını sarar; ` ```openui ` ve ` ```openui-lang ` blokları sohbette tembel yüklenen ayrı bir parçayla (165 KB, gzip 50 KB) çizilir, ana paket büyümedi; talimat yaklaşık 1050 token. Telemetri testle doğrulandı: Bun kurulum betiğini çalıştırmaz, bayraklarla betik hiçbir şey göndermez (kontrol olarak bayraksız gönderdiği de gösterilir), kütüphane ve talimat üretmek istek atmaz, ekranda dış adrese istek gitmedi; CI ve Dockerfile bayrakları ayarlar. Raporlar (Ekim 2026): bileşen şemaları ortak `packages/genui` paketine taşındı; sunucu talimatı oradan üretir (yaklaşık 1150 token), arayüz aynı şemalara kendi bileşenlerini bağlar. Haftalık CEO raporu artık OpenUI ile yazılıyor: gerçek bir denemede model geçerli bir blok yazdı ve hatasız çizildi (brifing JSON, gün sonu notu ve akşam özeti bilerek düz metin olduğu için onlara eklenmedi). Sohbette: Ayarlar'daki "Sohbetlerde zengin cevaplar" açılınca sohbetler OpenUI talimatını alır (varsayılan kapalı, yaklaşık bin token); Button bileşeni `@ToAssistant` ile sohbete takip sorusu gönderir, `@OpenUrl` sadece http/https adresleri yeni sekmede açar; sahte claude ile ekranda denendi*
- [x] AI'ın yaptığı HTML raporlar için temalı, sandbox'lı iframe (#7) — *` ```html-report ` bloğu sohbette `sandbox="allow-scripts"` (aynı köken yok) bir çerçevede çizilir; içerik güvenlik politikası yalnız satır içi CSS/JS'e izin verir, ağ isteği yapılamaz; God Eye'ın renkleri verilir, yükseklik içeriğe uyar, tam ekran ve "Kod" görünümü var. Denemede sayfanın God Eye'a erişimi ve dış adrese isteği engellendi (sıfır dış istek). Tema değişince açık çerçeve yeniden çizilene kadar eski renklerde kalır*

#### 16.3 Çoklu ajan ve güvenilirlik
- [x] ⭐ Durum hapı: Onay bekliyor > Cevap bekliyor > Çalışıyor > Plan hazır > Bitti (görülmedi); Gelen kutusuna bağlı (#5) — *sunucu her sohbet için tek durum hesaplar: bekleyen onay, soruyla biten cevap, çalışıyor, bekleyen plan onayı (ExitPlanMode), kimse açık değilken biten tur; Terminaller listesinde ve Gelen Kutusu'nda (en acilden) gösterilir, sohbet açılınca "görülmedi" kalkar. "Plan hazır" Claude Code'un ExitPlanMode için onay istemesine dayanıyor, gerçek Claude ile denenmedi*
- [x] God Eye'ı ajanlara açan kapsamlı MCP uç noktası: hafıza, persona, sır isteme, HTML çizme (#6) — *God Eye'ın MCP sunucusuna üç araç eklendi: `godeye_persona` (bir personanın tarzı, kontrol listesi, tuzakları, kuralları ve bu projedeki görüşleri; sadece okuma), `godeye_request_secret` (ajan sırrı ister, kullanıcı God Eye'da girer, kasaya ve projenin env dosyasına yazılır, ajana değer değil sadece "kaydedildi" döner; ajan kendi isteğini cevaplayamaz), `godeye_show_html` (ajanın sayfası Gelen Kutusu'ndan sandbox'lı çerçevede açılır). Hafıza okuma zaten vardı; ajanın hafızaya yazması bilerek yok (hafızayı zehirleyebilir). İstekler bellekte tutulur, yeniden başlatmada düşer*
- [x] Limit kurtarma: sıfırlanınca devam et / ertele (#8) — *sohbet limit yüzünden durunca sıfırlanma saati (Claude Code'un mesajındaki zaman damgasından ya da son limit okumasından) bir kartta görünür: "Sıfırlanınca devam et" sıfırlanmadan bir dakika sonra devam mesajını gönderir (iptal edilebilir), "Başka hesap kullan" Limitler sayfasına götürür; hap ve Gelen Kutusu "Limit doldu" der. Sahte claude ile denendi; God Eye yeniden başlarsa bekleyen devam zamanlayıcısı kaybolur*
- [x] Yapılandırılmış ve artımlı devir/özet şablonları (#9) — *özet daha önce yazılmışsa model sadece ondan sonraki mesajları ve önceki özeti alır, özeti günceller (geçerli olanı tutar, yeniyi ekler, biteni "açık işler"den çıkarır): uzun oturumların ortası kaybolmaz, aynı içerik tekrar gönderilmez. Devir istemi (amaç, yapılanlar, açık işler, riskler) artık oturumun kendi kaydından dal ve değiştirilen dosyaları da içerir. Güncellemenin özet kalitesi gerçek bir modelle karşılaştırılmadı*
- [x] Adaptör yetenek bayrakları (#10); pi adaptörü (#17) — *her aracın ne yapabildiği (terminalde id ile açma, kopyalama, God Eye sohbetinde devam, tam bağlamlı yan soru) çekirdekte tek bir tabloda; Oturum sayfası, yardımcı, sohbet ve terminal yolları araç adına değil bu tabloya bakar (önceden bir Gemini oturumunu terminalde açmak ona Claude'un `--resume` bayrağını veriyordu, artık açılamaz deniyor). pi oturumları (`~/.pi/agent/sessions`, JSONL) okunuyor: istek, cevap, araç adımları, hatalar, token, sıkıştırma, değişen dosyalar, kurulan paketler; terminalde `--session` / `--fork` ile açılır. pi'nin belgelerindeki biçimle yazılıp testlendi, bu bilgisayarda gerçek pi oturumuyla denenmedi*
- [ ] opencode adaptörü (V2 oturumları SQLite'ta, biçim hâlâ değişiyor; bu bilgisayarda kurulu değil), ileride ACP (#17)
- [x] Döngü tespiti (#11) ve tur kapanışı kuralı: yarım kalan araç çağrıları "kesildi" (#12) — *sohbette aynı araç aynı girdiyle son 10 adımda 3 kez çalışınca bir kez "döngüye girmiş olabilir" uyarısı ve Durdur bağlantısı çıkar; tur bitince ya da süreç kapanınca hâlâ çalışıyor görünen adımlar "Tur, bu adım bitmeden sona erdi" olarak kapanır. Dosyadan okunan oturumların sağlığına döngü işareti henüz eklenmedi*
- [x] Mesaja bağlı checkpoint ve geri yüklemeyi geri alma (#15) — *her sohbet turundan önce alınan kayıt (zaten vardı, HEAD ebeveynli gizli git ref'i) geri yüklenince yanında "Geri al" çıkar ve geri yüklemeden hemen önceki hâle döndürür. AI sohbeti o projede çalışırken geri yükleme kilitli (arayüzde ve sunucuda), yoksa AI'ın yazdıkları eski dosyalarla karışırdı. 2 MB'tan büyük izlenmeyen dosyalar kayda girmez ve geri yüklemede silinmez; repo başına en yeni 200 kayıt tutulur. Ekranda geçici bir repoyla denendi*
- [x] Akış protokolü düzeni: sıra numarası, birleştirme, geri basınç (#19) — *sohbetin her değişikliği bir sıra numarası taşır; sunucu aynı olayın art arda gelen hâllerini birleştirip 40 ms'de bir tek paket gönderir (akan cevabın her kelimesi ayrı mesaj değil), tarayıcı paketi tek seferde uygular ve eski numaralı paketi atar. Tarayıcı yetişemezse (1 MB'tan fazla gönderilmemiş veri) sunucu biriktirmeyi bırakır, soket boşalınca tek bir güncel durum gönderir: yavaş sekme sunucuda bellek büyütmez. Sahte claude ile 4 kat yavaş CPU'da ana iş parçacığı 2,1 sn'den 1,9 sn'ye, uzun görevler 836 ms'den 666 ms'ye indi*

#### 16.4 Güvenlik ve iş akışı
- [x] Proje güven sorusu: yeni repo'nun hook/MCP/skill'leri onaysız yüklenmez (#16) — *projede `.claude` hook'u (God Eye'ın kendi hafıza hook'u hariç), `.mcp.json` sunucusu ya da beceri varsa sohbet onları yüklemeden başlar (`--setting-sources user --strict-mcp-config`, beceri varsa `--disable-slash-commands`), sohbetin üstünde neyin yüklenmediği listelenir ve "Güven ve onlarla yeniden başlat" ile güvenilir; güven bu dosyaların parmak izine bağlı, değişirlerse yeniden sorulur, Kurulum sekmesinden geri alınır. Gözetimsiz takım çalışmaları ve zamanlanmış işler bunları hiç yüklemez. Etkileşimli terminalde Claude Code kendi güven sorusunu sorar*
- [x] Zamanlanmış ve ajanın oluşturduğu işlerde revizyona bağlı onay ve sınırlar (#21) — *onay işin içeriğinin (istek, akış, zaman, bütçe) özetine bağlı: onaydan sonra kullanıcı dışında değişen iş çalışmaz, "değişti" diye yeniden onay ister; 90 günden eski onay da yeniden sorulur; bir iş saatte en fazla 4 kez, aynı anda en fazla 2 zamanlanmış iş çalışır. God Eye'ın MCP sunucusundan gelen istekler ajan olarak işaretlenir ve sadece öneri yapabilir (onaylama, ayar değiştirme 403). Sınır: aynı kullanıcı hesabında çalışan bir süreç God Eye'ın oturum anahtarı dosyasını okuyabilir; bu işletim sistemi seviyesinde kapatılabilecek bir şey, uygulama içinde değil*
- [x] "// ai: şunu yap!" yorum izleyici (#20); `when` bağlamlı kısayollar ve palette `>` eylem modu (#22) — *Yorum izleyici bitti: son bir gün içinde etkin olan git projelerinde 20 saniyede bir yalnızca değişmiş dosyalara bakılır (dosya sistemi izleyicisi inotify sınırını tüketebileceği için değil), `// ai: ...!` (değişiklik) ve `... ai?` (soru) yorumları her yorum biçiminde bulunur, Gelen Kutusu'na düşer, tıklayınca dosya ve satırla taslaklı sohbet açılır (AI kendiliğinden çalışmaz), yorum silinince kaybolur. Git olmayan projeler izlenmez. Sayfalar kendi eylemlerini ve yalnız o sayfada çalışan kısayollarını kaydeder (sohbet: durdur Ctrl+., sıkıştır, ayrıntı seviyesi Alt+D; proje: yeni sohbet Alt+N, Kurulum); komut paleti bunları "Bu sayfada" altında gösterir, `>` ile başlayınca sadece eylemler listelenir*
- [x] Hazır personalar: keşifçi, planlayıcı, inceleyici, işçi zinciri (#23); `AGENTS.md`, knip, kayıttan oynatılan adaptör testleri (#24, Faz 15 ile) — *yeni hazır akış "careful": keşifçi (architect, sadece okur) kodu haritalar, planlayıcı adımları yazar, eleştirmen (devils-advocate) planı kod yazılmadan önce sınar ve kalırsa plana geri yollar, sen onaylarsın, işçi kendi kopyasında yapar, kontroller ve QA inceler; testle denendi. Repoda AGENTS.md (CLAUDE.md ona bağlanır): komutlar, kapılar ve kurallar. knip kapısı CI'da. Claude Code adaptörü için anonimleştirilmiş gerçek bir oturum kaydı üzerinden oynatma testi; Codex ve Gemini için bu bilgisayarda oturum dosyası olmadığından kayıt yok*

#### 16.5 Kullanıcı testinden kalanlar (`research/kullanici-testi_2026-10-18.md`)
- [x] ⭐ Sohbet listesi sunucuda kalıcı: God Eye yeniden başlayınca da her tarayıcıda "Kaldığım yerden devam et" — *sohbetler oturum kimliğiyle veritabanında saklanır; Terminaller sayfasında "Son sohbetler" listesi ve "Kaldığım yerden devam et" her tarayıcıda, yeniden başlatmadan sonra da çalışır*
- [x] ⭐ Ana sayfa sade: önce sohbet kutusu ve projeler; brifing, gün sonu, "Bugün" ve odak kartları katlanabilir; Basit modda jargon ("Session", "Dinç/Yoruluyor", model adları) açıklanır ya da gizlenir — *brifing, gün sonu, "Bugün", odak ve özet önerisi tek bir "Günün özeti" bölümünde; Basit modda kapalı başlar, seçim hatırlanır. Sağlık rozeti ve model seçimi bir cümleyle açıklanır, Basit modda "Dinç" rozeti gizlenir; Türkçede "session" yerine "oturum" (sözlükte açıklamalı)*
- [x] Telefonda Dosyalar sayfası tek panel; telefonda turda menü butonu adımı — *telefonda yerler bir seçim kutusu, açılan dosya listeyi kaplar ve "Dosyalara dön" ile geri gelinir; turda menü butonunu tanıtan adım sadece telefonda görünür*
- [x] Öğrenme merkezi başlıklarının Türkçesi (yol haritası ve kâğıt başlıkları şu an tek dil) — *başlık tek bir ad ("Docker") ya da en/tr çifti olabilir; 21 başlığa Türkçe eklendi ("Linux sunucu", "Önbellekleme"); sunucu başlığı okurun dilinde gönderir, Türkçe arama Türkçe başlığı da bulur*
- [x] Erişilebilirlik taraması (axe ile kontrast ve etiketler; sabit İngilizce aria-label'lar) — *axe-core 4.13 ile 22 sayfa, açık ve koyu tema, masaüstü (1366) ve telefon (390) tarandı: seçili menü yazısının kontrastı, klavyeyle odaklanamayan kayan kod blokları ve tablo, grafikte iç içe etkileşim ve 3 sabit İngilizce etiket düzeltildi; tarama artık 0 ihlal veriyor. Ekran okuyucuyla elle deneme yapılmadı*
- [ ] Gerçek bir acemiyle ve ekran okuyucu kullanan biriyle deneme

**Bitti sayılır:** Uzun bir Claude cevabı akarken sayfa takılmıyor, araç çağrıları tek satırlık özetlerle görünüyor, ajan çalışırken yazılan mesaj kuyrukta bekliyor, haftalık rapor OpenUI ile grafik ve butonlarla geliyor ve kurulumda hiçbir dış adrese istek gitmediği testle gösteriliyor.

---

---

## 9. Açık Sorular ve Riskler

| # | Konu | Not / Karar |
|---|---|---|
| 1 | Archon Claude için login mi API key mi kullanıyor? | **Test edildi (Ekim 2026, kaynak koddan, kullanıcının sistemine kurmadan):** `CLAUDE_USE_GLOBAL_AUTH=true` ile Claude Code girişini kullanıyor, API anahtarı gerekmedi. Worktree için gerçek bir uzak repo istiyor (yoksa `--no-worktree`). Hazır akışları push/PR açtığı için God Eye bunları çalıştırmaz; yerleşik motor aynı YAML biçimini okur |
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
