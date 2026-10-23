<img src="docs/logo.svg" width="64" height="64" alt="Igrek logo">

# Igrek

*Igrek: know why.* (Eski adı / formerly: God Eye)

**Tüm AI kod projelerini tek ekrandan gör, anla ve yönet.**
*See, understand and manage all your AI coding projects from one screen.*

> **Durum / Status:** Faz 0–5 bitti (takip, hafıza, çalışma alanı, hesaplar, takım senkronu, prompt güçlendirici, bölüm sayfaları ve puanlama). Ayrıntılar `plan.md` içinde. / Phases 0–5 are done; see `plan.md`.
> Yol haritası / Roadmap: [plan.md](plan.md).

---

## Türkçe

### Bu nedir?

Artık kodu çoğunlukla yapay zekâ yazıyor (Claude, Codex, Gemini…). Ama çok fazla proje ve sohbet olunca
neyin yapıldığı, neyin kaldığı ve neyin bozuk olduğu kayboluyor.

**Igrek bunu çözer:**

- **Her şeyi takip eder:** Tüm AI sohbetlerini otomatik okur ve "bugün ne yapıldı" diye sade dille anlatır.
- **Her şeyi hatırlar:** Alınan kararları, yapılan hataları ve projenin durumunu unutmaz. Yeni bir sohbette AI'a bunları kendisi hatırlatır.
- **Puan verir:** Projenin her bölümünü (tasarım, ön yüz, arka yüz, veritabanı…) inceler ve "iyi mi, kötü mü, nasıl düzelir" diye açıklar.
- **Uzman bir takım sunar:** Tasarımcı, yazılımcı, güvenlik uzmanı gibi AI uzmanları projen üzerinde birlikte çalışır.
- **Canlı gösterir:** Uygulamanı ekranda açar. Bir yere tıklayıp "bunu değiştir" yazman yeterli.
- **Hesapları yönetir:** Birden fazla AI hesabın arasında tek tıkla geçersin ve ne kadar limitin kaldığını görürsün.
- **Zamanlı iş yapar:** "Cuma sabahı şunu yap" dersin, zamanı gelince kendisi yapar.
- **Öğrenir:** Her hatadan ve senin eklediğin kitaplardan öğrenir, aynı hatayı bir daha yapmaz.
- **Takımla çalışır:** Arkadaşların ne yaptığını canlı görürsün, herkes aynı bilgiyle çalışır.
- **Sunucularını yönetir:** "Şu sunucuya gir, şunu yap" dersin, onayınla yapar.
- **Senin dilinde konuşur:** Hangi dili istersen.

Her şey **senin bilgisayarında** çalışır. Takımla paylaştığın veriler şifrelenerek gönderilir. Aradaki sunucu bile içeriğini okuyamaz.

### Masaüstü uygulaması (en kolayı)

