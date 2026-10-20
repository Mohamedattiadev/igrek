import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, normalize, relative, sep } from "node:path";
import type { FileContent, FileEntry, TrashItem } from "@igrek/core";

/** Never readable or writable through Igrek, even inside an allowed folder (plan.md 2.4). */
const DENIED = [
  ".ssh",
  ".gnupg",
  ".aws",
  ".kube",
  ".docker/config.json",
  ".netrc",
  ".pki",
  ".password-store",
  ".mozilla",
  ".config/google-chrome",
  ".config/chromium",
  ".config/BraveSoftware",
  ".local/share/keyrings",
  ".igrek/session.key",
  ".igrek/session.key",
  ".claude/.credentials.json",
  ".codex/auth.json",
].map((p) => join(homedir(), p));

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const TEXT_EXT = new Set(
  "ts tsx js jsx mjs cjs json jsonc md mdx txt css scss sass less html htm xml svg yml yaml toml ini cfg conf env sh bash zsh fish py rb go rs java kt kts swift c h cc cpp hpp cs php lua sql graphql gql vue svelte astro dart r m mm pl ex exs erl hs elm clj scala gradle properties lock log csv tsv dockerfile makefile gitignore editorconfig prisma tf hcl nix".split(
    " ",
  ),
);

export class FileAccessError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

function within(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
}

function real(path: string): string {
  // Resolve symlinks for existing paths; for new files resolve the parent.
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  return join(existsSync(parent) ? realpathSync(parent) : parent, basename(path));
}

/**
 * All file access goes through here: only inside allowed roots (projects and
 * folders the user added), never into secrets, and deletes go to a trash folder.
 */
/**
 * The folders inside one folder, by name only, for choosing a project folder (the Add folder
 * dialog). It sees the whole disk, so it shows less than a listing: folders only, never a file or
 * what is in one, and never hidden ones (.ssh, .config and the like). Starts in the home folder.
 */
