"""The site's texts, English and Turkish, and the icons; build.py lays them out."""
import sys

ROOT = sys.argv[1]
REL = "https://github.com/Mohamedattiadev/igrek/releases/latest"
GH = "https://github.com/Mohamedattiadev/igrek"

I = {
    "chat": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    "shield": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    "gauge": '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    "wrench": '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    "lock": '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "layers": '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    "bot": '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    "globe": '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    "book": '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    "search": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "info": '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    "arrow": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
}


def icon(name):
    return f'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{I[name]}</svg>'


T = {
    "en": {
        "lang": "en", "other": "tr/", "other_name": "Türkçe", "base": "", "docs": "docs/",
        "title": "Igrek: know why", "desc": "Igrek is a control room for AI coding agents. It runs on your computer, follows every Claude Code and Codex chat, and tells you what changed, why, and what it cost.",
        "nav": ["Features", "Docs", "Download"],
        "pill": "<b>New</b> 0.1.6: 17 MB installers, one start box, one-click fixes",
        "h1": "Your AI agents, <span>explained</span>.",
        "lead": "Igrek sits on top of Claude Code and Codex on your own computer. It remembers your projects, keeps private details out of the AI's reach, and shows why every file changed.",
        "cta": "Download Igrek", "cta2": "Read the docs",
        "free": "Free. No account, no API keys, no telemetry. Linux, macOS and Windows.",
        "shot": "img/en-health.webp", "shot_alt": "Igrek showing a project's health",
        "f_eyebrow": "What it does", "f_h": "What one agent alone does not do",
        "f_sub": "Claude Code and Codex write the code. Igrek is the layer around them: memory, privacy, many projects at once, and a clear picture of what happened.",
        "features": [
            ("search", "Why did this change?", "Next to every changed file: the request that led to it, the plan step it belongs to, and the expert's note."),
            ("bot", "One place to start", "\"What do you want to do?\" goes to the right project, or to several at once, each in its own copy."),
            ("gauge", "Health, with a fix button", "Architecture, security, tests and dependencies scored; most findings fixed in one click, the rest by the right expert."),
            ("lock", "Private by design", "Salaries, IBANs, IDs and .env secrets become placeholders before anything reaches the model."),
            ("users", "Thirty experts on call", "Security, database, architecture and more: read-only reviewers that know their field."),
            ("layers", "Memory that lasts", "Decisions and mistakes are kept per project and put in front of the AI before similar work. Claude and Codex read the same rules."),
        ],
        "s_eyebrow": "How it works", "s_h": "Three steps, then it just runs",
        "steps": [("Install", "Download the app for your computer (about 17 MB). The first start fetches its runtime once."), ("Add your projects", "Pick the folders you work in. Igrek finds the ones Claude already worked in."), ("Ask", "Type what you want. Igrek picks the project, a way of working, and shows every step.")],
        "p_eyebrow": "Yours", "p_h": "It runs on your computer",
        "p_text": "Igrek uses the AI logins you already have, so there is nothing new to pay for. Nothing is sent to us: no telemetry, no account, and every address Igrek opens on the internet is listed in its Settings.",
        "p_list": ["Your Claude and Codex subscriptions, no API keys", "Private details hidden from the model, filled back in on your side", "A file that tells AI to stop is shown to you, and you decide", "Pushing, deploying and publishing always wait for your OK"],
        "p_shot": "img/en-experts.webp", "p_alt": "Igrek's experts",
        "stats": [("17 MB", "installer"), ("0", "telemetry"), ("30", "experts"), ("EN + TR", "checked by hand; other languages translated on request")],
        "d_eyebrow": "Download", "d_h": "Get Igrek",
        "d_sub": "Signed updates, installed by Igrek itself. Claude Code or Codex is needed too; Igrek shows how to install them on its first start.",
        "dl": [("Windows", ".msi, 64-bit", "Windows 10 or later."), ("macOS", ".dmg, Apple silicon and Intel", "macOS 11 or later."), ("Linux", "AppImage or .deb", "The AppImage updates itself.")],
        "dl_btn": "Download",
        "faq_h": "Questions",
        "faq": [
            ("Is it free?", "Yes. Igrek is free to install and use, for people and companies. It uses your own Claude or Codex plan, and the ones that call a model are marked so you see what uses your limit."),
            ("Does my code leave my computer?", "Only to the AI you already use, the way Claude Code and Codex send it. Igrek adds nothing on top: no telemetry, no server of ours. Private details are replaced by placeholders first."),
            ("Why does the first start download something?", "Igrek's server runs on Bun. To keep the installer small, the app downloads Bun's official release once (about 35 MB), checks it against Bun's published checksum and keeps it."),
            ("Is it open source?", "The source is open to read, but it is not open source: the Igrek Use License lets anyone use it for free, while selling it, redistributing it or offering it as a service needs written permission."),
        ],
        "foot": "© 2026 Mohamed Attia. The Igrek name and logo belong to Mohamed Attia.",
        "license": "License", "sec": "Security",
    },
    "tr": {
        "lang": "tr", "other": "../", "other_name": "English", "base": "../", "docs": "docs/",
        "title": "Igrek: nedenini bil", "desc": "Igrek, AI kodlama ajanları için bir kontrol merkezi. Kendi bilgisayarında çalışır, her Claude Code ve Codex sohbetini izler; neyin, neden değiştiğini ve neye mal olduğunu söyler.",
        "nav": ["Özellikler", "Belgeler", "İndir"],
        "pill": "<b>Yeni</b> 0.1.6: 17 MB kurulum, tek başlangıç kutusu, tek tıkla düzeltme",
        "h1": "AI ajanların, <span>anlaşılır</span>.",
        "lead": "Igrek, kendi bilgisayarında Claude Code ve Codex'in üstünde çalışır. Projelerini hatırlar, özel bilgilerini yapay zekâdan uzak tutar ve her dosyanın neden değiştiğini gösterir.",
        "cta": "Igrek'i indir", "cta2": "Belgeleri oku",
        "free": "Ücretsiz. Hesap yok, API anahtarı yok, telemetri yok. Linux, macOS ve Windows.",
        "shot": "img/tr-health.webp", "shot_alt": "Igrek bir projenin sağlığını gösteriyor",
        "f_eyebrow": "Ne yapar", "f_h": "Tek bir ajanın kendi başına yapmadıkları",
        "f_sub": "Kodu Claude Code ve Codex yazar. Igrek onların etrafındaki katmandır: hafıza, gizlilik, aynı anda birçok proje ve ne olduğunun net resmi.",
        "features": [
            ("search", "Bu neden değişti?", "Değişen her dosyanın yanında: ona yol açan istek, ait olduğu plan adımı ve uzmanın notu."),
            ("bot", "Tek başlangıç", "\"Ne yapmak istiyorsun?\" işi doğru projeye ya da aynı anda birkaçına götürür; her biri kendi kopyasında."),
            ("gauge", "Sağlık ve Düzelt düğmesi", "Mimari, güvenlik, testler ve bağımlılıklar puanlanır; çoğu bulgu tek tıkla, gerisi doğru uzmanla düzelir."),
            ("lock", "Baştan gizli", "Maaş, IBAN, kimlik numarası ve .env sırları modele ulaşmadan yer tutucuya dönüşür."),
            ("users", "Otuz uzman", "Güvenlik, veritabanı, mimari ve daha fazlası: alanını bilen, salt okunur inceleyiciler."),
            ("layers", "Kalıcı hafıza", "Kararlar ve hatalar proje başına saklanır, benzer işten önce AI'ın önüne konur. Claude ve Codex aynı kuralları okur."),
        ],
        "s_eyebrow": "Nasıl çalışır", "s_h": "Üç adım, sonra kendi işler",
        "steps": [("Kur", "Bilgisayarına uygun uygulamayı indir (yaklaşık 17 MB). İlk açılışta çalışma ortamını bir kez indirir."), ("Projelerini ekle", "Çalıştığın klasörleri seç. Claude'un daha önce çalıştığı klasörleri Igrek kendisi bulur."), ("Sor", "Ne istediğini yaz. Igrek projeyi ve çalışma yolunu seçer, her adımı gösterir.")],
        "p_eyebrow": "Senin", "p_h": "Senin bilgisayarında çalışır",
        "p_text": "Igrek zaten sahip olduğun AI girişlerini kullanır; ödeyeceğin yeni bir şey yok. Bize hiçbir şey gönderilmez: telemetri yok, hesap yok; Igrek'in internette açtığı her adres Ayarlar'da listelenir.",
        "p_list": ["Claude ve Codex aboneliklerin, API anahtarı yok", "Özel bilgiler modelden gizlenir, senin tarafında geri doldurulur", "AI'a dur diyen bir dosya sana gösterilir, kararı sen verirsin", "Push, yayına alma ve yayımlama her zaman senin onayını bekler"],
        "p_shot": "img/tr-experts.webp", "p_alt": "Igrek'in uzmanları",
        "stats": [("17 MB", "kurulum"), ("0", "telemetri"), ("30", "uzman"), ("TR + EN", "elle kontrol edildi; diğer diller istenince çevrilir")],
        "d_eyebrow": "İndir", "d_h": "Igrek'i edin",
        "d_sub": "İmzalı güncellemeler, Igrek'in kendisi kurar. Claude Code ya da Codex de gerekir; Igrek ilk açılışta nasıl kurulacaklarını gösterir.",
        "dl": [("Windows", ".msi, 64-bit", "Windows 10 ve sonrası."), ("macOS", ".dmg, Apple işlemci ve Intel", "macOS 11 ve sonrası."), ("Linux", "AppImage ya da .deb", "AppImage kendi kendine güncellenir.")],
        "dl_btn": "İndir",
        "faq_h": "Sorular",
        "faq": [
            ("Ücretsiz mi?", "Evet. Igrek'i kurmak ve kullanmak kişiler ve şirketler için ücretsizdir. Kendi Claude ya da Codex planını kullanır; model çağıran her şey işaretlidir, limitinden neyin harcadığını görürsün."),
            ("Kodum bilgisayarımdan çıkıyor mu?", "Yalnızca zaten kullandığın yapay zekâya, Claude Code ve Codex'in gönderdiği şekilde. Igrek üstüne bir şey eklemez: telemetri yok, bizim bir sunucumuz yok. Özel bilgiler önce yer tutucuya çevrilir."),
            ("İlk açılışta neden bir şey indiriyor?", "Igrek'in sunucusu Bun ile çalışır. Kurulumu küçük tutmak için uygulama Bun'ın resmî sürümünü bir kez indirir (yaklaşık 35 MB), Bun'ın yayımladığı sağlama değeriyle doğrular ve saklar."),
            ("Açık kaynak mı?", "Kaynak kodu okunabilir, ama açık kaynak değildir: Igrek Use License herkesin ücretsiz kullanmasına izin verir; satmak, yeniden dağıtmak ya da servis olarak sunmak yazılı izne bağlıdır."),
        ],
        "foot": "© 2026 Mohamed Attia. Igrek adı ve logosu Mohamed Attia'ya aittir.",
        "license": "Lisans", "sec": "Güvenlik",
    },
}

