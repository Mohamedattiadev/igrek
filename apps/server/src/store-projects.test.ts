import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./db";
import { Store } from "./store";

/** A store where only the folders the user adds are projects (the default setting). */
function setup() {
  const { sqlite } = openDb(":memory:");
  const store = new Store(sqlite);
  store.autoProjects = () => false;
  const home = mkdtempSync(join(tmpdir(), "igrek-projects-"));
  for (const dir of ["work/shop/src", "work/blog", "scratch/try"]) mkdirSync(join(home, dir), { recursive: true });
  const session = (id: string, cwd: string) =>
    sqlite
      .query("INSERT INTO sessions (id, project_id, tool, cwd) VALUES (?, ?, 'claude', ?)")
      .run(id, store.resolveProject(cwd), cwd);
  const visible = () =>
    store
      .listProjects()
      .filter((p) => !p.hidden)
      .map((p) => p.name)
      .sort();
  const projectOf = (id: string) =>
    (sqlite.query("SELECT project_id FROM sessions WHERE id = ?").get(id) as { project_id: string }).project_id;
  return { store, home, session, visible, projectOf };
}

describe("projects are the folders the user adds", () => {
  test("work in a folder nobody added is kept but hidden, and offered as found", () => {
    const { store, home, session, visible } = setup();
    session("s1", join(home, "scratch/try"));
    expect(visible()).toEqual([]);
    const found = store.listProjects().find((p) => p.name === "try");
    expect(found).toMatchObject({ hidden: true, addedByHand: false });
  });

  test("a folder added as one project gathers the work anywhere inside it", () => {
    const { store, home, session, visible, projectOf } = setup();
    session("s1", join(home, "work/shop/src"));
    session("s2", join(home, "work/blog"));
    const work = store.addFolder(join(home, "work"), "one");
    expect(visible()).toEqual(["work"]);
    expect([projectOf("s1"), projectOf("s2")]).toEqual([work, work]);
    // New work inside goes there too.
    expect(store.resolveProject(join(home, "work/shop"))).toBe(work);
  });

  test("a folder of projects makes each first-level folder a project", () => {
    const { store, home, session, visible } = setup();
    session("s1", join(home, "work/blog"));
    store.addFolder(join(home, "work"), "folder");
    session("s2", join(home, "work/shop/src"));
    expect(visible()).toEqual(["blog", "shop", "work"]);
    expect(store.listProjects().find((p) => p.name === "shop")?.addedByHand).toBe(true);
  });

  test("with projects added on their own, nothing changes from before", () => {
    const { store, home, session, visible } = setup();
    store.autoProjects = () => true;
    session("s1", join(home, "scratch/try"));
    expect(visible()).toEqual(["try"]);
  });

  test("hiding what was found keeps the user's own folders", () => {
    const { store, home, visible } = setup();
    store.autoProjects = () => true;
    store.resolveProject(join(home, "scratch/try"));
    store.addFolder(join(home, "work/blog"));
    expect(store.hideFound()).toBe(1);
    expect(visible()).toEqual(["blog"]);
  });

  test("adding every folder Claude worked in shows the ones found so far, not those inside an added project", () => {
    const { store, home, session, visible } = setup();
    store.addFolder(join(home, "work/shop"));
    session("s1", join(home, "scratch/try"));
    session("s2", join(home, "work/shop/src"));
    expect(visible()).toEqual(["shop"]);
    store.autoProjects = () => true;
    expect(store.showFound()).toBe(1);
    expect(visible()).toEqual(["shop", "try"]);
  });
});
