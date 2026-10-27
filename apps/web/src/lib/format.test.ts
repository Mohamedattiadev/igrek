import { expect, test } from "bun:test";
import { firstSentence } from "./format";

test("a card shows one whole sentence, not text cut off in the middle", () => {
  expect(
    firstSentence(
      "Kartlardaki ilaç ve aşı notlarını ayıkladım: 34 dönemde 98 uygulama, toplam 142 gün. Okunamayan isimler ayrı listede.",
    ),
  ).toBe("Kartlardaki ilaç ve aşı notlarını ayıkladım: 34 dönemde 98 uygulama, toplam 142 gün.");
  expect(firstSentence("Released 0.1.11 with reactions")).toBe("Released 0.1.11 with reactions");
  expect(firstSentence("Fixed it!\n\nThen more")).toBe("Fixed it!");
  const long = firstSentence(`${"word ".repeat(60)}end.`);
  expect(long.length).toBeLessThanOrEqual(160);
  expect(long.endsWith("...")).toBe(true);
});
