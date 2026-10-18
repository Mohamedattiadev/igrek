import { describe, expect, test } from "bun:test";
import { copyOldKeys } from "./storage-rename";

function memoryStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("settings saved under the old name", () => {
  test("are copied to the new names once, and the old ones stay", () => {
    const storage = memoryStorage({
      "godeye.zen": "1",
      "godeye.panel.chat": "320",
      godeyeReportHeight: "200",
      "other.key": "x",
    });
    expect(copyOldKeys(storage)).toBe(3);
    expect(storage.getItem("igrek.zen")).toBe("1");
    expect(storage.getItem("igrek.panel.chat")).toBe("320");
    expect(storage.getItem("igrekReportHeight")).toBe("200");
    expect(storage.getItem("godeye.zen")).toBe("1");
    expect(storage.getItem("igrek.other.key")).toBeNull();

    // A later change under the new name is not overwritten by a second run.
    storage.setItem("igrek.zen", "0");
    expect(copyOldKeys(storage)).toBe(0);
    expect(storage.getItem("igrek.zen")).toBe("0");
  });

  test("a value already saved under the new name wins", () => {
    const storage = memoryStorage({ "godeye.costCurrency": "EUR", "igrek.costCurrency": "TRY" });
    expect(copyOldKeys(storage)).toBe(0);
    expect(storage.getItem("igrek.costCurrency")).toBe("TRY");
  });
});
