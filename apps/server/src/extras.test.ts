import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SETTINGS, type EmbedderStatus } from "@igrek/core";
import { Backups } from "./backup";
import { Bus, StopRegistry } from "./bus";
import { openDb } from "./db";
import type { Embed } from "./embedder";
import { type AgentRun, Flows } from "./flows";
import { Lessons } from "./lessons";
import { Library } from "./library";
import { Personas } from "./personas";
import { Store } from "./store";
import { createProject } from "./templates";

const offline: Embed = {
  status: (): EmbedderStatus => ({ state: "missing", model: "x", sizeMb: 1 }),
  ready: () => false,
  embed: async () => [],
};

function world() {
  const { sqlite } = openDb(":memory:");
  const store = new Store(sqlite);
  const dir = mkdtempSync(join(tmpdir(), "godeye-extra-"));
  const bus = new Bus();
  const library = new Library(sqlite, bus, join(dir, ".lib"), offline);
  const lessons = new Lessons(
    sqlite,
    store,
    bus,
    new StopRegistry(),
    () => DEFAULT_SETTINGS,
    dir,
    library,
    offline,
    async () => "",
  );
  return { sqlite, store, dir, bus, library, lessons };
}

describe("backup", () => {
  test("a locked backup opens only with its password and restores what is missing", async () => {
    const a = world();
    const projectId = a.store.addProject(a.dir);
    a.store.addMemory(projectId, "decision", "Use SQLite for local data");
    await a.lessons.add({ projectId, title: "Forgot the PATH", prevent: "Export PATH before the tests." });
    a.library.upsertText({
      id: "note-1",
      kind: "note",
      title: "Release checklist",
      text: "Run the tests, then tag the release and write the notes.",
    });
    await a.library.idle();
    const file = await new Backups(a.sqlite).export("correct horse");
    expect(file.encrypted).toBe(true);
    expect(JSON.stringify(file)).not.toContain("SQLite");

    const b = world();
    b.sqlite.query("INSERT INTO projects (id, name, path, created_at) VALUES (?, 'x', ?, 0)").run(projectId, b.dir);
    const backups = new Backups(b.sqlite);
    await expect(backups.restore(file, "wrong")).rejects.toThrow("Wrong password");
    const added = await backups.restore(file, "correct horse");
    expect(added.memory_items).toBe(1);
    expect(added.lessons).toBe(1);
    expect(added.library_chunks).toBeGreaterThan(0);
    expect((await b.library.search("tag the release"))[0]?.title).toBe("Release checklist");
    // Restoring twice adds nothing.
    expect((await backups.restore(file, "correct horse")).memory_items).toBe(0);
  });
});

describe("project templates", () => {
  test("a new project carries your conventions and lessons, and the team starts on the skeleton", async () => {
    const w = world();
    const other = w.store.addProject(w.dir);
    w.store.addMemory(other, "convention", "All UI texts go through i18n");
    const l = await w.lessons.add({
      projectId: other,
      title: "Grid overflow",
      prevent: "Use minmax(0,1fr) for grid columns.",
    });
    w.lessons.makeRule(l.id, "project", () => undefined);
    const personas = new Personas(w.sqlite, w.store, w.bus, new StopRegistry(), () => DEFAULT_SETTINGS, w.dir);
    let asked = "";
    const agent: AgentRun = async ({ prompt }) => {
      asked = prompt;
      return "done";
    };
    const flows = new Flows(
      w.sqlite,
      w.store,
      w.bus,
      new StopRegistry(),
      personas,
      mkdtempSync(join(tmpdir(), "godeye-wts-")),
      agent,
      async () => [],
    );
    const home = mkdtempSync(join(tmpdir(), "godeye-home-"));
    const made = createProject(
      { store: w.store, flows, lessons: w.lessons },
      { name: "shop", parent: home, template: "saas", details: "Sells flowers" },
      home,
    );
    const guide = readFileSync(join(made.path, "CLAUDE.md"), "utf8");
    expect(guide).toContain("All UI texts go through i18n");
    expect(guide).toContain("Use minmax(0,1fr) for grid columns.");
    expect(existsSync(join(made.path, "AGENTS.md"))).toBe(true);
    expect(made.run?.flow).toBe("task");
    for (let i = 0; i < 100 && flows.get(made.run?.id as string)?.status === "running"; i++) await Bun.sleep(10);
    expect(asked).toContain("Sells flowers");
    expect(() =>
      createProject(
        { store: w.store, flows, lessons: w.lessons },
        { name: "x", parent: "/etc", template: "empty" },
        home,
      ),
    ).toThrow("home folder");
    // With the architecture questions answered, the decision and its rules are written down.
    const planned = createProject(
      { store: w.store, flows, lessons: w.lessons },
      {
        name: "ledger",
        parent: home,
        template: "empty",
        needs: { team: "small", scale: "small", releases: "weekly", background: false, plugins: false },
      },
      home,
    );
    expect(readFileSync(join(planned.path, "docs/adr/0001-architecture.md"), "utf8")).toContain("layered");
    expect(readFileSync(join(planned.path, "AGENTS.md"), "utf8")).toContain("Closed layers");
    expect(readFileSync(join(planned.path, "docs/architecture.md"), "utf8")).toContain("C4Context");
  });

  test("the recommended pattern follows the needs", async () => {
    const { recommendArchitecture } = await import("@igrek/core");
    const base = { team: "solo", scale: "small", releases: "rare", background: false, plugins: false } as const;
    expect(recommendArchitecture(base).pattern).toBe("layered");
    expect(recommendArchitecture({ ...base, plugins: true }).pattern).toBe("microkernel");
    expect(recommendArchitecture({ ...base, background: true, scale: "growing" }).pattern).toBe("eventDriven");
    expect(recommendArchitecture({ ...base, team: "large", scale: "high", releases: "daily" }).pattern).toBe(
      "microservices",
    );
    // A large team without high load or daily releases still starts as a modular monolith.
    expect(recommendArchitecture({ ...base, team: "large" })).toMatchObject({
      pattern: "layered",
      reasons: ["modules", "startSimple"],
    });
  });
});
