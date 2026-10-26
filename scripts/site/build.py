"""Igrek's site (site/, published by hand with the Site workflow), laid out like well-known docs: a home
page with the right download first, docs split into pages with a menu, "on this page", search and
previous/next, and privacy, terms, roadmap and community pages. The texts are in content.py; the working copy
of the app on the home page is drawn by mock.py.

    python3 scripts/site/build.py . <version>      (after a release: its download links name the version)
"""
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "content.py")).read()
exec(SRC)  # T, M, DOCS, I, icon, REL, GH
exec(open(os.path.join(HERE, "mock.py")).read())  # app_mock, privacy_mock, MOCK_JS

ROOT = sys.argv[1]
VERSION = sys.argv[2]
SITE = os.path.join(ROOT, "site")
DL = "https://github.com/Mohamedattiadev/igrek/releases/download/v{v}/{f}"

UI = {
    "en": {"docs": "Docs", "download": "Download", "roadmap": "Roadmap", "community": "Community", "privacy": "Privacy",
           "terms": "Terms", "search": "Search the docs", "otp": "On this page", "prev": "Previous", "next": "Next",
           "home": "Igrek", "latest": "Latest version", "for": "Download for {os}", "other": "Other systems",
           "all": "All downloads", "nothing": "Nothing found", "overview": "Overview",
           "dl_note": "Free. About 17 MB; the first start fetches its runtime once (about 35 MB).",
           "docs_intro": "Install Igrek, start your first task, and know what it does with your data. Pick a topic, or search."},
    "tr": {"docs": "Belgeler", "download": "İndir", "roadmap": "Yol haritası", "community": "Topluluk", "privacy": "Gizlilik",
           "terms": "Koşullar", "search": "Belgelerde ara", "otp": "Bu sayfada", "prev": "Önceki", "next": "Sonraki",
           "home": "Igrek", "latest": "Son sürüm", "for": "{os} için indir", "other": "Diğer sistemler",
           "all": "Tüm indirmeler", "nothing": "Bir şey bulunamadı", "overview": "Genel bakış",
           "dl_note": "Ücretsiz. Yaklaşık 17 MB; ilk açılışta çalışma ortamını bir kez indirir (yaklaşık 35 MB).",
           "docs_intro": "Igrek'i kur, ilk işini başlat ve verinle ne yaptığını öğren. Bir konu seç ya da ara."},
}

