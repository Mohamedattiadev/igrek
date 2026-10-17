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
} from "@godeye/core";
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
    const dir = mkdtempSync(join(tmpdir(), "godeye-logs-"));
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
    const dir = mkdtempSync(join(tmpdir(), "godeye-err-"));
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
