import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fillPrivate, findPrivateShapes, hidePrivate, isIban, isTcKimlik, placeholdersIn } from "@igrek/core";
import { openDb } from "./db";
import { PrivateValues } from "./private-values";
import { Sealer } from "./seal";

const values = [
  { name: "tc_kimlik", value: "10000000146" },
  { name: "iban", value: "TR33 0006 1005 1978 6457 8413 26" },
  { name: "ogrenci_no", value: "B201210045" },
];

describe("private details", () => {
  test("a saved value becomes its placeholder, in whatever spacing it was typed", () => {
    const { text, hidden } = hidePrivate("TC: 10000000146, IBAN TR330006100519786457841326, no b201210045", values);
    expect(text).toBe("TC: [[private:tc_kimlik]], IBAN [[private:iban]], no [[private:ogrenci_no]]");
    expect(hidden.sort()).toEqual(["iban", "ogrenci_no", "tc_kimlik"]);
  });

  test("placeholders go back to the values only here, and unknown ones stay", () => {
    expect(fillPrivate("[[private:tc_kimlik]] / [[private:other]]", values)).toBe("10000000146 / [[private:other]]");
    expect(placeholdersIn("a [[private:iban]] b [[private:iban]]")).toEqual(["iban"]);
  });

  test("identity numbers, IBANs and cards are recognised by their check digits, not by length alone", () => {
    expect(isTcKimlik("10000000146")).toBe(true);
    expect(isTcKimlik("12345678901")).toBe(false);
    expect(isIban("TR33 0006 1005 1978 6457 8413 26")).toBe(true);
    expect(isIban("TR33 0006 1005 1978 6457 8413 27")).toBe(false);
    const found = findPrivateShapes("Kimlik 10000000146, kart 4111 1111 1111 1111, sipariş 12345678901");
    expect(found.map((f) => f.kind)).toEqual(["tcKimlik", "card"]);
  });
});

describe("private details kept by Igrek", () => {
  test("saved sealed, listed without the value, and opened again after a restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igrek-private-"));
    const { sqlite } = openDb(":memory:");
    const first = new PrivateValues(sqlite, new Sealer(dir));
    await first.ready;
    const listed = await first.save({
      name: "tc_kimlik",
      label: "T.C. kimlik",
      kind: "identity",
      value: "10000000146",
    });
    expect(listed).toEqual([
      { name: "tc_kimlik", label: "T.C. kimlik", kind: "identity", createdAt: expect.any(Number) },
    ]);
    const row = sqlite.query("SELECT value FROM private_values").get() as { value: string };
    expect(row.value).not.toContain("10000000146");
    const again = new PrivateValues(sqlite, new Sealer(dir));
    await again.ready;
    expect(again.values()).toEqual([{ name: "tc_kimlik", value: "10000000146" }]);
    // A new label keeps the value; a bad name is refused.
    await again.save({ name: "tc_kimlik", label: "Kimlik", kind: "identity" });
    expect(again.values()[0]?.value).toBe("10000000146");
    await expect(again.save({ name: "TC Kimlik", value: "x123" })).rejects.toThrow();
  });
});
