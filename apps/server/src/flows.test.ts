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
  return { flows, board, projectId, dir };
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
