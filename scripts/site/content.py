"""The site's texts, English and Turkish, and the icons; build.py lays them out."""
import sys

ROOT = sys.argv[1]
REL = "https://github.com/Mohamedattiadev/igrek/releases/latest"
GH = "https://github.com/Mohamedattiadev/igrek"

I = {
    "search": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "info": '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    "folder": '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    "chat": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    "gauge": '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    "wrench": '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    "lock": '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "bot": '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    "globe": '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    "send": '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    "branch": '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    "back": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    "file": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    "pointer": '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>',
    "play": '<polygon points="6 3 20 12 6 21 6 3"/>',
    "book": '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    "arrow": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    "eye": '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
}


def icon(name):
    return f'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{I[name]}</svg>'


T = {
    "en": {
        "title": "Igrek, a desktop app for Claude Code and Codex",
        "desc": "Igrek runs on your computer next to Claude Code and Codex. It keeps your projects and chats in one window, shows which request changed which file, and replaces saved secrets before anything is sent to the model.",
        "h1": "One window for your Claude Code and Codex work",
        "lead": "Igrek is a desktop app that runs next to the agents you already use. It lists the chats of all your projects, shows which request changed which file, and replaces your saved secrets with placeholders before a message is sent.",
        "announce": "Igrek {version} is out", "docs_btn": "Read the docs",
        "works": "Works with", "works_list": ["Claude Code", "Codex", "Linux", "macOS", "Windows"],
        "f_sub": "Claude Code and Codex write the code. Igrek keeps track of what they did, why, and what it cost.",
        "s_sub": "From download to your first task in a few minutes.",
        "p_sub": "The part people ask about first.",
        "cta_h": "Try it on your own projects", "cta_p": "Free, no account, no API keys. About 17 MB.",
        "f_h": "What it does",
        "features": [
            ("Where a change came from", "Each changed file has a Why? button: the message that asked for it, the plan step it belongs to, and any expert asked in the same turn. It is read from the chat, not guessed."),
            ("One box for every project", "Type a task on the home page. Igrek sends it to the right project, or to several at once, each working in its own copy."),
            ("Health checks", "Architecture, security, tests and dependencies get a score. Simple findings, like a missing lockfile, have a Fix button that shows the command before it runs."),
            ("Secrets stay on your side", "Saved details such as IBANs and ID numbers, and the values in your .env files, are swapped for placeholders before a message goes out and put back when the answer comes in."),
            ("Reviewers for one field each", "About thirty read-only reviewers, from security and databases to finance. Call one with @ in a chat. Each review is a model call, so none run unless you ask."),
            ("Notes per project", "Decisions and past mistakes are saved per project and given to the agent at the start of a chat. Rules that are only in CLAUDE.md or only in AGENTS.md are shown so you can merge them."),
        ],
        "s_h": "Getting started",
        "steps": [("Install the app", "About 17 MB. On the first start it downloads its runtime once (about 35 MB)."), ("Add your project folders", "Folders Claude has already worked in are listed, one click each."), ("Type a task", "Pick a project or let Igrek pick one. You see every step it takes.")],
        "p_h": "What leaves your computer",
        "p_text": "Your code goes to Claude or Codex the same way it does without Igrek, through your own subscription. Nothing is sent to us: there is no account, no telemetry and no server of ours. Settings lists every address Igrek connects to.",
        "p_list": ["No API keys: it uses the Claude and Codex logins you have", "Pushing, deploying and publishing wait for your OK", "If a file asks AI tools not to help, Igrek shows you the line and you decide"],
        "faq_h": "Questions",
        "faq": [
            ("Is it free?", "Yes, for people and companies. It runs on your own Claude or Codex plan, and anything that calls a model is marked so you can see what uses your limit."),
            ("Does my code leave my computer?", "Only to the AI you already use, the same way Claude Code and Codex send it. Igrek adds no telemetry and has no server. Private details are replaced by placeholders first."),
            ("Why does the first start download something?", "Igrek's server runs on Bun. To keep the installer small, the app downloads Bun's official release once (about 35 MB), checks it against Bun's published checksum and keeps it."),
            ("Is it open source?", "The source is open to read, but it is not open source: the Igrek Use License lets anyone use it for free, while selling it, redistributing it or offering it as a service needs written permission."),
        ],
        "foot": "© 2026 Mohamed Attia. The Igrek name and logo belong to Mohamed Attia.",
        "sec": "Security",
    },
    "tr": {
        "title": "Igrek, Claude Code ve Codex için masaüstü uygulaması",
        "desc": "Igrek bilgisayarında Claude Code ve Codex'in yanında çalışır. Projelerini ve sohbetlerini tek pencerede toplar, hangi isteğin hangi dosyayı değiştirdiğini gösterir ve kayıtlı sırlarını modele gitmeden önce değiştirir.",
        "h1": "Claude Code ve Codex işlerin için tek pencere",
        "lead": "Igrek, zaten kullandığın ajanların yanında çalışan bir masaüstü uygulaması. Tüm projelerinin sohbetlerini listeler, hangi isteğin hangi dosyayı değiştirdiğini gösterir ve kayıtlı sırlarını mesaj gönderilmeden önce yer tutucuyla değiştirir.",
        "announce": "Igrek {version} çıktı", "docs_btn": "Belgeleri oku",
        "works": "Birlikte çalışır", "works_list": ["Claude Code", "Codex", "Linux", "macOS", "Windows"],
        "f_sub": "Kodu Claude Code ve Codex yazar. Igrek ne yaptıklarını, nedenini ve neye mal olduğunu takip eder.",
        "s_sub": "İndirmeden ilk işine birkaç dakikada.",
        "p_sub": "İnsanların ilk sorduğu kısım.",
        "cta_h": "Kendi projelerinde dene", "cta_p": "Ücretsiz, hesap yok, API anahtarı yok. Yaklaşık 17 MB.",
        "f_h": "Ne yapar",
        "features": [
            ("Değişiklik nereden geldi", "Değişen her dosyanın bir Neden? düğmesi var: onu isteyen mesaj, ait olduğu plan adımı ve aynı turda sorulan uzman. Sohbetten okunur, tahmin edilmez."),
            ("Her proje için tek kutu", "Ana sayfaya bir iş yaz. Igrek onu doğru projeye ya da aynı anda birkaçına gönderir; her biri kendi kopyasında çalışır."),
            ("Sağlık kontrolleri", "Mimari, güvenlik, testler ve bağımlılıklar puanlanır. Eksik lockfile gibi basit bulgularda bir Düzelt düğmesi var; komutu çalıştırmadan önce gösterir."),
            ("Sırlar senin tarafında kalır", "IBAN ve kimlik numarası gibi kayıtlı bilgiler ve .env dosyalarındaki değerler, mesaj çıkmadan yer tutucuyla değiştirilir, cevap gelince geri konur."),
            ("Her biri tek alana bakan inceleyiciler", "Güvenlikten veritabanına, finansa kadar otuz kadar salt okunur inceleyici. Sohbette @ ile birini çağır. Her inceleme bir model çağrısı olduğu için sen istemedikçe hiçbiri çalışmaz."),
            ("Proje başına notlar", "Kararlar ve geçmiş hatalar proje başına saklanır, sohbetin başında ajana verilir. Yalnızca CLAUDE.md'de ya da yalnızca AGENTS.md'de olan kurallar gösterilir, birleştirebilirsin."),
        ],
        "s_h": "Başlarken",
        "steps": [("Uygulamayı kur", "Yaklaşık 17 MB. İlk açılışta çalışma ortamını bir kez indirir (yaklaşık 35 MB)."), ("Proje klasörlerini ekle", "Claude'un daha önce çalıştığı klasörler listelenir, her biri tek tık."), ("Bir iş yaz", "Projeyi sen seç ya da Igrek seçsin. Attığı her adımı görürsün.")],
        "p_h": "Bilgisayarından ne çıkar",
        "p_text": "Kodun Claude'a ya da Codex'e, Igrek olmadan nasıl gidiyorsa öyle, kendi aboneliğinle gider. Bize hiçbir şey gelmez: hesap yok, telemetri yok, bizim bir sunucumuz yok. Igrek'in bağlandığı her adres Ayarlar'da listelenir.",
        "p_list": ["API anahtarı yok: zaten olan Claude ve Codex girişlerini kullanır", "Push, yayına alma ve yayımlama senin onayını bekler", "Bir dosya AI araçlarından yardım etmemesini istiyorsa Igrek o satırı gösterir, kararı sen verirsin"],
        "faq_h": "Sorular",
        "faq": [
            ("Ücretsiz mi?", "Evet, kişiler ve şirketler için. Kendi Claude ya da Codex planınla çalışır; model çağıran her şey işaretlidir, limitinden neyin harcadığını görürsün."),
            ("Kodum bilgisayarımdan çıkıyor mu?", "Yalnızca zaten kullandığın yapay zekâya, Claude Code ve Codex'in gönderdiği şekilde. Igrek telemetri eklemez, sunucusu yoktur. Özel bilgiler önce yer tutucuya çevrilir."),
            ("İlk açılışta neden bir şey indiriyor?", "Igrek'in sunucusu Bun ile çalışır. Kurulumu küçük tutmak için uygulama Bun'ın resmî sürümünü bir kez indirir (yaklaşık 35 MB), Bun'ın yayımladığı sağlama değeriyle doğrular ve saklar."),
            ("Açık kaynak mı?", "Kaynak kodu okunabilir, ama açık kaynak değildir: Igrek Use License herkesin ücretsiz kullanmasına izin verir; satmak, yeniden dağıtmak ya da servis olarak sunmak yazılı izne bağlıdır."),
        ],
        "foot": "© 2026 Mohamed Attia. Igrek adı ve logosu Mohamed Attia'ya aittir.",
        "sec": "Güvenlik",
    },
}

