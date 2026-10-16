# Dependencies / Bağımlılıklar

The outside packages it relies on and how safely they're pinned.

Dayandığı dış paketler ve sürümlerinin ne kadar güvenli sabitlendiği.

Score = 100 × Σ(weight × value) / Σ(weight). Value is 0–1 per check.

| Check / Kontrol | Weight | How to fix | Nasıl düzelir |
|---|---|---|---|
| `deps.lockfile` Exact versions locked (lockfile) / Sürümler kilitli (lockfile) | 1.5 | Commit the lockfile so everyone installs the same versions. | Herkes aynı sürümleri kursun diye lockfile'ı commit et. |
| `deps.loose` Unbounded versions / Sınırsız sürümler | 1 | Replace "*", "latest" and open-ended ">=" versions with normal ranges (for example ^1.2.3). | "*", "latest" ve ucu açık ">=" sürümlerini normal aralıklarla değiştir (örneğin ^1.2.3). |
| `deps.mixedLocks` One package manager / Tek paket yöneticisi | 0.5 | Keep a single package manager: remove the extra lockfiles in the listed folders. | Tek bir paket yöneticisi kullan: listelenen klasörlerdeki fazladan lockfile'ları sil. |
| `deps.deprecated` Deprecated packages / Artık desteklenmeyen paketler | 1 | Replace the listed deprecated packages with their maintained alternatives. | Listelenen desteklenmeyen paketleri bakımı süren alternatifleriyle değiştir. |
| `tool.audit` Known vulnerabilities in dependencies / Bağımlılıklarda bilinen açıklar | 2 | Update the packages with known vulnerabilities (start with critical and high). | Bilinen açığı olan paketleri güncelle (kritik ve yüksekten başla). |

Checks named `tool.*` only count after you run the project's own tools (Sections → Run the project's own checks), for two weeks.
