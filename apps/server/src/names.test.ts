import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hooksInstalled, installHooks, uninstallHooks } from "./hooks";
import { currentToolName, databaseFile, defaultDataDir, envValue } from "./names";
import { readManifest } from "./plugins";

const temp = (name: string) => mkdtempSync(join(tmpdir(), `igrek-${name}-`));

describe("rename from God Eye to Igrek", () => {
  test("the new variable wins, the old one is still read", () => {
    expect(envValue({ IGREK_PORT: "1", GODEYE_PORT: "2" }, "PORT")).toBe("1");
    expect(envValue({ GODEYE_PORT: "2" }, "PORT")).toBe("2");
    expect(envValue({}, "PORT")).toBeUndefined();
  });

  test("~/.godeye moves to ~/.igrek with its data, and a link stays at the old path", () => {
    const home = temp("home");
    mkdirSync(join(home, ".godeye"));
    writeFileSync(join(home, ".godeye", "session.key"), "secret");

    // A second process (the MCP server) does not move anything.
    expect(defaultDataDir(home)).toBe(join(home, ".godeye"));
    expect(existsSync(join(home, ".igrek"))).toBe(false);

    expect(defaultDataDir(home, true)).toBe(join(home, ".igrek"));
    expect(readFileSync(join(home, ".igrek", "session.key"), "utf8")).toBe("secret");
    expect(lstatSync(join(home, ".godeye")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(home, ".godeye", "session.key"), "utf8")).toBe("secret");
    // Later starts just use the new folder.
    expect(defaultDataDir(home, true)).toBe(join(home, ".igrek"));
    expect(defaultDataDir(home)).toBe(join(home, ".igrek"));
  });

  test("a fresh install uses ~/.igrek, and an existing ~/.igrek is never overwritten", () => {
    const fresh = temp("fresh");
    expect(defaultDataDir(fresh, true)).toBe(join(fresh, ".igrek"));
    expect(existsSync(join(fresh, ".godeye"))).toBe(false);

    const both = temp("both");
    mkdirSync(join(both, ".godeye"));
    mkdirSync(join(both, ".igrek"));
    writeFileSync(join(both, ".igrek", "keep"), "new");
    expect(defaultDataDir(both, true)).toBe(join(both, ".igrek"));
    expect(readFileSync(join(both, ".igrek", "keep"), "utf8")).toBe("new");
    expect(lstatSync(join(both, ".godeye")).isDirectory()).toBe(true);
  });

  test("godeye.db and its log files become igrek.db", () => {
    const dir = temp("db");
    for (const suffix of ["", "-wal", "-shm"]) writeFileSync(join(dir, `godeye.db${suffix}`), suffix || "main");
    expect(databaseFile(dir)).toBe(join(dir, "igrek.db"));
    expect(readFileSync(join(dir, "igrek.db"), "utf8")).toBe("main");
    expect(readFileSync(join(dir, "igrek.db-wal"), "utf8")).toBe("-wal");
    expect(existsSync(join(dir, "godeye.db"))).toBe(false);
    // Already moved: nothing more happens.
    expect(databaseFile(dir)).toBe(join(dir, "igrek.db"));
  });

  test("old MCP tool names still answer", () => {
    expect(currentToolName("godeye_search")).toBe("igrek_search");
    expect(currentToolName("igrek_search")).toBe("igrek_search");
    expect(currentToolName("library_search")).toBe("library_search");
  });

  test("hooks installed under the old name are replaced, not doubled", () => {
    const project = temp("hooks");
    mkdirSync(join(project, ".claude"));
    const file = join(project, ".claude", "settings.local.json");
    const old = (arg: string) => ({
      hooks: [{ type: "command", command: `/home/u/.godeye/bin/godeye-hook.sh ${arg}` }],
    });
    writeFileSync(
      file,
      JSON.stringify({ hooks: { SessionStart: [old("session-start")], SessionEnd: [old("session-end")] } }),
    );
    expect(hooksInstalled(project)).toBe(true);

    installHooks(project, "/home/u/.igrek/bin/igrek-hook.sh");
    const hooks = JSON.parse(readFileSync(file, "utf8")).hooks;
    expect(hooks.SessionStart).toHaveLength(1);
    expect(hooks.SessionStart[0].hooks[0].command).toBe("/home/u/.igrek/bin/igrek-hook.sh session-start");
    expect(hooks.UserPromptSubmit).toHaveLength(1);

    writeFileSync(file, JSON.stringify({ hooks: { SessionStart: [old("session-start")] } }));
    uninstallHooks(project);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({});
  });

  test("a plugin with the old manifest name still loads", () => {
    const dir = temp("plugin");
    writeFileSync(join(dir, "godeye-plugin.json"), JSON.stringify({ id: "old-one", name: "Old one" }));
    expect(readManifest(dir).id).toBe("old-one");
  });
});
