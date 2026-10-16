# DevOps / DevOps

Building, shipping and running it: Docker, CI and deployment.

Derleme, yayınlama ve çalıştırma: Docker, CI ve deploy.

Score = 100 × Σ(weight × value) / Σ(weight). Value is 0–1 per check.

| Check / Kontrol | Weight | How to fix | Nasıl düzelir |
|---|---|---|---|
| `ops.ci` Automatic checks on every push (CI) / Her push'ta otomatik kontrol (CI) | 1.5 | Add a CI workflow (for example GitHub Actions) that installs, lints, type-checks and runs the tests on every push. | Her push'ta kurulum, lint, tip kontrolü ve testleri çalıştıran bir CI akışı ekle (örneğin GitHub Actions). |
| `ops.dockerUser` Containers don't run as root / Container'lar root olarak çalışmıyor | 1 | Add a non-root USER to the listed Dockerfiles. | Listelenen Dockerfile'lara root olmayan bir USER ekle. |
| `ops.dockerignore` .dockerignore present / .dockerignore var | 0.5 | Add a .dockerignore that leaves out node_modules, .git, build output and .env files. | node_modules, .git, build çıktıları ve .env dosyalarını dışarıda bırakan bir .dockerignore ekle. |
| `ops.healthcheck` Health check / Sağlık kontrolü | 0.5 | Add a HEALTHCHECK to the Dockerfile (or healthcheck in compose) so broken containers are noticed. | Bozulan container fark edilsin diye Dockerfile'a HEALTHCHECK (veya compose'a healthcheck) ekle. |
| `ops.pinned` Base images without a fixed version / Sürümü sabit olmayan imajlar | 1 | Pin the listed base images to a specific version instead of :latest or no tag. | Listelenen base imajları :latest veya etiketsiz yerine belirli bir sürüme sabitle. |

Checks named `tool.*` only count after you run the project's own tools (Sections → Run the project's own checks), for two weeks.
