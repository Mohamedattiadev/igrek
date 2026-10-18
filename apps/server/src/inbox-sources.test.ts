import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { Bus } from "./bus";
import { migrate } from "./db";
import { Environments } from "./environments";
import type { Servers } from "./servers";
import { Store } from "./store";

describe("inbox sources", () => {
  test("failed deploys stay three days, successful ones one day", () => {
    const db = new Database(":memory:");
    migrate(db);
    db.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p1', 'Shop', '/x', 0)").run();
    db.query(
      "INSERT INTO project_envs (id, project_id, name, server_id, path, created_at) VALUES ('e1', 'p1', 'prod', 's1', '/srv', 0)",
    ).run();
    const now = Date.now();
    const add = (id: string, at: number, code: number) =>
      db
        .query(
          "INSERT INTO deploys (id, env_id, project_id, at, from_head, to_head, command, exit_code, output, ms) VALUES (?, 'e1', 'p1', ?, 'a', 'b', 'make', ?, '', 1)",
        )
        .run(id, at, code);
    add("ok-now", now - 1000, 0);
    add("ok-old", now - 2 * 86_400_000, 0);
    add("bad-old", now - 2 * 86_400_000, 1);
    add("bad-ancient", now - 5 * 86_400_000, 1);
    const envs = new Environments(
      db,
      new Store(db),
      {} as Servers,
      new Bus(),
      () => [],
      () => undefined,
    );
    expect(envs.notices(now).map((n) => [n.id, n.kind, n.detail])).toEqual([
      ["deploy:ok-now", "deployDone", "prod"],
      ["deploy:bad-old", "deployFailed", "prod · exit 1"],
    ]);
  });
});
