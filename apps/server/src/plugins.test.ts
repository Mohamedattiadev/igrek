import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./db";
import { Plugins, readManifest, shellLine } from "./plugins";

function pluginDir(manifest: object, files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "godeye-plugin-"));
  writeFileSync(join(dir, "igrek-plugin.json"), JSON.stringify(manifest));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

describe("plugins", () => {
  test("manifests keep only known permissions and safe entries", () => {
    const m = readManifest(
      pluginDir({
        id: "stats",
        name: "Stats",
        permissions: ["projects:read", "write:all"],
        panels: [
          { id: "a", title: "A", entry: "a.html" },
          { id: "b", entry: "../../etc/passwd.html" },
          { id: "c", entry: "c.js" },
        ],
        commands: [
          { id: "loc", title: "Lines", run: ["wc", "-l"] },
          { id: "bad", run: "rm -rf /" },
        ],
      }),
    );
    expect(m.permissions).toEqual(["projects:read"]);
    expect(m.panels.map((p) => p.id)).toEqual(["a"]);
    expect(m.commands.map((c) => c.id)).toEqual(["loc"]);
    expect(() => readManifest(pluginDir({ id: "Bad Id!", name: "x" }))).toThrow();
    expect(shellLine(["git", "log", "--format=%h %s", "it's"])).toBe(`git log '--format=%h %s' 'it'\\''s'`);
  });

  test("installed off; files served only when on and only from the plugin's folder", async () => {
    const { sqlite } = openDb(":memory:");
    const home = mkdtempSync(join(tmpdir(), "godeye-plugins-"));
    const plugins = new Plugins(sqlite, home);
    const src = pluginDir(
      { id: "hello", name: "Hello", panels: [{ id: "p", entry: "p.html" }] },
      { "p.html": "<p>hi</p>" },
    );
    mkdirSync(join(src, "node_modules"));
    writeFileSync(join(src, "node_modules", "big.js"), "x");
    const p = await plugins.install(src);
    expect(p.enabled).toBe(false);
    expect(plugins.file("hello", "p.html")).toBeUndefined();
    plugins.setEnabled("hello", true);
    expect(plugins.file("hello", "p.html")).toBe(join(home, "hello", "p.html"));
    expect(plugins.file("hello", "../../etc/passwd")).toBeUndefined();
    expect(plugins.file("hello", "node_modules/big.js")).toBeUndefined();
    expect(plugins.allows("hello", "memory:read")).toBe(false);
    await expect(plugins.install("relative/path")).rejects.toThrow();
    plugins.remove("hello");
    expect(plugins.list()).toEqual([]);
  });
});
