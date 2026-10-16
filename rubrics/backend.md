# Backend / Backend

The server side: APIs, business rules and how requests are handled.

Sunucu tarafı: API'ler, iş kuralları ve isteklerin nasıl işlendiği.

Score = 100 × Σ(weight × value) / Σ(weight). Value is 0–1 per check.

| Check / Kontrol | Weight | How to fix | Nasıl düzelir |
|---|---|---|---|
| `be.validation` Input validation / Girdi doğrulama | 1.5 | Validate request bodies and parameters with a schema library (for example zod or valibot; pydantic in Python) at the API boundary. | API girişinde istek gövdesini ve parametreleri bir şema kütüphanesiyle doğrula (örneğin zod veya valibot; Python'da pydantic). |
| `be.rateLimit` Rate limiting / İstek sınırlama | 1 | Add rate limiting to login and other expensive or public endpoints. | Giriş ve diğer pahalı veya herkese açık endpoint'lere istek sınırı (rate limit) ekle. |
| `be.emptyCatch` Errors silently swallowed / Sessizce yutulan hatalar | 1 | In the listed places, handle or log the error instead of ignoring it with an empty catch. | Listelenen yerlerde boş catch ile hatayı yok saymak yerine işle ya da logla. |

Checks named `tool.*` only count after you run the project's own tools (Sections → Run the project's own checks), for two weeks.