PAGES = {
    "privacy": {
        "en": ("Privacy policy", open(os.path.join(ROOT, "PRIVACY.md")).read()),
        "tr": ("Gizlilik politikası", """# Gizlilik politikası

Son değişiklik: 25 Ekim 2026.

Igrek senin bilgisayarında çalışır. Bu politika bunun verin için ne demek olduğunu anlatır.

## Bize ne gelir

Hiçbir şey. Igrek'in hesabı, telemetrisi, analitiği ve bizim bir sunucumuz yok. Projelerini, sohbetlerini,
dosyalarını, ayarlarını ve Igrek'i nasıl kullandığını görmeyiz.

## Verin nereye gider

- **Bilgisayarın.** Igrek'in tuttuğu her şey (projeler, sohbet geçmişi, hafıza, ayarlar, özel bilgiler)
  bilgisayarındaki veri klasöründedir (`~/.igrek`). Özel bilgiler ve sırlar mühürlü saklanır.
- **Kullandığın yapay zekâ.** Sohbetler kendi hesaplarınla Claude'a (Anthropic) ya da Codex'e (OpenAI),
  Claude Code ve Codex'in gönderdiği şekilde, o şirketlerin koşullarıyla gider. Mesaj çıkmadan önce Igrek
  kaydettiğin özel bilgileri ve projelerinin `.env` sırlarını yer tutuculara çevirir; tutarları, IBAN'ları,
  kart ve kimlik numaralarını şekillerinden tanır.
- **Açtığın servisler.** Yalnızca kurarsan: Telegram, Discord ya da e-posta bildirimleri, kendi kurduğun
  takım hub'ı, kendi sunucuların. Her biri, Igrek'in açtığı her internet adresiyle birlikte Ayarlar > Ağ'da
  listelenir.
- **İndirmeler.** Güncellemeler ve ilk açılıştaki çalışma ortamı (Bun) GitHub'dan gelir; GitHub isteği her
  indirmedeki gibi görür. Bağımlılık kontrolleri açık OSV veritabanına paket adlarını ve sürümlerini sorar.

## Sorun bildirmek

"Sorun bildir" raporu (sürüm, sistem, özel bilgileri çıkarılmış kayıt satırları) sana gösterir ve yalnızca
sen istersen GitHub'da açar. GitHub'daki bir issue herkese açıktır.

## Hakların

Verin bize hiç ulaşmaz; bu yüzden geri verebileceğimiz ya da silebileceğimiz bir şey yoktur: Igrek'in veri
klasörünü silmek onu siler. Bu politikayla ilgili sorular için
[Discussions](https://github.com/Mohamedattiadev/igrek/discussions) ya da SECURITY.md'deki iletişim.
Bu, KVKK ve GDPR için de geçerlidir: Igrek'in yapımcısı verinin sorumlusu değildir.
""")},
    "terms": {
        "en": ("Terms of use", open(os.path.join(ROOT, "TERMS.md")).read()),
        "tr": ("Kullanım koşulları", """# Kullanım koşulları

Son değişiklik: 25 Ekim 2026.

1. **Lisans.** Igrek'in kullanımı [Igrek Use License](https://github.com/Mohamedattiadev/igrek/blob/main/LICENSE)
   ile belirlenir. Kısaca: herkes, şirketler dahil, ücretsiz kurup kullanabilir ve kodunu okuyabilir;
   satmak, yeniden dağıtmak, servis olarak sunmak, değiştirilmiş sürüm yayınlamak, adı ve logoyu kullanmak
   ve kodla yapay zekâ eğitmek yazılı izne bağlıdır.
2. **Yapay zekâ hesapların.** Igrek, Claude Code, Codex ve diğer araçlarla kendi hesapların üzerinden
   çalışır. Onların koşullarına bağlısın; ücretleri ve limitleri seninle onlar arasındadır.
3. **Senin sorumluluğun.** Yapay zekâ ajanları dosya değiştirir ve komut çalıştırır. Igrek push, yayına alma
   ve yayımlamadan önce sorar, yapabildiği yerde ayrı kopyalarda çalışır ve anlık kopyalar tutar; ama neyi
   kabul edeceğine sen karar verirsin. Önemli olanın yedeğini al.
4. **Garanti yok.** Igrek olduğu gibi, hiçbir garanti olmadan sunulur. Yasanın izin verdiği ölçüde yapımcısı,
   kullanımından doğan zarardan (veri kaybı, yapay zekâ kullanım maliyeti, kesilen iş dahil) sorumlu değildir.
5. **Değişiklikler.** Bu koşullar yeni bir sürümle değişebilir; yukarıdaki tarih en son ne zaman değiştiğini söyler.
""")},
    "roadmap": {
        "en": ("Roadmap", """# Roadmap

What comes next, in the order it is planned. It changes with what people ask for: say what you need in
[Discussions](https://github.com/Mohamedattiadev/igrek/discussions).

### Now <span class="badge">{version}</span>
- About 17 MB installers; the runtime is fetched once on the first start.
- One "What do you want to do?" box, ways of working per task, a Simple view for people who do not code.
- One-click fixes, a browser extension that acts on pages with you, one memory for Claude and Codex.

### Next
- A screen helper that sees your screen when you ask and points at things (tried and taken back out to be redone).
- More languages checked by hand.
- Packages signed by the operating systems, so the first start asks nothing.

### Later
- Teams: shared boards and reviews over the encrypted hub.
- More AI tools next to Claude Code and Codex.
"""),
        "tr": ("Yol haritası", """# Yol haritası

Sırada ne var, planlandığı sırayla. İnsanların istediklerine göre değişir: neye ihtiyacın olduğunu
[Discussions](https://github.com/Mohamedattiadev/igrek/discussions)'ta söyle.

### Şimdi <span class="badge">{version}</span>
- Yaklaşık 17 MB kurulum; çalışma ortamı ilk açılışta bir kez indirilir.
- Tek "Ne yapmak istiyorsun?" kutusu, işe göre çalışma yolları, kod yazmayanlar için Basit görünüm.
- Tek tıkla düzeltme, sayfalarda seninle iş yapan tarayıcı eklentisi, Claude ve Codex için tek hafıza.

### Sırada
- İstediğinde ekranını görüp bir yeri gösteren ekran asistanı (denendi, yeniden yapılmak üzere çıkarıldı).
- Elle kontrol edilmiş daha fazla dil.
- İşletim sistemlerince imzalanmış paketler; ilk açılışta hiçbir şey sorulmasın.

### Daha sonra
- Takımlar: şifreli hub üzerinden ortak pano ve incelemeler.
- Claude Code ve Codex'in yanında daha fazla yapay zekâ aracı.
""")},
    "community": {
        "en": ("Community and help", open(os.path.join(ROOT, "SUPPORT.md")).read().replace("# Getting help", "# Community and help")),
        "tr": ("Topluluk ve yardım", """# Topluluk ve yardım

- **Sorular, fikirler, yaptığını göstermek:** [Discussions](https://github.com/Mohamedattiadev/igrek/discussions).
- **Bir şey çalışmıyor:** Igrek'te sağ alttaki yardım düğmesi, **Sorun bildir**. Sürümünü, sistemini ve
  kaydın son satırlarını, özel bilgileri çıkararak hazırlar ve sen okuduktan sonra GitHub'da açar. Elle de
  [issue açabilirsin](https://github.com/Mohamedattiadev/igrek/issues/new/choose).
- **Güvenlik sorunları:** gizlice, [SECURITY.md](https://github.com/Mohamedattiadev/igrek/blob/main/SECURITY.md)'deki gibi. Asla herkese açık bir issue'da değil.

Igrek'i tek bir kişi yapıyor. Cevaplar genelde birkaç gün içinde gelir.
""")},
}


