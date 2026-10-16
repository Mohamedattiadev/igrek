# Performance / Performans

How fast it loads: heavy files and loading only what's needed.

Ne kadar hızlı yüklendiği: ağır dosyalar ve sadece gerekenin yüklenmesi.

Score = 100 × Σ(weight × value) / Σ(weight). Value is 0–1 per check.

| Check / Kontrol | Weight | How to fix | Nasıl düzelir |
|---|---|---|---|
| `perf.assets` Heavy files in the repo / Repoda ağır dosyalar | 1 | Compress or resize the listed assets (WebP/AVIF for images), or load them from a CDN. | Listelenen dosyaları sıkıştır veya küçült (görseller için WebP/AVIF) ya da bir CDN'den yükle. |
| `perf.lazy` Pages load only what they need / Sayfalar sadece gerekeni yüklüyor | 1 | Load rarely used pages and heavy components on demand (React.lazy / dynamic import). | Az kullanılan sayfaları ve ağır bileşenleri ihtiyaç anında yükle (React.lazy / dynamic import). |

Checks named `tool.*` only count after you run the project's own tools (Sections → Run the project's own checks), for two weeks.
