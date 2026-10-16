# Database / Veritabanı

Where data is stored: tables, migrations and queries.

Verinin saklandığı yer: tablolar, migration'lar ve sorgular.

Score = 100 × Σ(weight × value) / Σ(weight). Value is 0–1 per check.

| Check / Kontrol | Weight | How to fix | Nasıl düzelir |
|---|---|---|---|
| `db.migrations` Database migrations / Veritabanı migration'ları | 1.5 | Manage schema changes with versioned migrations instead of changing tables by hand. | Tablo değişikliklerini elle yapmak yerine sürümlü migration'larla yönet. |
| `db.injection` Queries built from strings / Metinle kurulan sorgular | 2 | In the listed queries, pass values as bound parameters instead of inserting them with ${...} (SQL injection risk). | Listelenen sorgularda değerleri ${...} ile eklemek yerine parametre olarak geçir (SQL injection riski). |

Checks named `tool.*` only count after you run the project's own tools (Sections → Run the project's own checks), for two weeks.
