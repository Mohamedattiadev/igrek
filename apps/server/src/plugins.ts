import type { Database } from "bun:sqlite";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";
import { PLUGIN_PERMISSIONS, type PluginInfo, type PluginManifest, type PluginPermission } from "@godeye/core";

const MANIFEST = "godeye-plugin.json";

/** Checks a manifest and keeps only what God Eye understands. */
export function readManifest(dir: string): PluginManifest {
  const file = join(dir, MANIFEST);
  if (!existsSync(file)) throw new Error(`No ${MANIFEST} in this folder`);
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<PluginManifest>;
  const id = String(raw.id ?? "");
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id))
    throw new Error("The plugin id must be lowercase letters, numbers and dashes");
  const name = String(raw.name ?? "")
    .trim()
    .slice(0, 60);
  if (!name) throw new Error("The plugin has no name");
  const permissions = (Array.isArray(raw.permissions) ? raw.permissions : []).filter((p): p is PluginPermission =>
    PLUGIN_PERMISSIONS.includes(p as PluginPermission),
  );
  const panels = (Array.isArray(raw.panels) ? raw.panels : [])
    .filter(
      (p) =>
        p &&
        /^[\w-]{1,40}$/.test(String(p.id)) &&
        typeof p.entry === "string" &&
        /\.html?$/.test(p.entry) &&
        !p.entry.includes(".."),
    )
    .slice(0, 10)
    .map((p) => ({
      id: String(p.id),
      title: String(p.title ?? p.id).slice(0, 60),
      entry: String(p.entry),
      place: p.place === "project" ? ("project" as const) : ("tools" as const),
    }));
  const commands = (Array.isArray(raw.commands) ? raw.commands : [])
    .filter(
      (c) =>
        c &&
        /^[\w-]{1,40}$/.test(String(c.id)) &&
        Array.isArray(c.run) &&
        c.run.length > 0 &&
        c.run.every((a) => typeof a === "string"),
    )
    .slice(0, 20)
    .map((c) => ({
      id: String(c.id),
      title: String(c.title ?? c.id).slice(0, 60),
      run: c.run.map(String).slice(0, 30),
    }));
  return {
    id,
    name,
    version: String(raw.version ?? "0.0.0").slice(0, 20),
    ...(raw.description ? { description: String(raw.description).slice(0, 300) } : {}),
    ...(raw.author ? { author: String(raw.author).slice(0, 60) } : {}),
    permissions,
    panels,
    commands,
  };
}

/** A command as one shell line, each part quoted. */
export function shellLine(run: string[]): string {
  return run.map((a) => (/^[\w./:=@%+-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(" ");
}

/**
 * Plugin system (plan.md 12): a plugin is a folder with a godeye-plugin.json, installed from a
 * folder on this computer or a git URL. It stays off until you read and approve what it asks
 * for. Its pages run in a sandbox with no network (they can't send anything out) and read only
 * the data their permissions name, through a message bridge. Its commands run in a terminal you
 * see, in the project's folder, only when you click. Plugins never run inside God Eye's server.
 */
export class Plugins {
  constructor(
    private readonly db: Database,
    private readonly dir: string,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  list(): PluginInfo[] {
    const rows = this.db.query("SELECT * FROM plugins ORDER BY installed_at").all() as {
      id: string;
      source: string;
      enabled: number;
      installed_at: number;
    }[];
    return rows.map((r) => {
      try {
        return {
          ...readManifest(join(this.dir, r.id)),
          enabled: !!r.enabled,
          source: r.source,
          installedAt: r.installed_at,
        };
      } catch (err) {
        return {
          id: r.id,
          name: r.id,
          version: "?",
          permissions: [],
          panels: [],
          commands: [],
          enabled: false,
          source: r.source,
          installedAt: r.installed_at,
          error: (err as Error).message,
        };
      }
    });
  }

  get(id: string): PluginInfo | undefined {
    return this.list().find((p) => p.id === id);
  }

  /** From a local folder (copied) or a git URL (shallow clone). Installed turned off. */
  async install(source: string): Promise<PluginInfo> {
    const from = source.trim();
    const tmp = join(this.dir, `.incoming-${Date.now()}`);
    try {
      if (/^(https:\/\/|git@)[\w.@:/~-]+$/.test(from)) {
        const p = Bun.spawnSync(["git", "clone", "--depth", "1", "--", from, tmp], {
          stdout: "pipe",
          stderr: "pipe",
          timeout: 120_000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
        if (p.exitCode !== 0) throw new Error(p.stderr.toString().trim().split("\n").pop() || "git clone failed");
        rmSync(join(tmp, ".git"), { recursive: true, force: true });
      } else if (from.startsWith("/") && existsSync(from) && statSync(from).isDirectory()) {
        cpSync(from, tmp, { recursive: true, filter: (src) => !/(^|\/)(node_modules|\.git)(\/|$)/.test(src) });
      } else throw new Error("Give a folder path (starting with /) or an https git URL");
      const manifest = readManifest(tmp);
      const target = join(this.dir, manifest.id);
      rmSync(target, { recursive: true, force: true });
      cpSync(tmp, target, { recursive: true });
      this.db
        .query(
          "INSERT INTO plugins (id, source, enabled, installed_at) VALUES (?, ?, 0, ?) ON CONFLICT(id) DO UPDATE SET source = excluded.source, enabled = 0, installed_at = excluded.installed_at",
        )
        .run(manifest.id, from, Date.now());
      return this.get(manifest.id) as PluginInfo;
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  setEnabled(id: string, enabled: boolean): void {
    if (!this.get(id)) throw new Error("Plugin not found");
    this.db.query("UPDATE plugins SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  }

  remove(id: string): void {
    this.db.query("DELETE FROM plugins WHERE id = ?").run(id);
    if (/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) rmSync(join(this.dir, id), { recursive: true, force: true });
  }

  /** A file of an enabled plugin, never outside its folder. */
  file(id: string, path: string): string | undefined {
    const plugin = this.get(id);
    if (!plugin?.enabled) return undefined;
    const root = realpathSync(join(this.dir, id)) + sep;
    const full = normalize(resolve(root, path));
    if (!full.startsWith(root) || !existsSync(full) || !statSync(full).isFile()) return undefined;
    return realpathSync(full).startsWith(root) ? full : undefined;
  }

  allows(id: string, permission: PluginPermission): boolean {
    const p = this.get(id);
    return !!p?.enabled && p.permissions.includes(permission);
  }
}
