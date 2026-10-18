import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SETTINGS, type FlowRun, type ToolResult } from "@godeye/core";
import { parseArchonLine } from "./archon";
import { Board } from "./board";
import { Bus, StopRegistry } from "./bus";
import { openDb } from "./db";
import { type AgentRun, Flows, parseFlow } from "./flows";
import { BUILTIN_FLOWS } from "./flows-builtin";
import { Personas } from "./personas";
import { Store } from "./store";

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "godeye-flow-"));
  const git = (...args: string[]) =>
    Bun.spawnSync(["git", "-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args]);
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "README.md"), "# app\n");
  git("add", "-A");
  git("commit", "-qm", "first");
  return dir;
}

async function until(get: () => FlowRun | undefined, ok: (r: FlowRun) => boolean) {
  for (let i = 0; i < 400; i++) {
    const r = get();
    if (r && ok(r)) return r;
    await Bun.sleep(10);
  }
  throw new Error(`timed out: ${JSON.stringify(get()?.nodes.map((n) => `${n.id}:${n.status}`))}`);
}

function setup(agent: AgentRun, checks: () => Promise<ToolResult[]>) {
  const { sqlite } = openDb(":memory:");
  const store = new Store(sqlite);
  const dir = repo();
  const projectId = store.addProject(dir);
  const bus = new Bus();
  const personas = new Personas(sqlite, store, bus, new StopRegistry(), () => DEFAULT_SETTINGS, dir);
  const flows = new Flows(
    sqlite,
    store,
    bus,
    new StopRegistry(),
    personas,
    mkdtempSync(join(tmpdir(), "godeye-wts-")),
    agent,
    checks,
  );
  const board = new Board(sqlite, bus, flows);
  flows.onChange = (run) => board.followRun(run);
  return { flows, board, projectId, dir, sqlite };
}

const pass = (kind: ToolResult["kind"]): ToolResult => ({
  kind,
  command: `bun ${kind}`,
  exitCode: 0,
  ok: true,
  ms: 1,
  at: 1,
  output: "",
});

describe("flow definitions", () => {
  test("built-in flows read; broken ones are refused", () => {
    for (const text of Object.values(BUILTIN_FLOWS)) expect(parseFlow(text, "builtin").nodes.length).toBeGreaterThan(0);
    expect(() => parseFlow("nodes:\n  - id: a\n    depends_on: [b]\n    prompt: x", "project")).toThrow("unknown b");
    expect(() => parseFlow("nodes:\n  - id: a\n    prompt: x\n    bash: y", "project")).toThrow("exactly one");
    expect(parseArchonLine("[ask] Completed (5s)")).toEqual({ node: "ask", event: "done", text: "Completed (5s)" });
    expect(parseArchonLine("[count] Started")?.event).toBe("start");
    expect(parseArchonLine("plain line")).toBeUndefined();
  });
});

