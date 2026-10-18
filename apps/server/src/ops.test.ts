import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  certCovers,
  errorFingerprint,
  expiryStep,
  fingerprint,
  groupLines,
  registrableDomain,
  type ServerMessage,
} from "@igrek/core";
import { AppErrors, browserName } from "./apperrors";
import { Bus } from "./bus";
import { openDb } from "./db";
import { Docker, parseContainers, validContainer } from "./docker";
import { findLogFiles, lineTime, toLines } from "./logs";
import { Monitors } from "./monitors";
import type { Servers } from "./servers";
import { Store } from "./store";

describe("domains and certificates", () => {
  test("the registrable domain keeps sold second-level endings", () => {
    expect(registrableDomain("api.example.com")).toBe("example.com");
    expect(registrableDomain("shop.example.com.tr")).toBe("example.com.tr");
    expect(registrableDomain("a.b.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("example.dev")).toBe("example.dev");
  });

  test("a wildcard covers one label only", () => {
    expect(certCovers("*.example.com", "api.example.com")).toBe(true);
    expect(certCovers("*.example.com", "a.b.example.com")).toBe(false);
    expect(certCovers("*.example.com", "example.com")).toBe(false);
    expect(certCovers("example.com", "EXAMPLE.com")).toBe(true);
  });

  test("warnings at 30, 14, 7 and 1 days", () => {
    const now = 0;
    const day = 86_400_000;
    expect(expiryStep(40 * day, now)).toBeUndefined();
    expect(expiryStep(29 * day + 5, now)).toBe(30);
    expect(expiryStep(10 * day, now)).toBe(14);
    expect(expiryStep(3 * day, now)).toBe(7);
    expect(expiryStep(-day, now)).toBe(1);
  });

  test("a domain check reads the certificate, RDAP and DNS; a wrong certificate name is a notice", async () => {
    const { sqlite } = openDb(":memory:");
    const now = 1_800_000_000_000;
    const monitors = new Monitors(sqlite, new Store(sqlite), new Bus(), {
      now: () => now,
      cert: async () => ({ expires: now + 5 * 86_400_000, issuer: "Let's Encrypt", names: ["other.com"] }),
      rdap: async () => ({ expires: now + 300 * 86_400_000, registrar: "Example Registrar" }),
      dns: async () => ({ A: ["1.2.3.4"], AAAA: [], CNAME: [], MX: [], NS: ["ns1.example.com"], TXT: [] }),
    });
    const d = await monitors.addDomain({ host: "https://API.Example.com/path" });
    expect(d.host).toBe("api.example.com");
    expect(d.registrable).toBe("example.com");
    expect(d.certMismatch).toBe(true);
    expect(d.registrar).toBe("Example Registrar");
    expect(d.dns?.A).toEqual(["1.2.3.4"]);
    const kinds = monitors.notices().map((n) => `${n.kind}:${n.detail}`);
    expect(kinds).toContain("cert:api.example.com · 5d");
    expect(kinds.some((k) => k.startsWith("cert:api.example.com · other.com"))).toBe(true);
    expect(kinds.some((k) => k.startsWith("domain:"))).toBe(false);
    await expect(monitors.addDomain({ host: "not a domain" })).rejects.toThrow();
  });
});

describe("uptime", () => {
  test("a monitor removed while its check is running leaves nothing behind", async () => {
    const { sqlite } = openDb(":memory:");
    let release = () => {};
    const fetcher = (() =>
      new Promise<Response>((resolve) => {
        release = () => resolve(new Response("ok", { status: 200 }));
      })) as unknown as typeof fetch;
    const monitors = new Monitors(sqlite, new Store(sqlite), new Bus(), { fetcher });
    // Adding a monitor starts its first check; it waits on the slow site.
    const m = monitors.add({ url: "https://example.com", interval: 60 });
    await Bun.sleep(5);
    monitors.remove(m.id);
    release();
    await Bun.sleep(20);
    expect(sqlite.query("SELECT COUNT(*) AS n FROM uptime_checks").get()).toEqual({ n: 0 });
  });

  test("down after two failed checks, up again on the first success, with an alert each time", async () => {
    const { sqlite } = openDb(":memory:");
    const bus = new Bus();
    const alerts: string[] = [];
    bus.subscribe((m: ServerMessage) => {
      if (m.type === "alert") alerts.push(m.kind);
    });
    let answer: number | "error" = 200;
    const fetcher = (async () => {
      if (answer === "error") throw new Error("connect ECONNREFUSED");
      return new Response("ok", { status: answer });
    }) as unknown as typeof fetch;
    const monitors = new Monitors(sqlite, new Store(sqlite), bus, { fetcher });
    const m = monitors.add({ url: "https://example.com", interval: 5 });
    expect(m.interval).toBe(60);
    await Bun.sleep(5);
    expect((await monitors.checkSite(m.id))?.up).toBe(true);
    answer = 503;
    expect((await monitors.checkSite(m.id))?.up).toBe(true);
    answer = "error";
    const down = await monitors.checkSite(m.id);
    expect(down?.up).toBe(false);
    expect(down?.error).toContain("ECONNREFUSED");
    expect(monitors.notices()[0]?.kind).toBe("down");
    answer = 200;
    const back = await monitors.checkSite(m.id);
    expect(back?.up).toBe(true);
    expect(back?.uptime24h).toBe(60);
    expect(alerts).toEqual(["down", "up"]);
    expect(monitors.history(m.id)).toHaveLength(5);
    expect(() => monitors.add({ url: "ftp://x" })).toThrow();
  });
});

describe("logs", () => {
  test("the same error with other numbers and ids is one group; errors come first", () => {
    const lines = toLines(
      "api",
      [
        "2026-10-17T10:00:01Z ERROR user 1234 not found (id 7f3c9a2b-1111-4222-8333-444455556666)",
        "2026-10-17T10:00:02Z info started in 340ms",
        "2026-10-17T10:00:03Z ERROR user 98 not found (id 0a3c9a2b-1111-4222-8333-444455556666)",
        '2026-10-17T10:00:04Z WARN retrying request to "https://x.test/a"',
        "TypeError: Cannot read properties of undefined (reading 'name')",
        "    at render (/app/src/page.tsx:12:5)",
      ].join("\n"),
    );
    expect(lines).toHaveLength(5);
    expect(lines[4]?.text).toContain("at render");
    expect(lines[0]?.at).toBe(Date.parse("2026-10-17T10:00:01Z"));
    const groups = groupLines(lines);
    expect(groups[0]).toMatchObject({ count: 2, level: "error" });
    expect(groups.map((g) => g.level)).toEqual(["error", "error", "warn"]);
    expect(fingerprint("at /a/b.ts:12:5 took 30ms")).toBe(fingerprint("at /a/b.ts:99:1 took 4ms"));
  });

  test("times in common formats; .log files found but not in node_modules", () => {
    expect(lineTime("[2026-10-17 12:00:01,250] x")).toBe(Date.parse("2026-10-17T12:00:01.250"));
    expect(lineTime("no time")).toBeUndefined();
    const dir = mkdtempSync(join(tmpdir(), "igrek-logs-"));
    Bun.spawnSync(["mkdir", "-p", join(dir, "logs"), join(dir, "node_modules", "x")]);
    writeFileSync(join(dir, "logs", "app.log"), "a\n");
    writeFileSync(join(dir, "node_modules", "x", "y.log"), "b\n");
    expect(findLogFiles(dir)).toEqual([join(dir, "logs", "app.log")]);
  });
});

describe("docker", () => {
  test("containers with compose labels and resource use", () => {
    const ps = [
      JSON.stringify({
        ID: "d806abfb40e1aaaa",
        Names: "shop-db-1",
        Image: "postgres:17",
        State: "running",
        Status: "Up 3 hours",
        Ports: "5432/tcp",
        Labels: "com.docker.compose.project=shop,com.docker.compose.service=db",
        CreatedAt: "2026-10-01",
      }),
      "WARNING: something",
    ].join("\n");
    const stats = JSON.stringify({
      ID: "d806abfb40e1",
      Name: "shop-db-1",
      CPUPerc: "0.10%",
      MemUsage: "18MiB / 7GiB",
      MemPerc: "0.24%",
    });
    expect(parseContainers(ps, stats)).toEqual([
      {
        id: "d806abfb40e1",
        name: "shop-db-1",
        image: "postgres:17",
        state: "running",
        status: "Up 3 hours",
        ports: "5432/tcp",
        project: "shop",
        service: "db",
        createdAt: "2026-10-01",
        cpu: "0.10%",
        mem: "18MiB / 7GiB",
        memPercent: "0.24%",
      },
    ]);
    expect(validContainer("shop-db-1")).toBe(true);
    expect(validContainer("x; rm -rf /")).toBe(false);
  });

  test("restart runs locally without a shell, and on a server as a confirmed, audited command", async () => {
    const local: string[][] = [];
    const remote: { command: string; confirmations: number }[] = [];
    const servers = {
      run: async (_id: string, command: string, opts: { confirmations: number }) => {
        remote.push({ command, confirmations: opts.confirmations });
        return { exitCode: 0, output: "web" };
      },
    } as unknown as Servers;
    const docker = new Docker(servers, async (args) => {
      local.push(args);
      return { code: 0, output: "web" };
    });
    await docker.act({ kind: "local" }, "web", "restart");
    await docker.act({ kind: "server", serverId: "s1" }, "web", "stop");
    expect(local).toEqual([["restart", "web"]]);
    expect(remote).toEqual([{ command: "docker stop web", confirmations: 1 }]);
    await expect(docker.act({ kind: "local" }, "web && reboot", "restart")).rejects.toThrow("Unknown container");
  });
});

describe("app errors", () => {
  test("grouped by message and stack frames; the commits before the first release are suspects; resolved ones reopen", () => {
    const { sqlite } = openDb(":memory:");
    const store = new Store(sqlite);
    const dir = mkdtempSync(join(tmpdir(), "igrek-err-"));
    const git = (...args: string[]) =>
      Bun.spawnSync(["git", "-C", dir, "-c", "user.name=Ayse", "-c", "user.email=a@a", ...args])
        .stdout.toString()
        .trim();
    git("init", "-q", "-b", "main");
    writeFileSync(join(dir, "a.ts"), "1\n");
    git("add", "-A");
    git("commit", "-qm", "first");
    const v1 = git("rev-parse", "--short=12", "HEAD");
    writeFileSync(join(dir, "a.ts"), "2\n");
    git("commit", "-qam", "change the cart");
    const v2 = git("rev-parse", "--short=12", "HEAD");
    const projectId = store.addProject(dir);
    const errors = new AppErrors(sqlite, store, new Bus());
    const key = errors.key(projectId);
    expect(errors.key(projectId)).toBe(key);
    expect(errors.ingest("wrong", { message: "x" })).toBe(false);
    // Release 1 had other errors only.
    expect(errors.ingest(key, { message: "Other", release: v1 })).toBe(true);
    const stack = (line: number) =>
      `TypeError: x is undefined\n    at total (https://shop.test/cart.js?v=3:${line}:9)\n    at onClick (https://shop.test/app.js:1:1)`;
    errors.ingest(key, {
      message: "x is undefined",
      stack: stack(10),
      release: v2,
      url: "https://shop.test/cart?id=4",
      userAgent: "Mozilla/5.0 Firefox/131.0",
    });
    errors.ingest(key, {
      message: "x is undefined",
      stack: stack(14),
      release: v2,
      userAgent: "Mozilla/5.0 Chrome/130.0 Safari/537.36",
    });
    const groups = errors.list(projectId);
    const g = groups.find((x) => x.message === "x is undefined");
    expect(groups).toHaveLength(2);
    expect(g).toMatchObject({
      count: 2,
      firstRelease: v2,
      urls: ["https://shop.test/cart"],
      browsers: ["Firefox", "Chrome"],
    });
    expect(g?.suspects?.map((s) => s.subject)).toEqual(["change the cart"]);
    errors.setStatus(g?.id ?? "", "resolved");
    errors.ingest(key, { message: "x is undefined", stack: stack(20), release: v2 });
    expect(errors.get(g?.id ?? "")?.status).toBe("open");
    expect(errors.snippet(projectId, "http://localhost:7777").browser).toContain(`/ingest/errors/${key}`);
    expect(errors.notices().length).toBe(2);
  });

  test("fingerprints ignore line numbers and query strings; browser names", () => {
    expect(errorFingerprint({ message: "boom", stack: "at f (a.js?x=1:1:2)" })).toBe(
      errorFingerprint({ message: "boom", stack: "at f (a.js:9:9)" }),
    );
    expect(browserName("Mozilla/5.0 (iPhone) AppleWebKit Version/18 Mobile Safari/604.1")).toBe("Safari Mobile");
    expect(browserName("Mozilla/5.0 Chrome/130 Safari/537 Edg/130")).toBe("Edge");
  });
});

describe("code host", () => {
  test("remotes in https and ssh form", async () => {
    const { parseRemote } = await import("./codehost");
    expect(parseRemote("git@github.com:me/app.git")).toEqual({
      host: "github",
      repo: "me/app",
      web: "https://github.com/me/app",
    });
    expect(parseRemote("https://token@gitlab.example.com/group/sub/app")).toMatchObject({
      host: "gitlab",
      repo: "group/sub/app",
    });
    expect(parseRemote("ssh://git@bitbucket.org/me/app.git").host).toBe("other");
    expect(parseRemote("").host).toBe("none");
  });

  test("an issue becomes a board card; a bug label starts the fix flow", async () => {
    const { CodeHost } = await import("./codehost");
    const dir = mkdtempSync(join(tmpdir(), "igrek-host-"));
    Bun.spawnSync(["git", "init", "-q", dir]);
    const { sqlite } = openDb(":memory:");
    const store = new Store(sqlite);
    const projectId = store.addProject(dir);
    const added: { title: string; description?: string; origin?: string }[] = [];
    const moved: string[] = [];
    const board = {
      add: (a: { title: string; description?: string; origin?: string }) => {
        added.push(a);
        return { id: "card1" };
      },
      move: (_id: string, _status: string, _order: unknown, flow: string) => {
        moved.push(flow);
        return { runId: "run1" };
      },
    };
    const calls: string[] = [];
    const runner = async (cmd: string[]) => {
      calls.push(cmd.join(" "));
      if (cmd[0] === "git") return { code: 0, out: "git@github.com:me/app.git\n", err: "" };
      if (cmd[1] === "auth") return { code: 0, out: "", err: "" };
      return {
        code: 0,
        out: JSON.stringify({
          number: 7,
          title: "Login breaks",
          body: "Steps…",
          author: { login: "ada" },
          labels: [{ name: "bug" }],
          url: "u",
          updatedAt: "2026-10-01",
          comments: [],
        }),
        err: "",
      };
    };
    const host = new CodeHost(store, board as never, runner);
    expect(await host.info(projectId)).toMatchObject({ host: "github", repo: "me/app", signedIn: true });
    expect(await host.issueToTask(projectId, 7, true)).toEqual({ taskId: "card1", runId: "run1" });
    expect(added[0]).toMatchObject({ title: "Login breaks", origin: "issue #7" });
    expect(added[0]?.description).toContain("Fixes #7");
    expect(moved).toEqual(["fix"]);
    expect(calls.some((c) => c.includes("issue view 7 -R me/app"))).toBe(true);
  });
});

describe("costs", () => {
  test("yearly spread over months, cancelled ones stop, currencies converted with ECB rates", async () => {
    const { Costs } = await import("./costs");
    const { costInMonth } = await import("@igrek/core");
    const jan = new Date(2026, 0, 1).getTime();
    expect(costInMonth({ amount: 120, period: "year", startsAt: jan }, 2026, 5)).toBe(10);
    expect(costInMonth({ amount: 50, period: "once", startsAt: jan }, 2026, 1)).toBe(0);
    expect(
      costInMonth({ amount: 9, period: "month", startsAt: jan, endsAt: new Date(2026, 2, 1).getTime() }, 2026, 3),
    ).toBe(0);
    const { sqlite } = openDb(":memory:");
    const fetcher = (async () =>
      Response.json({ date: "2026-10-16", rates: { USD: 1.125, TRY: 55.7 } })) as unknown as typeof fetch;
    const costs = new Costs(sqlite, {}, fetcher);
    costs.add({ name: "VPS", amount: 10, currency: "EUR", period: "month", category: "server", startsAt: jan });
    costs.add({ name: "API", amount: 557, currency: "TRY", period: "month", category: "api", startsAt: jan });
    costs.add({ name: "Odd", amount: 5, currency: "XYZ", period: "month", startsAt: jan });
    expect(() => costs.add({ name: "", amount: 1 })).toThrow();
    const s = await costs.summary("USD", new Date(2026, 9, 17));
    expect(s.month).toBe(22.5); // 10 EUR = 11.25 USD, 557 TRY = 10 EUR = 11.25 USD
    expect(s.unconverted).toEqual(["XYZ"]);
    expect(s.byCategory.map((c) => c.category)).toEqual(["server", "api"]);
    expect(s.trend).toHaveLength(12);
  });
});

describe("time tracking", () => {
  test("messages close together are one block; a 15-minute gap starts a new one; parallel sessions count once", async () => {
    const { workBlocks } = await import("@igrek/core");
    const min = 60_000;
    expect(workBlocks([0, 5 * min, 10 * min, 40 * min])).toEqual([
      { start: 0, end: 10 * min },
      { start: 40 * min, end: 42 * min },
    ]);
    const { timeReport } = await import("./timetrack");
    const { sqlite } = openDb(":memory:");
    const store = new Store(sqlite);
    const dir = mkdtempSync(join(tmpdir(), "igrek-time-"));
    const projectId = store.addProject(dir);
    const day = new Date(2026, 9, 15, 10, 0).getTime();
    for (const [sid, offsets] of [
      ["s1", [0, 10, 20]],
      ["s2", [5, 15]],
    ] as const) {
      sqlite.query("INSERT INTO sessions (id, project_id, tool) VALUES (?, ?, 'claude')").run(sid, projectId);
      for (const o of offsets)
        sqlite
          .query("INSERT INTO messages (id, session_id, ts, role, kind, text) VALUES (?, ?, ?, 'user', 'prompt', 'x')")
          .run(`${sid}-${o}`, sid, day + o * min);
    }
    const r = timeReport(store, day - min, day + 60 * min);
    expect(r.totals).toEqual([{ projectId, minutes: 20, sessions: 2 }]);
    expect(r.days.find((d) => d.day === "2026-10-15")?.minutes[projectId]).toBe(20);
  });
});

describe("write-ups", () => {
  test("ADRs in the Nygard format with numbered file names; fences taken off", async () => {
    const { adrFileName, adrMarkdown, unfence } = await import("./writeups");
    const a = {
      number: 3,
      title: "Use Postgres, not MongoDB",
      date: "2026-10-01",
      context: "c",
      decision: "d",
      consequences: "e",
    };
    expect(adrFileName(a)).toBe("0003-use-postgres-not-mongodb.md");
    expect(adrMarkdown(a)).toContain("# 3. Use Postgres, not MongoDB\n\nDate: 2026-10-01\n\n## Status\n\nAccepted");
    expect(unfence("```markdown\n## Bugün\n- x\n```")).toBe("## Bugün\n- x");
    expect(unfence("## Plain")).toBe("## Plain");
  });
});

describe("pull request review", () => {
  test("your review goes out with gh only as you wrote it; changes need a text", async () => {
    const { CodeHost } = await import("./codehost");
    const dir = mkdtempSync(join(tmpdir(), "igrek-pr-"));
    Bun.spawnSync(["git", "init", "-q", dir]);
    const { sqlite } = openDb(":memory:");
    const store = new Store(sqlite);
    const projectId = store.addProject(dir);
    const calls: string[][] = [];
    const runner = async (cmd: string[]) => {
      calls.push(cmd);
      if (cmd[0] === "git") return { code: 0, out: "https://github.com/me/app.git", err: "" };
      return { code: 0, out: cmd[2] === "diff" ? "+added line" : "", err: "" };
    };
    const host = new CodeHost(store, {} as never, runner);
    expect(await host.prDiff(projectId, 5)).toBe("+added line");
    await host.review(projectId, 5, "approve", "");
    await host.review(projectId, 5, "changes", "Please add a test");
    await expect(host.review(projectId, 5, "comment", "  ")).rejects.toThrow();
    expect(calls.filter((c) => c[1] === "pr" && c[2] === "review").map((c) => c.slice(3).join(" "))).toEqual([
      "5 -R me/app --approve",
      "5 -R me/app --request-changes --body Please add a test",
    ]);
  });
});

describe("deploy safety", () => {
  test("destructive migrations are recognized", async () => {
    const { DESTRUCTIVE_SQL } = await import("./environments");
    for (const sql of [
      "DROP TABLE users;",
      "ALTER TABLE orders DROP COLUMN note;",
      "TRUNCATE sessions;",
      "DELETE FROM logs;",
      "ALTER TABLE a RENAME COLUMN b TO c;",
      "ALTER TABLE t ALTER COLUMN price TYPE integer;",
    ])
      expect(DESTRUCTIVE_SQL.test(sql)).toBe(true);
    for (const sql of [
      "CREATE TABLE users (id int);",
      "ALTER TABLE orders ADD COLUMN note text;",
      "DELETE FROM logs WHERE at < now() - interval '30 days';",
      "CREATE INDEX x ON t(a);",
    ])
      expect(DESTRUCTIVE_SQL.test(sql)).toBe(false);
  });
});
