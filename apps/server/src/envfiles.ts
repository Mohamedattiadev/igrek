import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { EnvBackup, EnvFileInfo, EnvKeyRow, EnvKeyUse, EnvOverview } from "@godeye/core";

/**
 * .env editor (plan.md 5.6). Values stay on this computer: they're masked in
 * every listing, revealed one at a time on request, never sent to AI or the
 * hub, and never written to logs or error messages. Every write is preceded
 * by a backup in God Eye's own data folder.
 */

const ENV_NAME = /^\.env(\.[\w.-]+)?$/;
const EXAMPLE = /\.(example|sample|template|dist|defaults)$/;
const SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "venv",
  ".venv",
  "vendor",
  "target",
  "coverage",
]);

interface Entry {
  key: string;
  value: string;
  /** First and last line (0-based): a quoted value may span several lines (private keys). */
  start: number;
  end: number;
}

export function parse(text: string): Entry[] {
  const lines = text.split("\n");
  const out: Entry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = (lines[i] ?? "").match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/);
    if (!m?.[1]) continue;
    let value = (m[2] ?? "").trim();
    const start = i;
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      const closed = (s: string) => s.length >= 1 && s.endsWith(quote) && !s.endsWith(`\\${quote}`);
      if (value.length >= 2 && closed(value.slice(1))) value = value.slice(1, -1);
      else {
        // Opening quote without a closing one: the value continues on the next lines.
        const parts = [value.slice(1)];
        while (i + 1 < lines.length) {
          i++;
          const next = lines[i] ?? "";
          if (closed(next.trimEnd())) {
            parts.push(next.trimEnd().slice(0, -1));
            break;
          }
          parts.push(next);
        }
        value = parts.join("\n");
      }
    } else value = value.replace(/\s+#.*$/, "");
    out.push({ key: m[1], value, start, end: i });
  }
  return out;
}

/** "sk-ant-api03-…3f2a" → "sk-••••3f2a"; short values are fully hidden. */
export function mask(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••";
  return `${value.slice(0, 3)}••••${value.length > 16 ? value.slice(-4) : ""}`;
}

function envLabel(name: string): string {
  const suffix = name.replace(EXAMPLE, "").replace(/^\.env\.?/, "");
  if (!suffix) return "default";
  if (suffix === "prod") return "production";
  if (suffix === "dev") return "development";
  return suffix;
}

function quoteIfNeeded(value: string): string {
  return /[\s#"'$`\\]/.test(value) || value === "" ? JSON.stringify(value) : value;
}

// ---- text-level edits (shared by local files and files on a server) ----------------------

export function valueIn(text: string, key: string): string {
  const found = parse(text).find((e) => e.key === key);
  if (!found) throw new Error("Key not found");
  return found.value;
}

/** Adds or changes one key; comments, order and other lines stay as they were. */
export function setInText(text: string, key: string, value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) throw new Error("Invalid key name");
  if (/[\r\n]/.test(value)) throw new Error("Values can't contain line breaks");
  const lines = text.split("\n");
  const entry = `${key}=${quoteIfNeeded(value)}`;
  const found = parse(text).find((e) => e.key === key);
  if (found) {
    const line = lines[found.start]?.match(/^\s*export\s+/) ? `export ${entry}` : entry;
    // A multi-line value is replaced as a whole.
    lines.splice(found.start, found.end - found.start + 1, line);
  } else {
    if (lines.length && lines.at(-1) === "") lines.pop();
    lines.push(entry, "");
  }
  return lines.join("\n");
}

/** Removes every definition of the key, including all lines of a multi-line value. */
export function removeFromText(text: string, key: string): string {
  const lines = text.split("\n");
  for (const e of parse(text)
    .filter((x) => x.key === key)
    .reverse())
    lines.splice(e.start, e.end - e.start + 1);
  return lines.join("\n");
}

export function keyCount(text: string): number {
  return parse(text).length;
}

export class EnvFiles {
  constructor(private readonly backupDir: string) {}