describe("team run", () => {
  test("plan waits for you, two sides build in their own copies, failed checks send the work back, then one approval merges", async () => {
    const calls: string[] = [];
    let checkRuns = 0;
    const agent: AgentRun = async ({ cwd, prompt, readOnly }) => {
      const step = prompt.match(/one step \("([^"]+)"\)/)?.[1] ?? "?";
      calls.push(`${step}${readOnly ? " (read)" : ""}`);
      if (step === "Backend") writeFileSync(join(cwd, "auth.ts"), `export const login = () => ${checkRuns};\n`);
      if (step === "Frontend") writeFileSync(join(cwd, "Login.tsx"), "export const Login = () => null;\n");
      if (prompt.includes("WHAT WENT WRONG")) expect(prompt).toContain("FAIL bun test");
      return prompt.includes("VERDICT") ? "Looks right.\nVERDICT: PASS" : `${step} done`;
    };
    const { flows, projectId, dir, board } = setup(agent, async () => {
      checkRuns++;
      return checkRuns === 1
        ? [
            pass("typecheck"),
            { ...pass("test"), ok: false, exitCode: 1, output: "1 fail: login rejects empty password" },
          ]
        : [pass("typecheck"), pass("test")];
    });
    const task = board.add({ projectId, title: "Add user login" });
    board.move(task.id, "doing");
    const runId = board.get(task.id)?.runId as string;
    let run = await until(
      () => flows.get(runId),
      (r) => r.status === "needs_you",
    );
    expect(run.nodes.find((n) => n.id === "approve-plan")?.status).toBe("needs_you");
    expect(calls).toEqual(["Plan (read)", "Design (read)"]);
    expect(board.get(task.id)?.status).toBe("review");

    flows.respond(runId, "approve-plan", "approve");
    run = await until(
      () => flows.get(runId),
      (r) => r.status === "ready" || r.status === "failed",
    );
    expect(run.status).toBe("ready");
    // Checks failed once: both sides ran twice, then QA, security, DevOps and the summary.
    expect(calls.filter((c) => c === "Backend").length).toBe(2);
    expect(calls.filter((c) => c === "Frontend").length).toBe(2);
    expect(run.nodes.find((n) => n.id === "checks")).toMatchObject({ status: "done", verdict: "pass", attempts: 2 });
    expect(run.changes?.map((f) => f.path).sort()).toEqual(["Login.tsx", "auth.ts"]);
    // Nothing is in your folder until you approve.
    expect(existsSync(join(dir, "auth.ts"))).toBe(false);
    expect(board.get(task.id)?.status).toBe("review");

    flows.merge(runId);
    expect(readFileSync(join(dir, "auth.ts"), "utf8")).toContain("login");
    expect(existsSync(join(dir, "Login.tsx"))).toBe(true);
    expect(flows.get(runId)?.status).toBe("merged");
    expect(board.get(task.id)?.status).toBe("done");
  });

  test("careful: the explorer and the critic only read, a failed critique sends the plan back before any code", async () => {
    const calls: string[] = [];
    let critiques = 0;
    const agent: AgentRun = async ({ cwd, prompt, readOnly }) => {
      const step = prompt.match(/one step \("([^"]+)"\)/)?.[1] ?? "?";
      calls.push(`${step}${readOnly ? " (read)" : ""}`);
      if (step === "Critique")
        return ++critiques === 1 ? "Misses empty input.\nVERDICT: FAIL" : "Holds.\nVERDICT: PASS";
      if (step === "Work")
        writeFileSync(join(cwd, "sum.ts"), "export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);\n");
      return prompt.includes("VERDICT") ? "Fine.\nVERDICT: PASS" : `${step} done`;
    };
    const { flows, projectId } = setup(agent, async () => [pass("test")]);
    const run = flows.start({ projectId, flow: "careful", request: "Add a sum helper" });
    await until(
      () => flows.get(run.id),
      (r) => r.status === "needs_you",
    );
    expect(calls).toEqual(["Explore (read)", "Plan (read)", "Critique (read)", "Plan (read)", "Critique (read)"]);
    flows.respond(run.id, "approve", "approve");
    const done = await until(
      () => flows.get(run.id),
      (r) => r.status === "ready" || r.status === "failed",
    );
    expect(done.status).toBe("ready");
    expect(calls.slice(5)).toEqual(["Work", "Review (read)"]);
    expect(done.changes?.map((f) => f.path)).toEqual(["sum.ts"]);
  });

  test("cleanup: nothing is touched when the checks already fail; otherwise each removal is its own commit", async () => {
    const steps: string[] = [];
    const agent: AgentRun = async ({ cwd, prompt, readOnly }) => {
      const step = prompt.match(/one step \("([^"]+)"\)/)?.[1] ?? "?";
      steps.push(`${step}${readOnly ? " (read)" : ""}`);
      if (step === "Clean")
        for (const name of ["old-a", "old-b"]) {
          writeFileSync(join(cwd, `${name}.txt`), "gone\n");
          Bun.spawnSync(["git", "-C", cwd, "add", "-A"]);
          Bun.spawnSync([
            "git",
            "-C",
            cwd,
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@t",
            "commit",
            "-qm",
            `Remove ${name}`,
          ]);
        }
      return prompt.includes("VERDICT") ? "Nothing changed for users.\nVERDICT: PASS" : `${step} done`;
    };
    const red = setup(agent, async () => [{ ...pass("test"), ok: false, exitCode: 1 }]);
    const stopped = red.flows.start({ projectId: red.projectId, flow: "cleanup", request: "src/" });
    const end = await until(
      () => red.flows.get(stopped.id),
      (r) => r.status === "failed" || r.status === "needs_you",
    );
    expect(end.status).toBe("failed");
    expect(steps).toEqual([]);

    const green = setup(agent, async () => [pass("test")]);
    const run = green.flows.start({ projectId: green.projectId, flow: "cleanup", request: "src/" });
    await until(
      () => green.flows.get(run.id),
      (r) => r.status === "needs_you",
    );
    expect(steps).toEqual(["Find dead code (read)"]);
    green.flows.respond(run.id, "pick", "approve");
    const done = await until(
      () => green.flows.get(run.id),
      (r) => r.status === "ready" || r.status === "failed",
    );
    expect(done.status).toBe("ready");
    expect(steps.slice(1)).toEqual(["Clean", "Nothing changed for users (read)"]);
    const branch = done.worktree?.branch ?? "";
    const log = Bun.spawnSync(["git", "-C", green.dir, "log", "--format=%s", branch]).stdout.toString();
    expect(log).toContain("Remove old-a");
    expect(log).toContain("Remove old-b");
  });

  test("a run can give its unnamed steps to one persona (a fix by the part's owner)", async () => {
    const systems: (string | undefined)[] = [];
    const agent: AgentRun = async ({ cwd, system }) => {
      systems.push(system);
      writeFileSync(join(cwd, "fix.ts"), "export const fixed = true;\n");
      return "Fixed";
    };
    const { flows, projectId } = setup(agent, async () => [pass("test")]);
    expect(() => flows.start({ projectId, flow: "task", request: "Fix it", persona: "nobody" })).toThrow();
    const run = flows.start({ projectId, flow: "task", request: "Fix the swallowed errors", persona: "backend" });
    expect(run.nodes.find((n) => n.id === "do")?.persona).toBe("backend");
    await until(
      () => flows.get(run.id),
      (r) => r.status === "ready" || r.status === "failed",
    );
    expect(systems[0]).toBeTruthy();
  });

  test("a QA failure goes back a limited number of times, then the run stops", async () => {
    const agent: AgentRun = async ({ prompt }) => (prompt.includes("VERDICT") ? "Broken.\nVERDICT: FAIL" : "done");
    const { flows, projectId } = setup(agent, async () => [pass("test")]);
    const run = flows.start({ projectId, flow: "fix", request: "Login crashes on empty password" });
    const end = await until(
      () => flows.get(run.id),
      (r) => r.status === "failed" || r.status === "ready",
    );
    expect(end.status).toBe("failed");
    expect(end.nodes.find((n) => n.id === "qa")?.attempts).toBe(3);
    flows.discard(run.id);
    expect(flows.get(run.id)?.status).toBe("discarded");
  });
});

