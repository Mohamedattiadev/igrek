import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Accounts, lockDown } from "./accounts";
import { claudeAdapter } from "./adapters/claude";
import { Bus } from "./bus";
import { migrate } from "./db";
import { Indexer } from "./indexer";
import { forecast, limitAlerts, limitsOverview } from "./limits";
import { Store } from "./store";

function setup() {
  const sqlite = new Database(":memory:");
  migrate(sqlite);
  const accounts = new Accounts(sqlite, new Bus(), mkdtempSync(join(tmpdir(), "igrek-accounts-")));
  return { sqlite, accounts };
}

describe("accounts", () => {
  test("extra accounts get their own folder and env; switching is a choice", () => {
    const { accounts } = setup();
    const work = accounts.add("claude", "Work");
    expect(existsSync(work.configDir)).toBe(true);
    expect(statSync(work.configDir).mode & 0o777).toBe(0o700);
    expect(accounts.env(work)).toEqual({ CLAUDE_CONFIG_DIR: work.configDir });
    expect(work.active).toBe(false);

    accounts.setActive(work.id);
    expect(accounts.active("claude")?.id).toBe(work.id);

    const codex = accounts.add("codex", "Side");
    expect(accounts.env(codex)).toEqual({ CODEX_HOME: codex.configDir });

    accounts.remove(work.id);
    expect(existsSync(work.configDir)).toBe(false);
    expect(accounts.get(work.id)).toBeUndefined();
  });

  test("credential files are locked to the user", () => {
    const dir = mkdtempSync(join(tmpdir(), "igrek-lock-"));
    writeFileSync(join(dir, ".credentials.json"), "{}", { mode: 0o644 });
    lockDown(dir);
    expect(statSync(join(dir, ".credentials.json")).mode & 0o777).toBe(0o600);
  });

  test("a project can pin its own account", () => {
    const { sqlite, accounts } = setup();
    const store = new Store(sqlite);
    const projectId = store.resolveProject("/tmp/pinned-project");
    const main = accounts.add("claude", "Main");
    accounts.setActive(main.id);
    const work = accounts.add("claude", "Work");
    expect(accounts.forProject("claude", projectId)?.id).toBe(main.id);
    accounts.setProjectAccount(projectId, work.id);
    expect(accounts.forProject("claude", projectId)?.id).toBe(work.id);
  });
});

describe("limits", () => {
  const base = { at: 0, fiveHourResetsAt: 5 * 3_600_000, week: 0.3 };

  test("forecasts when the 5-hour limit fills at the current pace", () => {
    const result = forecast(
      [
        { ...base, at: 0, fiveHour: 0.2 },
        { ...base, at: 3_600_000, fiveHour: 0.5 },
      ],
      3_600_000,
    );
    expect(result?.perHour).toBeCloseTo(0.3);
    // 50% left at 30%/hour → about 1h40m after the last snapshot.
    expect(result?.fullAt).toBeCloseTo(3_600_000 + (0.5 / 0.3) * 3_600_000, -3);
  });

  test("no scary forecast when the window resets first", () => {
    const result = forecast(
      [
        { ...base, at: 0, fiveHour: 0.1 },
        { ...base, at: 3_600_000, fiveHour: 0.15 },
      ],
      3_600_000,
    );
    expect(result?.fullAt).toBeUndefined();
  });

  test("alerts at 80%, and usage is counted per message by project and model", async () => {
    const { sqlite, accounts } = setup();
    const account = accounts.add("claude", "Main");
    accounts.recordLimit(account.id, {
      at: Date.now(),
      fiveHour: 0.85,
      fiveHourResetsAt: Date.now() + 3_600_000,
      week: 0.4,
    });
    expect(limitAlerts(accounts)).toMatchObject([{ accountId: account.id, window: "fiveHour", value: 0.85 }]);

    const root = mkdtempSync(join(tmpdir(), "igrek-usage-"));
    mkdirSync(join(root, "p"));
    const msg = (id: string, input: number) =>
      JSON.stringify({
        type: "assistant",
        uuid: id,
        sessionId: "s",
        cwd: "/tmp/usage-project",
        timestamp: new Date().toISOString(),
        message: {
          id,
          model: "claude-sonnet-5",
          content: [{ type: "text", text: "ok" }],
          usage: {
            input_tokens: input,
            output_tokens: 10,
            cache_read_input_tokens: 500,
            cache_creation_input_tokens: 0,
          },
        },
      });
    writeFileSync(join(root, "p", "s.jsonl"), `${msg("m1", 100)}\n${msg("m2", 200)}\n`);
    const store = new Store(sqlite);
    await new Indexer(store, new Bus(), [claudeAdapter(root, account.id)]).scan();
    const overview = limitsOverview(sqlite, accounts);
    expect(overview.total).toBe(320);
    expect(overview.models).toEqual([{ key: "claude-sonnet-5", label: "claude-sonnet-5", tokens: 320 }]);
    expect(overview.days.at(-1)?.total).toBe(320);
    expect(store.sessionRow("s")?.account_id).toBe(account.id);
  });
});
