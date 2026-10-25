import { describe, expect, test } from "bun:test";
import { APP_VERSION } from "@igrek/core";
import { reportText, scrub } from "./report";

describe("report a problem", () => {
  test("private details, keys and the home folder are taken out", () => {
    const text = scrub(
      "open /home/ayse/projects/shop failed\nIBAN TR330006100519786457841326 for Ayşe Yılmaz\napi_key=sk-ant-abcdefghijklmnopqrstuvwxyz123456\nAuthorization: Bearer abcdefghijklmnop1234567890",
      [{ name: "name", value: "Ayşe Yılmaz" }],
      "/home/ayse",
    );
    expect(text).toContain("open ~/projects/shop failed");
    expect(text).not.toContain("TR33");
    expect(text).not.toContain("Ayşe Yılmaz");
    expect(text).not.toContain("sk-ant-abcdefghijklmnop");
    expect(text).not.toContain("abcdefghijklmnop1234567890");
  });

  test("the report has the version, the system and the recent log, and keeps only the last lines", () => {
    const log = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    const text = reportText({ platform: "linux", arch: "x64", runtime: "Bun 1.4.3", desktop: true }, log, []);
    expect(text).toContain(`Igrek ${APP_VERSION}, desktop app, linux x64, Bun 1.4.3`);
    expect(text).toContain("line 99");
    expect(text).not.toContain("line 39\n");
  });
});