describe("limit queue", () => {
  test("a full limit puts the run on hold instead of failing it; it goes on by itself after the reset", async () => {
    let calls = 0;
    const reset = Math.floor(Date.now() / 1000) + 3 * 3600;
    const agent: AgentRun = async ({ cwd }) => {
      calls++;
      if (calls === 1) throw new Error(`Claude AI usage limit reached|${reset}`);
      writeFileSync(join(cwd, "fix.ts"), "export const ok = true;\n");
      return "Fixed";
    };
    const { flows, projectId } = setup(agent, async () => [pass("test")]);
    const run = flows.start({ projectId, flow: "task", request: "Rename the helper" });
    const waiting = await until(
      () => flows.get(run.id),
      (r) => r.status === "waiting_limit",
    );
    expect(waiting.resumeAt).toBe(reset * 1000);
    expect(waiting.nodes.every((n) => n.status !== "failed")).toBe(true);
    expect(flows.resumeWaiting(reset * 1000 - 1000)).toEqual([]);
    expect(flows.resumeWaiting(reset * 1000 + 1)).toEqual([run.id]);
    const done = await until(
      () => flows.get(run.id),
      (r) => r.status === "ready",
    );
    expect(done.nodes.find((n) => n.status === "done")?.attempts).toBe(1);
    expect(calls).toBe(2);
  });
});

describe("model arena", () => {
  test("two models, one task, each in its own copy; the winner is merged, the other thrown away; stats add up", async () => {
    const { Arena } = await import("./arena");
    const models: string[] = [];
    const agent: AgentRun = async ({ cwd, model }) => {
      models.push(model ?? "");
      writeFileSync(join(cwd, "README.md"), `# app\nWritten by ${model}\n`);
      return `Done by ${model}`;
    };
    const { flows, projectId, dir, sqlite } = setup(agent, async () => [pass("test")]);
    const arena = new Arena(sqlite, flows);
    expect(() =>
      arena.start({ projectId, request: "Improve the README docs", models: ["sonnet", "sonnet"] }),
    ).toThrow();
    const match = arena.start({ projectId, request: "Improve the README docs", models: ["haiku", "sonnet"] });
    expect(match.category).toBe("docs");
    for (const s of match.sides)
      await until(
        () => flows.get(s.runId),
        (r) => r.status === "ready",
      );
    expect(models.sort()).toEqual(["haiku", "sonnet"]);
    arena.pick(match.id, "sonnet");
    const [a, b] = match.sides.map((s) => flows.get(s.runId)?.status);
    expect([a, b]).toEqual(["discarded", "merged"]);
    expect(readFileSync(join(dir, "README.md"), "utf8")).toContain("Written by sonnet");
    expect(arena.stats()).toEqual([
      { category: "docs", model: "sonnet", wins: 1, played: 1 },
      { category: "docs", model: "haiku", wins: 0, played: 1 },
    ]);
    expect(() => arena.pick(match.id, "haiku")).toThrow();
  });
});

describe("evening recap", () => {
  test("numbers per project for a day, the text written once and kept", async () => {
    const { Writeups } = await import("./writeups");
    const agent: AgentRun = async () => "ok";
    const { flows, projectId, sqlite } = setup(agent, async () => [pass("test")]);
    const store = new Store(sqlite);
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    store.saveCommits(projectId, [{ hash: "abc1234", author: "a", subject: "Add login", at: Date.now(), files: 2 }]);
    let asked = "";
    const w = new Writeups(sqlite, store, flows, async (prompt) => {
      asked = prompt;
      return "```markdown\n## Bugün\n- Giriş eklendi\n```";
    });
    expect(w.dayStats(day).commits).toBe(1);
    const recap = await w.recap(day, "tr");
    expect(recap.text).toBe("## Bugün\n- Giriş eklendi");
    expect(asked).toContain("commit: Add login");
    expect(asked).toContain("Turkish");
    expect(w.cachedRecap(day)?.text).toBe(recap.text);
    expect(w.recapDays()).toEqual([day]);
    await expect(w.recap("2001-01-01", "tr")).rejects.toThrow("Nothing happened");
  });
});
