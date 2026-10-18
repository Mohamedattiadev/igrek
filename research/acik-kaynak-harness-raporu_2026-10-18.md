# Açık kaynak AI kodlama harness'ları: God Eye için neler alınır

**Tarih:** 18 Ekim 2026
**İncelenenler:** t3code (v2), pi, opencode (v2), crush, cline, aider, goose, OpenUI
**Yöntem:** Her depo `--depth 1` ile klonlandı, README, dokümanlar ve ana kaynak dosyaları okundu. Hiçbiri kurulmadı, derlenmedi ve çalıştırılmadı. Okuma bitince klonlar silindi.
**Ayrıntılı notlar (İngilizce, dosya yolu ve satır numarasıyla):**
- `research/notes/notes-t3code.md`
- `research/notes/notes-pi-opencode.md`
- `research/notes/notes-others.md`

Satır numaraları aşağıdaki commit'lere aittir.

## 1. İncelenen depolar

| Depo | Ne | Yığın | Lisans | Okunan commit |
|---|---|---|---|---|
| pingdotgg/t3code | Claude Code, Codex, Cursor, OpenCode, Pi ve ACP ajanlarını tek yerden süren "harness kontrol yüzeyi"; web, masaüstü ve mobil | TypeScript, Effect-TS (v4 beta), React 19, Tailwind 4, Electron, Expo | MIT | 6a6ebb2 |
| earendil-works/pi (eski badlogic/pi-mono) | Küçük çekirdekli terminal ajanı; her şey eklenti | TypeScript, Node, kendi TUI'si | MIT | 482c138 |
| anomalyco/opencode (eski sst/opencode) | Sunucu, TUI, web ve masaüstü olan açık kodlama ajanı (V2 yeniden yazım) | Bun, Effect 4 beta, SolidJS, SQLite, Electron | MIT | 63c1a27 |
| charmbracelet/crush | Terminal ajanı | Go | FSL-1.1-MIT: **sadece fikir, kod kopyalanmaz** | 14ac9bc |
| cline/cline | VS Code eklentisi ve SDK | TypeScript, React | Apache-2.0 | a42df8c |
| Aider-AI/aider | Terminal eşli programlama | Python | Apache-2.0 | 5dc9490 |
| aaif-goose/goose (eski block/goose) | Masaüstü ve CLI ajanı, MCP uygulamaları | Rust, Electron | Apache-2.0 | bfcc6ee |
| thesysdev/openui | Üretken arayüz (generative UI) için açık standart, dil ve React renderer | TypeScript | MIT | 8d9c4c3 |

**Kod alma kuralları:**
- MIT ve Apache-2.0 kod, telif notu korunup kaynak dosyası bir yorumda belirtilerek alınabilir.
- Crush'tan sadece fikir alınır.
- t3code ve opencode sunucu kodu Effect-TS'e sıkı bağlı. Bu yüzden God Eye'a (Bun ve Hono) doğrudan kopyalanmaz; algoritmalar düz TypeScript ile yeniden yazılır. t3code'daki saf web yardımcıları (`lruCache.ts`, `incrementalHighlighting.ts` gibi) neredeyse olduğu gibi alınabilir.

## 2. Birden fazla projenin bağımsız olarak yaptığı şeyler (en güçlü sinyal)

