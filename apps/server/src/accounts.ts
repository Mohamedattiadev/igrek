import type { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Account, AiTool, RateLimitInfo } from "@igrek/core";
import type { Bus } from "./bus";
import { cleanEnv } from "./env";

type Row = {
  id: string;
  provider: AiTool;
  label: string;
  config_dir: string | null;
  email: string | null;
  plan: string | null;
  logged_in: number;
  active: number;
  checked_at: number | null;
  created_at: number;
};

const ENV_VAR: Partial<Record<AiTool, string>> = { claude: "CLAUDE_CONFIG_DIR", codex: "CODEX_HOME" };

/** Where a provider keeps things when no override is set (the account you already use). */
function defaultDir(provider: AiTool): string {
  return provider === "codex" ? join(homedir(), ".codex") : join(homedir(), ".claude");
}

/** Makes sure only the user can read an account folder and its credential files (plan.md 3.1). */
export function lockDown(dir: string): void {
  if (!existsSync(dir)) return;
  chmodSync(dir, 0o700);
  for (const name of readdirSync(dir)) {
    if (/credential|auth|token/i.test(name)) {
      const path = join(dir, name);
      if (statSync(path).isFile()) chmodSync(path, 0o600);
    }
  }
}

/**
 * Several logins per AI tool without logging out (plan.md 3.1). Each extra
 * account lives in its own config folder (CLAUDE_CONFIG_DIR / CODEX_HOME), so
 * switching is just choosing which folder new sessions use.
 * Switching is always the user's choice — never automatic on a limit.
 */
export class Accounts {
  constructor(
    private readonly db: Database,
    private readonly bus: Bus,
    private readonly accountsDir: string,
  ) {
    mkdirSync(accountsDir, { recursive: true, mode: 0o700 });
  }

  private toAccount(row: Row): Account {
    return {
      id: row.id,
      provider: row.provider,
      label: row.label,
      configDir: row.config_dir ?? defaultDir(row.provider),
      isDefault: row.config_dir === null,
      email: row.email ?? undefined,
      plan: row.plan ?? undefined,
      loggedIn: !!row.logged_in,
      active: !!row.active,
      checkedAt: row.checked_at ?? undefined,
      rateLimit: this.latestLimit(row.id),
    };
  }

  list(): Account[] {
    return (this.db.query("SELECT * FROM accounts ORDER BY provider, active DESC, created_at").all() as Row[]).map(
      (r) => this.toAccount(r),
    );
  }

  get(id: string): Account | undefined {
    const row = this.db.query("SELECT * FROM accounts WHERE id = ?").get(id) as Row | undefined;
    return row ? this.toAccount(row) : undefined;
  }

  active(provider: AiTool): Account | undefined {
    const row = this.db.query("SELECT * FROM accounts WHERE provider = ? AND active = 1").get(provider) as
      | Row
      | undefined;
    return row ? this.toAccount(row) : undefined;
  }

  /** The account a project should use: its own default if set, otherwise the active one. */
  forProject(provider: AiTool, projectId?: string): Account | undefined {
    if (projectId) {
      const chosen = this.db.query("SELECT account_id FROM projects WHERE id = ?").get(projectId) as
        | { account_id: string | null }
        | undefined;
      const account = chosen?.account_id ? this.get(chosen.account_id) : undefined;
      if (account?.provider === provider) return account;
    }
    return this.active(provider);
  }

  /** Environment that points a CLI at this account's folder (empty for the default account). */
  env(account?: Account): Record<string, string> {
    if (!account || account.isDefault) return {};
    const name = ENV_VAR[account.provider];
    return name ? { [name]: account.configDir } : {};
  }

  /** Registers the login you already have (~/.claude) the first time Igrek starts. */
  ensureDefault(provider: AiTool): void {
    const exists = this.db.query("SELECT 1 FROM accounts WHERE provider = ? AND config_dir IS NULL").get(provider);
    if (exists || !existsSync(defaultDir(provider))) return;
    const hasActive = this.db.query("SELECT 1 FROM accounts WHERE provider = ? AND active = 1").get(provider);
    this.db
      .query("INSERT INTO accounts (id, provider, label, config_dir, active, created_at) VALUES (?, ?, ?, NULL, ?, ?)")
      .run(crypto.randomUUID().slice(0, 8), provider, "Main", hasActive ? 0 : 1, Date.now());
  }

  /** A new, empty account folder; the user then logs in once in a terminal. */
  add(provider: AiTool, label: string): Account {
    if (!ENV_VAR[provider]) throw new Error(`${provider} accounts are not supported yet`);
    const id = crypto.randomUUID().slice(0, 8);
    const dir = join(this.accountsDir, `${provider}-${id}`);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.db
      .query("INSERT INTO accounts (id, provider, label, config_dir, active, created_at) VALUES (?, ?, ?, ?, 0, ?)")
      .run(id, provider, label.trim().slice(0, 40) || provider, dir, Date.now());
    this.changed();
    return this.get(id) as Account;
  }

  /** Command that logs this account in (run inside an Igrek terminal). */
  loginCommand(account: Account): string[] {
    return account.provider === "codex" ? ["codex", "login"] : ["claude", "auth", "login"];
  }

  setActive(id: string): void {
    const account = this.get(id);
    if (!account) throw new Error("Account not found");
    this.db.transaction(() => {
      this.db.query("UPDATE accounts SET active = 0 WHERE provider = ?").run(account.provider);
      this.db.query("UPDATE accounts SET active = 1 WHERE id = ?").run(id);
    })();
    this.changed();
  }

  setProjectAccount(projectId: string, accountId: string | null): void {
    this.db.query("UPDATE projects SET account_id = ? WHERE id = ?").run(accountId, projectId);
    this.changed();
  }

