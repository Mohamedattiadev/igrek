import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bus } from "./bus";
import { migrate } from "./db";
import { Environments } from "./environments";
import type { Servers } from "./servers";
import { Store } from "./store";

function sh(cwd: string, ...args: string[]) {
  const p = Bun.spawnSync(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  });
  return p.stdout.toString().trim();
}

describe("environments", () => {
  const root = mkdtempSync(join(tmpdir(), "godeye-envs-"));
  sh(root, "init", "-q", "-b", "main");
  writeFileSync(join(root, "a.txt"), "1");
  sh(root, "add", ".");
  sh(root, "commit", "-qm", "first");
  const deployed = sh(root, "rev-parse", "HEAD");
  mkdirSync(join(root, "migrations"));
  writeFileSync(join(root, "migrations/002.sql"), "ALTER TABLE x ADD y;");
  sh(root, "add", ".");
  sh(root, "commit", "-qm", "add migration");

  const db = new Database(":memory:");
  migrate(db);
  db.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p1', 'Shop', ?, 0)").run(root);
  let dirty = 0;
  const ran: string[] = [];
  const fake = {
    get: (id: string) => (id === "s1" ? { id: "s1", name: "prod-vps" } : undefined),
    inspect: async () => ({ code: 0, output: `${deployed}\nmain\n${dirty}\n1700000000\tfirst\n` }),
    readEnvFile: async () => "DATABASE_URL=x\n",
    run: async (_id: string, command: string) => {
      ran.push(command);
      return { exitCode: 0, output: "Already up to date." };
    },
  } as unknown as Servers;
  const envs = new Environments(
    db,
    new Store(db),
    fake,
    new Bus(),
    () => [
      { name: "DATABASE_URL", refs: [], documented: true },
      { name: "STRIPE_KEY", refs: [], documented: true },
    ],
    () => ({ ok: true, at: Date.now() }),
  );

  test("status, warnings before deploy, and the deploy itself", async () => {
    const env = envs.add("p1", {
      name: "production",
      serverId: "s1",
      path: "/srv/shop",
      deployCommand: "docker compose up -d --build",
    });
    const state = await envs.state(env.id);
    expect(state).toMatchObject({ reachable: true, head: deployed.slice(0, 7), branch: "main", ahead: 1, behind: 0 });
    const { checks } = await envs.checks(env.id);
    const ids = checks.map((c) => c.id);
    expect(ids).toContain("migrations");
    expect(ids).toContain("envMissing");
    expect(checks.find((c) => c.id === "envMissing")?.detail).toBe("STRIPE_KEY");
    const record = await envs.deploy(env.id, { confirmations: 1 });
    expect(ran.at(-1)).toBe(
      "cd '/srv/shop' && git fetch --quiet && git checkout 'main' && git pull --ff-only && docker compose up -d --build",
    );
    expect(envs.deploys({ projectId: "p1" })[0]?.id).toBe(record.id);
    expect(envs.workflow(env.id).content).toContain("cd /srv/shop");
  });

  test("the databases are backed up before a deploy; a failed backup stops it", async () => {
    const env = envs.list("p1")[0];
    envs.hasDbBackup = () => false;
    const { checks } = await envs.checks(env?.id ?? "");
    expect(checks.map((c) => c.id)).toContain("noDbBackup");
    envs.beforeDeploy = async () => ["Shop DB"];
    const record = await envs.deploy(env?.id ?? "", { confirmations: 1 });
    expect(record.output).toStartWith("Backed up first: Shop DB");
    const before = ran.length;
    envs.beforeDeploy = async () => {
      throw new Error("The backup before the deploy failed");
    };
    await expect(envs.deploy(env?.id ?? "", { confirmations: 1 })).rejects.toThrow("backup");
    expect(ran.length).toBe(before);
    envs.beforeDeploy = undefined;
  });

  test("edits made directly on the server block the deploy", async () => {
    dirty = 2;
    const env = envs.list("p1")[0];
    const { checks } = await envs.checks(env?.id ?? "");
    expect(checks[0]).toMatchObject({ id: "serverDirty", level: "block" });
    await expect(envs.deploy(env?.id ?? "", { confirmations: 1 })).rejects.toThrow(/serverDirty/);
  });
});

describe("staging and preview", () => {
  test("a staging copy is cloned next to the original as one confirmed command; a preview deploys another branch once", async () => {
    const root = mkdtempSync(join(tmpdir(), "godeye-stg-"));
    sh(root, "init", "-q", "-b", "main");
    writeFileSync(join(root, "a.txt"), "1");
    sh(root, "add", ".");
    sh(root, "commit", "-qm", "first");
    sh(root, "remote", "add", "origin", "git@github.com:me/shop.git");
    const db = new Database(":memory:");
    migrate(db);
    db.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p1', 'Shop', ?, 0)").run(root);
    const ran: { command: string; confirmations: number }[] = [];
    const fake = {
      get: () => ({ id: "s1", name: "vps" }),
      inspect: async () => ({ code: 0, output: "abc\nmain\n0\n1700000000\tfirst\n" }),
      readEnvFile: async () => "",
      run: async (_id: string, command: string, opts: { confirmations: number }) => {
        ran.push({ command, confirmations: opts.confirmations });
        return { exitCode: 0, output: "" };
      },
    } as unknown as Servers;
    const envs = new Environments(
      db,
      new Store(db),
      fake,
      new Bus(),
      () => [],
      () => undefined,
    );
    const prod = envs.add("p1", { name: "production", serverId: "s1", path: "/srv/shop", deployCommand: "make up" });
    const staging = await envs.createStaging(prod.id, {
      name: "staging",
      path: "/srv/shop-staging",
      branch: "develop",
      confirmations: 1,
    });
    expect(ran[0]).toEqual({
      command:
        "test ! -e '/srv/shop-staging' && git clone 'git@github.com:me/shop.git' '/srv/shop-staging' && cd '/srv/shop-staging' && git checkout 'develop'",
      confirmations: 1,
    });
    expect(staging).toMatchObject({
      name: "staging",
      path: "/srv/shop-staging",
      branch: "develop",
      deployCommand: "make up",
    });
    await expect(
      envs.createStaging(prod.id, { name: "x", path: "/srv/shop", branch: "main", confirmations: 1 }),
    ).rejects.toThrow();
    await envs.deploy(staging.id, { confirmations: 1, branch: "feature/login" });
    expect(ran.at(-1)?.command).toContain("git checkout 'feature/login'");
    expect(envs.list("p1").find((e) => e.id === staging.id)?.branch).toBe("develop");
    await expect(envs.deploy(staging.id, { confirmations: 1, branch: "x; rm -rf /" })).rejects.toThrow();
  });
});