| Konu | Kimde var | God Eye'da bugün |
|---|---|---|
| Akış (streaming) sırasında Markdown'ı blok blok işlemek: sadece son blok yeniden çizilir, kapanmamış Markdown iyileştirilir | t3code, opencode, cline, crush | Her parçada bütün mesaj yeniden işleniyor |
| Ardışık araç çağrılarını tek satıra toplamak: "3 dosya okudu, 2 dosya düzenledi, 4 komut çalıştırdı" | t3code, opencode, cline | Her araç ayrı bir kart |
| Ajan çalışırken mesaj yazmak: kuyruğa alma ya da çalışan işi yönlendirme (steer) | t3code, pi, opencode, cline, goose | Yok |
| İzin kuralları: "bir kez", "her zaman" ve "reddet ve sebebini yaz"; proje bazında otomatik onay; güvenli komut listesi | opencode, crush, goose, t3code | Her istek ayrı onay |
| Bağlam doluluk göstergesi ve sıkıştırma ayırıcıları; prompt önbelleğinin süresi dolunca sıkıştırma önerisi | t3code, cline, goose, pi | Sağlık göstergesi var, önbellek süresi yok |
| Sohbete bağlı checkpoint'ler ve "geri yüklemeyi geri al" | opencode, cline, t3code | Gizli ref'li checkpoint var; mesaja bağlı değil |
| Ajanın soru kartı: tek seçim, çoklu seçim ya da JSON şemalı form | crush, cline, goose, t3code | Yok |
| Sandbox'lı iframe içinde AI'ın yaptığı HTML rapor ve görseller | t3code (`render_html`), goose (MCP Apps) | Yok; bugün sadece JSON çit blokları var |
| Döngü tespiti: aynı araç, aynı girdi ve aynı çıktı tekrar ediyor | crush, goose | Yok |
| Sağlayıcı yetenek bayrakları: resume, steer, fork, rollback, plan modu | t3code, pi, opencode | Araç adına göre kontroller |

## 3. Birleşik öncelik listesi

**Etki:** Y = yüksek, O = orta. **Emek:** S = küçük (1 gün altı), M = orta (birkaç gün), L = büyük.

