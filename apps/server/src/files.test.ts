import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Files } from "./files";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "godeye-files-"));
  const outside = mkdtempSync(join(tmpdir(), "godeye-outside-"));
  writeFileSync(join(outside, "secret.txt"), "nope");
  const files = new Files(() => [root], join(mkdtempSync(join(tmpdir(), "godeye-trash-")), "trash"));
  return { root, outside, files };
}

describe("file access", () => {
  test("stays inside allowed folders, even through ../ and symlinks", () => {
    const { root, outside, files } = setup();
    expect(() => files.read(join(root, "..", outside.split("/").pop() ?? "", "secret.txt"))).toThrow(/Outside/);
    symlinkSync(outside, join(root, "link"));
    expect(() => files.read(join(root, "link", "secret.txt"))).toThrow(/Outside/);
  });

  test("never opens protected places like ~/.ssh", () => {
    const files = new Files(() => [homedir()], join(mkdtempSync(join(tmpdir(), "godeye-trash-")), "trash"));
    expect(() => files.list(join(homedir(), ".ssh"))).toThrow(/protected/);
  });

  test("reads text, flags binary, and refuses to overwrite a file that changed meanwhile", () => {
    const { root, files } = setup();
    writeFileSync(join(root, "a.ts"), "let x = 1;");
    writeFileSync(join(root, "img.bin"), Buffer.from([0, 1, 2, 3]));
    const text = files.read(join(root, "a.ts"));
    expect(text.kind).toBe("text");
    expect(files.read(join(root, "img.bin")).kind).toBe("binary");

    utimesSync(join(root, "a.ts"), new Date(), new Date(Date.now() + 5000));
    expect(() => files.write(join(root, "a.ts"), "let x = 2;", text.mtime)).toThrow(/changed on disk/);
    files.write(join(root, "a.ts"), "let x = 3;");
    expect(readFileSync(join(root, "a.ts"), "utf8")).toBe("let x = 3;");
  });

  test("delete goes to the trash and can be restored", () => {
    const { root, files } = setup();
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "note.md"), "hi");
    const item = files.trash(join(root, "docs"));
    expect(existsSync(join(root, "docs"))).toBe(false);
    expect(files.listTrash().map((t) => t.id)).toContain(item.id);
    files.restore(item.id);
    expect(readFileSync(join(root, "docs", "note.md"), "utf8")).toBe("hi");
  });

  test("finds files by name", () => {
    const { root, files } = setup();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "LoginPage.tsx"), "");
    expect(files.search(root, "login").map((h) => h.path)).toEqual([join(root, "src", "LoginPage.tsx")]);
  });
});
