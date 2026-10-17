import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DeployCheck, DeployRecord, EnvironmentInfo, EnvironmentState, EnvKeyUse } from "@godeye/core";
import type { Bus } from "./bus";
import type { Servers } from "./servers";
import type { Store } from "./store";

/**
 * Project environments (plan.md 1.2b / 1.2c): the same repo on a server as
 * Staging or Prod. God Eye never copies code: the server pulls from git.
 * It only makes the flow visible and the deploy safe (checks, confirm, log).
 */

function git(cwd: string, args: string[]): string | undefined {
  const proc = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "ignore" });
  return proc.exitCode === 0 ? proc.stdout.toString().trim() : undefined;
}

/** SQL in a migration that can lose data. */
export const DESTRUCTIVE_SQL =
  /\b(drop\s+(table|column|schema|database|index)|alter\s+table\s+\S+\s+drop|truncate\b|delete\s+from\s+\S+\s*(;|$)|rename\s+(column|to)\b|alter\s+column\s+\S+\s+(type|set\s+data\s+type))/im;

const MIGRATION = /(^|\/)(migrations?|alembic|drizzle|prisma\/migrations)\/|\.sql$/i;
const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

export class Environments {
  constructor(
    private readonly db: Database,
    private readonly store: Store,
    private readonly servers: Servers,
    private readonly bus: Bus,
    private readonly usedEnv: (projectId: string) => EnvKeyUse[],
    private readonly testsPassed: (projectId: string) => { ok: boolean; at: number } | undefined,
  ) {}

  /**
   * Before a deploy (plan.md 13.4): back up the project's databases first. Set by the server to
   * run the project's database backup jobs; returns what was backed up, or throws to stop.
   */
  beforeDeploy?: (projectId: string) => Promise<string[]>;
  /** Whether the project has a database backup job at all. */
  hasDbBackup?: (projectId: string) => boolean;