  /** Env files in the project folder and its sub-packages (a few levels deep). */
  list(root: string): string[] {
    const out: string[] = [];
    const walk = (dir: string, depth: number) => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isFile() && ENV_NAME.test(entry.name)) out.push(relative(root, join(dir, entry.name)));
        else if (entry.isDirectory() && depth < 3 && !SKIP.has(entry.name) && !entry.name.startsWith("."))
          walk(join(dir, entry.name), depth + 1);
      }
    };
    walk(root, 0);
    return out.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  }

  /** Only an existing (or new) .env file inside the project; anything else is refused. */
  private resolveFile(root: string, path: string, mustExist = true): string {
    const full = resolve(root, path);
    if (!full.startsWith(`${resolve(root)}${sep}`) || !ENV_NAME.test(full.split(sep).pop() ?? ""))
      throw new Error("Not an env file in this project");
    if (mustExist && !existsSync(full)) throw new Error("File not found");
    return full;
  }

  /** `extra`: env files read from elsewhere (a server over SSH), already as text. */
  overview(
    root: string,
    used: EnvKeyUse[],
    extra: { path: string; text?: string; error?: string; serverId: string; remotePath: string }[] = [],
  ): EnvOverview {
    const sources: { path: string; text?: string; error?: string; remote?: { serverId: string; path: string } }[] = [
      ...this.list(root).map((path) => ({ path })),
      ...extra.map((e) => ({
        path: e.path,
        text: e.text,
        error: e.error,
        remote: { serverId: e.serverId, path: e.remotePath },
      })),
    ];
    const files: EnvFileInfo[] = [];
    const rows = new Map<string, EnvKeyRow>();
    const row = (name: string) => {
      let r = rows.get(name);
      if (!r) {
        const use = used.find((u) => u.name === name);
        r = {
          name,
          values: {},
          usedInCode: !!use,
          provider: use?.provider,
          refs: use?.refs.slice(0, 3) ?? [],
          issues: [],
        };
        rows.set(name, r);
      }
      return r;
    };
    for (const source of sources) {
      const path = source.path;
      const name = (source.remote?.path ?? path).split("/").pop() ?? "";
      const example = EXAMPLE.test(name);
      let keyed: (Entry & { line: number })[] = [];
      if (source.error) {
        files.push({ path, env: "production", example: false, keys: 0, remote: source.remote, error: source.error });
        continue;
      }
      try {
        keyed = parse(source.text ?? readFileSync(join(root, path), "utf8")).map((e) => ({ ...e, line: e.start + 1 }));
      } catch {
        continue;
      }
      // A server's file is the live one: production unless its name says otherwise.
      const env = source.remote && envLabel(name) === "default" ? "production" : envLabel(name);
      files.push({ path, env, example, keys: keyed.length, remote: source.remote });
      const seen = new Set<string>();
      for (const l of keyed) {
        const r = row(l.key as string);
        if (seen.has(l.key as string)) r.issues.push({ kind: "duplicate", file: path });
        seen.add(l.key as string);
        const value = l.value ?? "";
        r.values[path] = { masked: mask(value), empty: value === "", line: l.line };
        if (example || !value) {
          if (!example && !value) r.issues.push({ kind: "empty", file: path });
          continue;
        }
        const n = (l.key as string).toUpperCase();
        if (
          /_(URL|URI|ENDPOINT|HOST_URL)$/.test(n) &&
          !/^[a-z][a-z0-9+.-]*:\/\//i.test(value) &&
          !value.startsWith("/")
        )
          r.issues.push({ kind: "format", file: path, expected: "url" });
        if (/(^|_)PORT$/.test(n) && !/^\d{1,5}$/.test(value))
          r.issues.push({ kind: "format", file: path, expected: "number" });
        if (/(_ENABLED|_DISABLED|^ENABLE_|^DISABLE_)/.test(n) && !/^(true|false|0|1|yes|no|on|off)$/i.test(value))
          r.issues.push({ kind: "format", file: path, expected: "boolean" });
      }
    }
    // Keys the code reads that a real (non-example) env file doesn't define.
    const realFiles = files.filter((f) => !f.example);
    for (const use of used) {
      const r = row(use.name);
      if (realFiles.length)
        for (const f of realFiles.filter((f) => f.env === "default" || f.env === "local"))
          if (!r.values[f.path]) r.issues.push({ kind: "missing", file: f.path });
    }
    for (const r of rows.values())
      if (!r.usedInCode && Object.keys(r.values).length && used.length) r.issues.push({ kind: "unused" });
    return { files, keys: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  }

  reveal(root: string, file: string, key: string): string {
    return valueIn(readFileSync(this.resolveFile(root, file), "utf8"), key);
  }

  private backupFolder(root: string, file: string): string {
    const id = createHash("sha1").update(resolve(root, file)).digest("hex").slice(0, 16);
    return join(this.backupDir, id);
  }

  private backup(root: string, file: string): void {
    const full = this.resolveFile(root, file, false);
    if (!existsSync(full)) return;
    const folder = this.backupFolder(root, file);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    // Names are times; two changes in the same millisecond must not overwrite each other's backup.
    let at = Date.now();
    while (existsSync(join(folder, `${at}.env`))) at++;
    const target = join(folder, `${at}.env`);
    copyFileSync(full, target);
    chmodSync(target, 0o600);
  }

  private write(full: string, text: string): void {
    const mode = existsSync(full) ? statSync(full).mode & 0o777 : 0o600;
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text, { mode });
  }

  /** Adds or changes one key; comments, order and other lines stay as they were. */
  set(root: string, file: string, key: string, value: string): void {
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) throw new Error("Invalid key name");
    if (/[\r\n]/.test(value)) throw new Error("Values can't contain line breaks");
    const full = this.resolveFile(root, file, false);
    this.backup(root, file);
    this.write(full, setInText(existsSync(full) ? readFileSync(full, "utf8") : "", key, value));
  }

  remove(root: string, file: string, key: string): void {
    const full = this.resolveFile(root, file);
    this.backup(root, file);
    this.write(full, removeFromText(readFileSync(full, "utf8"), key));
  }

  history(root: string, file: string): EnvBackup[] {
    const folder = this.backupFolder(root, file);
    if (!existsSync(folder)) return [];
    return readdirSync(folder)
      .filter((n) => /^\d+\.env$/.test(n))
      .map((n) => {
        const at = Number(n.slice(0, -4));
        let keys = 0;
        try {
          keys = parse(readFileSync(join(folder, n), "utf8")).length;
        } catch {
          // unreadable backup: still listed
        }
        return { id: String(at), at, keys };
      })
      .sort((a, b) => b.at - a.at)
      .slice(0, 50);
  }

  restore(root: string, file: string, id: string): void {
    if (!/^\d+$/.test(id)) throw new Error("Unknown backup");
    const source = join(this.backupFolder(root, file), `${id}.env`);
    if (!existsSync(source)) throw new Error("Unknown backup");
    const full = this.resolveFile(root, file, false);
    this.backup(root, file);
    this.write(full, readFileSync(source, "utf8"));
  }

  /**
   * Keeps .env.example in step: every key the code reads or a real env file
   * defines is listed, with an empty value. Values are never copied.
   */
  syncExample(root: string, used: EnvKeyUse[]): { file: string; added: string[] } {
    const existing =
      this.list(root).find((p) => p === ".env.example") ??
      this.list(root).find((p) => !p.includes("/") && EXAMPLE.test(p));
    const file = existing ?? ".env.example";
    const full = this.resolveFile(root, file, false);
    const text = existsSync(full) ? readFileSync(full, "utf8") : "";
    const have = new Set(parse(text).map((e) => e.key));
    const wanted = new Set(used.map((u) => u.name));
    for (const path of this.list(root).filter((p) => !EXAMPLE.test(p) && !p.includes("/")))
      for (const e of parse(readFileSync(join(root, path), "utf8"))) wanted.add(e.key);
    const added = [...wanted].filter((k) => !have.has(k)).sort();
    if (added.length) {
      if (existsSync(full)) this.backup(root, file);
      const body = `${text.replace(/\n*$/, text ? "\n\n" : "")}# Added by God Eye (fill in your own values in .env)\n${added.map((k) => `${k}=`).join("\n")}\n`;
      this.write(full, body);
    }
    return { file, added };
  }
}