export function folderNames(input?: string): { path: string; parent?: string; folders: string[] } {
  const path = normalize(input?.trim() ? input.trim() : homedir());
  if (!path.startsWith(sep) && !/^[A-Za-z]:[\\/]/.test(path)) throw new FileAccessError("Give a full path", 400);
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch {
    throw new FileAccessError("This folder cannot be opened", 404);
  }
  const folders = entries
    .filter((e) => !e.name.startsWith(".") && (e.isDirectory() || (e.isSymbolicLink() && isDir(join(path, e.name)))))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 500);
  const parent = dirname(path);
  return { path, ...(parent !== path ? { parent } : {}), folders };
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export class Files {
  constructor(
    private readonly roots: () => string[],
    private readonly trashDir: string,
  ) {
    mkdirSync(trashDir, { recursive: true });
  }

  /** Validates and normalizes a path; throws FileAccessError when it isn't allowed. */
  resolve(input: string): string {
    if (!input?.startsWith("/")) throw new FileAccessError("Use a full path");
    const path = real(normalize(input));
    if (DENIED.some((denied) => within(path, denied))) throw new FileAccessError("This location is protected", 403);
    const roots = this.roots().map((root) => (existsSync(root) ? realpathSync(root) : root));
    if (!roots.some((root) => within(path, root))) throw new FileAccessError("Outside your allowed folders", 403);
    return path;
  }

  private entry(path: string): FileEntry {
    const stat = statSync(path);
    return {
      name: basename(path),
      path,
      type: stat.isDirectory() ? "dir" : "file",
      size: stat.size,
      mtime: stat.mtimeMs,
    };
  }

  list(input: string, showHidden = false): FileEntry[] {
    const path = this.resolve(input);
    if (!statSync(path).isDirectory()) throw new FileAccessError("Not a folder");
    const entries: FileEntry[] = [];
    for (const name of readdirSync(path)) {
      if (!showHidden && name.startsWith(".") && name !== ".env" && name !== ".github") continue;
      if (name === "node_modules" || name === ".git") continue;
      const full = join(path, name);
      if (DENIED.some((denied) => within(full, denied))) continue;
      try {
        entries.push(this.entry(full));
      } catch {
        // Broken symlink or vanished file.
      }
    }
    return entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  }

  isText(path: string, sample?: Buffer): boolean {
    const ext = extname(path).slice(1).toLowerCase() || basename(path).toLowerCase();
    if (TEXT_EXT.has(ext)) return true;
    const bytes = sample ?? readFileSync(path).subarray(0, 4096);
    return !bytes.includes(0);
  }

  read(input: string): FileContent {
    const path = this.resolve(input);
    const stat = statSync(path);
    if (stat.isDirectory()) throw new FileAccessError("This is a folder");
    const base: Omit<FileContent, "content" | "kind"> = { path, size: stat.size, mtime: stat.mtimeMs };
    if (stat.size > MAX_TEXT_BYTES) return { ...base, kind: "binary" };
    const buffer = readFileSync(path);
    if (!this.isText(path, buffer.subarray(0, 4096))) return { ...base, kind: "binary" };
    return { ...base, kind: "text", content: buffer.toString("utf8") };
  }

  /** Saves a file; refuses if it changed on disk since the caller loaded it. */
  write(input: string, content: string, expectedMtime?: number): FileEntry {
    const path = this.resolve(input);
    if (path.split(sep).includes(".git")) throw new FileAccessError("Git's own files can't be edited here", 403);
    if (expectedMtime !== undefined && existsSync(path)) {
      const now = statSync(path).mtimeMs;
      if (Math.abs(now - expectedMtime) > 1)
        throw new FileAccessError("The file changed on disk since you opened it", 409);
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return this.entry(path);
  }

  writeBytes(input: string, bytes: Uint8Array): FileEntry {
    const path = this.resolve(input);
    if (existsSync(path)) throw new FileAccessError("A file with this name already exists", 409);
    writeFileSync(path, bytes);
    return this.entry(path);
  }

  mkdir(input: string): FileEntry {
    const path = this.resolve(input);
    if (existsSync(path)) throw new FileAccessError("Already exists", 409);
    mkdirSync(path, { recursive: true });
    return this.entry(path);
  }

  rename(fromInput: string, toInput: string): FileEntry {
    const from = this.resolve(fromInput);
    const to = this.resolve(toInput);
    if (existsSync(to)) throw new FileAccessError("Something with that name already exists", 409);
    renameSync(from, to);
    return this.entry(to);
  }

  copy(fromInput: string, toInput: string): FileEntry {
    const from = this.resolve(fromInput);
    const to = this.resolve(toInput);
    if (existsSync(to)) throw new FileAccessError("Something with that name already exists", 409);
    cpSync(from, to, { recursive: true });
    return this.entry(to);
  }

  /** Moves to Igrek's trash instead of deleting, so it can be restored. */
  trash(input: string): TrashItem {
    const path = this.resolve(input);
    const id = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const dir = join(this.trashDir, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "origin.json"), JSON.stringify({ path, deletedAt: Date.now() }));
    renameSync(path, join(dir, "item"));
    return { id, path, deletedAt: Date.now() };
  }

  listTrash(): TrashItem[] {
    return readdirSync(this.trashDir)
      .map((id) => {
        try {
          const origin = JSON.parse(readFileSync(join(this.trashDir, id, "origin.json"), "utf8"));
          return { id, path: origin.path as string, deletedAt: origin.deletedAt as number };
        } catch {
          return undefined;
        }
      })
      .filter((item): item is TrashItem => !!item)
      .sort((a, b) => b.deletedAt - a.deletedAt);
  }

  restore(id: string): FileEntry {
    if (!/^[\w-]+$/.test(id)) throw new FileAccessError("Unknown item");
    const dir = join(this.trashDir, id);
    const origin = JSON.parse(readFileSync(join(dir, "origin.json"), "utf8")) as { path: string };
    const target = this.resolve(origin.path);
    if (existsSync(target)) throw new FileAccessError("Something already exists at the original place", 409);
    mkdirSync(dirname(target), { recursive: true });
    renameSync(join(dir, "item"), target);
    rmSync(dir, { recursive: true, force: true });
    return this.entry(target);
  }

  /** File names (and, with `content`, lines) matching `query` under a folder. */
  search(
    rootInput: string,
    query: string,
    content = false,
    limit = 200,
  ): { path: string; line?: number; text?: string }[] {
    const root = this.resolve(rootInput);
    const q = query.toLowerCase();
    if (!q) return [];
    if (content) {
      // ripgrep or git grep are far faster than walking; fall back to names only.
      const rg = Bun.which("rg");
      const args = rg
        ? [rg, "--line-number", "--no-heading", "--max-count", "5", "--max-columns", "200", "-i", "-F", query, root]
        : ["git", "-C", root, "grep", "-n", "-i", "-F", "-I", query];
      const proc = Bun.spawnSync(args, { stdout: "pipe", stderr: "ignore" });
      return proc.stdout
        .toString()
        .split("\n")
        .filter(Boolean)
        .slice(0, limit)
        .map((line) => {
          const match = line.match(/^(.+?):(\d+):(.*)$/);
          if (!match) return undefined;
          const file = match[1]?.startsWith("/") ? match[1] : join(root, match[1] ?? "");
          return { path: file, line: Number(match[2]), text: (match[3] ?? "").trim().slice(0, 200) };
        })
        .filter(
          (hit): hit is { path: string; line: number; text: string } =>
            !!hit && !DENIED.some((d) => within(hit.path, d)),
        );
    }
    const out: { path: string }[] = [];
    const walk = (dir: string, depth: number) => {
      if (depth > 8 || out.length >= limit) return;
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of names) {
        if (name === "node_modules" || name === ".git" || out.length >= limit) continue;
        const full = join(dir, name);
        if (name.toLowerCase().includes(q)) out.push({ path: full });
        try {
          if (statSync(full).isDirectory()) walk(full, depth + 1);
        } catch {
          // Skip unreadable entries.
        }
      }
    };
    walk(root, 0);
    return out;
  }

  /** Size of each child folder, biggest first (disk usage view). */
  usage(input: string): { path: string; size: number }[] {
    const path = this.resolve(input);
    const proc = Bun.spawnSync(["du", "-sb", "--max-depth=1", path], { stdout: "pipe", stderr: "ignore" });
    return proc.stdout
      .toString()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [size = "0", ...rest] = line.split("\t");
        return { path: rest.join("\t"), size: Number(size) };
      })
      .filter((row) => row.path !== path)
      .sort((a, b) => b.size - a.size)
      .slice(0, 30);
  }

  relativeTo(root: string, path: string): string {
    return relative(root, path);
  }
}