def md(text):
    """Enough Markdown for these pages: headings, lists, paragraphs, links, bold, code."""
    out, lst, para = [], None, []

    def inline(s):
        s = html.escape(s, quote=False)
        s = re.sub(r"&lt;(https?://[^&]+)&gt;", r'<a href="\1">\1</a>', s)
        # A file of the repository named by a relative link is shown on GitHub.
        s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", lambda m: f'<a href="{m.group(2) if re.match(r"https?:|#", m.group(2)) else GH + "/blob/main/" + m.group(2)}">{m.group(1)}</a>', s)
        s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        return s.replace('&lt;span class="badge"&gt;', '<span class="badge">').replace("&lt;/span&gt;", "</span>")

    def flush():
        nonlocal lst, para
        if para:
            out.append(f"<p>{inline(' '.join(para))}</p>")
            para = []
        if lst:
            tag = lst[0]
            out.append(f"<{tag}>" + "".join(f"<li>{inline(i)}</li>" for i in lst[1]) + f"</{tag}>")
            lst = None

    for raw in text.split("\n"):
        line = raw.rstrip()
        m = re.match(r"^(#{1,3}) (.*)", line)
        if m:
            flush()
            n = len(m.group(1))
            out.append(f"<h{n}>{inline(m.group(2))}</h{n}>")
        elif re.match(r"^(- |\d+\. )", line):
            if para:
                flush()
            tag = "ol" if line[0].isdigit() else "ul"
            item = re.sub(r"^(- |\d+\. )", "", line)
            if not lst or lst[0] != tag:
                flush()
                lst = (tag, [])
            lst[1].append(item)
        elif line.startswith("   ") and lst:
            lst[1][-1] += " " + line.strip()
        elif not line.strip():
            flush()
        else:
            if lst:
                flush()
            para.append(line.strip())
    flush()
    return "\n".join(out)


def slugify(s):
    s = re.sub(r"<[^>]+>", "", s).lower()
    s = s.translate(str.maketrans("çğıöşüâ", "cgiosua"))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def with_ids(body):
    """h3 headings get ids, and the list for "on this page"."""
    toc = []

    def rep(m):
        text = m.group(1)
        sid = slugify(text)
        toc.append((sid, re.sub(r"<[^>]+>", "", text)))
        return f'<h3 id="{sid}">{text}</h3>'

    return re.sub(r"<h3>(.*?)</h3>", rep, body), toc


