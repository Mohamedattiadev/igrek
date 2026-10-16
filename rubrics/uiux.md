# UI / UX / Arayüz / Deneyim

How it looks and feels: themes, small screens, accessibility.

Nasıl görünüyor ve hissettiriyor: temalar, küçük ekranlar, erişilebilirlik.

Score = 100 × Σ(weight × value) / Σ(weight). Value is 0–1 per check.

| Check / Kontrol | Weight | How to fix | Nasıl düzelir |
|---|---|---|---|
| `ux.dark` Dark mode / Koyu tema | 1 | Add a dark theme that follows the system setting (prefers-color-scheme) using shared color variables. | Ortak renk değişkenleriyle, sistem ayarını (prefers-color-scheme) izleyen bir koyu tema ekle. |
| `ux.responsive` Works on small screens / Küçük ekranlarda çalışıyor | 1 | Make the layout responsive with breakpoints so it works on phones and narrow windows. | Düzeni breakpoint'lerle duyarlı yap; telefonlarda ve dar pencerelerde de çalışsın. |
| `ux.alt` Images without alt text / Alt metni olmayan görseller | 1.5 | Add meaningful alt text to the listed images (alt="" for purely decorative ones). | Listelenen görsellere anlamlı alt metni ekle (sadece süs olanlara alt=""). |
| `ux.focus` Visible keyboard focus / Görünür klavye odağı | 1 | Add clear :focus-visible styles so keyboard users can see where they are. | Klavye kullananlar nerede olduklarını görsün diye belirgin :focus-visible stilleri ekle. |

Checks named `tool.*` only count after you run the project's own tools (Sections → Run the project's own checks), for two weeks.