HEAD = """<!doctype html>
<html lang="{lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content="{desc}" />
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="{desc}" />
    <meta property="og:image" content="https://mohamedattiadev.github.io/igrek/{ogimg}" />
    <link rel="icon" href="{base}logo.svg" />
    <link rel="alternate" hreflang="{otherlang}" href="{other}" />
    <link rel="stylesheet" href="{base}style.css" />
  </head>
  <body>
    <header class="top">
      <div class="wrap">
        <a class="brand" href="{home}"><img src="{base}logo.svg" width="24" height="24" alt="" /> Igrek</a>
        <nav>
{nav}
        </nav>
      </div>
    </header>
"""

COPY = """    <script>
      // A copy button on every command, so nothing has to be selected by hand.
      for (const pre of document.querySelectorAll("pre")) {{
        const b = document.createElement("button");
        b.className = "copy";
        b.type = "button";
        b.textContent = "{copy}";
        b.onclick = () => navigator.clipboard.writeText(pre.querySelector("code").innerText).then(() => {{
          b.textContent = "{copied}";
          setTimeout(() => (b.textContent = "{copy}"), 1500);
        }});
        pre.append(b);
      }}
      // The section on screen is marked in the side menu.
      const links = [...document.querySelectorAll(".docs aside a")];
      const mark = () => {{
        let on = links[0];
        for (const a of links) {{
          const s = document.querySelector(a.getAttribute("href"));
          if (s && s.getBoundingClientRect().top < 120) on = a;
        }}
        for (const a of links) a.classList.toggle("on", a === on);
      }};
      if (links.length) {{ addEventListener("scroll", mark, {{ passive: true }}); mark(); }}
    </script>
"""


