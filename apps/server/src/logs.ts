import type { Database } from "bun:sqlite";
import { closeSync, existsSync, openSync, readdirSync, readSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { groupLines, type LogGroup, type LogLine, type LogSource, lineLevel } from "@godeye/core";
import type { Docker } from "./docker";
import type { Files } from "./files";
import type { Servers } from "./servers";
import type { Store } from "./store";

const TAIL_BYTES = 512 * 1024;
const MAX_LINES = 3000;

export interface SavedSource {
  id: string;
  projectId?: string;
  source: LogSource;
}

export function sourceLabel(s: LogSource): string {
  if (s.label) return s.label;
  if (s.kind === "file") return s.path.split("/").slice(-2).join("/");
  if (s.kind === "docker") return `docker:${s.container}`;
  if (s.kind === "journal") return `journal:${s.unit}`;
  return `terminal:${s.terminalId}`;
}

/** systemd unit names; nothing that could change the shell command. */
export function validUnit(unit: string): boolean {
  return /^[a-zA-Z0-9@._:-]{1,120}$/.test(unit);
}

/** The time at the start of a line (ISO, "2026-10-17 12:00:01", Docker's --timestamps). */
export function lineTime(text: string): number | undefined {
  const m = text.match(/^\[?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/);
  if (!m?.[1]) return undefined;
  const t = Date.parse(m[1].replace(",", ".").replace(" ", "T"));
  return Number.isNaN(t) ? undefined : t;
}

export function toLines(source: string, text: string): LogLine[] {
  const out: LogLine[] = [];
  let last: LogLine | undefined;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) continue;
    // Stack frames and indented continuation lines belong to the line before them.
    if (last && /^(\s+at\s|\s{2,}|\t|Caused by:|\s*File ")/.test(line) && last.text.length < 4000) {
      last.text += `\n${line}`;
      continue;
    }
    last = {
      source,
      text: line.slice(0, 4000),
      level: lineLevel(line),
      ...(lineTime(line) ? { at: lineTime(line) } : {}),
    };
    out.push(last);
  }
  return out;
}

function tailFile(path: string): string {
  const size = statSync(path).size;
  const start = Math.max(0, size - TAIL_BYTES);
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const text = buf.toString("utf8");
    // Drop the first, probably cut, line.
    return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
  } finally {
    closeSync(fd);
  }
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".venv", "venv", "dist", "build", ".next", "target", "__pycache__"]);

/** .log files in a project, a few folders deep. */
export function findLogFiles(root: string, depth = 3): string[] {
  const out: string[] = [];
  const walk = (dir: string, level: number) => {
    if (out.length >= 30) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory() && level < depth && !SKIP_DIRS.has(e.name) && !e.name.startsWith("."))
        walk(join(dir, e.name), level + 1);
      else if (e.isFile() && /\.log(\.\d+)?$/.test(e.name)) out.push(join(dir, e.name));
    }
  };
  walk(root, 0);
  return out;
}

/**
 * Log center (plan.md 12): files on this computer, Docker containers and systemd services
 * (here or on a server) in one place. Lines are searched, and errors that are the same once
 * numbers and ids are set aside are grouped, so one bug repeated 400 times is one row.
 */
export class Logs {
  constructor(
    private readonly db: Database,
    private readonly store: Store,
    private readonly files: Files,
    private readonly docker: Docker,
    private readonly servers: Servers,
  ) {}

  saved(projectId?: string): SavedSource[] {
    const rows = this.db
      .query(
        projectId
          ? "SELECT * FROM log_sources WHERE project_id = ? ORDER BY created_at"
          : "SELECT * FROM log_sources ORDER BY created_at",
      )
      .all(...(projectId ? [projectId] : [])) as { id: string; project_id: string | null; source: string }[];
    return rows.map((r) => ({
      id: r.id,
      ...(r.project_id ? { projectId: r.project_id } : {}),
      source: JSON.parse(r.source) as LogSource,
    }));
  }