| # | Ne | Etki | Emek | Kaynak (lisans) | God Eye'da nereye |
|---|---|---|---|---|---|
| 1 | **Blok blok akan Markdown + artımlı Shiki + LRU önbellek.** Uzun cevaplarda takılma biter | Y | S | t3code `markdown-incremental.ts`, `incrementalHighlighting.ts`, `lruCache.ts` (MIT); opencode `markdown-stream.ts` (MIT); cline `MarkdownBlock.tsx` (Apache-2.0) | `components/Markdown.tsx`, `lib/highlight.ts` |
| 2 | **İş günlüğü gruplama:** ardışık araç çağrıları tek satır cümle olur, istenince açılır. Detay seviyeleri: her şey / ayrıntılı / sade / sadece metin | Y | M | t3code `work-log/presentation.ts` (MIT); opencode `timeline/detail.ts` (MIT); cline `tool-summary/` (Apache-2.0) | `pages/Chat.tsx`, yeni `lib/workLog.ts` |
| 3 | **Çalışırken mesaj kuyruğu ve yönlendirme (steer):** sıradaki mesaj beklemede durur, istenirse öne alınır; yeniden başlatmada kuyruk korunur | Y | M | t3code `QueuedRunOrder.ts` (MIT); pi `agent-loop.ts` (MIT); opencode `session/inbox.ts` (MIT) | `chats.ts`, `chat-routes.ts`, sohbet kutusu |
| 4 | **Onaylar sohbet kutusunun içinde:** "N/M" sayacı, "her zaman izin ver" kuralları, "reddet ve neden yaz", proje bazında otomatik onay, süreç ölünce "artık devam edilemez" durumu | Y | M | opencode `permission.ts`, `auto-approve.ts` (MIT); t3code `ComposerPendingApprovalActions.tsx` (MIT); crush (fikir) | `ApprovalCard.tsx`, `guards.ts`, `Chat.tsx` |
| 5 | **Durum hapı:** session ve sohbet listelerinde öncelik sırasıyla Onay bekliyor > Cevap bekliyor > Çalışıyor > Plan hazır > Bitti (görülmedi); Gelen kutusuna bağlı | Y | S-M | t3code `Sidebar.logic.ts` (MIT) | session listeleri, `Inbox.tsx` |
| 6 | **God Eye'ı ajanlara açan MCP uç noktası (kapsamlı token ile):** hafızada ara, bir personaya sor, sır iste, HTML çiz | Y | M | t3code `orchestrator-mcp-server.md`, `McpSessionRegistry.ts` (MIT) | `apps/server/src/mcp.ts` |
| 7 | **Görsel cevaplar ve raporlar:** God Eye bileşenleriyle **OpenUI** (bkz. bölüm 4); serbest HTML için temalı ve sandbox'lı iframe | Y | S sonra M | OpenUI (MIT); t3code `HtmlRenderFrame.tsx` (MIT); goose `McpAppRenderer` (Apache-2.0) | `RichBlocks.tsx`, `Markdown.tsx`, `RichPreviews.tsx` |
| 8 | **Limit kurtarma:** sıfırlanınca devam et, sıfırlanana kadar ertele; 5 saatlik ve haftalık pencere sorgusu | Y | M | t3code `OrchestrationV2LimitRecovery`, `claudeUsageLimits.ts` (MIT) | `limits.ts`, `schedules.ts`, `Inbox.tsx` |
| 9 | **Daha iyi devir ve özet şablonları:** yapılandırılmış, artımlı güncellenen, dosya takipli | Y | S | pi `compaction.ts` (MIT); opencode `session/compaction.ts` (MIT); crush `summary.md` (fikir) | `summarizer.ts`, `RecapCard.tsx` |
| 10 | **Adaptör yetenek bayrakları:** her araç ne yapabildiğini kendisi söyler; arayüz araç adına bakmaz | Y | S-M | t3code `provider-capability-system.md`, `ProviderAdapter.ts` (MIT) | `adapters/types.ts` |
| 11 | **Döngü tespiti:** son 10 olayda aynı araç, girdi ve çıktı 5 kez gelirse session sağlığına ve Gelen kutusuna uyarı | O-Y | S | goose `tool_monitor.rs` (Apache-2.0); crush (fikir) | session sağlığı, `insight/` |
| 12 | **Tur kapanışı kuralı:** biten ya da çöken her turda yarım kalan araç çağrıları "kesildi" olarak kapanır | O | S | crush `settle.go` (fikir) | `chats.ts`, adaptörler |
| 13 | **Ajanın soru kartı:** seçenekler ve JSON şemalı form | O-Y | M | cline `agent-ask-question.tsx`, goose `JsonSchemaForm` (Apache-2.0); OpenUI formları | `Chat.tsx`, `ApprovalCard.tsx` |
| 14 | **Diff satırına yorum:** yorum bir sonraki prompt'a eklenir | Y | M | opencode `line-comment.tsx` (MIT) | `DiffView.tsx`, sohbet kutusu |
| 15 | **Mesaja bağlı checkpoint ve geri yüklemeyi geri alma:** HEAD ebeveyni, fsync, güvenli geri yükleme | O-Y | S-M | t3code `GitVcsDriver.ts` (MIT); opencode `snapshot.ts`, `revert.ts` (MIT) | `checkpoints.ts`, `CheckpointRestore.tsx` |
| 16 | **Proje güven sorusu:** yeni alınan bir repo'nun hook'ları, MCP sunucuları ve skill'leri yüklenmeden önce onay istenir | O-Y | S-M | pi `project-trust.ts` (MIT) | proje ekleme, `hooks.ts`, `mcpservers.ts` |
| 17 | **Yeni adaptörler:** pi (JSONL RPC) ve opencode (HTTP/SSE ya da SQLite) session'larını izleme ve sürme; ileride ACP | O-Y | M (ACP: L) | pi `docs/rpc.md`; opencode SDK; goose `goose-acp` (Apache-2.0) | `apps/server/src/adapters/` |
| 18 | **Bağlam ölçer ve maliyet:** prompt önbelleği süresi, önbellek isabeti, model fiyat tablosu, mesaj başına kullanım | O | S-M | t3code `ContextWindowMeter.logic.ts`, `usagePricing` (MIT); cline `agent-context-usage.tsx` (Apache-2.0) | `Chat.tsx`, `costs.ts`, `Limits.tsx` |
| 19 | **Akış protokolü düzeni:** sıra numarası ve `?after=N` ile devam, 50 ms birleştirme, geri basınç sınırı | O-Y | M | t3code `ThreadLiveEventCoalescer.ts`, `LiveStreamBudget.ts` (MIT) | `bus.ts`, `chat-routes.ts` |
| 20 | **"// ai: şunu yap!" yorumu izleyici:** dosyaya yazılan yorum bir iş başlatır | O | M | aider `watch.py` (Apache-2.0) | `watchers.ts` |
| 21 | **Zamanlanmış ve ajanın oluşturduğu işlerde revizyona bağlı onay:** süre sonu, eşzamanlılık ve saatlik sınır; ajan kendi işini onaylayamaz | O | M | cline Agenda (`ARCHITECTURE.md`, Apache-2.0) | `schedules.ts`, `flows.ts` |
| 22 | **Kısayollar için `when` bağlamları ve komut paletinde `>` eylem modu** | O | M | t3code `keybindings.ts` (MIT) | `CommandPalette.tsx`, yeni `lib/keybindings.ts` |
| 23 | **Hazır personalar:** keşifçi (scout), planlayıcı, inceleyici, işçi ve "uygula, sonra incele" zinciri | O | S | pi `examples/extensions/subagent` (MIT) | `personas.ts`, `flows-builtin.ts` |
| 24 | **Geliştirme kalitesi:** `AGENTS.md`, özel lint kuralları, knip (ölü kod), kayıttan oynatılan adaptör testleri | O | S-M | t3code `AGENTS.md`, `testing-strategy.md` (MIT) | repo kökü, CI; Faz 15 ile birlikte |

