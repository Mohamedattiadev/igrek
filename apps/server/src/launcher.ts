import type { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { LaunchPart } from "@igrek/core";
import type { Bus, StopRegistry } from "./bus";
import type { Services } from "./preview/services";

/**
 * Starting a project (plan.md 19.4): every part of it that runs (an app's dev script, each app of
 * a monorepo, Procfile processes, Makefile targets, Docker Compose services) in one list, started
 * one by one or all at once, each with its log and the address it serves; and, if the user wants,
 * started by themselves when the project is opened. Nothing runs that the project's own files do
 * not name, and nothing runs without the user's click or their "start on open".
 */

/** Folders where a monorepo keeps its apps. */
const APP_DIRS = ["apps", "packages", "services"];
const APP_NAMES = ["frontend", "backend", "server", "client", "web", "api", "admin", "worker"];
/** The scripts that start an app, in the order they are preferred. */
const SCRIPTS = ["dev", "start", "serve", "watch"];
const MAKE_TARGET = /^(dev|run|start|serve|up)([\w-]*)\s*:(?!=)/gm;
const URL_IN_LOG = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d+))/;
const PORT_IN_LOG = /\b(?:port|PORT|listening on|Listening on)\D{0,12}(\d{2,5})\b/;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");
const MAX_LOG = 400;

type Found = Omit<LaunchPart, "status">;