# The working copies of the app on the home page (mock.py draws them). The projects, files and numbers are the
# same demo the screenshots use, so the site and the app tell one story.
M = {
    "en": {
        "label": "Watch the demo, or take over: click anywhere in the window.",
        "replay": "Play the demo again",
        "b_task": "Fix the coupon in shop and invoice-api",
        "b_experts": ["Security", "Database", "Architecture", "Frontend", "Finance", "+25"],
        "b_rules": "2 rules only in CLAUDE.md", "b_merge": "Merge",
        "side": ["Projects", "Chats", "Experts", "Private details"],
        "search": "Search pages, projects, commands...",
        "projects": "Projects",
        "ask": "What do you want to do?",
        "ask_example": "Add a cart page to the shop",
        "picks": "Igrek picks",
        "picked": "Igrek picked <b>shop</b>: the cart code is there. A chat started in its own copy.",
        "cards": [("S", "#b5643c", "shop", "Added the checkout page: address form, shipping choice and order summary", "29 min ago"),
                  ("I", "#9a9a2c", "invoice-api", "Invoices can be downloaded as PDF", "2 hours ago"),
                  ("M", "#b08a3a", "mobile-app", "The cart screen shows the last cart offline", "yesterday"),
                  ("A", "#3a9a52", "admin-panel", "Added status and date filters to the orders table", "yesterday"),
                  ("B", "#b0427a", "blog", "Wrote a post about free shipping", "3 days ago"),
                  ("L", "#6a45b8", "landing-page", "Lighthouse performance went from 71 to 96", "5 days ago")],
        "fresh": "Fresh",
        "tabs": ["Overview", "Changes", "Health"],
        "latest": "Latest session", "session": "Checkout page", "goal": "<b>Goal:</b> so customers can pay after the cart.",
        "done": "What was done", "done_list": ["Added the checkout page: address form, shipping choice and order summary", "The orders API checks the address"],
        "open": "Still open", "open_list": ["Connect the payment provider's form"],
        "why": "Why?",
        "files": [
            ("src/checkout/AddressForm.tsx", "+84", "", "Add a checkout page: address, shipping and a summary", "2 of 4: the address form", "Frontend: every field has a label you can click"),
            ("api/orders.ts", "+12", "-3", "Add a checkout page: address, shipping and a summary", "3 of 4: check the address on the server too", "Security: the server never trusts what the browser sends"),
            ("src/cart/coupon.ts", "+6", "-2", "The coupon breaks free shipping", "1 of 1: take the coupon off before the shipping limit", "Tests: a test for 49.90 with a 10% coupon"),
        ],
        "w_req": "Request", "w_step": "Plan step", "w_exp": "Expert",
        "health": "Project health", "health_sub": "The average of the parts below; security and tests count a bit more.",
        "parts": [("Architecture", 100), ("Security", 96), ("Tests", 88)],
        "finding": "No lockfile in git", "finding_sub": "Installs can pick up different versions on another computer.",
        "fix": "Fix", "fix_cmd": "bun install && git add bun.lock", "run": "Run", "fixed": "Fixed: bun.lock is in git.",
        "status": "Connected", "saved": "Everything saved locally",
        "ov_folder": "Folder", "ov_path": "/home/deniz/code/shop", "ov_ahead": "1 ahead", "ov_dirty": "1 uncommitted change",
        "ov_commit": "A coupon comes off before shipping", "ov_meta": "Deniz Yilmaz · 5 hours ago · 557f71a",
        "ov_flow": "Code flow", "ov_flow_items": ["1 change isn't committed. Commit it before switching tasks or deploying.", "1 of your commits is not pushed yet. Others can't see it."],
        "ov_recent": "Recent sessions",
        "ov_sessions": [("Checkout page", "30 min ago"), ("Coupon and shipping", "6 hours ago"), ("API rate limit", "4 days ago")],
        "parts_more": [("Frontend", 94), ("Database", 100), ("DevOps", 90)],
        "scan": "Scan now", "scanning": "Scanning 29 files...", "scanned": "Scanned just now · 29 files", "trend": "Over time",
        "finding2": "2 packages have known issues", "finding2_sub": "ws 8.17.0 and semver 7.5.1 have published fixes.",
        "ask_sec": "Ask Security", "sec_reply": "Security: update ws to 8.18.0 and semver to 7.6.3. Neither changes the API shop uses.",
        "chats_h": "Chats",
        "chats": [
            ("Checkout page", "shop", "30 min ago", "Add a checkout page: address, shipping and a summary",
             "Done. The page has an address form, a shipping choice and an order summary, and the orders API checks the address too. All tests pass.", "4 files changed", "+131", "-7"),
            ("Coupon and shipping", "shop", "6 hours ago", "The coupon breaks free shipping",
             "The coupon came off after the shipping limit was checked. It now comes off first, and a new test covers 49.90 with a 10% coupon.", "src/cart/coupon.ts", "+6", "-2"),
            ("PDF invoices", "invoice-api", "2 hours ago", "Let customers download invoices as PDF",
             "Added GET /invoices/:id/pdf. The PDF uses the same totals as the invoice page, so the two cannot disagree.", "3 files changed", "+88", ""),
            ("Offline cart", "mobile-app", "yesterday", "Show the last cart when there is no connection",
             "The cart screen keeps the last cart and shows it offline, with a note that prices may have changed.", "2 files changed", "+54", "-9"),
        ],
        "composer": "Message the chat...", "limit": "Last turn: 3% of your 5-hour limit · 71% left",
        "experts_h": "Experts", "experts_sub": "Read-only reviewers. Each answer is one model call.", "ask_btn": "Ask", "readonly": "Read-only",
        "experts": [
            ("Security", "OWASP, secrets, sign-in", "The checkout form posts over HTTPS and the server checks every field."),
            ("Database", "Schemas, indexes, migrations", "orders.user_id needs an index: checkout reads the whole table."),
            ("Architecture", "Layers, boundaries, cycles", "Cart and checkout share no state through globals. Good."),
            ("Frontend", "Accessibility, state, speed", "Two fields in the address form have no visible label."),
            ("Tests", "Tests that catch real bugs", "The coupon edge case is covered; payment errors are not yet."),
            ("DevOps", "Builds, deploys, rollbacks", "CI does not pin the Bun version. Pin it."),
            ("Product", "Scope, the smallest version", "Ship checkout without saved addresses first."),
            ("Finance", "Costs, prices, invoices", "Shipping is free from 50; the coupon fix keeps that true."),
            ("Design", "Layout, type, contrast", "The summary's grey text is under 4.5:1 contrast in dark mode."),
        ],
        "priv_h": "Private details", "priv_sub": "Sealed on this computer. The model only ever sees the placeholder.",
        "priv_cols": ["Name", "Value", "The model sees"], "show": "Show", "hide": "Hide",
        "priv": [
            ("IBAN", "TR33 •••• •••• •••• 8413 26", "TR33 0006 1005 1978 6457 8413 26", "[[private:iban]]"),
            ("Salary", "••.••• TL", "85.000 TL", "[[private:amount]]"),
            ("ID number", "•••••••••46", "10000000146", "[[private:id]]"),
            (".env STRIPE_KEY", "sk_live_••••••", "sk_live_51Hx9f2...", "[[env:STRIPE_KEY]]"),
            (".env DATABASE_URL", "postgres://••••", "postgres://shop:hunter2@localhost/shop", "[[env:DATABASE_URL]]"),
        ],
        "p_you": "What you see", "p_model": "What the model gets",
        "p_msg": "Send the March salary, {amount}, to {iban}. The payment key is {key}.",
        "p_real": {"amount": "85.000 TL", "iban": "TR33 0006 1005 1978 6457 8413 26", "key": "sk_live_51Hx9f2..."},
        "p_note_you": "This is your message as you typed it.",
        "p_note_model": "This is what leaves your computer. The answer comes back with the real values put in again.",
    },
    "tr": {
        "label": "Demoyu izle ya da kendin dene: pencerede herhangi bir yere tıkla.",
        "replay": "Demoyu yeniden oynat",
        "b_task": "Kuponu shop ve invoice-api'de düzelt",
        "b_experts": ["Güvenlik", "Veritabanı", "Mimari", "Frontend", "Finans", "+25"],
        "b_rules": "2 kural yalnızca CLAUDE.md'de", "b_merge": "Birleştir",
        "side": ["Projeler", "Sohbetler", "Uzmanlar", "Özel bilgiler"],
        "search": "Sayfa, proje, komut ara...",
        "projects": "Projeler",
        "ask": "Ne yapmak istiyorsun?",
        "ask_example": "Mağazaya bir sepet sayfası ekle",
        "picks": "Igrek seçsin",
        "picked": "Igrek <b>shop</b>'u seçti: sepet kodu orada. Kendi kopyasında bir sohbet başladı.",
        "cards": [("S", "#b5643c", "shop", "Ödeme sayfası eklendi: adres formu, kargo seçimi ve sipariş özeti", "29 dk önce"),
                  ("I", "#9a9a2c", "invoice-api", "Faturalar PDF olarak indirilebiliyor", "2 saat önce"),
                  ("M", "#b08a3a", "mobile-app", "Sepet ekranı son sepeti çevrimdışı gösteriyor", "dün"),
                  ("A", "#3a9a52", "admin-panel", "Sipariş tablosuna durum ve tarih filtreleri eklendi", "dün"),
                  ("B", "#b0427a", "blog", "Ücretsiz kargo hakkında bir yazı yazıldı", "3 gün önce"),
                  ("L", "#6a45b8", "landing-page", "Lighthouse performansı 71'den 96'ya çıktı", "5 gün önce")],
        "fresh": "Güncel",
        "tabs": ["Genel bakış", "Değişiklikler", "Sağlık"],
        "latest": "Son oturum", "session": "Ödeme sayfası", "goal": "<b>Amaç:</b> müşteriler sepetten sonra ödeyebilsin.",
        "done": "Yapılanlar", "done_list": ["Ödeme sayfası eklendi: adres formu, kargo seçimi ve sipariş özeti", "Sipariş API'si adresi kontrol ediyor"],
        "open": "Açık kalan", "open_list": ["Ödeme sağlayıcısının formunu bağla"],
        "why": "Neden?",
        "files": [
            ("src/checkout/AddressForm.tsx", "+84", "", "Ödeme sayfası ekle: adres, kargo ve özet", "4 adımdan 2.si: adres formu", "Frontend: her alanın tıklanabilir bir etiketi var"),
            ("api/orders.ts", "+12", "-3", "Ödeme sayfası ekle: adres, kargo ve özet", "4 adımdan 3.sü: adresi sunucuda da kontrol et", "Güvenlik: sunucu tarayıcının gönderdiğine asla güvenmez"),
            ("src/cart/coupon.ts", "+6", "-2", "Kupon ücretsiz kargoyu bozuyor", "1 adımdan 1.si: kuponu kargo limitinden önce düş", "Testler: %10 kuponla 49,90 için bir test"),
        ],
        "w_req": "İstek", "w_step": "Plan adımı", "w_exp": "Uzman",
        "health": "Proje sağlığı", "health_sub": "Aşağıdaki bölümlerin ortalaması; güvenlik ve testler biraz daha ağır sayılır.",
        "parts": [("Mimari", 100), ("Güvenlik", 96), ("Testler", 88)],
        "finding": "Git'te lockfile yok", "finding_sub": "Başka bir bilgisayarda kurulum farklı sürümler çekebilir.",
        "fix": "Düzelt", "fix_cmd": "bun install && git add bun.lock", "run": "Çalıştır", "fixed": "Düzeldi: bun.lock git'te.",
        "status": "Bağlı", "saved": "Her şey yerelde kayıtlı",
        "ov_folder": "Klasör", "ov_path": "/home/deniz/code/shop", "ov_ahead": "1 ileride", "ov_dirty": "1 commit'lenmemiş değişiklik",
        "ov_commit": "Kupon kargodan önce düşüyor", "ov_meta": "Deniz Yılmaz · 5 saat önce · 557f71a",
        "ov_flow": "Kod akışı", "ov_flow_items": ["1 değişiklik commit'lenmedi. İş değiştirmeden ya da yayına almadan önce commit'le.", "Commit'lerinden 1'i henüz push'lanmadı. Diğerleri göremiyor."],
        "ov_recent": "Son oturumlar",
        "ov_sessions": [("Ödeme sayfası", "30 dk önce"), ("Kupon ve kargo", "6 saat önce"), ("API hız sınırı", "4 gün önce")],
        "parts_more": [("Frontend", 94), ("Veritabanı", 100), ("DevOps", 90)],
        "scan": "Şimdi tara", "scanning": "29 dosya taranıyor...", "scanned": "Az önce tarandı · 29 dosya", "trend": "Zaman içinde",
        "finding2": "2 paketin bilinen sorunu var", "finding2_sub": "ws 8.17.0 ve semver 7.5.1 için yayımlanmış düzeltmeler var.",
        "ask_sec": "Güvenliğe sor", "sec_reply": "Güvenlik: ws'i 8.18.0'a, semver'i 7.6.3'e güncelle. İkisi de shop'un kullandığı API'yi değiştirmez.",
        "chats_h": "Sohbetler",
        "chats": [
            ("Ödeme sayfası", "shop", "30 dk önce", "Ödeme sayfası ekle: adres, kargo ve özet",
             "Tamam. Sayfada adres formu, kargo seçimi ve sipariş özeti var; sipariş API'si de adresi kontrol ediyor. Tüm testler geçiyor.", "4 dosya değişti", "+131", "-7"),
            ("Kupon ve kargo", "shop", "6 saat önce", "Kupon ücretsiz kargoyu bozuyor",
             "Kupon, kargo limiti kontrol edildikten sonra düşüyordu. Artık önce düşüyor; yeni bir test %10 kuponla 49,90'ı kapsıyor.", "src/cart/coupon.ts", "+6", "-2"),
            ("PDF faturalar", "invoice-api", "2 saat önce", "Müşteriler faturayı PDF olarak indirebilsin",
             "GET /invoices/:id/pdf eklendi. PDF, fatura sayfasıyla aynı toplamları kullanıyor, ikisi farklı olamaz.", "3 dosya değişti", "+88", ""),
            ("Çevrimdışı sepet", "mobile-app", "dün", "Bağlantı yokken son sepeti göster",
             "Sepet ekranı son sepeti saklıyor ve çevrimdışıyken, fiyatların değişmiş olabileceği notuyla gösteriyor.", "2 dosya değişti", "+54", "-9"),
        ],
        "composer": "Sohbete yaz...", "limit": "Son tur: 5 saatlik limitinin %3'ü · %71 kaldı",
        "experts_h": "Uzmanlar", "experts_sub": "Salt okunur inceleyiciler. Her cevap bir model çağrısı.", "ask_btn": "Sor", "readonly": "Salt okunur",
        "experts": [
            ("Güvenlik", "OWASP, sırlar, giriş", "Ödeme formu HTTPS ile gidiyor ve sunucu her alanı kontrol ediyor."),
            ("Veritabanı", "Şemalar, indeksler, migration'lar", "orders.user_id'ye indeks gerek: ödeme tüm tabloyu okuyor."),
            ("Mimari", "Katmanlar, sınırlar, döngüler", "Sepet ve ödeme global değişkenle durum paylaşmıyor. İyi."),
            ("Frontend", "Erişilebilirlik, durum, hız", "Adres formunda iki alanın görünür etiketi yok."),
            ("Testler", "Gerçek hatayı yakalayan testler", "Kupon sınır durumu kapsanıyor; ödeme hataları henüz değil."),
            ("DevOps", "Derleme, yayına alma, geri alma", "CI, Bun sürümünü sabitlemiyor. Sabitle."),
            ("Ürün", "Kapsam, en küçük sürüm", "Ödemeyi önce kayıtlı adresler olmadan çıkar."),
            ("Finans", "Maliyet, fiyat, fatura", "Kargo 50'den itibaren ücretsiz; kupon düzeltmesi bunu koruyor."),
            ("Tasarım", "Yerleşim, yazı, kontrast", "Özetteki gri yazı koyu temada 4.5:1 kontrastın altında."),
        ],
        "priv_h": "Özel bilgiler", "priv_sub": "Bu bilgisayarda mühürlü. Model yalnızca yer tutucuyu görür.",
        "priv_cols": ["Ad", "Değer", "Modelin gördüğü"], "show": "Göster", "hide": "Gizle",
        "priv": [
            ("IBAN", "TR33 •••• •••• •••• 8413 26", "TR33 0006 1005 1978 6457 8413 26", "[[private:iban]]"),
            ("Maaş", "••.••• TL", "85.000 TL", "[[private:amount]]"),
            ("Kimlik no", "•••••••••46", "10000000146", "[[private:id]]"),
            (".env STRIPE_KEY", "sk_live_••••••", "sk_live_51Hx9f2...", "[[env:STRIPE_KEY]]"),
            (".env DATABASE_URL", "postgres://••••", "postgres://shop:hunter2@localhost/shop", "[[env:DATABASE_URL]]"),
        ],
        "p_you": "Senin gördüğün", "p_model": "Modelin aldığı",
        "p_msg": "Mart maaşını, {amount}, {iban} hesabına gönder. Ödeme anahtarı {key}.",
        "p_real": {"amount": "85.000 TL", "iban": "TR33 0006 1005 1978 6457 8413 26", "key": "sk_live_51Hx9f2..."},
        "p_note_you": "Mesajın, yazdığın gibi.",
        "p_note_model": "Bilgisayarından çıkan bu. Cevap gelince gerçek değerler yeniden yerine konur.",
    },
}

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

