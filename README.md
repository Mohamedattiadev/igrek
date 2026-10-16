# 👁️ God Eye

**Tüm AI kod projelerini tek ekrandan gör, anla ve yönet.**
*See, understand and manage all your AI coding projects from one screen.*

> 🚧 **Durum / Status:** Faz 0 bitti: uygulama iskeleti, tasarım sistemi, dil seçimi, ayarlar, güvenlik ve Docker hazır.
> Proje takibi Faz 1 ile geliyor. Yol haritası: [plan.md](plan.md).
> *Phase 0 done: app shell, design system, languages, settings, security and Docker. Project tracking arrives in Phase 1.*

---

## 🇹🇷 Türkçe

### Bu nedir?

Artık kodu çoğunlukla yapay zekâ yazıyor (Claude, Codex, Gemini…). Ama çok fazla proje ve sohbet olunca
neyin yapıldığı, neyin kaldığı ve neyin bozuk olduğu kayboluyor.

**God Eye bunu çözer:**

- 📋 **Her şeyi takip eder:** Tüm AI sohbetlerini otomatik okur ve "bugün ne yapıldı" diye sade dille anlatır.
- 🧠 **Her şeyi hatırlar:** Alınan kararları, yapılan hataları ve projenin durumunu unutmaz. Yeni bir sohbette AI'a bunları kendisi hatırlatır.
- 📊 **Puan verir:** Projenin her bölümünü (tasarım, ön yüz, arka yüz, veritabanı…) inceler ve "iyi mi, kötü mü, nasıl düzelir" diye açıklar.
- 👥 **Uzman bir takım sunar:** Tasarımcı, yazılımcı, güvenlik uzmanı gibi AI uzmanları projen üzerinde birlikte çalışır.
- 👁️ **Canlı gösterir:** Uygulamanı ekranda açar. Bir yere tıklayıp "bunu değiştir" yazman yeterli.
- 🔑 **Hesapları yönetir:** Birden fazla AI hesabın arasında tek tıkla geçersin ve ne kadar limitin kaldığını görürsün.
- ⏰ **Zamanlı iş yapar:** "Cuma sabahı şunu yap" dersin, zamanı gelince kendisi yapar.
- 📚 **Öğrenir:** Her hatadan ve senin eklediğin kitaplardan öğrenir, aynı hatayı bir daha yapmaz.
- 🤝 **Takımla çalışır:** Arkadaşların ne yaptığını canlı görürsün, herkes aynı bilgiyle çalışır.
- 🖧 **Sunucularını yönetir:** "Şu sunucuya gir, şunu yap" dersin, onayınla yapar.
- 🌍 **Senin dilinde konuşur:** Hangi dili istersen.

Her şey **senin bilgisayarında** çalışır. Takımla paylaştığın veriler şifrelenerek gönderilir. Aradaki sunucu bile içeriğini okuyamaz.

### Kurulum (tek komut)

**Gerekenler:** [Docker](https://docs.docker.com/get-docker/) ve en az bir AI aracı (örneğin Claude Code).

```bash
git clone <repo-adresi> god-eye
cd god-eye
cp .env.example .env     # projelerinin olduğu klasörü yaz: GODEYE_PROJECTS_DIR=...
mkdir -p ~/.godeye
docker compose up -d
```

Sonra tarayıcında şu adresi aç: **http://localhost:7777**

İlk açılışta dilini seçersin, o kadar. 🎉
(AI araçları, hesaplar ve proje klasörleri sonraki fazlarda bu sihirbaza eklenecek.)

> 💡 `.env` dosyasındaki `GODEYE_PROJECTS_DIR` mutlaka var olan bir klasör olmalı. Yoksa Docker onu kendisi oluşturur ve klasörün sahibi `root` olur.

### Docker'sız çalıştırmak (geliştirici)

```bash
bun install
bun run build      # arayüzü derler
bun run start      # http://localhost:7777
bun run doctor     # kurulum kontrolü
```

### Kapatmak / güncellemek

```bash
docker compose down          # kapat
git pull && docker compose up -d --build   # güncelle
```

### Sık sorulan sorular

**Kodlama bilmem gerekiyor mu?**
Hayır. "Basit Mod"da sadece ne istediğini yazarsın.

**Verilerim nerede duruyor?**
Bilgisayarında, `~/.godeye` klasöründe.

**API anahtarı (API key) gerekiyor mu?**
Hayır. Normal Claude/Codex hesabınla giriş yapman yeterli.

**Bir şey bozulursa?**
Her değişiklik kaydedilir. Tek tıkla geri alabilirsin.

---

## 🇬🇧 English

### What is it?

Most code is now written by AI (Claude, Codex, Gemini…). But with many projects and chats, it's easy to lose
track of what was done, what's left and what's broken.

**God Eye fixes that:**

- 📋 **Tracks everything:** Reads all your AI chats automatically and explains "what happened today" in plain words.
- 🧠 **Remembers everything:** Keeps decisions, mistakes and project status, and reminds the AI in every new chat.
- 📊 **Scores your project:** Reviews each part (design, frontend, backend, database…) and explains what's good, what's bad and how to fix it.
- 👥 **Gives you an expert team:** AI experts (designer, developer, security…) work on your project together.
- 👁️ **Shows it live:** Opens your app on screen. Click on something, type "change this", done.
- 🔑 **Manages accounts:** Switch between AI accounts in one click and see how much limit is left.
- ⏰ **Runs scheduled jobs:** Say "do this on Friday morning" and it does it on its own.
- 📚 **Learns:** Learns from every mistake and from the books you add, so the same mistake doesn't happen twice.
- 🤝 **Works with your team:** See what your teammates are doing live; everyone works from the same knowledge.
- 🖧 **Manages your servers:** Say "log into that server and do this", and it does it with your approval.
- 🌍 **Speaks your language:** Any language you choose.

Everything runs **on your own computer**. Anything you share with your team is encrypted first. Even the server in between can't read it.

### Install (one command)

**You need:** [Docker](https://docs.docker.com/get-docker/) and at least one AI tool (for example Claude Code).

```bash
git clone <repo-url> god-eye
cd god-eye
cp .env.example .env     # set the folder that holds your projects: GODEYE_PROJECTS_DIR=...
mkdir -p ~/.godeye
docker compose up -d
```

Then open **http://localhost:7777** and pick your language. That's it. 🎉
(AI tools, accounts and project folders join the setup wizard in later phases.)

> 💡 `GODEYE_PROJECTS_DIR` in `.env` must be a folder that already exists, otherwise Docker creates it owned by `root`.

### Run without Docker (developers)

```bash
bun install
bun run build      # build the web UI
bun run start      # http://localhost:7777
bun run doctor     # check your setup
```

### Stop / update

```bash
docker compose down          # stop
git pull && docker compose up -d --build   # update
```

### FAQ

**Do I need to know how to code?** No. In "Simple Mode" you just type what you want.

**Where is my data?** On your computer, in the `~/.godeye` folder.

**Do I need an API key?** No. Your normal Claude/Codex account login is enough.

**What if something breaks?** Every change is saved. Undo with one click.

---

## License

MIT