def foot(t):
    return f"""    <footer>
      <div class="wrap">
        <span>{t["foot"]}</span>
        <span><a href="{GH}">GitHub</a> · <a href="{GH}/blob/main/LICENSE">{t["license"]}</a> · <a href="{GH}/blob/main/SECURITY.md">{t["sec"]}</a></span>
      </div>
    </footer>
"""


def nav(t, docs):
    home = t["base"] + ("" if t["lang"] == "en" else "tr/") if docs else "./"
    pre = "../" if docs else ""
    links = [
        f'          <a href="{pre}#features">{t["nav"][0]}</a>',
        f'          <a href="{"./" if docs else t["docs"]}">{t["nav"][1]}</a>',
        f'          <a href="{GH}">GitHub</a>',
        f'          <a class="lang" href="{("../" if docs else "") + t["other"]}">{t["other_name"]}</a>',
        f'          <a class="cta" href="{pre}#download">{t["nav"][2]}</a>',
    ]
    return "\n".join(links), home


def landing(t):
    n, home = nav(t, False)
    h = HEAD.format(lang=t["lang"], title=t["title"], desc=t["desc"], base=t["base"], other=t["other"],
                    otherlang="tr" if t["lang"] == "en" else "en", nav=n, home=home, ogimg=t["shot"].replace("img/", "img/"))
    feats = "\n".join(
        f'          <div class="card"><span class="ic">{icon(i)}</span><h3>{a}</h3><p>{b}</p></div>' for i, a, b in t["features"])
    steps = "\n".join(f'          <div class="card"><h3>{a}</h3><p>{b}</p></div>' for a, b in t["steps"])
    plist = "\n".join(f"            <li>{icon('check')}<span>{x}</span></li>" for x in t["p_list"])
    stats = "\n".join(f'          <div class="stat"><b>{a}</b><span>{b}</span></div>' for a, b in t["stats"])
    dls = "\n".join(
        f'          <div class="card"><h3>{a}</h3><span>{b}</span><small>{c}</small><a class="button" href="{REL}">{icon("download")}{t["dl_btn"]}</a></div>'
        for a, b, c in t["dl"])
    faq = "\n".join(f"        <details><summary>{q}</summary><p>{a}</p></details>" for q, a in t["faq"])
    body = f"""    <main>
      <div class="hero wrap">
        <span class="pill">{t["pill"]}</span>
        <h1>{t["h1"]}</h1>
        <p class="lead">{t["lead"]}</p>
        <div class="actions">
          <a class="button" href="#download">{icon("download")}{t["cta"]}</a>
          <a class="button ghost" href="{t["docs"]}">{t["cta2"]}{icon("arrow")}</a>
        </div>
        <p class="note">{t["free"]}</p>
        <div class="shot"><div class="bar"><i></i><i></i><i></i></div><img src="{t["base"]}{t["shot"]}" width="1440" height="900" alt="{t["shot_alt"]}" /></div>
      </div>
      <section id="features">
        <div class="wrap">
          <p class="eyebrow">{t["f_eyebrow"]}</p>
          <h2>{t["f_h"]}</h2>
          <p class="sub">{t["f_sub"]}</p>
          <div class="grid">
{feats}
          </div>
        </div>
      </section>
      <section>
        <div class="wrap">
          <p class="eyebrow">{t["s_eyebrow"]}</p>
          <h2>{t["s_h"]}</h2>
          <div class="steps" style="margin-top:32px">
{steps}
          </div>
        </div>
      </section>
      <div class="band">
        <section>
          <div class="wrap split">
            <div>
              <p class="eyebrow">{t["p_eyebrow"]}</p>
              <h2>{t["p_h"]}</h2>
              <p style="color:var(--muted)">{t["p_text"]}</p>
              <ul>
{plist}
              </ul>
            </div>
            <div class="shot" style="margin:0"><div class="bar"><i></i><i></i><i></i></div><img src="{t["base"]}{t["p_shot"]}" width="1440" height="900" alt="{t["p_alt"]}" loading="lazy" /></div>
          </div>
          <div class="wrap stats">
{stats}
          </div>
        </section>
      </div>
      <section id="download">
        <div class="wrap">
          <p class="eyebrow">{t["d_eyebrow"]}</p>
          <h2>{t["d_h"]}</h2>
          <p class="sub">{t["d_sub"]}</p>
          <div class="downloads">
{dls}
          </div>
        </div>
      </section>
      <section>
        <div class="wrap" style="max-width:820px">
          <h2>{t["faq_h"]}</h2>
{faq}
        </div>
      </section>
    </main>
"""
    return h + body + foot(t) + "  </body>\n</html>\n"