def shell(lang, depth, title, desc, main, active="", search_index=None, path=""):
    u = UI[lang]
    up = "../" * depth
    # `depth` counts from the language's root (site/ or site/tr/); `path` is the page from there.
    home = up
    root = up + ("" if lang == "en" else "../")  # site root (style, logo, images)
    alt = root + ("tr/" if lang == "en" else "") + path
    nav = [
        (f"{home}docs/", u["docs"], "docs"),
        (f"{home}roadmap/", u["roadmap"], "roadmap"),
        (f"{home}community/", u["community"], "community"),
        (GH, "GitHub", ""),
    ]
    links = "\n".join(
        f'          <a href="{h}"{" class=on" if a == active else ""}>{x}</a>' for h, x, a in nav)
    pair = [("en", "EN", "English"), ("tr", "TR", "Türkçe")]
    links += "\n" + f'          <span class="langs">{icon("globe")}' + "".join(
        f'<span class="cur" title="{n}">{c}</span>' if k == lang else f'<a href="{alt}" hreflang="{k}" lang="{k}" title="{n}">{c}</a>'
        for k, c, n in pair) + "</span>"
    search = ""
    script = ""
    if search_index is not None:
        search = f"""        <div class="search">{icon("search")}<input id="q" type="search" placeholder="{u["search"]}" aria-label="{u["search"]}" autocomplete="off" /><div class="results" id="results"></div></div>"""
        script = f"""    <script>
      // Search the docs here in the page: titles first, then text; nothing is sent anywhere.
      const pages = {json.dumps(search_index, ensure_ascii=False)};
      const q = document.getElementById("q"), box = document.getElementById("results");
      const show = () => {{
        const words = q.value.trim().toLocaleLowerCase().split(/\\s+/).filter(Boolean);
        if (!words.length) return box.classList.remove("open");
        const hits = pages.map((p) => {{
          const t = p.title.toLocaleLowerCase(), b = p.text.toLocaleLowerCase();
          if (!words.every((w) => t.includes(w) || b.includes(w))) return null;
          const score = words.filter((w) => t.includes(w)).length * 10 + 1;
          const at = b.indexOf(words[0]);
          return {{ ...p, score, snip: at < 0 ? p.text.slice(0, 90) : `…${{p.text.slice(Math.max(0, at - 30), at + 70)}}…` }};
        }}).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 8);
        box.innerHTML = hits.length ? "" : "<small style='padding:8px 10px'>{u["nothing"]}</small>";
        for (const h of hits) {{
          const a = document.createElement("a");
          a.href = `{up}${{h.href}}`;
          a.textContent = h.title;
          const s = document.createElement("small");
          s.textContent = h.snip;
          a.append(s);
          box.append(a);
        }}
        box.classList.add("open");
      }};
      q.addEventListener("input", show);
      q.addEventListener("keydown", (e) => e.key === "Enter" && box.querySelector("a")?.click());
      document.addEventListener("keydown", (e) => {{ if (e.key === "/" && document.activeElement !== q) {{ e.preventDefault(); q.focus(); }} }});
      document.addEventListener("click", (e) => {{ if (!e.target.closest(".search")) box.classList.remove("open"); }});
      for (const pre of document.querySelectorAll("pre")) {{
        const b = document.createElement("button");
        b.className = "copy"; b.type = "button"; b.textContent = "{DOCS[lang]["copy"]}";
        b.onclick = () => navigator.clipboard.writeText(pre.querySelector("code").innerText).then(() => {{
          b.textContent = "{DOCS[lang]["copied"]}"; setTimeout(() => (b.textContent = "{DOCS[lang]["copy"]}"), 1500);
        }});
        pre.append(b);
      }}
    </script>
"""
    return f"""<!doctype html>
<html lang="{lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#fbfbfc" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0f1012" media="(prefers-color-scheme: dark)" />
    <title>{title}</title>
    <meta name="description" content="{html.escape(desc)}" />
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="{html.escape(desc)}" />
    <meta property="og:image" content="https://mohamedattiadev.github.io/igrek/img/{lang}-health.webp" />
    <link rel="icon" href="{root}logo.svg" />
    <link rel="stylesheet" href="{root}style.css" />
    <script>
      // Parts that fade in on scroll stay visible when scripts are off.
      document.documentElement.classList.add("js");
    </script>
  </head>
  <body>
    <header class="top">
      <div class="wrap">
        <a class="brand" href="{home or './'}"><img src="{root}logo.svg" width="24" height="24" alt="" /> Igrek</a>
{search}
        <nav>
{links}
          <a class="cta" href="{home or './'}#download">{u["download"]}</a>
        </nav>
      </div>
    </header>
{main}
    <footer>
      <div class="wrap">
        <span>{T[lang]["foot"]}</span>
        <span><a href="{home}docs/">{u["docs"]}</a> · <a href="{home}roadmap/">{u["roadmap"]}</a> · <a href="{home}community/">{u["community"]}</a> · <a href="{home}privacy/">{u["privacy"]}</a> · <a href="{home}terms/">{u["terms"]}</a> · <a href="{GH}/blob/main/SECURITY.md">{T[lang]["sec"]}</a></span>
      </div>
    </footer>
{script}  </body>
</html>
"""


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write(text)


