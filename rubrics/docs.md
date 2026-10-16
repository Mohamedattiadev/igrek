# Docs / Dokümantasyon

How easy it is for someone new to understand and start.

Yeni biri için anlamanın ve başlamanın ne kadar kolay olduğu.

Score = 100 × Σ(weight × value) / Σ(weight). Value is 0–1 per check.

| Check / Kontrol | Weight | How to fix | Nasıl düzelir |
|---|---|---|---|
| `docs.readme` README length characters / README uzunluğu karakter | 1.5 | Expand the README: what the project does, how to install and run it, and how it's organised. | README'yi genişlet: proje ne yapıyor, nasıl kurulur ve çalıştırılır, nasıl düzenlenmiş. |
| `docs.install` README explains how to start / README nasıl başlanacağını anlatıyor | 1 | Add an "Install" and "Usage" section to the README with the exact commands. | README'ye tam komutlarla bir "Kurulum" ve "Kullanım" bölümü ekle. |
| `docs.license` License / Lisans | 0.5 | Add a LICENSE file so others know how they may use the code. | Başkaları kodu nasıl kullanabileceğini bilsin diye bir LICENSE dosyası ekle. |
| `docs.envExample` .env.example for settings / Ayarlar için .env.example | 1 | Add a .env.example listing every environment variable the code reads, with empty or sample values. | Kodun okuduğu her ortam değişkenini boş veya örnek değerlerle listeleyen bir .env.example ekle. |
| `docs.any` Any documentation / Herhangi bir doküman | 1 | Add at least a README describing the project. | En azından projeyi anlatan bir README ekle. |

Checks named `tool.*` only count after you run the project's own tools (Sections → Run the project's own checks), for two weeks.
