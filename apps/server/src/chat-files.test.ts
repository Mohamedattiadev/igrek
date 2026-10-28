import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatFiles, MAX_FILE } from "./chat-files";

const folder = () => new ChatFiles(mkdtempSync(join(tmpdir(), "igrek-files-")));

describe("chat files", () => {
  test("a file is kept by its hash, once; its parts put back together in any order make it again", () => {
    const here = folder();
    const bytes = new Uint8Array(700_000).map((_, i) => i % 251);
    const sent = here.save(bytes, "../../etc/report.pdf", "Application/PDF; charset=x");
    expect(sent).toMatchObject({ name: ".._.._etc_report.pdf", size: 700_000, type: "application/pdf" });
    expect(here.save(bytes, "again.pdf", "application/pdf").hash).toBe(sent.hash);
    const parts = here.parts(sent.hash);
    expect(parts).toHaveLength(3);
    const there = folder();
    // Out of order, and one part twice: it is whole only after the last missing one.
    expect(there.receivePart({ hash: sent.hash, i: 2, n: 3, data: parts[2] ?? "" })).toBe(false);
    expect(there.receivePart({ hash: sent.hash, i: 0, n: 3, data: parts[0] ?? "" })).toBe(false);
    expect(there.receivePart({ hash: sent.hash, i: 0, n: 3, data: parts[0] ?? "" })).toBe(false);
    expect(there.receivePart({ hash: sent.hash, i: 1, n: 3, data: parts[1] ?? "" })).toBe(true);
    expect(there.read(sent.hash)).toEqual(bytes);
  });

  test("parts that do not make up the file their hash names are thrown away; odd numbers are refused", () => {
    const there = folder();
    const hash = "a".repeat(64);
    expect(there.receivePart({ hash, i: 0, n: 1, data: Buffer.from("not it").toString("base64") })).toBe(false);
    expect(there.has(hash)).toBe(false);
    expect(there.receivePart({ hash, i: 5, n: 2, data: "" })).toBe(false);
    expect(there.receivePart({ hash: "../x", i: 0, n: 1, data: "" })).toBe(false);
    expect(there.receivePart({ hash, i: 0, n: 100_000, data: "" })).toBe(false);
  });

  test("too big or empty is refused; only pictures and voice show in the page", () => {
    expect(() => folder().save(new Uint8Array(MAX_FILE + 1), "big.bin", "")).toThrow(/10 MB/);
    expect(() => folder().save(new Uint8Array(0), "empty", "")).toThrow(/empty/);
    expect(ChatFiles.inline("image/png")).toBe(true);
    expect(ChatFiles.inline("audio/webm")).toBe(true);
    expect(ChatFiles.inline("text/html")).toBe(false);
    expect(ChatFiles.inline("image/svg+xml")).toBe(false);
  });
});