def files(v):
    return {
        "linux": (DL.format(v=v, f=f"Igrek_{v}_amd64.AppImage"), "Linux", "AppImage"),
        "linux-deb": (DL.format(v=v, f=f"Igrek_{v}_amd64.deb"), "Linux", ".deb"),
        "windows": (DL.format(v=v, f=f"Igrek_{v}_x64_en-US.msi"), "Windows", ".msi"),
        "mac-arm": (DL.format(v=v, f=f"Igrek_{v}_aarch64.dmg"), "macOS", "Apple silicon"),
        "mac-intel": (DL.format(v=v, f=f"Igrek_{v}_x64.dmg"), "macOS", "Intel"),
    }


def home_page(lang):
    t, u = T[lang], UI[lang]
    f = files(VERSION)
    depth = 0
    base = "" if lang == "en" else "../"
    links = " ".join(f"<a href=\"{h}\">{o} {k}</a>" for h, o, k in f.values())
    works = "".join(f"<b>{x}</b>" for x in t["works_list"])
    steps = "\n".join(
        f'            <li style="--i:{i}"><span class="num">{i + 1}</span><b>{a}</b><p>{b}</p></li>' for i, (a, b) in enumerate(t["steps"]))
    plist = "\n".join(f"                <li>{icon('check')}<span>{x}</span></li>" for x in t["p_list"])
    faq = "\n".join(f"          <details><summary>{q}</summary><p>{a}</p></details>" for q, a in t["faq"])
    app = app_mock(lang).replace("{base}", base).replace("{version}", VERSION)
    dl = f'<a class="button dl-os" href="{REL}">{icon("download")}<span class="dltext">{u["download"]}</span></a>'
    main = f"""    <main class="home">
      <div class="hero">
        <div class="hero-bg" aria-hidden="true"></div>
        <div class="wrap hero-in">
          <a class="announce" href="{REL}"><span>v{VERSION}</span>{t["announce"].replace("{version}", VERSION)}{icon("arrow")}</a>
          <h1>{t["h1"]}</h1>
          <p class="lead">{t["lead"]}</p>
          <div class="actions" id="download">
            {dl}
            <a class="button ghost" href="docs/">{icon("book")}{t["docs_btn"]}</a>
          </div>
          <p class="others">{links}</p>
          <p class="note">{u["dl_note"]}</p>
        </div>
        <div class="wrap">
        {app}
        </div>
      </div>
      <div class="wrap works reveal"><span>{t["works"]}</span>{works}</div>
      <section id="features">
        <div class="wrap">
          <div class="shead reveal"><h2>{t["f_h"]}</h2><p>{t["f_sub"]}</p></div>
          <div class="bento">
{bento(lang, t["features"])}
          </div>
        </div>
      </section>
      <section>
        <div class="wrap">
          <div class="shead reveal"><h2>{t["p_h"]}</h2><p>{t["p_sub"]}</p></div>
          <div class="split reveal">
            <div>
              <p>{t["p_text"]}</p>
              <ul class="checks">
{plist}
              </ul>
            </div>
            {privacy_mock(lang)}
          </div>
        </div>
      </section>
      <section>
        <div class="wrap">
          <div class="shead reveal"><h2>{t["s_h"]}</h2><p>{t["s_sub"]}</p></div>
          <ol class="steps reveal">
{steps}
          </ol>
        </div>
      </section>
      <section>
        <div class="wrap faq reveal">
          <h2>{t["faq_h"]}</h2>
{faq}
        </div>
      </section>
      <section>
        <div class="wrap">
          <div class="cta reveal">
            <h2>{t["cta_h"]}</h2>
            <p>{t["cta_p"]}</p>
            {dl}
          </div>
        </div>
      </section>
    </main>
    <script>
      // The package for this computer first; the others stay one click away.
      const files = {json.dumps({k: v[0] for k, v in f.items()})};
      const ua = navigator.userAgent;
      const os = /Windows/.test(ua) ? ["windows", "Windows"] : /Mac/.test(ua) ? ["mac-arm", "macOS"] : /Linux|X11/.test(ua) ? ["linux", "Linux"] : null;
      if (os)
        for (const a of document.querySelectorAll(".dl-os")) {{
          a.href = files[os[0]];
          a.querySelector(".dltext").textContent = {json.dumps(u["for"])}.replace("{{os}}", os[1]);
        }}
    </script>
""" + MOCK_JS
    return shell(lang, depth, t["title"], t["desc"], main)