DOCS = {
    "en": {
        "title": "Igrek docs", "h1": "Igrek docs", "lead": "Everything to install Igrek, start your first task and know what it does with your data.",
        "groups": [("Start", ["install", "first", "start"]), ("Working", ["chats", "why", "health", "experts", "memory"]), ("More", ["extension", "privacy", "team", "move", "update"])],
        "copy": "Copy", "copied": "Copied",
        "sections": {
            "install": ("Install", f"""<h3>The desktop app</h3>
<p>Download the package for your computer from the <a href="{REL}">latest release</a>: <code>.msi</code> for Windows, <code>.dmg</code> for macOS (<code>aarch64</code> for Apple silicon, <code>x64</code> for Intel), an <code>AppImage</code> or <code>.deb</code> for Linux. Each is about 17 MB (the AppImage carries its own WebKit and is larger).</p>
<div class="callout">{icon("info")}<div>On its first start the app downloads Bun, which runs Igrek's server: Bun's official release (about 35 MB), checked against Bun's published SHA-256, once. The loading page shows how far it is. This needs the internet the first time only.</div></div>
<p>The packages are not signed with a paid certificate, so the system asks once:</p>
<ul><li><b>Windows:</b> "Windows protected your PC". Click <i>More info</i>, then <i>Run anyway</i>.</li><li><b>macOS:</b> "Igrek cannot be opened". Close it, open System Settings, Privacy &amp; Security, scroll down and click <i>Open Anyway</i>.</li><li><b>Linux (AppImage):</b> make it executable (<code>chmod +x Igrek_*.AppImage</code>), then open it. Some systems need <code>libfuse2</code> first.</li></ul>
<p>Claude Code or Codex is not inside: on the first start Igrek checks for them and installs one in a click if you like. Sign in to it once.</p>
<h3>From a terminal</h3>
<p>Linux and macOS:</p>
<pre><code>curl -fsSL https://raw.githubusercontent.com/Mohamedattiadev/igrek/main/scripts/install.sh | sh</code></pre>
<p>Windows (PowerShell). Install Git for Windows first; Claude Code uses its bash.</p>
<pre><code>irm https://raw.githubusercontent.com/Mohamedattiadev/igrek/main/scripts/install.ps1 | iex</code></pre>
<h3>With Docker</h3>
<pre><code>git clone https://github.com/Mohamedattiadev/igrek.git &amp;&amp; cd igrek
docker compose up -d</code></pre>
<p>Then open <code>http://localhost:7777</code>.</p>"""),
            "first": ("First start", """<p>Pick your language, say whether you write code, then add your project folders: one project, or a folder that holds several. Igrek shows only the folders you add; the ones Claude already worked in are one click away.</p>
<ul><li><b>Simple</b> (you do not write code): a project shows its overview, chats and files, in plain words.</li><li><b>Developer</b>: code, board, health, setup and tools too. Settings, Mode changes it any time; nothing is removed either way.</li></ul>"""),
            "start": ("Start a task", """<p>The <b>What do you want to do?</b> box on the home page is the place to start. Leave it on <i>Igrek picks</i> and the chief, who knows every project, hands the work to the right one; pick a project yourself; or pick <i>Several projects</i> to send one task to many, each in its own copy, side by side.</p>
<p>A task for a project gets a way of working for its kind: a bug is reproduced before it is fixed, a slowness measured before and after, a refactor keeps the behaviour, a feature starts with its data and its smallest version. The box says which one; <i>leave out</i> sends your text as written.</p>
<p>Inside a project, <b>New chat</b> starts a chat; its arrow has terminals (Claude Code, Codex, a shell) and your other accounts.</p>"""),
            "chats": ("Chats", """<p>The box has what each message needs: text, pictures, saved prompts and experts. Approval mode, model and detail are under <i>Chat settings</i>. Above the box: the agent's plan, the chat's to-do list and the files the chat changed, with a diff and one-click undo.</p>
<p>The header shows what the last turn took of your 5-hour limit, and before you send, what a message here usually takes and what is left. Anything that asks a model has a small mark.</p>"""),
            "why": ("Why?", """<p>Every changed file has a <b>Why?</b> button: the request that led to the change, the plan step it belongs to and the expert asked in the same turn. It is read from the chat itself; nothing is guessed.</p>"""),
            "health": ("Health and Fix", """<p>The Health tab scores architecture, security, tests, documentation, dependencies and more, and lists what to improve. <b>Fix</b> runs a known command for the simple ones (a missing lockfile, an .env file in git), shown before it runs; the others are done by the part's expert in its own copy, which you review before anything is merged. Before merging, Igrek shows the files and tests that use what changed.</p>"""),
            "experts": ("Experts", """<p>About thirty experts, from security and databases to product and finance, each with its field's standards and numbers. Call one with <kbd>@</kbd> in a chat, ask all of them about a project, or turn on expert review of sensitive changes. Each review is one model call, so it is off by default. Experts can be shared as packs.</p>"""),
            "memory": ("Memory", """<p>Decisions, conventions and mistakes are kept per project and put in front of the AI at the start of each chat. Claude Code reads <code>CLAUDE.md</code> and Codex reads <code>AGENTS.md</code>; the Memory tab shows rules only one of them has and joins them, so both agents follow the same.</p>"""),
            "extension": ("Browser extension", """<p>For Chrome, Brave and Edge. It fills forms with your private details without the AI seeing them, writes a field's text, and acts on a page with you: ask about the page or an element you pick, and let it propose up to five steps (click, type, choose). Each step is outlined on the page and done only when you click <i>Do it</i>; one that sends, pays or deletes asks twice, and password fields are never typed into.</p>
<p>To connect it, press <i>Connect</i> in its panel and <i>Allow</i> in Igrek when the same code shows in both.</p>"""),
            "privacy": ("Privacy", """<p>Everything runs on your computer. No telemetry, no paid API; every address Igrek opens on the internet is listed in Settings. Your saved private details and your projects' .env secrets become placeholders such as <code>[[private:iban]]</code> before a message leaves, and the real values are put back on your side. Salaries, IBANs, card and ID numbers are recognised by their shape too.</p>
<p>When a file the AI reads tells AI tools not to help (a homework rule, a policy), Igrek shows you the line once and you decide whether it goes on. Nothing is hidden from the model.</p>"""),
            "team": ("Team", """<p>An optional hub, on a server you run, shares the projects you choose end-to-end encrypted. Everyone uses their own AI account; accounts are never shared. Setting up a hub is in the README.</p>"""),
            "move": ("Move to another computer", """<p>Settings, Move to another computer: one file, locked with a password, carries everything Igrek keeps. Open it in Igrek on the other computer and restart. AI logins are not in it; sign in again there.</p>"""),
            "update": ("Update and remove", f"""<p>The desktop app looks for a new version when it opens and once a day, and installs it after you agree. From a terminal install, run the install command again.</p>
<p>To remove Igrek, uninstall the app (or delete the AppImage), and delete its data in <code>~/.igrek</code> and its runtime in <code>~/.local/share/igrek-runtime</code> (Windows: <code>%LOCALAPPDATA%\\igrek-runtime</code>). Security issues: <a href="{GH}/blob/main/SECURITY.md">SECURITY.md</a>.</p>"""),
        },
    },
    "tr": {
        "title": "Igrek belgeleri", "h1": "Igrek belgeleri", "lead": "Igrek'i kurmak, ilk işini başlatmak ve verinle ne yaptığını bilmek için gereken her şey.",
        "groups": [("Başlangıç", ["install", "first", "start"]), ("Çalışırken", ["chats", "why", "health", "experts", "memory"]), ("Daha fazla", ["extension", "privacy", "team", "move", "update"])],
        "copy": "Kopyala", "copied": "Kopyalandı",
        "sections": {
            "install": ("Kurulum", f"""<h3>Masaüstü uygulaması</h3>
<p>Bilgisayarına uygun paketi <a href="{REL}">son sürümden</a> indir: Windows için <code>.msi</code>, macOS için <code>.dmg</code> (Apple işlemci için <code>aarch64</code>, Intel için <code>x64</code>), Linux için <code>AppImage</code> ya da <code>.deb</code>. Her biri yaklaşık 17 MB (AppImage kendi WebKit'ini taşıdığı için daha büyük).</p>
<div class="callout">{icon("info")}<div>Uygulama ilk açılışta Igrek'in sunucusunu çalıştıran Bun'ı indirir: Bun'ın resmî sürümü (yaklaşık 35 MB), Bun'ın yayımladığı SHA-256 ile doğrulanarak, bir kez. Yükleme ekranı ne kadar indiğini gösterir. İnternet yalnızca ilk seferde gerekir.</div></div>
<p>Paketler ücretli bir sertifikayla imzalanmadığı için sistem bir kez sorar:</p>
<ul><li><b>Windows:</b> "Windows bilgisayarınızı korudu" çıkar. <i>Ek bilgi</i>'ye, sonra <i>Yine de çalıştır</i>'a tıkla.</li><li><b>macOS:</b> "Igrek açılamıyor" çıkar. Kapat, Sistem Ayarları &gt; Gizlilik ve Güvenlik'i aç, aşağı kaydırıp <i>Yine de Aç</i>'a tıkla.</li><li><b>Linux (AppImage):</b> çalıştırılabilir yap (<code>chmod +x Igrek_*.AppImage</code>), sonra aç. Bazı sistemlerde önce <code>libfuse2</code> gerekir.</li></ul>
<p>Claude Code ya da Codex içinde değildir: Igrek ilk açılışta onlara bakar, istersen tek tıkla kurar. Bir kez giriş yapman yeter.</p>
<h3>Terminalden</h3>
<p>Linux ve macOS:</p>
<pre><code>curl -fsSL https://raw.githubusercontent.com/Mohamedattiadev/igrek/main/scripts/install.sh | sh</code></pre>
<p>Windows (PowerShell). Önce Git for Windows'u kur; Claude Code onun bash'ini kullanır.</p>
<pre><code>irm https://raw.githubusercontent.com/Mohamedattiadev/igrek/main/scripts/install.ps1 | iex</code></pre>
<h3>Docker ile</h3>
<pre><code>git clone https://github.com/Mohamedattiadev/igrek.git &amp;&amp; cd igrek
docker compose up -d</code></pre>
<p>Sonra <code>http://localhost:7777</code> adresini aç.</p>"""),
            "first": ("İlk açılış", """<p>Dilini seç, kod yazıp yazmadığını söyle, sonra proje klasörlerini ekle: tek bir proje ya da birkaç proje içeren bir klasör. Igrek yalnızca eklediğin klasörleri gösterir; Claude'un daha önce çalıştığı klasörler tek tıkla eklenir.</p>
<ul><li><b>Basit</b> (kod yazmıyorsan): bir proje genel bakışını, sohbetlerini ve dosyalarını sade dille gösterir.</li><li><b>Geliştirici</b>: kod, pano, sağlık, kurulum ve araçlar da. Ayarlar &gt; Mod'dan istediğin zaman değişir; hiçbir şey silinmez.</li></ul>"""),
            "start": ("İşe başlamak", """<p>Başlangıç yeri ana sayfadaki <b>Ne yapmak istiyorsun?</b> kutusu. <i>Igrek seçsin</i>'de bırakırsan her projeyi bilen şef işi doğru projeye verir; projeyi kendin seçebilirsin; ya da <i>Birden çok proje</i> ile bir işi birkaç projeye gönderirsin, her biri kendi kopyasında, sonuçlar yan yana.</p>
<p>Bir projeye giden iş, türüne göre bir çalışma yoluyla gider: hata önce yeniden üretilir, yavaşlık önce ve sonra ölçülür, yeniden düzenlemede davranış aynı kalır, yeni özellik önce veriyle ve en küçük sürümle başlar. Kutu hangisi olduğunu söyler; <i>çıkar</i> dersen yazdığın gibi gider.</p>
<p>Proje içinde <b>Yeni sohbet</b> bir sohbet açar; okunda terminaller (Claude Code, Codex, kabuk) ve diğer hesapların var.</p>"""),
            "chats": ("Sohbetler", """<p>Kutuda her mesajın ihtiyacı olanlar var: yazı, resim, kayıtlı prompt'lar ve uzmanlar. Onay modu, model ve ayrıntı <i>Sohbet ayarları</i>'nda. Kutunun üstünde: ajanın planı, sohbetin yapılacaklar listesi ve sohbetin değiştirdiği dosyalar (fark ve tek tıkla geri alma).</p>
<p>Başlık son turun 5 saatlik limitinden ne kadar yediğini, göndermeden önce de burada bir mesajın genelde ne harcadığını ve ne kaldığını gösterir. Model çağıran her şeyde küçük bir işaret var.</p>"""),
            "why": ("Neden?", """<p>Değişen her dosyanın bir <b>Neden?</b> düğmesi var: değişikliğe yol açan istek, ait olduğu plan adımı ve aynı turda sorulan uzman. Sohbetin kendisinden okunur; hiçbir şey tahmin edilmez.</p>"""),
            "health": ("Sağlık ve Düzelt", """<p>Sağlık sekmesi mimariyi, güvenliği, testleri, belgeleri, bağımlılıkları ve daha fazlasını puanlar, neyin iyileşeceğini listeler. Basit olanlarda (eksik lockfile, git'teki .env) <b>Düzelt</b> bilinen bir komutu, çalıştırmadan önce göstererek çalıştırır; diğerlerini bölümün uzmanı kendi kopyasında yapar, birleştirmeden önce sen bakarsın. Birleştirmeden önce Igrek değişeni kullanan dosyaları ve testleri gösterir.</p>"""),
            "experts": ("Uzmanlar", """<p>Güvenlikten veritabanına, üründen finansa otuz kadar uzman; her biri alanının standartları ve sayılarıyla. Sohbette <kbd>@</kbd> ile birini çağır, bir projeyi hepsine sor ya da hassas değişikliklerde uzman incelemesini aç. Her inceleme bir model çağrısıdır, bu yüzden varsayılan olarak kapalı. Uzmanlar paket olarak paylaşılabilir.</p>"""),
            "memory": ("Hafıza", """<p>Kararlar, kurallar ve hatalar proje başına saklanır ve her sohbetin başında AI'ın önüne konur. Claude Code <code>CLAUDE.md</code>, Codex <code>AGENTS.md</code> okur; Hafıza sekmesi yalnızca birinde olan kuralları gösterir ve birleştirir, iki ajan da aynı kurallara uyar.</p>"""),
            "extension": ("Tarayıcı eklentisi", """<p>Chrome, Brave ve Edge için. Formları özel bilgilerinle, AI onları görmeden doldurur; bir alanın metnini yazar ve sayfada seninle birlikte iş yapar: sayfa ya da seçtiğin bir öğe hakkında sor, en çok beş adım (tıkla, yaz, seç) önersin. Her adım sayfada çerçevelenir ve ancak <i>Yap</i>'a basınca yapılır; gönderen, ödeyen ya da silen adım iki kez sorar, şifre alanına hiç yazılmaz.</p>
<p>Bağlamak için panelinde <i>Bağlan</i>'a bas, ikisinde de aynı kod görünürken Igrek'te <i>İzin ver</i>'e bas.</p>"""),
            "privacy": ("Gizlilik", """<p>Her şey senin bilgisayarında çalışır. Telemetri yok, ücretli API yok; Igrek'in internette açtığı her adres Ayarlar'da listelenir. Kaydettiğin özel bilgiler ve projelerinin .env sırları, mesaj çıkmadan <code>[[private:iban]]</code> gibi yer tutuculara dönüşür, gerçek değerler senin tarafında geri konur. Maaş, IBAN, kart ve kimlik numaraları şekillerinden de tanınır.</p>
<p>AI'ın okuduğu bir dosya AI araçlarına yardım etmemesini söylüyorsa (bir ödev kuralı, bir politika), Igrek o satırı sana bir kez gösterir, devam edip etmeyeceğine sen karar verirsin. Modelden hiçbir şey gizlenmez.</p>"""),
            "team": ("Takım", """<p>İsteğe bağlı bir hub, senin kurduğun bir sunucuda, seçtiğin projeleri uçtan uca şifreli paylaşır. Herkes kendi AI hesabını kullanır; hesaplar asla paylaşılmaz. Hub kurulumu README'de.</p>"""),
            "move": ("Başka bilgisayara taşıma", """<p>Ayarlar, Başka bilgisayara taşı: şifreyle kilitli tek bir dosya Igrek'in tuttuğu her şeyi taşır. Diğer bilgisayarda Igrek'te aç ve yeniden başlat. AI girişleri dosyada yok; orada yeniden giriş yap.</p>"""),
            "update": ("Güncelleme ve kaldırma", f"""<p>Masaüstü uygulaması açılırken ve günde bir kez yeni sürüme bakar, sen onaylayınca kurar. Terminalden kurduysan kurulum komutunu yeniden çalıştır.</p>
<p>Kaldırmak için uygulamayı kaldır (ya da AppImage'ı sil), verisini <code>~/.igrek</code>, çalışma ortamını <code>~/.local/share/igrek-runtime</code> (Windows: <code>%LOCALAPPDATA%\\igrek-runtime</code>) içinden sil. Güvenlik açıkları: <a href="{GH}/blob/main/SECURITY.md">SECURITY.md</a>.</p>"""),
        },
    },
}


