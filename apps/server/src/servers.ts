import type { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Approval, CommandRisk, RemoteRun, ServerHealth, ServerInfo, ServerTag } from "@godeye/core";
import type { Bus, StopRegistry } from "./bus";
import { classifyCommand } from "./commands";
import { cleanEnv } from "./env";

const TAGS: ServerTag[] = ["prod", "staging", "test", "other"];
const MAX_OUTPUT = 64 * 1024;

export const SERVER_MIGRATION = `CREATE TABLE servers (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     target TEXT NOT NULL,
     port INTEGER,
     tag TEXT NOT NULL DEFAULT 'other',
     health TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE remote_audit (
     id TEXT PRIMARY KEY,
     server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
     command TEXT NOT NULL,
     risk TEXT NOT NULL,
     actor TEXT NOT NULL,
     reason TEXT,
     started_at INTEGER NOT NULL,
     exit_code INTEGER,
     output TEXT,
     duration_ms INTEGER
   );
   CREATE INDEX remote_audit_server ON remote_audit(server_id, started_at DESC);`;

/** A target is user@host, host, or an ~/.ssh/config alias; nothing that could be read as an ssh option. */
export function validTarget(target: string): boolean {
  return /^([a-zA-Z0-9._-]+@)?[a-zA-Z0-9._:-]+$/.test(target) && !target.startsWith("-");
}

/** Host aliases from ~/.ssh/config (only the config, never keys). */
export function sshConfigHosts(
  path = join(homedir(), ".ssh", "config"),
): { alias: string; hostname?: string; user?: string; port?: number }[] {
  if (!existsSync(path)) return [];
  const hosts: { alias: string; hostname?: string; user?: string; port?: number }[] = [];
  let current: (typeof hosts)[number][] = [];
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [key = "", ...rest] = line.split(/\s+/);
    const value = rest.join(" ");
    if (key.toLowerCase() === "host") {
      current = value
        .split(/\s+/)
        .filter((alias) => !/[*?!]/.test(alias))
        .map((alias) => ({ alias }));
      hosts.push(...current);
    } else {
      for (const host of current) {
        if (key.toLowerCase() === "hostname") host.hostname = value;
        else if (key.toLowerCase() === "user") host.user = value;
        else if (key.toLowerCase() === "port") host.port = Number(value);
      }
    }
  }
  return hosts;
}

/** One-shot status probe; only reads. */
const HEALTH_COMMAND = [
  `echo "UP:$(uptime -p 2>/dev/null || uptime)"`,
  `echo "LOAD:$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)"`,
  `df -P / | awk 'NR==2{print "DISK:"$5}'`,
  `free 2>/dev/null | awk '/Mem:/{printf "MEM:%d\\n", $3*100/$2}'`,
  `docker ps --format 'CT:{{.Names}}\t{{.Status}}' 2>/dev/null`,
  `systemctl --failed --no-legend --plain 2>/dev/null | awk '{print "FAIL:"$1}'`,
].join("; ");

export function parseHealth(output: string): Omit<ServerHealth, "ok" | "checkedAt"> {
  const health: Omit<ServerHealth, "ok" | "checkedAt"> = { containers: [], failedUnits: [] };
  for (const line of output.split("\n")) {
    if (line.startsWith("UP:")) health.uptime = line.slice(3).trim();
    else if (line.startsWith("LOAD:")) health.load = line.slice(5).trim();
    else if (line.startsWith("DISK:")) health.diskPercent = Number.parseInt(line.slice(5), 10);
    else if (line.startsWith("MEM:")) health.memPercent = Number.parseInt(line.slice(4), 10);
    else if (line.startsWith("CT:")) {
      const [name = "", status = ""] = line.slice(3).split("\t");
      health.containers?.push({ name, status });
    } else if (line.startsWith("FAIL:")) health.failedUnits?.push(line.slice(5).trim());
  }
  return health;
}

type Row = {
  id: string;
  name: string;
  target: string;
  port: number | null;
  tag: ServerTag;
  health: string | null;
  created_at: number;
};

interface Pending {
  approval: Approval;
  status: "pending" | "approved" | "denied";
  run?: RemoteRun;
}

/**
 * Servers reached over SSH (plan.md 2.5). God Eye calls the system `ssh`, so
 * keys stay with ssh-agent and are never read here. Every command is sorted by
 * risk, approved when it changes something, and written to an audit log.
 */
export class Servers {
  private approvals = new Map<string, Pending>();