**Listenin hemen altında kalanlar:**
- **t3code:** sohbet içinde arama ve sanal (virtualized) zaman çizelgesi, webhook ile tetiklenen zamanlanmış işler, prompt bağlantıları, bütçeli bağlamla sağlayıcı değiştirme
- **pi:** sohbet ağacı ("buradan düzenle ve yeniden dene")
- **opencode:** aranabilir ayarlar; çoklu sekmede bildirimleri tekilleştirmek için Web Locks
- **aider:** diff'ten commit mesajı
- **pi:** session'ı HTML olarak dışa aktarma

## 4. OpenUI kararı

**Karar: Mevcut renderer'ın yanında kullanılacak, onun yerine geçmeyecek.**

**Nedir?** Modelin satır satır yazdığı küçük bir arayüz dili, örneğin `chart = BarChart(labels, [series])`. Akış sırasında her yarım metin geçerli bir sayfadır. Ayrıca şunlar var:
- Eylemler: `@ToAssistant("…")`, modele yeni bir mesaj gönderen bir buton yapar.
- Formlar ve durum.
- Araç sorguları.
- Sadece değişen satırları gönderen düzenlemeler.
- Modele geri gönderilebilen yapılandırılmış hata raporları.
- Kayıtlı mesajlar için geriye uyumluluk kuralları.

`generateSystemPrompt` modele verilecek talimatı **bizim kaydettiğimiz bileşenlerden** üretir, yani model sadece izin verdiğimiz bileşenleri kullanabilir. Spec 1.0'da ve `react-lang` 1.x'te, `react-ui` hâlâ 0.x'te. Çok aktif: haftada birkaç sürüm çıkıyor.

