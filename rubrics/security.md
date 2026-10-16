# Security / Güvenlik

Secrets, risky code and what could leak.

Sırlar, riskli kod ve sızabilecek şeyler.

Score = 100 × Σ(weight × value) / Σ(weight). Value is 0–1 per check.

| Check / Kontrol | Weight | How to fix | Nasıl düzelir |
|---|---|---|---|
| `sec.envTracked` .env files kept out of git / .env dosyaları git'te değil | 3 | Remove the listed .env files from git (git rm --cached), add .env to .gitignore, and change every secret that was in them. | Listelenen .env dosyalarını git'ten çıkar (git rm --cached), .gitignore'a .env ekle ve içindeki tüm sırları değiştir. |
| `sec.secrets` Keys or passwords in the code / Kodda anahtar veya şifre | 3 | Move the secrets found in the listed lines to environment variables, and change (rotate) those keys, since they were committed. | Listelenen satırlardaki sırları ortam değişkenlerine taşı ve commit edildikleri için o anahtarları değiştir. |
| `sec.publicKeys` Public client keys to restrict / Kısıtlanması gereken açık anahtarlar | 0.5 | These Google/Firebase client keys are public by design; make sure each one is restricted (app, website and API restrictions) in Google Cloud Console. | Bu Google/Firebase istemci anahtarları zaten herkese açık olacak şekilde tasarlandı; Google Cloud Console'da her birinin kısıtlı olduğundan emin ol (uygulama, site ve API kısıtları). |
| `sec.gitignoreEnv` .env is in .gitignore / .env, .gitignore'da | 1 | Add .env (and .env.*, except examples) to .gitignore. | .gitignore'a .env (ve örnekler hariç .env.*) ekle. |
| `sec.dangerous` Risky code patterns / Riskli kod kalıpları | 1.5 | Review the listed eval, innerHTML, shell commands built from strings and similar: replace them with safe alternatives or sanitize the input. | Listelenen eval, innerHTML, metinden kurulan shell komutları gibi yerleri incele: güvenli alternatiflerle değiştir veya girdiyi temizle. |
| `tool.auditSecurity` Serious vulnerabilities in dependencies / Bağımlılıklarda ciddi açıklar | 1 | Update the packages with critical or high vulnerabilities now. | Kritik veya yüksek açığı olan paketleri hemen güncelle. |

Checks named `tool.*` only count after you run the project's own tools (Sections → Run the project's own checks), for two weeks.
