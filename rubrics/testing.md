# Tests / Testler

How well the code is checked automatically.

Kodun otomatik olarak ne kadar iyi kontrol edildiği.

Score = 100 × Σ(weight × value) / Σ(weight). Value is 0–1 per check.

| Check / Kontrol | Weight | How to fix | Nasıl düzelir |
|---|---|---|---|
| `test.exists` Tests files / Testler dosya | 2 | Add tests for the most important behaviour, starting with the code that breaks most often. | En önemli davranışlar için, en sık bozulan koddan başlayarak testler ekle. |
| `test.ratio` Test files per code file / Kod dosyası başına test | 1.5 | Add tests for the main modules that have none yet (aim for about one test file per three code files). | Henüz testi olmayan ana modüllere test ekle (yaklaşık her üç kod dosyasına bir test dosyası hedefle). |
| `test.script` One command runs the tests / Testler tek komutla çalışıyor | 1 | Add a "test" script (or pytest config) so the whole suite runs with one command. | Tüm testler tek komutla çalışsın diye bir "test" script'i (veya pytest ayarı) ekle. |
| `test.ci` CI runs the tests / CI testleri çalıştırıyor | 1 | Make the CI workflow run the test suite, not just the build. | CI akışı sadece build değil test paketini de çalıştırsın. |
| `tool.tests` Tests pass / Testler geçiyor | 3 | Make the failing tests pass, or fix the code they caught. | Başarısız testleri geçir veya yakaladıkları kodu düzelt. |

Checks named `tool.*` only count after you run the project's own tools (Sections → Run the project's own checks), for two weeks.
