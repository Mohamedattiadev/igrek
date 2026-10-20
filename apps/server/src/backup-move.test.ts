import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMovedIn, exportDataFolder, movedInWaiting, stageDataFolder } from "./backup-move";

/** A data folder with a database, a library file, and the parts that must stay on their computer. */
function dataFolder(label: string) {
  const root = mkdtempSync(join(tmpdir(), "igrek-move-test-"));
  const dir = join(root, ".igrek");
  mkdirSync(join(dir, "library"), { recursive: true });
  mkdirSync(join(dir, "accounts", "a1"), { recursive: true });
  writeFileSync(join(dir, "library", "book.txt"), `${label} book`);
  writeFileSync(join(dir, "accounts", "a1", "token"), `${label} login`);
  writeFileSync(join(dir, "vault.key"), `${label} vault`);
  writeFileSync(join(dir, "session.key"), `${label} session`);
  const sqlite = new Database(join(dir, "igrek.db"));
  sqlite.run("CREATE TABLE notes (text TEXT)");
  sqlite.run("INSERT INTO notes VALUES (?)", [`${label} note`]);
  return { dir, sqlite };
}

describe("moving Igrek to another computer", () => {
  test("the folder travels in one locked file and takes over at the next start, logins stay", async () => {
    const from = dataFolder("old computer");
    const file = await exportDataFolder(from.dir, from.sqlite, "correct horse");
    expect(new TextDecoder().decode(file)).not.toContain("old computer note");

    const to = dataFolder("new computer");
    to.sqlite.close();
    await stageDataFolder(to.dir, file, "correct horse");
    expect(movedInWaiting(to.dir)).toBe(true);
    const kept = applyMovedIn(to.dir, 1);

    const moved = new Database(join(to.dir, "igrek.db"));
    expect(moved.query("SELECT text FROM notes").get()).toEqual({ text: "old computer note" });
    expect(readFileSync(join(to.dir, "library", "book.txt"), "utf8")).toBe("old computer book");
    expect(readFileSync(join(to.dir, "vault.key"), "utf8")).toBe("old computer vault");
    // This computer's own logins and browser session come along; the replaced folder is kept.
    expect(readFileSync(join(to.dir, "accounts", "a1", "token"), "utf8")).toBe("new computer login");
    expect(readFileSync(join(to.dir, "session.key"), "utf8")).toBe("new computer session");
    expect(kept && existsSync(join(kept, "igrek.db"))).toBe(true);
    expect(movedInWaiting(to.dir)).toBe(false);
  });

  test("a wrong password or another file is refused and nothing is staged", async () => {
    const from = dataFolder("a");
    const file = await exportDataFolder(from.dir, from.sqlite, "correct horse");
    const to = dataFolder("b");
    await expect(stageDataFolder(to.dir, file, "wrong password")).rejects.toThrow("Wrong password");
    await expect(stageDataFolder(to.dir, new TextEncoder().encode("{}"), "x")).rejects.toThrow(
      "not an Igrek move file",
    );
    expect(movedInWaiting(to.dir)).toBe(false);
    expect(applyMovedIn(to.dir)).toBeUndefined();
  });

  test("a short password is not accepted", async () => {
    const from = dataFolder("a");
    await expect(exportDataFolder(from.dir, from.sqlite, "short")).rejects.toThrow("at least 8");
  });
});