def docs(t, d):
    n, home = nav(t, True)
    h = HEAD.format(lang=t["lang"], title=d["title"], desc=d["lead"], base="../" + t["base"], other="../" + t["other"] + "docs/",
                    otherlang="tr" if t["lang"] == "en" else "en", nav=n, home="../", ogimg=t["shot"])
    side = []
    for g, keys in d["groups"]:
        side.append(f"          <p>{g}</p>")
        side += [f'          <a href="#{k}">{d["sections"][k][0]}</a>' for k in keys]
    body_sections = "\n".join(f'        <section id="{k}" style="padding:0"><h2>{d["sections"][k][0]}</h2>\n{d["sections"][k][1]}\n        </section>'
                              for _, keys in d["groups"] for k in keys)
    shot = f'<div class="shot"><div class="bar"><i></i><i></i><i></i></div><img src="../{t["base"]}img/{t["lang"]}-home.webp" width="1440" height="900" alt="" loading="lazy" /></div>'
    body = f"""    <main class="wrap docs">
      <aside>
{chr(10).join(side)}
      </aside>
      <article class="doc">
        <h1>{d["h1"]}</h1>
        <p class="lead">{d["lead"]}</p>
        {shot}
{body_sections}
      </article>
    </main>
"""
    return h + body + foot(t) + COPY.format(copy=d["copy"], copied=d["copied"]) + "  </body>\n</html>\n"