**Neden yanında, neden sadece `react-lang`:**
1. **Bizim mekanizmamızla aynı biçim.** `inlineMode` "metin + çitli openui kodu" demek. God Eye zaten ` ```chart ` bloklarını böyle çiziyor; ` ```openui ` tek satırlık bir ekleme.
2. **`react-ui` ağır.** Radix, d3, tanstack table, KaTeX, ikinci bir vurgulayıcı (Prism) ve lodash getiriyor; hazır paket yaklaşık 900 KB gzip. Bunun yerine sadece `react-lang`, `lang-core` ve `zod` alınıp, `defineComponent` ile **God Eye'ın kendi bileşenleri** sarılacak: grafik, istatistik, ilerleme, tablo, uyarı kutusu, kod ve mermaid. Böylece kendi renklerimiz, koyu mod ve Shiki aynen kalır; ek CSS gerekmez.
3. **Eski bloklar kalıyor.** ` ```chart `, ` ```stats ` ve ` ```progress ` yedek olarak çalışmaya devam ediyor.

**Riskler ve önlemler:**
- **Telemetri:** `lang-core`'un `postinstall` betiği kurulumda PostHog'a bir kurulum olayı gönderiyor. Bun bağımlılıkların postinstall betiklerini normalde çalıştırmaz, ama bu test edilmedi. Önlem: kurulumda ve CI'da `OPENUI_TELEMETRY_DISABLED=1` ve `DO_NOT_TRACK=1` ayarlanacak, sürüm tam sabitlenecek ve `node_modules` içinde PostHog adresini arayan bir test eklenecek. God Eye "sıfır telemetri" vaat ettiği için bu şart.
- **Güvenlik:** `@OpenUrl` sadece http ve https adreslerini kabul edecek şekilde sarılacak. `@Run` ve sorgular sadece God Eye'ın izin listesindeki, varsayılan olarak salt okunur araçlara gidecek. Bileşen içindeki Markdown DOMPurify'dan geçecek.
- **Model güvenilirliği:** Yeni bir dil öğrenmek gerekiyor; zayıf ya da yerel modeller hata yapabilir. Ama ayrıştırıcı sadece bozuk parçayı atıyor, sayfa çökmüyor. Hata oranı her araç için ölçülecek.
- **Prompt maliyeti:** Ölçülmedi. Önce `generateSystemPrompt` ile token sayısı çıkarılacak.
- **Prop sırası:** Bileşen argümanları sıraya bağlı. Sonradan sırayı değiştirmek kayıtlı mesajları bozar, bu yüzden prop'lar baştan dikkatle tasarlanmalı.

**Aşamalar:**
1. **Deneme (yarım gün):** Ayrı bir dalda 8 bileşenlik bir God Eye kütüphanesi kurulur ve paket boyutu ölçülür.
2. **İlk kullanım:** God Eye'ın kendi raporları (Haftalık, Brifing, Bölümler/Insight) ` ```openui ` ile yazılır.
3. **Sohbetlerde isteğe bağlı:** "Zengin cevaplar" seçeneği eklenir. `onError` ile "düzelt" çipi, `onAction` ile izin listesindeki God Eye komutları çalışır.

**Yedek plan:** OpenUI fazla ağır gelirse, cline'ın izin listeli JSX önizlemesi (yaklaşık 300 satır, yeni dil yok) aynı ` ```openui ` çitinin arkasına konabilir.

## 5. Neyi almayacağız

- **pi'nin izin modeli:** pi'de izin sistemi yok ("kullanıcıya güven" yaklaşımı). God Eye'ın onay sistemi kalır.
- **t3code ve opencode sunucusu (Effect-TS):** Doğrudan kopyalanmaz, sadece algoritmalar düz TypeScript ile yazılır.
- **Crush kodu:** FSL lisanslı. Sadece fikir alınır.
- **OpenUI bulut ve gözlem servisleri** (Thesys Cloud, Gateway, observability-cloud): Asla açılmaz.
- **t3code'un bağımlılıkları** (`@pierre/diffs`, `@pierre/trees`, `@legendapp/list`, `libghostty-vt`): Lisansları kontrol edilmeden kullanılmaz.

## 6. Okunmayanlar ve kesin olmayanlar

- **t3code:** Orchestrator iç yapısı, Codex/ACP/Cursor adaptör gövdeleri, mobil ve masaüstü uygulamaları, relay Worker'ı ve native kod okunmadı. Bunlar hakkındaki ifadeler dokümana dayanıyor.
- **Diğer projeler:** Roo Code, Kilo Code, OpenHands, Continue, assistant-ui ve CopilotKit incelenmedi. İstenirse ikinci bir tur yapılabilir.
- **Ölçülmeyenler:** OpenUI'nin `react-lang` + `lang-core` boyutu ve prompt token sayısı ölçülmedi.
- **Test edilmeyen:** Bun'ın OpenUI `postinstall` betiğini gerçekten atladığı test edilmedi.