  list(projectId: string): EnvironmentInfo[] {
    return (
      this.db.query("SELECT * FROM project_envs WHERE project_id = ? ORDER BY created_at").all(projectId) as {
        id: string;
        project_id: string;
        name: string;
        server_id: string;
        path: string;
        branch: string;
        deploy_command: string;
        created_at: number;
      }[]
    ).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      serverId: r.server_id,
      serverName: this.servers.get(r.server_id)?.name ?? r.server_id,
      path: r.path,
      branch: r.branch,
      deployCommand: r.deploy_command,
    }));
  }

  add(
    projectId: string,
    input: { name: string; serverId: string; path: string; branch?: string; deployCommand?: string },
  ): EnvironmentInfo {
    if (!this.servers.get(input.serverId)) throw new Error("Server not found");
    const path = input.path.trim();
    if (!/^(\/|~\/)[\w./~-]*$/.test(path) || path.includes(".."))
      throw new Error("Use the full path of the project on the server, e.g. /srv/app");
    const name = input.name.trim().slice(0, 30) || "production";
    const branch = (input.branch ?? "main").trim() || "main";
    if (!/^[\w./-]{1,100}$/.test(branch)) throw new Error("Invalid branch name");
    const id = crypto.randomUUID();
    this.db
      .query(
        "INSERT INTO project_envs (id, project_id, name, server_id, path, branch, deploy_command, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        projectId,
        name,
        input.serverId,
        path,
        branch,
        (input.deployCommand ?? "").trim().slice(0, 500),
        Date.now(),
      );
    return this.list(projectId).find((e) => e.id === id) as EnvironmentInfo;
  }

  update(id: string, patch: { deployCommand?: string; branch?: string; name?: string }): void {
    if (patch.deployCommand !== undefined)
      this.db
        .query("UPDATE project_envs SET deploy_command = ? WHERE id = ?")
        .run(patch.deployCommand.trim().slice(0, 500), id);
    if (patch.branch && /^[\w./-]{1,100}$/.test(patch.branch))
      this.db.query("UPDATE project_envs SET branch = ? WHERE id = ?").run(patch.branch, id);
    if (patch.name?.trim())
      this.db.query("UPDATE project_envs SET name = ? WHERE id = ?").run(patch.name.trim().slice(0, 30), id);
  }

  remove(id: string): void {
    this.db.query("DELETE FROM project_envs WHERE id = ?").run(id);
  }

  private env(id: string): EnvironmentInfo {
    const row = this.db.query("SELECT project_id FROM project_envs WHERE id = ?").get(id) as
      | { project_id: string }
      | undefined;
    const env = row ? this.list(row.project_id).find((e) => e.id === id) : undefined;
    if (!env) throw new Error("Environment not found");
    return env;
  }

  /** Branches the server could pull: the remote branches this computer knows about. */
  branches(id: string): string[] {
    const env = this.env(id);
    const root = this.store.projectRow(env.projectId)?.path ?? "";
    return (git(root, ["branch", "-r", "--format=%(refname:short)"]) ?? "")
      .split("\n")
      .filter((b) => b.startsWith("origin/") && b !== "origin/HEAD" && b !== "origin")
      .map((b) => b.slice("origin/".length));
  }

  /**
   * A staging copy next to an existing environment (plan.md 13.4): the repo is cloned into a new
   * folder on the same server and set up as its own environment, with the same deploy command.
   * It runs on your click, as a confirmed command in the server's audit log.
   */
  async createStaging(
    fromId: string,
    opts: { name: string; path: string; branch: string; confirmations: number },
  ): Promise<EnvironmentInfo> {
    const from = this.env(fromId);
    const root = this.store.projectRow(from.projectId)?.path ?? "";
    const url = git(root, ["remote", "get-url", "origin"]);
    if (!url) throw new Error("The project has no origin remote to clone from");
    if (!/^(~\/|\/)[\w./-]{1,200}$/.test(opts.path) || opts.path.includes(".."))
      throw new Error("Give a full folder path for the copy");
    if (!/^[\w./-]{1,100}$/.test(opts.branch)) throw new Error("Unknown branch");
    if (opts.path.replace(/\/$/, "") === from.path.replace(/\/$/, ""))
      throw new Error("Use another folder than the original");
    const target = opts.path.startsWith("~/") ? `~/${q(opts.path.slice(2))}` : q(opts.path);
    const run = await this.servers.run(
      from.serverId,
      `test ! -e ${target} && git clone ${q(url)} ${target} && cd ${target} && git checkout ${q(opts.branch)}`,
      {
        confirmations: opts.confirmations,
        actor: "user",
        reason: `create ${opts.name} for ${from.name}`,
      },
    );
    if ((run.exitCode ?? 1) !== 0)
      throw new Error(
        (run.output ?? "").trim().split("\n").slice(-3).join(" ") ||
          "The copy could not be made (does the folder exist already?)",
      );
    return this.add(from.projectId, {
      name: opts.name,
      serverId: from.serverId,
      path: opts.path,
      branch: opts.branch,
      deployCommand: from.deployCommand,
    });
  }

  /** Where the server stands vs. this computer: commit, branch, edits made on the server. */
  async state(id: string): Promise<EnvironmentState> {
    const env = this.env(id);
    const project = this.store.projectRow(env.projectId);
    const root = project?.path ?? "";
    const remote = await this.servers.inspect(
      env.serverId,
      `cd ${env.path.startsWith("~/") ? `~/${q(env.path.slice(2))}` : q(env.path)} && git rev-parse HEAD && git rev-parse --abbrev-ref HEAD && git status --porcelain | wc -l && git log -1 --format=%ct%x09%s`,
      `git status of ${env.path}`,
    );
    if (remote.code !== 0)
      return {
        reachable: false,
        error: (remote.output ?? "").trim().split("\n").pop() || "Unreachable",
        checkedAt: Date.now(),
      };
    const [head = "", branch = "", dirty = "0", last = ""] = (remote.output ?? "").trim().split("\n");
    const [at, ...subject] = last.split("\t");
    const localHead = git(root, ["rev-parse", "HEAD"]);
    const known = git(root, ["cat-file", "-t", head]) === "commit";
    const ahead =
      known && localHead ? Number(git(root, ["rev-list", "--count", `${head}..${localHead}`]) ?? 0) : undefined;
    const behind =
      known && localHead ? Number(git(root, ["rev-list", "--count", `${localHead}..${head}`]) ?? 0) : undefined;
    return {
      reachable: true,
      head: head.slice(0, 7),
      branch,
      dirty: Number(dirty) || 0,
      lastCommitAt: Number(at) * 1000 || undefined,
      lastSubject: subject.join("\t"),
      localHead: localHead?.slice(0, 7),
      ahead,
      behind,
      knownLocally: known,
      checkedAt: Date.now(),
    };
  }

  /** Everything worth knowing before pulling on the server, worst first. */
  async checks(id: string): Promise<{ state: EnvironmentState; checks: DeployCheck[] }> {
    const env = this.env(id);
    const state = await this.state(id);
    const root = this.store.projectRow(env.projectId)?.path ?? "";
    const checks: DeployCheck[] = [];
    if (!state.reachable) return { state, checks: [{ id: "unreachable", level: "block", detail: state.error }] };
    if (state.dirty) checks.push({ id: "serverDirty", level: "block", detail: String(state.dirty) });
    if (state.branch && state.branch !== env.branch)
      checks.push({ id: "serverBranch", level: "warn", detail: `${state.branch} ≠ ${env.branch}` });
    if (state.behind) checks.push({ id: "serverAhead", level: "warn", detail: String(state.behind) });
    // The server pulls from git: anything not pushed won't arrive.
    const upstream = git(root, ["rev-parse", "--abbrev-ref", "@{u}"]);
    const unpushed = upstream ? Number(git(root, ["rev-list", "--count", `${upstream}..HEAD`]) ?? 0) : 0;
    if (unpushed) checks.push({ id: "unpushed", level: "warn", detail: String(unpushed) });
    if (!upstream) checks.push({ id: "noUpstream", level: "warn" });
    const uncommitted = (git(root, ["status", "--porcelain"]) ?? "").split("\n").filter(Boolean).length;
    if (uncommitted) checks.push({ id: "uncommitted", level: "info", detail: String(uncommitted) });
    if (state.knownLocally && state.head) {
      const changed = (git(root, ["diff", "--name-only", `${state.head}..${upstream ?? "HEAD"}`]) ?? "")
        .split("\n")
        .filter(Boolean);
      const migrations = changed.filter((f) => MIGRATION.test(f));
      if (migrations.length) {
        checks.push({ id: "migrations", level: "warn", detail: migrations.slice(0, 5).join(", ") });
        // New migrations that can lose data: dropped tables or columns, truncates, renames.
        const risky = migrations.filter((f) => {
          const text = git(root, ["show", `${upstream ?? "HEAD"}:${f}`]) ?? "";
          return DESTRUCTIVE_SQL.test(text);
        });
        if (risky.length)
          checks.push({ id: "destructiveMigration", level: "warn", detail: risky.slice(0, 5).join(", ") });
        if (this.hasDbBackup && !this.hasDbBackup(env.projectId)) checks.push({ id: "noDbBackup", level: "warn" });
      }
      if (!changed.length) checks.push({ id: "nothingNew", level: "info" });
    }
    const tests = this.testsPassed(env.projectId);
    if (!tests) checks.push({ id: "testsUnknown", level: "info" });
    else if (!tests.ok) checks.push({ id: "testsFailing", level: "warn" });
    // Settings the code reads that the server's .env doesn't have (names only).
    try {
      const text = await this.servers.readEnvFile(env.serverId, `${env.path.replace(/\/$/, "")}/.env`);
      const have = new Set([...text.matchAll(/^\s*(?:export\s+)?([A-Za-z_][\w.-]*)\s*=/gm)].map((m) => m[1]));
      const missing = this.usedEnv(env.projectId)
        .filter((k) => !have.has(k.name) && k.documented)
        .map((k) => k.name);
      if (missing.length) checks.push({ id: "envMissing", level: "warn", detail: missing.slice(0, 8).join(", ") });
    } catch {
      // no .env there (or not readable): nothing to compare
    }
    const order = { block: 0, warn: 1, info: 2 };
    return { state, checks: checks.sort((a, b) => order[a.level] - order[b.level]) };
  }

  /**
   * Pull on the server and run the deploy command. Blocking checks stop it;
   * the user has already confirmed the warnings. Logged with before/after commits.
   */
  async deploy(id: string, opts: { confirmations: number; branch?: string }): Promise<DeployRecord> {
    const base = this.env(id);
    // A preview deploy (plan.md 13.4): another branch, this time only; the environment keeps its own.
    if (opts.branch && !/^[\w./-]{1,100}$/.test(opts.branch)) throw new Error("Unknown branch");
    const env = opts.branch ? { ...base, branch: opts.branch } : base;
    const { state, checks } = await this.checks(id);
    const blocking = checks.filter((c) => c.level === "block");
    if (blocking.length) throw new Error(`Can't deploy: ${blocking.map((c) => c.id).join(", ")}`);
    // A backup of the project's databases first; if it fails, nothing is deployed.
    const backedUp = this.beforeDeploy ? await this.beforeDeploy(env.projectId) : [];
    const cd = env.path.startsWith("~/") ? `~/${q(env.path.slice(2))}` : q(env.path);
    const command = `cd ${cd} && git fetch --quiet && git checkout ${q(env.branch)} && git pull --ff-only${env.deployCommand ? ` && ${env.deployCommand}` : ""}`;
    const started = Date.now();
    const run = await this.servers.run(env.serverId, command, {
      confirmations: opts.confirmations,
      actor: "user",
      reason: `deploy ${env.name}`,
    });
    const after = await this.state(id).catch(() => undefined);
    const record: DeployRecord = {
      id: crypto.randomUUID(),
      envId: id,
      projectId: env.projectId,
      at: started,
      fromHead: state.head ?? "",
      toHead: after?.head ?? "",
      command,
      exitCode: run.exitCode ?? -1,
      output: `${backedUp.length ? `Backed up first: ${backedUp.join(", ")}\n` : ""}${run.output ?? ""}`.slice(-8000),
      ms: Date.now() - started,
    };
    this.db
      .query(
        "INSERT INTO deploys (id, env_id, project_id, at, from_head, to_head, command, exit_code, output, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        record.id,
        id,
        env.projectId,
        record.at,
        record.fromHead,
        record.toHead,
        command,
        record.exitCode,
        record.output,
        record.ms,
      );
    this.bus.publish({ type: "deploys-changed", projectId: env.projectId });
    return record;
  }

  deploys(filter: { projectId?: string; serverId?: string }, limit = 30): DeployRecord[] {
    const rows = (
      filter.serverId
        ? this.db
            .query(
              "SELECT d.* FROM deploys d JOIN project_envs e ON e.id = d.env_id WHERE e.server_id = ? ORDER BY d.at DESC LIMIT ?",
            )
            .all(filter.serverId, limit)
        : this.db
            .query("SELECT * FROM deploys WHERE project_id = ? ORDER BY at DESC LIMIT ?")
            .all(filter.projectId ?? "", limit)
    ) as {
      id: string;
      env_id: string;
      project_id: string;
      at: number;
      from_head: string;
      to_head: string;
      command: string;
      exit_code: number;
      output: string;
      ms: number;
    }[];
    return rows.map((r) => ({
      id: r.id,
      envId: r.env_id,
      projectId: r.project_id,
      at: r.at,
      fromHead: r.from_head,
      toHead: r.to_head,
      command: r.command,
      exitCode: r.exit_code,
      output: r.output,
      ms: r.ms,
    }));
  }

  /** A GitHub Actions workflow that deploys on push to the branch, over SSH (secrets set in GitHub). */
  workflow(id: string): { path: string; content: string; exists: boolean } {
    const env = this.env(id);
    const root = this.store.projectRow(env.projectId)?.path ?? "";
    const path = `.github/workflows/deploy-${env.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}.yml`;
    const content = `# Created by God Eye. Deploys ${env.name} when ${env.branch} changes.
# In GitHub → Settings → Secrets and variables → Actions, add:
#   DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY (a key used only for deploys), DEPLOY_PORT (optional)
name: Deploy ${env.name}
on:
  push:
    branches: [${env.branch}]
  workflow_dispatch:
concurrency: deploy-${env.name}
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: \${{ secrets.DEPLOY_HOST }}
          username: \${{ secrets.DEPLOY_USER }}
          key: \${{ secrets.DEPLOY_SSH_KEY }}
          port: \${{ secrets.DEPLOY_PORT || 22 }}
          script: |
            set -e
            cd ${env.path}
            git fetch --quiet
            git checkout ${env.branch}
            git pull --ff-only
${env.deployCommand ? `            ${env.deployCommand}\n` : ""}`;
    return { path, content, exists: existsSync(join(root, path)) };
  }

  writeWorkflow(id: string): string {
    const env = this.env(id);
    const root = this.store.projectRow(env.projectId)?.path ?? "";
    const { path, content, exists } = this.workflow(id);
    if (exists) throw new Error("That workflow file already exists");
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(join(root, path), content);
    return path;
  }
}
