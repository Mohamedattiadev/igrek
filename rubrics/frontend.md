# Frontend / Frontend

The code that runs in the browser or app: screens and components.

Tarayıcıda veya uygulamada çalışan kod: ekranlar ve bileşenler.

Score = 100 × Σ(weight × value) / Σ(weight). Value is 0–1 per check.

| Check / Kontrol | Weight | How to fix | Nasıl düzelir |
|---|---|---|---|
| `fe.strict` TypeScript strict mode / TypeScript strict modu | 1.5 | Turn on "strict": true in tsconfig.json and fix the type errors it reveals. | tsconfig.json'da "strict": true'yu aç ve çıkan tip hatalarını düzelt. |
| `fe.bigComponents` Very large UI components / Çok büyük arayüz bileşenleri | 1.5 | Break the largest UI components (over 400 lines) into smaller components and hooks, keeping the UI identical. | En büyük arayüz bileşenlerini (400 satırdan fazla) daha küçük bileşenlere ve hook'lara böl; görünüm aynı kalsın. |
| `fe.any` Uses of "any" / "any" kullanımı | 1 | Replace "any" types with real types (or "unknown" plus a check) in the listed places. | Listelenen yerlerde "any" tiplerini gerçek tiplerle (ya da "unknown" + kontrol) değiştir. |
| `fe.errorBoundary` Error screen instead of a blank page / Boş sayfa yerine hata ekranı | 0.5 | Add an error boundary (or the router's errorElement) so a crash shows a friendly error screen instead of a blank page. | Bir error boundary (veya router'ın errorElement'i) ekle; çökme olunca boş sayfa yerine anlaşılır bir hata ekranı çıksın. |
| `fe.i18n` Ready for other languages / Başka dillere hazır | 0.5 | Move the UI texts into translation files with an i18n library so the app can be translated. | Arayüz metinlerini bir i18n kütüphanesiyle çeviri dosyalarına taşı; uygulama çevrilebilir olsun. |

Checks named `tool.*` only count after you run the project's own tools (Sections → Run the project's own checks), for two weeks.