def doc_pages(lang):
    d, u = DOCS[lang], UI[lang]
    order = [k for _, keys in d["groups"] for k in keys]
    prefix = "" if lang == "en" else "tr/"
    index = []
    for k in order:
        title, body = d["sections"][k]
        plain = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(body))).strip()
        index.append({"title": title, "href": f"docs/{k}/", "text": plain[:600]})
    other = "tr/" if lang == "en" else ""

    def menu(on):
        out = [f'          <a href="../"{" class=on" if on == "" else ""}>{u["overview"]}</a>' if on else f'          <a href="./" class=on>{u["overview"]}</a>']
        for g, keys in d["groups"]:
            out.append(f"          <p>{g}</p>")
            for k in keys:
                href = f"../{k}/" if on else f"{k}/"
                out.append(f'          <a href="{href}"{" class=on" if k == on else ""}>{d["sections"][k][0]}</a>')
        return "\n".join(out)

    depth_home = 1
    # Overview
    cards = "\n".join(
        f'<div class="card"><h3>{g}</h3>' + "".join(f'<a href="{k}/">{d["sections"][k][0]}</a>' for k in keys) + "</div>"
        for g, keys in d["groups"])
    main = f"""    <main class="wrap docs3">
      <aside class="menu">
{menu("")}
      </aside>
      <article class="doc">
        <h1>{d["h1"]}</h1>
        <p class="lead">{u["docs_intro"]}</p>
        <div class="docs-home">{cards}</div>
      </article>
      <aside class="toc"></aside>
    </main>
"""
    write(os.path.join(SITE, prefix, "docs", "index.html"),
          shell(lang, depth_home, d["title"], d["lead"], main, "docs", index, "docs/"))
    for n, k in enumerate(order):
        title, body = d["sections"][k]
        body, toc = with_ids(body)
        prev = order[n - 1] if n > 0 else None
        nxt = order[n + 1] if n + 1 < len(order) else None
        pager = '<div class="pager">'
        if prev:
            pager += f'<a href="../{prev}/"><small>{u["prev"]}</small>{d["sections"][prev][0]}</a>'
        if nxt:
            pager += f'<a class="next" href="../{nxt}/"><small>{u["next"]}</small>{d["sections"][nxt][0]}</a>'
        pager += "</div>"
        toc_html = (f"<p>{u['otp']}</p>" + "".join(f'<a href="#{i}">{x}</a>' for i, x in toc)) if toc else ""
        group = next(g for g, keys in d["groups"] if k in keys)
        main = f"""    <main class="wrap docs3">
      <aside class="menu">
{menu(k)}
      </aside>
      <article class="doc">
        <div class="crumbs"><a href="../">{u["docs"]}</a> / {group}</div>
        <h1>{title}</h1>
{body}
        {pager}
      </article>
      <aside class="toc">{toc_html}</aside>
    </main>
"""
        write(os.path.join(SITE, prefix, "docs", k, "index.html"),
              shell(lang, depth_home + 1, f"{title} · {d['title']}", re.sub(r"<[^>]+>", "", body)[:150], main, "docs", index, f"docs/{k}/"))


def plain_pages(lang):
    prefix = "" if lang == "en" else "tr/"
    depth = 1
    for key, langs in PAGES.items():
        title, text = langs[lang]
        body = md(text.replace("{version}", VERSION))
        cls = "doc roadmap" if key == "roadmap" else "doc"
        main = f"""    <main class="wrap" style="padding-top:40px">
      <article class="{cls}" style="margin:0 auto">
{body}
      </article>
    </main>
"""
        write(os.path.join(SITE, prefix, key, "index.html"), shell(lang, depth, f"{title} · Igrek", title, main, key, path=f"{key}/"))


for lang in ("en", "tr"):
    write(os.path.join(SITE, "" if lang == "en" else "tr/", "index.html"), home_page(lang))
    doc_pages(lang)
    plain_pages(lang)
print("ok")