/** The package manager the folder's lockfile names (the root's when the folder has none). */
function manager(dir: string, root: string): string {
  for (const d of [dir, root]) {
    if (existsSync(join(d, "bun.lock")) || existsSync(join(d, "bun.lockb"))) return "bun";
    if (existsSync(join(d, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(join(d, "yarn.lock"))) return "yarn";
  }
  return "npm";
}

/** The folders that may hold an app: the project, apps/*, packages/*, services/*, frontend, backend… */
function appFolders(root: string): string[] {
  const out = [root];
  for (const name of APP_NAMES) if (existsSync(join(root, name, "package.json"))) out.push(join(root, name));
  for (const dir of APP_DIRS) {
    if (!existsSync(join(root, dir))) continue;
    // In name order, so the list is the same on every computer.
    const entries = readdirSync(join(root, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries)
      if (e.isDirectory() && existsSync(join(root, dir, e.name, "package.json"))) out.push(join(root, dir, e.name));
  }
  return out;
}

function scriptParts(root: string): Found[] {
  const out: Found[] = [];
  for (const dir of appFolders(root)) {
    let pkg: { name?: string; scripts?: Record<string, string> };
    try {
      pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    const script = SCRIPTS.find((s) => pkg.scripts?.[s]);
    if (!script) continue;
    const where = relative(root, dir) || ".";
    out.push({
      id: `script:${where}:${script}`,
      name: where === "." ? (pkg.name ?? script) : where,
      kind: "script",
      command: `${manager(dir, root)} run ${script}`,
      cwd: where,
    });
  }
  return out;
}

function procfileParts(root: string): Found[] {
  if (!existsSync(join(root, "Procfile"))) return [];
  return readFileSync(join(root, "Procfile"), "utf8")
    .split("\n")
    .flatMap((line) => {
      const m = line.match(/^([\w-]+):\s*(.+)$/);
      return m?.[1] && m[2]
        ? [{ id: `procfile:${m[1]}`, name: m[1], kind: "procfile" as const, command: m[2].trim(), cwd: "." }]
        : [];
    });
}

function makeParts(root: string): Found[] {
  if (!existsSync(join(root, "Makefile"))) return [];
  const text = readFileSync(join(root, "Makefile"), "utf8");
  return [...text.matchAll(MAKE_TARGET)].map((m) => {
    const target = `${m[1]}${m[2] ?? ""}`;
    return { id: `make:${target}`, name: `make ${target}`, kind: "make" as const, command: `make ${target}`, cwd: "." };
  });
}

/** Every runnable part the project's files name, without Docker (that one asks Docker). */
export function discoverParts(root: string): Found[] {
  return [...scriptParts(root), ...procfileParts(root), ...makeParts(root)];
}

/** The address a part serves, from what it printed. */
export function addressIn(line: string): { url?: string; port?: number } | undefined {
  const url = line.match(URL_IN_LOG);
  if (url?.[1]) return { url: url[1].replace("0.0.0.0", "localhost"), port: Number(url[2]) };
  const port = line.match(PORT_IN_LOG)?.[1];
  return port && Number(port) > 79 ? { port: Number(port) } : undefined;
}

type Running = {
  proc: ReturnType<typeof Bun.spawn>;
  log: string[];
  status: LaunchPart["status"];
  url?: string;
  port?: number;
  unregister: () => void;
};

export class Launcher {
  private running = new Map<string, Running>();

  constructor(
    private readonly db: Database,
    private readonly bus: Bus,
    private readonly stops: StopRegistry,
    private readonly services: Services,
    private readonly projectPath: (id: string) => string | undefined,
  ) {}

  private key = (projectId: string, partId: string) => `${projectId}\u0000${partId}`;

  private changed(projectId: string): void {
    this.bus.publish({ type: "launch-changed", projectId });
  }

  private root(projectId: string): string {
    const root = this.projectPath(projectId);
    if (!root || !existsSync(root)) throw new Error("Project folder not found");
    return root;
  }

  /** The parts with how each stands: processes Igrek started, and the Compose services' own state. */
  async parts(projectId: string): Promise<LaunchPart[]> {
    const root = this.root(projectId);
    const own = discoverParts(root).map((p) => {
      const r = this.running.get(this.key(projectId, p.id));
      return {
        ...p,
        status: r?.status ?? ("stopped" as const),
        ...(r?.url ? { url: r.url } : {}),
        ...(r?.port ? { port: r.port } : {}),
      };
    });
    const compose = await this.services.list(root).catch(() => undefined);
    const docker: LaunchPart[] = (compose?.services ?? []).map((s) => ({
      id: `compose:${s.name}`,
      name: s.name,
      kind: "compose",
      command: `docker compose -f ${compose?.file} up -d ${s.name}`,
      cwd: ".",
      status: s.running ? "running" : "stopped",
    }));
    return [...docker, ...own];
  }

  logs(projectId: string, partId: string): string[] {
    return this.running.get(this.key(projectId, partId))?.log ?? [];
  }

  async start(projectId: string, partId: string): Promise<void> {
    const root = this.root(projectId);
    if (partId.startsWith("compose:")) {
      await this.services.one(root, partId.slice(8), "start");
      return this.changed(projectId);
    }
    const part = discoverParts(root).find((p) => p.id === partId);
    if (!part) throw new Error("This part is not in the project any more");
    const key = this.key(projectId, partId);
    const now = this.running.get(key);
    if (now && (now.status === "running" || now.status === "starting")) return;
    // Its own process group, so stopping it stops what it started (a dev server under npm).
    const shell = ["sh", "-c", part.command];
    const proc = Bun.spawn(Bun.which("setsid") ? ["setsid", ...shell] : shell, {
      cwd: join(root, part.cwd),
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      env: { ...process.env, FORCE_COLOR: "0", BROWSER: "none" },
    });
    const r: Running = {
      proc,
      log: [],
      status: "starting",
      unregister: this.stops.register(`launch-${proc.pid}`, {
        label: part.name,
        stop: () => this.stop(projectId, partId),
      }),
    };
    this.running.set(key, r);
    void this.read(projectId, r, proc.stdout as ReadableStream<Uint8Array>);
    void this.read(projectId, r, proc.stderr as ReadableStream<Uint8Array>);
    void proc.exited.then((code) => {
      r.unregister();
      r.status = r.status === "stopped" || code === 0 || code === 143 ? "stopped" : "failed";
      r.log.push(`[exited with ${code}]`);
      this.changed(projectId);
    });
    // Nothing printed an address after a while: it runs all the same (a worker, a watcher).
    setTimeout(() => {
      if (r.status === "starting") {
        r.status = "running";
        this.changed(projectId);
      }
    }, 8000).unref?.();
    this.changed(projectId);
  }

  private async read(projectId: string, r: Running, stream: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      for (const raw of decoder.decode(chunk).split("\n")) {
        const line = raw.replace(ANSI, "").trimEnd();
        if (!line) continue;
        r.log.push(line);
        if (r.log.length > MAX_LOG) r.log.shift();
        const found = !r.url ? addressIn(line) : undefined;
        if (found) {
          Object.assign(r, found);
          r.status = "running";
          this.changed(projectId);
        }
      }
    }
  }

  async stop(projectId: string, partId: string): Promise<void> {
    if (partId.startsWith("compose:")) {
      await this.services.one(this.root(projectId), partId.slice(8), "stop");
      return this.changed(projectId);
    }
    const r = this.running.get(this.key(projectId, partId));
    if (!r || r.status === "stopped" || r.status === "failed") return;
    r.status = "stopped";
    try {
      // The whole group when it has one; the process alone otherwise.
      process.kill(-r.proc.pid, "SIGTERM");
    } catch {
      r.proc.kill();
    }
    this.changed(projectId);
  }

  async startAll(projectId: string, only?: string[]): Promise<void> {
    const parts = await this.parts(projectId);
    for (const p of parts)
      if (p.status !== "running" && (!only || only.includes(p.id))) await this.start(projectId, p.id);
  }

  async stopAll(projectId: string): Promise<void> {
    for (const p of await this.parts(projectId))
      if (p.status === "running" || p.status === "starting") await this.stop(projectId, p.id);
  }

  /** The parts that start by themselves when the project is opened. */
  auto(projectId: string): string[] {
    return (
      this.db.query("SELECT part FROM launch_auto WHERE project_id = ? ORDER BY part").all(projectId) as {
        part: string;
      }[]
    ).map((r) => r.part);
  }

  setAuto(projectId: string, parts: string[]): void {
    this.db.transaction(() => {
      this.db.query("DELETE FROM launch_auto WHERE project_id = ?").run(projectId);
      for (const part of parts.slice(0, 50))
        this.db
          .query("INSERT OR IGNORE INTO launch_auto (project_id, part) VALUES (?, ?)")
          .run(projectId, part.slice(0, 200));
    })();
    this.changed(projectId);
  }

  /** The project was opened: its "start on open" parts that are not running yet start. */
  async opened(projectId: string): Promise<void> {
    const auto = this.auto(projectId);
    if (auto.length) await this.startAll(projectId, auto);
  }

  stopEverything(): void {
    for (const r of this.running.values())
      if (r.status === "running" || r.status === "starting")
        try {
          process.kill(-r.proc.pid, "SIGTERM");
        } catch {
          r.proc.kill();
        }
  }
}