  rename(id: string, label: string): void {
    this.db.query("UPDATE accounts SET label = ? WHERE id = ?").run(label.trim().slice(0, 40), id);
    this.changed();
  }

  /** Removes an added account and its folder (credentials included). The default login is never deleted. */
  remove(id: string): void {
    const account = this.get(id);
    if (!account || account.isDefault) throw new Error("The main account can't be removed here");
    this.db.query("DELETE FROM accounts WHERE id = ?").run(id);
    if (account.configDir.startsWith(this.accountsDir)) rmSync(account.configDir, { recursive: true, force: true });
    if (account.active) {
      const fallback = this.db
        .query("SELECT id FROM accounts WHERE provider = ? ORDER BY created_at LIMIT 1")
        .get(account.provider) as { id: string } | undefined;
      if (fallback) this.setActive(fallback.id);
    }
    this.changed();
  }

  /** Asks the CLI whether this account is logged in, and as whom. */
  async refresh(id: string): Promise<Account | undefined> {
    const account = this.get(id);
    if (!account) return undefined;
    let loggedIn = false;
    let email: string | null = null;
    let plan: string | null = null;
    if (account.provider === "claude" && Bun.which("claude")) {
      const proc = Bun.spawn(["claude", "auth", "status", "--json"], {
        stdout: "pipe",
        stderr: "ignore",
        env: cleanEnv(this.env(account)),
      });
      const timer = setTimeout(() => proc.kill(), 15_000);
      const out = await new Response(proc.stdout).text();
      clearTimeout(timer);
      try {
        const status = JSON.parse(out) as { loggedIn?: boolean; email?: string; subscriptionType?: string };
        loggedIn = !!status.loggedIn;
        email = status.email ?? null;
        plan = withTier(status.subscriptionType, account.configDir) ?? null;
      } catch {
        // Older CLI or unexpected output: leave as not logged in.
      }
    } else if (account.provider === "codex") {
      loggedIn = existsSync(join(account.configDir, "auth.json"));
    }
    lockDown(account.configDir);
    this.db
      .query("UPDATE accounts SET logged_in = ?, email = ?, plan = ?, checked_at = ? WHERE id = ?")
      .run(loggedIn ? 1 : 0, email, plan, Date.now(), id);
    this.changed();
    return this.get(id);
  }

  async refreshAll(): Promise<void> {
    for (const account of this.list()) await this.refresh(account.id).catch(() => undefined);
  }

  /** Session folders to watch: the default ~/.claude plus each extra Claude account. */
  claudeProjectDirs(): { accountId: string; dir: string }[] {
    return this.list()
      .filter((a) => a.provider === "claude")
      .map((a) => ({ accountId: a.id, dir: join(a.configDir, "projects") }));
  }

  // ---- limits --------------------------------------------------------------------

  recordLimit(accountId: string, info: RateLimitInfo): void {
    const last = this.latestLimit(accountId);
    // Store at most one snapshot a minute unless the numbers moved.
    if (last && info.at - last.at < 60_000 && last.fiveHour === info.fiveHour && last.week === info.week) return;
    this.db
      .query(
        "INSERT INTO rate_limits (account_id, at, five_hour, five_hour_resets, week, week_resets) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        accountId,
        info.at,
        info.fiveHour ?? null,
        info.fiveHourResetsAt ?? null,
        info.week ?? null,
        info.weekResetsAt ?? null,
      );
    this.bus.publish({ type: "limits-changed" });
  }

  latestLimit(accountId: string): RateLimitInfo | undefined {
    const row = this.db
      .query("SELECT * FROM rate_limits WHERE account_id = ? ORDER BY at DESC LIMIT 1")
      .get(accountId) as
      | {
          at: number;
          five_hour: number | null;
          five_hour_resets: number | null;
          week: number | null;
          week_resets: number | null;
        }
      | undefined;
    if (!row) return undefined;
    return {
      at: row.at,
      fiveHour: row.five_hour ?? undefined,
      fiveHourResetsAt: row.five_hour_resets ?? undefined,
      week: row.week ?? undefined,
      weekResetsAt: row.week_resets ?? undefined,
    };
  }

  limitHistory(accountId: string, since: number): RateLimitInfo[] {
    return (
      this.db.query("SELECT * FROM rate_limits WHERE account_id = ? AND at >= ? ORDER BY at").all(accountId, since) as {
        at: number;
        five_hour: number | null;
        five_hour_resets: number | null;
        week: number | null;
        week_resets: number | null;
      }[]
    ).map((row) => ({
      at: row.at,
      fiveHour: row.five_hour ?? undefined,
      fiveHourResetsAt: row.five_hour_resets ?? undefined,
      week: row.week ?? undefined,
      weekResetsAt: row.week_resets ?? undefined,
    }));
  }

  private changed(): void {
    this.bus.publish({ type: "accounts-changed" });
  }
}

/**
 * Claude Max is 5x ($100) or 20x ($200) and the CLI only says "max"; the login file next to it says
 * which (its rate limit tier). Only that one field is read, and it stays on this computer. Without
 * the file (macOS keeps the login in the Keychain) the plan stays "max" and its price unknown.
 */
export function withTier(plan: string | undefined, configDir: string): string | undefined {
  if (plan !== "max") return plan;
  try {
    const login = JSON.parse(readFileSync(join(configDir, ".credentials.json"), "utf8")) as {
      claudeAiOauth?: { rateLimitTier?: string };
    };
    const times = /max_(5|20)x/.exec(login.claudeAiOauth?.rateLimitTier ?? "")?.[1];
    return times ? `max ${times}x` : plan;
  } catch {
    return plan;
  }
}
