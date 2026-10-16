# Architecture / Mimari

How the project is put together: its parts and how they depend on each other.

Projenin nasıl kurulduğu: parçaları ve birbirine nasıl bağlı oldukları.

Score = 100 × Σ(weight × value) / Σ(weight). Value is 0–1 per check.

| Check / Kontrol | Weight | How to fix | Nasıl düzelir |
|---|---|---|---|
| `arch.readme` README at the top of the project / Projenin en üstünde README | 1 | Add a README.md at the project root that says what the project is and how to run it. | Proje kökünde ne olduğunu ve nasıl çalıştırıldığını anlatan bir README.md ekle. |
| `arch.bigFiles` Very long files / Çok uzun dosyalar | 2 | Split the longest files (over 600 lines) into smaller modules with one clear job each, without changing behaviour. | En uzun dosyaları (600 satırdan fazla) her biri tek bir işi yapan küçük modüllere böl; davranış değişmesin. |
| `arch.todo` TODO / FIXME notes / TODO / FIXME notları | 1 | Go through the TODO and FIXME comments: do the quick ones, turn the rest into tracked tasks, and remove stale ones. | TODO ve FIXME yorumlarını gözden geçir: kısa olanları yap, kalanları göreve çevir, eskimişleri sil. |
| `arch.types` Typed code / Tipli kod oranı | 1 | Convert the remaining JavaScript files to TypeScript, starting with the most used ones. | Kalan JavaScript dosyalarını en çok kullanılanlardan başlayarak TypeScript'e çevir. |
| `arch.lint` Linter / formatter set up / Linter / formatter kurulu | 1 | Set up a linter and formatter (for example Biome or ESLint + Prettier, or Ruff for Python) with a config file in the repo. | Repoya bir linter ve formatter ekle (örneğin Biome veya ESLint + Prettier, Python için Ruff) ve ayar dosyasını koy. |
| `tool.typecheck` Type check passes / Tip kontrolü geçiyor | 2 | Fix the type errors reported by the type check (see the output in "Run the project's own checks"). | Tip kontrolünün bildirdiği hataları düzelt (çıktı "Projenin kendi kontrollerini çalıştır" kartında). |
| `tool.lint` Linter passes / Linter geçiyor | 1.5 | Fix the problems the linter reports. | Linter'ın bildirdiği sorunları düzelt. |

Checks named `tool.*` only count after you run the project's own tools (Sections → Run the project's own checks), for two weeks.
