import { describe, expect, test } from "bun:test";
import { type PlaybookKind, playbookFor, playbookText } from "@igrek/core";

/** Requests people type, Turkish and English, each with the kind of task it is. */
const CASES: [string, PlaybookKind][] = [
  // bugs
  ["Fix the login bug", "bug"],
  ["The checkout page crashes when the cart is empty", "bug"],
  ["Search doesn't work on mobile", "bug"],
  ["Totals are wrong result after a discount", "bug"],
  ["Uploading a PDF throws an exception", "bug"],
  ["The tests are failing since yesterday", "bug"],
  ["Profile page shows a blank page", "bug"],
  ["Giriş sayfasındaki hatayı düzelt", "bug"],
  ["Sepet boşken ödeme sayfası çöküyor", "bug"],
  ["Mobilde arama çalışmıyor", "bug"],
  ["İndirim sonrası toplam yanlış hesaplıyor", "bug"],
  ["Kaydet düğmesine basınca uygulama patlıyor", "bug"],
  ["Ayarlar sayfası açılmıyor", "bug"],
  ["Menüdeki logo görünmüyor", "bug"],
  ["Bildirimlerde bir sorun var", "bug"],
  // performance
  ["The dashboard is slow to load", "perf"],
  ["Speed up the product list", "perf"],
  ["There is a memory leak in the editor", "perf"],
  ["Search takes too long with 10k items", "perf"],
  ["Optimize the image upload", "perf"],
  ["Fix the slow orders query", "perf"],
  ["Ana sayfa çok yavaş açılıyor", "perf"],
  ["Ürün listesini hızlandır", "perf"],
  ["Düzenleyicide bellek sızıntısı var", "perf"],
  ["Rapor oluşturmak çok uzun sürüyor", "perf"],
  ["Kaydırırken sayfa kasıyor", "perf"],
  ["Sorguları optimize et", "perf"],
  // refactors
  ["Refactor the payment module", "refactor"],
  ["Clean up the auth code", "refactor"],
  ["Split the big settings component", "refactor"],
  ["Extract a hook for the form state", "refactor"],
  ["Rename getData to loadOrders everywhere", "refactor"],
  ["Simplify the routing", "refactor"],
  ["Ödeme modülünü yeniden düzenle", "refactor"],
  ["Kodu temizle, çok dağınık", "refactor"],
  ["Ayarlar bileşenini sadeleştir", "refactor"],
  ["getData'yı her yerde yeniden adlandır", "refactor"],
  ["Form mantığını ayrı fonksiyona al", "refactor"],
  // features
  ["Add a cart page to the shop", "feature"],
  ["Build a dark mode toggle", "feature"],
  ["Implement password reset", "feature"],
  ["Create an admin dashboard", "feature"],
  ["New page for the blog archive", "feature"],
  ["Let users export their data as CSV", "feature"],
  ["Mağazaya sepet sayfası ekle", "feature"],
  ["Karanlık mod oluştur", "feature"],
  ["Şifre sıfırlama özelliği yap", "feature"],
  ["Blog arşivi için yeni sayfa", "feature"],
  ["Bir yönetim paneli geliştir", "feature"],
  ["Uygulamaya Türkçe desteği getir", "feature"],
];

/** Questions and chat: not tasks, so no way of working is added. */
const NONE = [
  "How does the login work?",
  "What is a lockfile?",
  "Why was this built with Redux?",
  "Explain the payment flow",
  "Tell me what changed today",
  "Is there a test for the cart?",
  "Thanks, looks good",
  "Lockfile nedir?",
  "Giriş nasıl çalışıyor?",
  "Ödeme akışını açıkla",
  "Bugün ne değişti, anlat",
  "Neden Redux kullanılmış?",
  "Sepet için test var mı?",
  "Teşekkürler, güzel olmuş",
  "",
];

describe("the kind of task, for its way of working", () => {
  test.each(CASES)("%s -> %s", (text, kind) => {
    expect(playbookFor(text)).toBe(kind);
  });

  test.each(NONE)("no playbook for: %s", (text) => {
    expect(playbookFor(text)).toBeUndefined();
  });

  test("every way of working says the goal back first and lists the decisions last", () => {
    for (const kind of ["bug", "perf", "refactor", "feature"] as const) {
      const text = playbookText(kind);
      expect(text.startsWith("## How to work\n1. Before changing anything, say the goal back")).toBe(true);
      expect(text.trim().endsWith("so they can be checked.")).toBe(true);
    }
    expect(playbookText("bug")).toContain("Reproduce it first");
    expect(playbookText("perf")).toContain("Measure first");
  });
});