Igrek kendi penceresinde açılır; tarayıcı, Docker ya da Bun gerekmez. Bilgisayarına uygun paketi
[Releases](https://github.com/Mohamedattiadev/igrek/releases) sayfasından indir: Linux için `.AppImage` ya da `.deb`,
Windows için `.msi`, macOS için `.dmg` (Apple işlemci: `aarch64`, Intel: `x64`). Claude Code ve Codex pakette
yoktur; kurulu değillerse ilk açılışta Igrek nasıl kurulacaklarını gösterir.

Paketler ücretli bir sertifikayla imzalı değildir; ilk açılışta işletim sistemi bir kez sorar:

- **Windows:** "Windows bilgisayarınızı korudu" çıkar: **Ek bilgi > Yine de çalıştır**.
- **macOS:** "Igrek açılamıyor" çıkar: kapat, **Sistem Ayarları > Gizlilik ve Güvenlik**'te aşağı kaydır,
  Igrek'in yanındaki **Yine de Aç**'a, sonra **Aç**'a tıkla.
- **Linux (AppImage):** `chmod +x Igrek_*.AppImage` ile çalıştırılabilir yap ve aç (bazı sistemlerde önce `libfuse2` gerekir).

Pencereyi kapatınca Igrek ve başlattığı her şey durur, arkada bir şey kalmaz. Tepsi ikonuyla pencere gizlenebilir;
herhangi bir programdayken `Ctrl+Space` hızlı soru açar. Ayarlar'da "Bilgisayar açılınca başlat" (varsayılan kapalı) ve
güncelleme var. Ayrıntılar: [docs/desktop.md](docs/desktop.md).

### Kurulum (tek komut)

**Gerekenler:** [Docker](https://docs.docker.com/get-docker/) ve en az bir AI aracı (örneğin Claude Code).

```bash
git clone <repo-adresi> igrek
cd igrek
cp .env.example .env     # projelerinin olduğu klasörü yaz: IGREK_PROJECTS_DIR=...
mkdir -p ~/.igrek
docker compose up -d
```

Sonra tarayıcında şu adresi aç: **http://localhost:7777**

İlk açılışta dilini seçersin, o kadar.
(AI araçları, hesaplar ve proje klasörleri sonraki fazlarda bu sihirbaza eklenecek.)

> **Not / Note:** `.env` dosyasındaki `IGREK_PROJECTS_DIR` mutlaka var olan bir klasör olmalı. Yoksa Docker onu kendisi oluşturur ve klasörün sahibi `root` olur.

**AI araçlarını imaja eklemek (isteğe bağlı):** `.env` dosyasında `IGREK_INSTALL_CLAUDE=true` ve/veya `IGREK_INSTALL_CODEX=true`, sonra `docker compose up -d --build`. Codex imajı yaklaşık 300 MB büyütür (kendi programı bu boyutta).

### Docker'sız kurulum (Windows, macOS, Linux)

Docker gerekmez; Igrek doğrudan bilgisayarında çalışır. Tek komutla: Linux ve macOS'ta
`curl -fsSL https://raw.githubusercontent.com/Mohamedattiadev/igrek/main/scripts/install.sh | sh`, Windows'ta
PowerShell'de `irm https://raw.githubusercontent.com/Mohamedattiadev/igrek/main/scripts/install.ps1 | iex`.
Elle kurmak istersen:

1. **Bun** kur: macOS ve Linux'ta `curl -fsSL https://bun.sh/install | bash`, Windows'ta PowerShell'de
   `powershell -c "irm bun.sh/install.ps1 | iex"`.
2. **Git** kur. Windows'ta [Git for Windows](https://git-scm.com/download/win): Claude Code da akışların kabuk
   adımları da onunla gelen bash'i kullanır.
3. **Claude Code**'u kur ve bir kez `claude` yazıp giriş yap (Codex isteğe bağlı).
4. Igrek'i indir ve başlat:

```bash
git clone https://github.com/Mohamedattiadev/igrek.git igrek && cd igrek
bun install
bun run build      # arayüzü derler
bun run start      # http://localhost:7777
bun run doctor     # kurulum kontrolü
```

5. Tarayıcıda `http://localhost:7777` aç. Ayarlar → **Igrek'i uygulama olarak kullan** ile kendi penceresinde açılır.

Ekran görüntüleri için Chrome, Chromium ya da Edge gerekir (başka yerdeyse `IGREK_BROWSER` ile yolunu ver).
Windows'ta henüz denenmeyenler: gömülü terminal ve Claude Code'un otomatik moddaki sandbox'ı (Windows'ta yok).

### Kapatmak / güncellemek

```bash
docker compose down          # kapat
git pull && docker compose up -d --build   # güncelle
```

### Takımla kullanmak (isteğe bağlı)

Tek başına kullanıyorsan bunu atla. Takım için küçük bir **Hub** sunucusu kurulur (kendi VPS'inde, ücretsiz):

```bash
# VPS'te, repo klasöründe
docker compose -f docker/hub-compose.yml up -d --build
docker compose -f docker/hub-compose.yml exec hub igrek-hub create-admin <kullanici-adin>
```

HTTPS için önüne Caddy koy (`docker/Caddyfile.example`). Sonra Igrek → **Takım** → *Kullanıcı adıyla giriş*. İlk girişte **kurtarma anahtarı** gösterilir, bir şifre yöneticisinde sakla. Arkadaşlarını oradan davet edersin: her biri için tek bir davet kodu çıkar, kodu özelden gönderirsin.

İstersen hub davet kodunu ve "şifremi unuttum" kodlarını **e-postayla** da gönderebilir (ücretsiz, kendi hesabınla; ör. Gmail uygulama şifresi). `docker/hub.env` dosyasına `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` yaz; yedekleme ayarları da aynı dosyaya gider (bkz. `docker/hub-compose.yml`).

- Hub verileri **okuyamaz**: her şey bilgisayarından şifreli çıkar.
- Bir projeyi paylaşmadıkça hiçbir şeyi gitmez. Sırlar (API anahtarları, şifreler) her zaman silinir.
- AI hesapların, SSH anahtarların ve `.env` dosyaların asla gönderilmez.

### Sık sorulan sorular

**Kodlama bilmem gerekiyor mu?**
Hayır. "Basit Mod"da sadece ne istediğini yazarsın.

**Verilerim nerede duruyor?**
Bilgisayarında, `~/.igrek` klasöründe.

**God Eye'dan güncelliyorum, verilerim ne olacak?**
Igrek ilk açılışta `~/.godeye` klasörünü `~/.igrek`'e taşır ve eski yerde bir bağlantı bırakır. Eski `GODEYE_*` ayarları,
kurulu hook'lar, eklentiler ve MCP kaydı çalışmaya devam eder. Docker kullanıyorsan önce `docker compose down`, sonra
bir kez `mv ~/.godeye ~/.igrek`, ardından `docker compose up -d --build`.

**API anahtarı (API key) gerekiyor mu?**
Hayır. Normal Claude/Codex hesabınla giriş yapman yeterli.

**Bir şey bozulursa?**
Her değişiklik kaydedilir. Tek tıkla geri alabilirsin.

---

## English

### What is it?

Most code is now written by AI (Claude, Codex, Gemini…). But with many projects and chats, it's easy to lose
track of what was done, what's left and what's broken.

**Igrek fixes that:**

- **Tracks everything:** Reads all your AI chats automatically and explains "what happened today" in plain words.
- **Remembers everything:** Keeps decisions, mistakes and project status, and reminds the AI in every new chat.
- **Scores your project:** Reviews each part (design, frontend, backend, database…) and explains what's good, what's bad and how to fix it.
- **Gives you an expert team:** AI experts (designer, developer, security…) work on your project together.
- **Shows it live:** Opens your app on screen. Click on something, type "change this", done.
- **Manages accounts:** Switch between AI accounts in one click and see how much limit is left.
- **Runs scheduled jobs:** Say "do this on Friday morning" and it does it on its own.
- **Learns:** Learns from every mistake and from the books you add, so the same mistake doesn't happen twice.
- **Works with your team:** See what your teammates are doing live; everyone works from the same knowledge.
- **Manages your servers:** Say "log into that server and do this", and it does it with your approval.
- **Speaks your language:** Any language you choose.

Everything runs **on your own computer**. Anything you share with your team is encrypted first. Even the server in between can't read it.

### Desktop app (the easiest)

Igrek opens in a window of its own; no browser, Docker or Bun needed. Download the package for your computer from
[Releases](https://github.com/Mohamedattiadev/igrek/releases): `.AppImage` or `.deb` for Linux, `.msi` for Windows,
`.dmg` for macOS (Apple silicon: `aarch64`, Intel: `x64`). Claude Code and Codex are not in the package; when they
are missing, Igrek shows on first run how to install them.

The packages are not signed with a paid certificate, so the system asks once on the first start:

- **Windows:** "Windows protected your PC" appears: **More info > Run anyway**.
- **macOS:** "Igrek cannot be opened" appears: close it, scroll down in **System Settings > Privacy & Security**,
  click **Open Anyway** next to Igrek, then **Open**.
- **Linux (AppImage):** make it runnable with `chmod +x Igrek_*.AppImage` and open it (some systems need `libfuse2` first).

Closing the window stops Igrek and everything it started; nothing is left running. The tray icon can hide the window;
`Ctrl+Space` from any program opens a quick question. Settings has "Start with the computer" (off by default) and
updates. Details: [docs/desktop.md](docs/desktop.md).

### Install (one command)

**You need:** [Docker](https://docs.docker.com/get-docker/) and at least one AI tool (for example Claude Code).

```bash
git clone <repo-url> igrek
cd igrek
cp .env.example .env     # set the folder that holds your projects: IGREK_PROJECTS_DIR=...
mkdir -p ~/.igrek
docker compose up -d
```

Then open **http://localhost:7777** and pick your language. That's it.
(AI tools, accounts and project folders join the setup wizard in later phases.)

> **Not / Note:** `IGREK_PROJECTS_DIR` in `.env` must be a folder that already exists, otherwise Docker creates it owned by `root`.

**Adding AI tools to the image (optional):** set `IGREK_INSTALL_CLAUDE=true` and/or `IGREK_INSTALL_CODEX=true` in `.env`, then `docker compose up -d --build`. Codex adds about 300 MB (its own binary is that size).

### Install without Docker (Windows, macOS, Linux)

No Docker needed; Igrek runs directly on your computer. In one command: on Linux and macOS
`curl -fsSL https://raw.githubusercontent.com/Mohamedattiadev/igrek/main/scripts/install.sh | sh`, on Windows in
PowerShell `irm https://raw.githubusercontent.com/Mohamedattiadev/igrek/main/scripts/install.ps1 | iex`.
To do it by hand:

1. Install **Bun**: on macOS and Linux `curl -fsSL https://bun.sh/install | bash`, on Windows in PowerShell
   `powershell -c "irm bun.sh/install.ps1 | iex"`.
2. Install **Git**. On Windows, [Git for Windows](https://git-scm.com/download/win): Claude Code and the shell steps
   of flows use the bash it brings.
3. Install **Claude Code** and run `claude` once to log in (Codex is optional).
4. Get Igrek and start it:

```bash
git clone https://github.com/Mohamedattiadev/igrek.git igrek && cd igrek
bun install
bun run build      # build the web UI
bun run start      # http://localhost:7777
bun run doctor     # check your setup
```

5. Open `http://localhost:7777`. Settings → **Igrek as an app** opens it in a window of its own.

Screenshots need Chrome, Chromium or Edge (set `IGREK_BROWSER` if yours is elsewhere). Not yet tried on Windows:
the built-in terminal, and Claude Code's sandbox for auto mode (it does not exist on Windows).

### Stop / update

```bash
docker compose down          # stop
git pull && docker compose up -d --build   # update
```

### Use it with a team (optional)

Skip this if you work alone. A team runs a small **Hub** server (on your own VPS, free):

```bash
# On the VPS, in the repo folder
docker compose -f docker/hub-compose.yml up -d --build
docker compose -f docker/hub-compose.yml exec hub igrek-hub create-admin <your-username>
```

Put Caddy in front for HTTPS (`docker/Caddyfile.example`). Then Igrek → **Team** → *Sign in with username*. The first time, you get a **recovery key**. Keep it in a password manager. Invite teammates from there: each one gets a single invite code, which you send them privately.

If you like, the hub can also **email** invite codes and "forgot password" codes (free, through your own account, e.g. a Gmail app password). Put `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASS` in `docker/hub.env`; backup settings go in the same file (see `docker/hub-compose.yml`).

- The hub **can't read** your data: everything is encrypted before it leaves your computer.
- Nothing is sent until you share a project. Secrets (API keys, passwords) are always removed.
- Your AI accounts, SSH keys and `.env` files are never sent.

### FAQ

**Do I need to know how to code?** No. In "Simple Mode" you just type what you want.

**Where is my data?** On your computer, in the `~/.igrek` folder.

**Updating from God Eye?** On first start Igrek moves `~/.godeye` to `~/.igrek` and leaves a link at the old path. Old
`GODEYE_*` settings, installed hooks, plugins and the MCP entry keep working. With Docker: `docker compose down`, then once
`mv ~/.godeye ~/.igrek`, then `docker compose up -d --build`.

**Do I need an API key?** No. Your normal Claude/Codex account login is enough.

**What if something breaks?** Every change is saved. Undo with one click.

---

## Lisans / License

**Kaynağı açık, açık kaynak değil.** © 2026 Mohamed Attia. Igrek'i herkes (şirketler dahil) ücretsiz kurup
kullanabilir ve kodunu okuyabilir. Kodu başka bir ürüne koymak, kopyasını dağıtmak ya da satmak, değiştirilmiş
sürüm yayınlamak, servis olarak sunmak, Igrek adını ve logosunu kullanmak ve kodla yapay zekâ eğitmek yazılı izin
olmadan yasaktır. Başka projelerden gelen bileşenler kendi lisanslarıyla kalır. Ayrıntılar: [LICENSE](LICENSE),
katkı kuralları: [CONTRIBUTING.md](CONTRIBUTING.md), güvenlik: [SECURITY.md](SECURITY.md).

**Source-available, not open source.** © 2026 Mohamed Attia. Anyone, companies included, may install and use Igrek
for free and read its code. Copying it into another product, distributing or selling copies, publishing changed
versions, offering it as a service, using the Igrek name and logo, and training AI on the code need written
permission. Components from other projects keep their own licenses. Details: [LICENSE](LICENSE), contributing:
[CONTRIBUTING.md](CONTRIBUTING.md), security: [SECURITY.md](SECURITY.md).