  constructor(
    private readonly db: Database,
    private readonly bus: Bus,
    private readonly stops: StopRegistry,
  ) {}

  private toInfo(row: Row): ServerInfo {
    return {
      id: row.id,
      name: row.name,
      target: row.target,
      port: row.port ?? undefined,
      tag: row.tag,
      createdAt: row.created_at,
      health: row.health ? (JSON.parse(row.health) as ServerHealth) : undefined,
    };
  }

  list(): ServerInfo[] {
    return (this.db.query("SELECT * FROM servers ORDER BY tag = 'prod' DESC, name").all() as Row[]).map((r) =>
      this.toInfo(r),
    );
  }

  get(idOrName: string): ServerInfo | undefined {
    const row = this.db
      .query("SELECT * FROM servers WHERE id = ? OR name = ? OR target = ?")
      .get(idOrName, idOrName, idOrName) as Row | undefined;
    return row ? this.toInfo(row) : undefined;
  }

  add(input: { name: string; target: string; port?: number; tag?: string }): ServerInfo {
    if (!validTarget(input.target)) throw new Error("Use user@host, a host name, or an ~/.ssh/config alias");
    const id = crypto.randomUUID().slice(0, 8);
    const tag = TAGS.find((t) => t === input.tag) ?? "other";
    const port = input.port && input.port > 0 && input.port < 65536 ? input.port : null;
    this.db
      .query("INSERT INTO servers (id, name, target, port, tag, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, input.name.trim().slice(0, 60) || input.target, input.target, port, tag, Date.now());
    this.bus.publish({ type: "servers-changed" });
    return this.get(id) as ServerInfo;
  }

  update(id: string, patch: { name?: unknown; tag?: unknown }): void {
    if (typeof patch.name === "string" && patch.name.trim()) {
      this.db.query("UPDATE servers SET name = ? WHERE id = ?").run(patch.name.trim().slice(0, 60), id);
    }
    const tag = TAGS.find((t) => t === patch.tag);
    if (tag) this.db.query("UPDATE servers SET tag = ? WHERE id = ?").run(tag, id);
    this.bus.publish({ type: "servers-changed" });
  }

  remove(id: string): void {
    this.db.query("DELETE FROM servers WHERE id = ?").run(id);
    this.bus.publish({ type: "servers-changed" });
  }

  /** ssh arguments for this server; `--` keeps the remote command from being read as options. */
  sshArgs(server: ServerInfo): string[] {
    return [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=8",
      ...(server.port ? ["-p", String(server.port)] : []),
      server.target,
    ];
  }

  private async exec(
    server: ServerInfo,
    command: string,
    timeoutMs = 120_000,
  ): Promise<{ code: number; output: string; ms: number }> {
    const started = Date.now();
    const proc = Bun.spawn(["ssh", ...this.sshArgs(server), "--", command], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      env: cleanEnv(),
    });
    const unregister = this.stops.register(`ssh-${proc.pid}`, { label: `ssh ${server.name}`, stop: () => proc.kill() });
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    try {
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      const output = `${out}${err ? (out ? "\n" : "") + err : ""}`;
      return {
        code,
        output: output.length > MAX_OUTPUT ? `${output.slice(0, MAX_OUTPUT)}\n…` : output,
        ms: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
      unregister();
    }
  }

  async checkHealth(id: string): Promise<ServerHealth> {
    const server = this.get(id);
    if (!server) throw new Error("Server not found");
    const result = await this.exec(server, HEALTH_COMMAND, 20_000);
    const health: ServerHealth =
      result.code === 0 || result.output.includes("UP:")
        ? { ok: true, checkedAt: Date.now(), ...parseHealth(result.output) }
        : {
            ok: false,
            checkedAt: Date.now(),
            error: result.output.trim().split("\n").slice(-2).join(" ") || `ssh exited with ${result.code}`,
          };
    this.db.query("UPDATE servers SET health = ? WHERE id = ?").run(JSON.stringify(health), id);
    this.bus.publish({ type: "servers-changed" });
    return health;
  }

  async checkAll(): Promise<void> {
    for (const server of this.list()) await this.checkHealth(server.id).catch(() => undefined);
  }

  /**
   * Runs a command the user (or an approved agent request) asked for.
   * `confirmations` must match the risk: 0 for read, 1 for change, 2 for danger.
   */
  async run(
    id: string,
    command: string,
    opts: { confirmations: number; actor: "user" | "agent"; reason?: string },
  ): Promise<RemoteRun> {
    const server = this.get(id);
    if (!server) throw new Error("Server not found");
    const { risk } = classifyCommand(command);
    const needed = { read: 0, change: 1, danger: 2 }[risk];
    if (opts.confirmations < needed)
      throw Object.assign(new Error(`This command needs ${needed} confirmation(s)`), { risk });
    const runId = crypto.randomUUID();
    const startedAt = Date.now();
    this.db
      .query(
        "INSERT INTO remote_audit (id, server_id, command, risk, actor, reason, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(runId, id, command, risk, opts.actor, opts.reason ?? null, startedAt);
    const result = await this.exec(server, command);
    this.db
      .query("UPDATE remote_audit SET exit_code = ?, output = ?, duration_ms = ? WHERE id = ?")
      .run(result.code, result.output, result.ms, runId);
    return {
      id: runId,
      serverId: id,
      command,
      risk,
      actor: opts.actor,
      reason: opts.reason,
      startedAt,
      exitCode: result.code,
      output: result.output,
      durationMs: result.ms,
    };
  }

  audit(id: string, limit = 50): RemoteRun[] {
    return (
      this.db
        .query("SELECT * FROM remote_audit WHERE server_id = ? ORDER BY started_at DESC LIMIT ?")
        .all(id, limit) as {
        id: string;
        server_id: string;
        command: string;
        risk: CommandRisk;
        actor: "user" | "agent";
        reason: string | null;
        started_at: number;
        exit_code: number | null;
        output: string | null;
        duration_ms: number | null;
      }[]
    ).map((r) => ({
      id: r.id,
      serverId: r.server_id,
      command: r.command,
      risk: r.risk,
      actor: r.actor,
      reason: r.reason ?? undefined,
      startedAt: r.started_at,
      exitCode: r.exit_code ?? undefined,
      output: r.output ?? undefined,
      durationMs: r.duration_ms ?? undefined,
    }));
  }

  // ---- agent requests ------------------------------------------------------------

  /**
   * An AI agent asks to run a command. Read-only commands run right away;
   * anything else waits in the inbox until the user approves or denies it.
   */
  async agentRequest(
    serverRef: string,
    command: string,
    reason?: string,
  ): Promise<{ status: "done"; run: RemoteRun } | { status: "pending"; approvalId: string }> {
    const server = this.get(serverRef);
    if (!server) throw new Error(`No server called "${serverRef}". Ask the user to add it in God Eye → Servers.`);
    const { risk } = classifyCommand(command);
    if (risk === "read")
      return { status: "done", run: await this.run(server.id, command, { confirmations: 0, actor: "agent", reason }) };
    const approval: Approval = {
      id: crypto.randomUUID(),
      kind: "server-command",
      serverId: server.id,
      serverName: server.name,
      serverTag: server.tag,
      command,
      risk,
      reason,
      requestedAt: Date.now(),
    };
    this.approvals.set(approval.id, { approval, status: "pending" });
    this.publishApprovals();
    // Unanswered requests expire after 15 minutes.
    setTimeout(() => {
      const pending = this.approvals.get(approval.id);
      if (pending?.status === "pending") {
        pending.status = "denied";
        this.publishApprovals();
      }
    }, 15 * 60_000);
    return { status: "pending", approvalId: approval.id };
  }

  async decide(id: string, approve: boolean): Promise<Pending | undefined> {
    const pending = this.approvals.get(id);
    if (pending?.status !== "pending") return pending;
    pending.status = approve ? "approved" : "denied";
    this.publishApprovals();
    if (approve) {
      const needed = { read: 0, change: 1, danger: 2 }[pending.approval.risk];
      pending.run = await this.run(pending.approval.serverId, pending.approval.command, {
        confirmations: needed,
        actor: "agent",
        reason: pending.approval.reason,
      }).catch((err: Error) => ({
        id: "",
        serverId: pending.approval.serverId,
        command: pending.approval.command,
        risk: pending.approval.risk,
        actor: "agent" as const,
        startedAt: Date.now(),
        exitCode: -1,
        output: err.message,
      }));
    }
    return pending;
  }

  approvalStatus(id: string): Pending | undefined {
    return this.approvals.get(id);
  }

  pendingApprovals(): Approval[] {
    return [...this.approvals.values()].filter((p) => p.status === "pending").map((p) => p.approval);
  }

  private publishApprovals(): void {
    this.bus.publish({ type: "approvals", approvals: this.pendingApprovals() });
  }
}
