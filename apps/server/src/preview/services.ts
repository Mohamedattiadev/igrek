import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The services a project's app needs before its preview can work (a database, a cache, object
 * storage), when the project describes them in a Docker Compose file: found in the usual folders,
 * shown with their state, and started with one click by the user. Igrek never starts them unasked,
 * and never removes containers, images or volumes.
 */
type Run = (args: string[], cwd: string) => Promise<{ code: number; out: string; err: string }>;

const NAME = /^(docker-)?compose([.-][\w.-]+)?\.ya?ml$/i;
const PLACES = ["", "infra", "docker", "deploy", ".devcontainer", "ops"];

export interface ComposeFile {
  /** Relative to the project. */
  file: string;
  services: { name: string; running: boolean }[];
}

function dockerRunner(): Run {
  return async (args, cwd) => {
    const docker = Bun.which("docker");
    if (!docker) return { code: 127, out: "", err: "Docker is not installed" };
    const proc = Bun.spawn([docker, ...args], { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const timer = setTimeout(() => proc.kill(), 120_000);
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    return { code, out, err: err.trim() };
  };
}

/** Compose files in the project's usual places; one for development comes first. */
export function composeFiles(root: string): string[] {
  const out: string[] = [];
  const look = (dir: string, deeper: boolean) => {
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isFile() && NAME.test(e.name)) out.push(relative(root, join(dir, e.name)));
      // One level inside the usual folders too (infra/compose/docker-compose.dev.yml).
      else if (deeper && e.isDirectory() && !e.name.startsWith(".")) look(join(dir, e.name), false);
    }
  };
  for (const place of PLACES) if (existsSync(join(root, place))) look(join(root, place), place !== "");
  const dev = (f: string) => (/dev|local/i.test(f) ? 0 : /prod/i.test(f) ? 2 : 1);
  return out.sort((a, b) => dev(a) - dev(b) || a.localeCompare(b));
}

/** `docker compose ps --format json`: one JSON object per line (newer Docker) or one array (older). */
export function runningServices(text: string): Set<string> {
  const trimmed = text.trim();
  if (!trimmed) return new Set();
  const rows: { Service?: string; State?: string }[] = trimmed.startsWith("[")
    ? JSON.parse(trimmed)
    : trimmed.split("\n").map((line) => JSON.parse(line));
  return new Set(rows.filter((r) => r.State === "running" && r.Service).map((r) => r.Service as string));
}

export class Services {
  constructor(private readonly run: Run = dockerRunner()) {}

  /** The project's compose file (the development one when there are several) and its services' state. */
  async list(root: string): Promise<ComposeFile | undefined> {
    const file = composeFiles(root)[0];
    if (!file) return undefined;
    const names = await this.run(["compose", "-f", file, "config", "--services"], root);
    if (names.code !== 0) throw new Error(names.err.split("\n").pop() || "docker compose could not read the file");
    const ps = await this.run(["compose", "-f", file, "ps", "--format", "json"], root);
    const running = ps.code === 0 ? runningServices(ps.out) : new Set<string>();
    return {
      file,
      services: names.out
        .split("\n")
        .map((n) => n.trim())
        .filter(Boolean)
        .map((name) => ({ name, running: running.has(name) })),
    };
  }

  /** One service up (`up -d <name>`), or stopped (`stop <name>`: the container stays, nothing is removed). */
  async one(root: string, name: string, action: "start" | "stop"): Promise<void> {
    const file = composeFiles(root)[0];
    if (!file) throw new Error("This project has no Docker Compose file");
    if (!/^[\w.-]+$/.test(name)) throw new Error("Unknown service");
    const args = action === "start" ? ["compose", "-f", file, "up", "-d", name] : ["compose", "-f", file, "stop", name];
    const done = await this.run(args, root);
    if (done.code !== 0)
      throw new Error(done.err.split("\n").slice(-3).join("\n") || `docker compose ${action} failed`);
  }

  /** Starts what is not running yet (`up -d`); containers that run already are left as they are. */
  async start(root: string): Promise<ComposeFile | undefined> {
    const file = composeFiles(root)[0];
    if (!file) throw new Error("This project has no Docker Compose file");
    const up = await this.run(["compose", "-f", file, "up", "-d"], root);
    if (up.code !== 0) throw new Error(up.err.split("\n").slice(-3).join("\n") || "docker compose up failed");
    return this.list(root);
  }
}
