import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface UpdateStatus {
  /** "git": a checkout God Eye can update itself; "docker": rebuild the image; "none": not updatable from here. */
  mode: "git" | "docker" | "none";
  behind: number;
  commits: string[];
  /** Local changes in God Eye's own folder: updating would need them committed or put aside first. */
  dirty: boolean;
  branch?: string;
  checkedAt: number;
  error?: string;
}

const ROOT = resolve(import.meta.dir, "..", "..", "..");

function git(args: string[], timeout = 30_000): { ok: boolean; out: string; err: string } {
  const p = Bun.spawnSync(["git", "-C", ROOT, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return { ok: p.exitCode === 0, out: p.stdout.toString().trim(), err: p.stderr.toString().trim() };
}

function run(cmd: string[]): { ok: boolean; out: string } {
  const p = Bun.spawnSync(cmd, { cwd: ROOT, stdout: "pipe", stderr: "pipe", timeout: 10 * 60_000 });
  return { ok: p.exitCode === 0, out: `${p.stdout}${p.stderr}`.trim().slice(-2000) };
}

/**
 * Self-update (plan.md 11). A git checkout of God Eye checks its upstream every few hours (with
 * your own git credentials, nothing else); "Update" pulls, installs and builds, then God Eye
 * restarts itself. In Docker the image is rebuilt instead, so only the command is shown.
 */
export class Updater {
  private last?: UpdateStatus;

  status(): UpdateStatus | undefined {
    return this.last;
  }

  check(): UpdateStatus {
    const now = Date.now();
    if (existsSync("/.dockerenv") || !existsSync(join(ROOT, ".git"))) {
      this.last = {
        mode: existsSync("/.dockerenv") ? "docker" : "none",
        behind: 0,
        commits: [],
        dirty: false,
        checkedAt: now,
      };
      return this.last;
    }
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).out;
    const fetched = git(["fetch", "--quiet"]);
    const behind = Number(git(["rev-list", "--count", "HEAD..@{u}"]).out) || 0;
    const commits = behind ? git(["log", "--format=%s", "-n", "10", "HEAD..@{u}"]).out.split("\n").filter(Boolean) : [];
    const dirty = git(["status", "--porcelain", "--untracked-files=no"]).out.length > 0;
    this.last = {
      mode: "git",
      behind,
      commits,
      dirty,
      branch,
      checkedAt: now,
      ...(fetched.ok ? {} : { error: fetched.err.slice(0, 300) || "Could not reach the git remote" }),
    };
    return this.last;
  }

  /** Pull, install, build. Refused with local changes, so nothing of yours is lost. */
  update(): { ok: boolean; log: string } {
    const status = this.check();
    if (status.mode !== "git") throw new Error("This copy of God Eye can't update itself");
    if (status.dirty) throw new Error("God Eye's folder has local changes; commit or put them aside first");
    if (!status.behind) return { ok: true, log: "Already up to date." };
    const steps: [string, () => { ok: boolean; out: string }][] = [
      [
        "git pull --ff-only",
        () => {
          const r = git(["pull", "--ff-only"], 5 * 60_000);
          return { ok: r.ok, out: `${r.out}\n${r.err}` };
        },
      ],
      ["bun install", () => run([process.execPath, "install", "--frozen-lockfile"])],
      ["bun run build", () => run([process.execPath, "run", "build"])],
    ];
    const log: string[] = [];
    for (const [name, step] of steps) {
      const r = step();
      log.push(`$ ${name}\n${r.out}`);
      if (!r.ok) return { ok: false, log: log.join("\n\n") };
    }
    this.check();
    return { ok: true, log: log.join("\n\n") };
  }

  /** Starts a fresh God Eye that waits a moment for this one to let go of the port, then this one exits. */
  restart(): void {
    const entry = join(ROOT, "apps", "server", "src", "index.ts");
    Bun.spawn(["sh", "-c", `sleep 2; exec "${process.execPath}" "${entry}"`], {
      cwd: ROOT,
      env: process.env,
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    }).unref();
    // The normal shutdown (terminals, chats, dev servers stopped cleanly), then the new one takes over.
    setTimeout(() => process.kill(process.pid, "SIGTERM"), 300);
  }
}