  add(source: LogSource, projectId?: string): SavedSource {
    this.validate(source);
    const id = crypto.randomUUID().slice(0, 12);
    this.db
      .query("INSERT INTO log_sources (id, project_id, source, created_at) VALUES (?, ?, ?, ?)")
      .run(id, projectId ?? null, JSON.stringify(source), Date.now());
    return { id, ...(projectId ? { projectId } : {}), source };
  }

  remove(id: string): void {
    this.db.query("DELETE FROM log_sources WHERE id = ?").run(id);
  }

  private validate(source: LogSource): void {
    if (source.kind === "file") this.filePath(source.path);
    else if (source.kind === "docker") {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(source.container)) throw new Error("Unknown container");
    } else if (source.kind === "journal") {
      if (!validUnit(source.unit)) throw new Error("Unknown service");
    } else throw new Error("Unknown log source");
    if ("serverId" in source && source.serverId && !this.servers.get(source.serverId))
      throw new Error("Server not found");
  }

  /** A log file inside a project or added folder (never a protected place), or under /var/log. */
  private filePath(path: string): string {
    if (path.startsWith("/var/log/")) {
      const real = realpathSync(path);
      if (!real.startsWith("/var/log/")) throw new Error("This location is protected");
      return real;
    }
    return this.files.resolve(path);
  }

  /** Sources worth showing for a project: its .log files and its Docker Compose containers. */
  async suggestions(projectId: string): Promise<LogSource[]> {
    const project = this.store.projectRow(projectId);
    if (!project || !existsSync(project.path)) return [];
    const out: LogSource[] = findLogFiles(project.path).map((path) => ({
      kind: "file",
      path,
      label: relative(project.path, path),
    }));
    try {
      const containers = await this.docker.containers({ kind: "local" });
      const name = project.path
        .split("/")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9_-]/g, "");
      for (const c of containers)
        if (
          c.project &&
          (c.project === name || c.project.startsWith(`${name}-`) || c.project === project.name.toLowerCase())
        )
          out.push({ kind: "docker", container: c.name, label: c.service ?? c.name });
    } catch {
      // No Docker here.
    }
    return out;
  }

  async read(source: LogSource, tail = 500): Promise<LogLine[]> {
    this.validate(source);
    const name = sourceLabel(source);
    let text = "";
    if (source.kind === "file") text = tailFile(this.filePath(source.path));
    else if (source.kind === "docker")
      text = await this.docker.logs(
        source.serverId ? { kind: "server", serverId: source.serverId } : { kind: "local" },
        source.container,
        tail,
      );
    else if (source.kind === "journal") {
      const args = [
        "journalctl",
        "-u",
        source.unit,
        "-n",
        String(Math.min(5000, tail)),
        "--no-pager",
        "-o",
        "short-iso",
      ];
      if (source.serverId) {
        const r = await this.servers.inspect(source.serverId, args.join(" "), `Logs: ${source.unit}`);
        text = r.output;
      } else {
        const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
        text = await new Response(proc.stdout).text();
        await proc.exited;
      }
    }
    return toLines(name, text).slice(-MAX_LINES);
  }

  /** Reads every source (errors per source are reported, not thrown), filters and groups. */
  async search(
    sources: LogSource[],
    opts: { query?: string; level?: LogLine["level"]; tail?: number } = {},
  ): Promise<{ lines: LogLine[]; groups: LogGroup[]; failed: { source: string; error: string }[] }> {
    const failed: { source: string; error: string }[] = [];
    const all = (
      await Promise.all(
        sources.slice(0, 20).map((s) =>
          this.read(s, opts.tail).catch((err: Error) => {
            failed.push({ source: sourceLabel(s), error: err.message });
            return [] as LogLine[];
          }),
        ),
      )
    ).flat();
    const query = opts.query?.trim().toLowerCase();
    let lines = query ? all.filter((l) => l.text.toLowerCase().includes(query)) : all;
    if (opts.level === "error") lines = lines.filter((l) => l.level === "error");
    else if (opts.level === "warn") lines = lines.filter((l) => l.level !== "info");
    // Lines with a time are put in order across sources; the rest keep their place.
    if (sources.length > 1 && lines.every((l) => l.at)) lines = [...lines].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    return { lines: lines.slice(-MAX_LINES), groups: groupLines(lines).slice(0, 100), failed };
  }
}
