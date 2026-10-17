import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type FlowDef,
  type FlowNode,
  type FlowNodeState,
  type FlowRun,
  limitResetAt,
  type Persona,
  type ToolResult,
} from "@godeye/core";
import { parse as parseYaml } from "yaml";
import type { Bus, StopRegistry } from "./bus";
import { cleanEnv } from "./env";
import { BUILTIN_FLOWS } from "./flows-builtin";
import { SHIP_ASK_RULES } from "./guards";
import { planTools, runTool } from "./insight/tools";
import { LIMIT_REACHED } from "./localmodel";
import type { Personas } from "./personas";
import type { Store } from "./store";
import { sandboxAvailable } from "./system";
import { createWorktree, mergeWorktree, removeWorktree, type Worktree, worktreeDiff } from "./worktrees";

const MAX_LOG = 60;
const NODE_TIMEOUT_MS = 40 * 60_000;

function git(cwd: string, args: string[]): { ok: boolean; out: string; err: string } {
  const p = Bun.spawnSync(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return { ok: p.exitCode === 0, out: p.stdout.toString().trim(), err: p.stderr.toString().trim() };
}

/** The user's git identity when set; a stand-in otherwise (commits on the run's own branch). */
function identity(cwd: string): string[] {
  const has = (key: string) => git(cwd, ["config", key]).out !== "";
  return [
    ...(has("user.name") ? [] : ["-c", "user.name=God Eye"]),
    ...(has("user.email") ? [] : ["-c", "user.email=god-eye@localhost"]),
  ];
}

/** Commits whatever the node changed, on the run's branch. */
function commitAll(cwd: string, message: string): boolean {
  git(cwd, ["add", "-A"]);
  if (git(cwd, ["diff", "--cached", "--quiet"]).ok) return false;
  return git(cwd, [...identity(cwd), "commit", "-q", "-m", message.slice(0, 200)]).ok;
}

/** Reads a flow from YAML (Archon's node format plus God Eye's fields). */
export function parseFlow(text: string, source: FlowDef["source"]): FlowDef {
  const raw = parseYaml(text) as Record<string, unknown> | null;
  if (!raw || !Array.isArray(raw.nodes)) throw new Error("A flow needs a list of nodes");
  const ids = new Set<string>();
  const nodes: FlowNode[] = (raw.nodes as Record<string, unknown>[]).map((n) => {
    const id = String(n.id ?? "").trim();
    if (!/^[\w-]{1,40}$/.test(id) || ids.has(id)) throw new Error(`Bad or repeated node id: ${id || "(empty)"}`);
    ids.add(id);
    const wait = n.wait as { attention?: unknown } | undefined;
    const onFail = n.on_fail as { back_to?: unknown; max?: unknown } | undefined;
    return {
      id,
      ...(typeof n.title === "string" ? { title: n.title.slice(0, 80) } : {}),
      ...(typeof n.persona === "string" ? { persona: n.persona } : {}),
      ...(typeof n.prompt === "string" ? { prompt: n.prompt } : {}),
      ...(typeof n.bash === "string" ? { bash: n.bash } : {}),
      ...(wait ? { wait: { attention: String(wait.attention ?? "Your decision is needed.") } } : {}),
      ...(n.checks === true ? { checks: true } : {}),
      ...(Array.isArray(n.depends_on) ? { depends_on: n.depends_on.map(String) } : {}),
      ...(typeof n.model === "string" ? { model: n.model } : {}),
      ...(n.worktree === "own" ? { worktree: "own" as const } : {}),
      ...(n.review === true ? { review: true } : {}),
      ...(onFail && Array.isArray(onFail.back_to)
        ? { on_fail: { back_to: onFail.back_to.map(String), max: Math.max(1, Math.min(5, Number(onFail.max) || 1)) } }
        : {}),
    };
  });
  for (const node of nodes) {
    for (const dep of node.depends_on ?? []) if (!ids.has(dep)) throw new Error(`${node.id} depends on unknown ${dep}`);
    for (const back of node.on_fail?.back_to ?? [])
      if (!ids.has(back)) throw new Error(`${node.id} goes back to unknown ${back}`);
    if ([node.prompt, node.bash, node.wait, node.checks].filter(Boolean).length !== 1)
      throw new Error(`${node.id} needs exactly one of prompt, bash, wait or checks`);
  }
  return {
    name: String(raw.name ?? "flow").slice(0, 60),
    ...(typeof raw.description === "string" ? { description: raw.description } : {}),
    nodes,
    source,
  };
}

/** Runs one AI step: Claude Code in the node's folder, as the persona, without asking (auto mode). */
export type AgentRun = (args: {
  cwd: string;
  prompt: string;
  system?: string;
  model?: string;
  readOnly: boolean;
  maxTurns: number;
  onActivity: (text: string) => void;
  register: (stop: () => void) => () => void;
}) => Promise<string>;

/** OpenAI's Codex CLI as a team step (the model arena): workspace-write sandbox, only in the run's copy. */
async function runCodex({ cwd, prompt, system, readOnly, register }: Parameters<AgentRun>[0]): Promise<string> {
  if (!Bun.which("codex")) throw new Error("Codex CLI is not installed (npm install -g @openai/codex)");
  const last = join(cwd, ".godeye-codex-last.txt");
  const proc = Bun.spawn(
    [
      "codex",
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      readOnly ? "read-only" : "workspace-write",
      "--output-last-message",
      last,
      `${system ? `${system}\n\n` : ""}${prompt}`,
    ],
    { cwd, stdout: "pipe", stderr: "pipe", env: cleanEnv({ GODEYE_INTERNAL: "1" }) },
  );
  const unregister = register(() => proc.kill());
  const timer = setTimeout(() => proc.kill(), NODE_TIMEOUT_MS);
  try {
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const answer = existsSync(last) ? readFileSync(last, "utf8").trim() : out.trim().slice(-4000);
    rmSync(last, { force: true });
    if (code !== 0) throw new Error((err || out).trim().slice(-600) || `codex exited with ${code}`);
    return answer || "Done";
  } finally {
    clearTimeout(timer);
    unregister();
  }
}

export const runAgent: AgentRun = async (args) => {
  if (args.model === "codex") return runCodex(args);
  const { cwd, prompt, system, model, readOnly, maxTurns, onActivity, register } = args;
  const sandboxed = !readOnly && sandboxAvailable();
  const proc = Bun.spawn(
    [
      "claude",
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--no-session-persistence",
      "--max-turns",
      String(maxTurns),
      // Auto mode, but only ever in the run's own copy; shipping is refused outright.
      // Reviewers only read, and may look at the branch's history and diff.
      "--permission-mode",
      readOnly ? "default" : "auto",
      "--settings",
      JSON.stringify({
        permissions: { deny: SHIP_ASK_RULES },
        ...(sandboxed ? { sandbox: { enabled: true, autoAllowBashIfSandboxed: false } } : {}),
      }),
      ...(model ? ["--model", model] : []),
      ...(system ? ["--append-system-prompt", system] : []),
      ...(readOnly
        ? [
            "--tools",
            "Read,Grep,Glob,Bash",
            "--allowedTools",
            "Bash(git diff:*)",
            "Bash(git log:*)",
            "Bash(git status:*)",
            "Bash(git show:*)",
            // Reviewers may run the project's tests to see for themselves.
            "Bash(bun test:*)",
            "Bash(npm test:*)",
            "Bash(npm run test:*)",
            "Bash(pnpm test:*)",
            "Bash(yarn test:*)",
            "Bash(pytest:*)",
            "Bash(go test:*)",
            "Bash(cargo test:*)",
          ]
        : []),
    ],
    {
      cwd,
      stdin: new Blob([prompt]),
      stdout: "pipe",
      stderr: "pipe",
      env: cleanEnv({ GODEYE_INTERNAL: "1", GIT_CEILING_DIRECTORIES: dirname(cwd) }),
    },
  );
  const unregister = register(() => proc.kill());
  const timer = setTimeout(() => proc.kill(), NODE_TIMEOUT_MS);
  let result: { result?: string; is_error?: boolean; subtype?: string } | undefined;
  try {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.type === "assistant") {
          for (const block of ((msg.message as Record<string, unknown>)?.content ?? []) as Record<string, unknown>[]) {
            if (block.type === "tool_use") {
              const input = (block.input ?? {}) as Record<string, unknown>;
              const target = String(input.file_path ?? input.command ?? input.pattern ?? input.description ?? "").slice(
                0,
                120,
              );
              onActivity(`${block.name}${target ? ` ${target.replace(`${cwd}/`, "")}` : ""}`);
            } else if (block.type === "text" && typeof block.text === "string" && block.text.trim())
              onActivity(block.text.trim().split("\n")[0]?.slice(0, 160) ?? "");
          }
        } else if (msg.type === "result") result = msg as typeof result;
      }
    }
    const code = await proc.exited;
    if (!result)
      throw new Error((await new Response(proc.stderr).text()).trim().slice(0, 400) || `claude exited with ${code}`);
    if (result.is_error || typeof result.result !== "string")
      throw new Error(
        result.subtype === "error_max_turns"
          ? "Ran out of steps before finishing"
          : String(result.result ?? "The step failed"),
      );
    return result.result;
  } finally {
    clearTimeout(timer);
    unregister();
  }
};

/**
 * God Eye's flow engine (plan.md Faz 8). Every run gets its own copy of the repo and its own branch;
 * nodes whose inputs are ready run at the same time (side-by-side nodes in copies of their own,
 * merged back when done); a failed gate sends the work back with what went wrong; nothing reaches
 * your branch until you approve the final screen, and nothing is ever pushed.
 */
export class Flows {
  private live = new Map<string, Set<() => void>>();
  private wake = new Map<string, () => void>();
  private feedback = new Map<string, Map<string, string>>();
  /** A run's state changed (the board follows it). */
  onChange: (run: FlowRun) => void = () => undefined;

  constructor(
    private readonly db: Database,
    private readonly store: Store,
    private readonly bus: Bus,
    private readonly stops: StopRegistry,
    private readonly personas: Personas,
    private readonly worktreeDir: string,
    private readonly agent: AgentRun = runAgent,
    private readonly checks: (
      root: string,
      register: (stop: () => void) => () => void,
    ) => Promise<ToolResult[]> = async (root, register) => {
      const out: ToolResult[] = [];
      for (const plan of planTools(root).filter((p) => p.kind !== "audit"))
        out.push(await runTool(root, plan, register));
      return out;
    },
  ) {}

  // ---- flows ---------------------------------------------------------------------

  /** Built-in flows plus the project's own (.godeye/flows and .archon/workflows). */
  flowsFor(projectId: string): FlowDef[] {
    const out: FlowDef[] = Object.values(BUILTIN_FLOWS).map((text) => parseFlow(text, "builtin"));
    const project = this.store.projectRow(projectId);
    if (!project) return out;
    for (const [dir, source] of [
      [join(project.path, ".godeye", "flows"), "project"],
      [join(project.path, ".archon", "workflows"), "archon"],
    ] as const) {
      let files: string[] = [];
      try {
        files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
      } catch {
        continue;
      }
      for (const file of files) {
        try {
          out.push(parseFlow(readFileSync(join(dir, file), "utf8"), source));
        } catch {
          // a flow we can't read (or an Archon feature we don't run) is left out
        }
      }
    }
    return out;
  }

  // ---- runs ----------------------------------------------------------------------

  list(projectId?: string): FlowRun[] {
    const rows = (
      projectId
        ? this.db
            .query("SELECT data FROM flow_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50")
            .all(projectId)
        : this.db.query("SELECT data FROM flow_runs ORDER BY created_at DESC LIMIT 50").all()
    ) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as FlowRun);
  }

  get(id: string): FlowRun | undefined {
    const row = this.db.query("SELECT data FROM flow_runs WHERE id = ?").get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as FlowRun) : undefined;
  }

  save(run: FlowRun): void {
    run.updatedAt = Date.now();
    this.db
      .query(
        `INSERT INTO flow_runs (id, project_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(run.id, run.projectId, JSON.stringify(run), run.createdAt, run.updatedAt);
    this.bus.publish({ type: "flows-changed", runId: run.id });
    this.onChange(run);
  }

  start(args: {
    projectId: string;
    flow: string;
    request: string;
    taskId?: string;
    scheduleId?: string;
    limits?: { maxMinutes?: number; maxTurns?: number };
    model?: string;
  }): FlowRun {
    const project = this.store.projectRow(args.projectId);
    if (!project || !existsSync(project.path)) throw new Error("Project folder not found");
    const def = this.flowsFor(args.projectId).find((f) => f.name === args.flow);
    if (!def) throw new Error("Flow not found");
    const request = args.request.trim().slice(0, 4000);
    if (request.length < 3) throw new Error("Write what the team should do");
    const id = crypto.randomUUID().slice(0, 10);
    const wt = createWorktree(project.path, `flow-${id}`, this.worktreeDir);
    if (!wt) throw new Error("The project needs git with at least one commit for a team run");
    const now = Date.now();
    const run: FlowRun = {
      id,
      projectId: project.id,
      flow: def.name,
      request,
      engine: "godeye",
      status: "running",
      nodes: def.nodes.map((n) => ({
        id: n.id,
        ...(n.title ? { title: n.title } : {}),
        ...(n.persona ? { persona: n.persona } : {}),
        status: "waiting",
        attempts: 0,
        log: [],
        dependsOn: n.depends_on ?? [],
      })),
      worktree: {
        path: wt.path,
        branch: wt.branch,
        base: wt.base,
        ...(wt.baseBranch ? { baseBranch: wt.baseBranch } : {}),
      },
      ...(args.taskId ? { taskId: args.taskId } : {}),
      ...(args.scheduleId ? { scheduleId: args.scheduleId } : {}),
      ...(args.limits ? { limits: args.limits } : {}),
      ...(args.model ? { model: args.model } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.save(run);
    // A time budget: the run stops when it is used up (plan.md Faz 9).
    if (args.limits?.maxMinutes)
      setTimeout(() => {
        const current = this.get(id);
        if (current && (current.status === "running" || current.status === "needs_you")) {
          this.stop(id);
          const stopped = this.get(id);
          if (stopped) {
            stopped.error = `Stopped after ${args.limits?.maxMinutes} minutes (the schedule's limit)`;
            this.save(stopped);
          }
        }
      }, args.limits.maxMinutes * 60_000).unref?.();
    void this.drive(run.id, def);
    return run;
  }

  private def(run: FlowRun): FlowDef | undefined {
    return this.flowsFor(run.projectId).find((f) => f.name === run.flow);
  }

  /** Approve or reject a waiting node. Rejecting sends the work back (with your words) when the flow says so. */
  respond(runId: string, nodeId: string, decision: "approve" | "reject", text = ""): FlowRun {
    const run = this.get(runId);
    const state = run?.nodes.find((n) => n.id === nodeId);
    if (!run || !state || state.status !== "needs_you") throw new Error("Nothing is waiting for you here");
    const def = this.def(run);
    if (!def) throw new Error("Flow not found");
    if (decision === "approve") {
      Object.assign(state, { status: "done", endedAt: Date.now(), output: text ? `Approved: ${text}` : "Approved" });
    } else {
      const node = def.nodes.find((n) => n.id === nodeId) as FlowNode;
      state.attempts++;
      if (!this.sendBack(run, def, node, state, `The user rejected this and said: ${text || "(no reason given)"}`)) {
        Object.assign(state, { status: "failed", endedAt: Date.now(), error: text || "Rejected" });
        run.status = "failed";
        run.error = "Rejected";
      }
    }
    if (run.status !== "failed") run.status = "running";
    this.save(run);
    const wake = this.wake.get(runId);
    if (wake) wake();
    else void this.drive(runId, def);
    return run;
  }

  stop(runId: string): void {
    const run = this.get(runId);
    if (!run) return;
    for (const kill of this.live.get(runId) ?? []) kill();
    for (const n of run.nodes) if (n.status === "running" || n.status === "needs_you") n.status = "failed";
    run.status = "stopped";
    this.save(run);
    this.wake.get(runId)?.();
  }

  /** Runs waiting for a limit go on once it has reset (checked every minute). */
  resumeWaiting(now = Date.now()): string[] {
    const resumed: string[] = [];
    for (const run of this.list()) {
      if (run.status !== "waiting_limit" || (run.resumeAt ?? 0) > now) continue;
      // Steps still running in parallel when the limit came finish on their own; wait for them.
      if (run.nodes.some((n) => n.status === "running")) continue;
      const def = this.def(run);
      if (!def) continue;
      run.status = "running";
      run.resumeAt = undefined;
      this.save(run);
      void this.drive(run.id, def);
      resumed.push(run.id);
    }
    return resumed;
  }

  /** Runs failed or stopped nodes again from where they were. */
  retry(runId: string): FlowRun {
    const run = this.get(runId);
    if (!run || !["failed", "stopped"].includes(run.status))
      throw new Error("Only a failed or stopped run can be tried again");
    const def = this.def(run);
    if (!def) throw new Error("Flow not found");
    for (const n of run.nodes) if (n.status === "failed") Object.assign(n, { status: "waiting", error: undefined });
    run.status = "running";
    run.error = undefined;
    this.save(run);
    void this.drive(runId, def);
    return run;
  }

  /** The final OK: the run's branch is merged into your branch on this computer (never pushed). */
  merge(runId: string): FlowRun {
    const run = this.get(runId);
    const project = run ? this.store.projectRow(run.projectId) : undefined;
    if (!run || !project || !run.worktree) throw new Error("Run not found");
    if (run.status !== "ready") throw new Error("The run is not ready to merge");
    const wt = this.wt(run);
    const result = mergeWorktree(project.path, wt, `${run.flow}: ${run.request.split("\n")[0]?.slice(0, 60)}`);
    if (!result.merged) throw new Error(result.message);
    removeWorktree(project.path, wt);
    run.status = "merged";
    this.save(run);
    return run;
  }

  discard(runId: string): FlowRun {
    const run = this.get(runId);
    const project = run ? this.store.projectRow(run.projectId) : undefined;
    if (!run || !project) throw new Error("Run not found");
    if (run.status === "running" || run.status === "needs_you") this.stop(runId);
    if (run.worktree && existsSync(run.worktree.path)) removeWorktree(project.path, this.wt(run));
    const fresh = this.get(runId) as FlowRun;
    fresh.status = "discarded";
    this.save(fresh);
    return fresh;
  }

  /** "Send it back": the developers take your words and work again; the gates run again. */
  revise(runId: string, text: string): FlowRun {
    const run = this.get(runId);
    if (run?.status !== "ready") throw new Error("Only a finished run can be sent back");
    const def = this.def(run);
    if (!def) throw new Error("Flow not found");
    const editors = def.nodes
      .filter((n) => n.prompt && n.persona && this.personas.get(n.persona)?.tools === "edit")
      .map((n) => n.id);
    if (!editors.length) throw new Error("This flow has no step that changes code");
    this.reset(run, def, editors, `The user looked at the result and asked for changes: ${text}`);
    run.status = "running";
    this.save(run);
    void this.drive(runId, def);
    return run;
  }

  private wt(run: FlowRun): Worktree {
    const project = this.store.projectRow(run.projectId);
    const top = project ? git(project.path, ["rev-parse", "--show-toplevel"]).out : "";
    return {
      ...(run.worktree as NonNullable<FlowRun["worktree"]>),
      sub: project && top ? project.path.slice(top.length + 1) : "",
    };
  }

  // ---- the engine ----------------------------------------------------------------

  /** Sets nodes (and everything after them) back to waiting, with what went wrong for the sent-back ones. */
  private reset(run: FlowRun, def: FlowDef, ids: string[], why: string): void {
    const fb = this.feedback.get(run.id) ?? new Map<string, string>();
    this.feedback.set(run.id, fb);
    const toReset = new Set(ids);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of def.nodes)
        if (!toReset.has(n.id) && (n.depends_on ?? []).some((d) => toReset.has(d))) {
          toReset.add(n.id);
          grew = true;
        }
    }
    for (const state of run.nodes) {
      if (!toReset.has(state.id)) continue;
      Object.assign(state, {
        status: "waiting",
        activity: undefined,
        verdict: undefined,
        error: undefined,
        endedAt: undefined,
      });
      if (ids.includes(state.id)) fb.set(state.id, why);
    }
  }

  /** On failure: go back to earlier nodes if the flow allows and the budget lasts. */
  private sendBack(run: FlowRun, def: FlowDef, node: FlowNode, state: FlowNodeState, why: string): boolean {
    const budget = node.on_fail;
    if (!budget || state.attempts > budget.max) return false;
    this.reset(run, def, budget.back_to, `${node.title ?? node.id} did not pass: ${why.slice(0, 4000)}`);
    // The gate itself runs again after the fixes.
    state.status = "waiting";
    return true;
  }

  private async drive(runId: string, def: FlowDef): Promise<void> {
    for (;;) {
      const run = this.get(runId);
      if (!run || !["running"].includes(run.status)) return;
      const done = (id: string) => run.nodes.find((n) => n.id === id)?.status === "done";
      const ready = run.nodes.filter((n) => n.status === "waiting" && n.dependsOn.every(done));
      if (run.nodes.every((n) => n.status === "done")) {
        run.changes = worktreeDiff(this.wt(run)).files.slice(0, 200);
        // Nothing changed (a report, a check): done, and the copy is cleaned up. Otherwise it waits for your OK.
        run.status = run.changes.length ? "ready" : "done";
        if (!run.changes.length) {
          const project = this.store.projectRow(run.projectId);
          if (project) removeWorktree(project.path, this.wt(run));
        }
        this.save(run);
        return;
      }
      if (!ready.length) {
        if (run.nodes.some((n) => n.status === "running")) {
          await new Promise<void>((resolve) => this.wake.set(runId, resolve));
          this.wake.delete(runId);
          continue;
        }
        if (run.nodes.some((n) => n.status === "needs_you")) {
          run.status = "needs_you";
          this.save(run);
          return;
        }
        run.status = "failed";
        run.error = run.error ?? run.nodes.find((n) => n.status === "failed")?.error ?? "Stopped";
        this.save(run);
        return;
      }
      for (const state of ready) {
        const node = def.nodes.find((n) => n.id === state.id) as FlowNode;
        if (node.wait) {
          Object.assign(state, { status: "needs_you", startedAt: Date.now(), activity: node.wait.attention });
          this.save(run);
          continue;
        }
        Object.assign(state, { status: "running", startedAt: Date.now(), attempts: state.attempts + 1, log: [] });
        this.save(run);
        void this.runNode(runId, def, node).finally(() => this.wake.get(runId)?.());
      }
      if (!run.nodes.some((n) => n.status === "running")) continue;
      await new Promise<void>((resolve) => this.wake.set(runId, resolve));
      this.wake.delete(runId);
    }
  }

  private update(runId: string, nodeId: string, patch: (s: FlowNodeState, run: FlowRun) => void): FlowRun | undefined {
    const run = this.get(runId);
    const state = run?.nodes.find((n) => n.id === nodeId);
    if (!run || !state) return undefined;
    patch(state, run);
    this.save(run);
    return run;
  }

  private fill(text: string, run: FlowRun, nodeId: string): string {
    const fb = this.feedback.get(run.id)?.get(nodeId);
    return text
      .replace(/\$REQUEST/g, run.request)
      .replace(/\$FEEDBACK/g, fb ? `\nWHAT WENT WRONG LAST TIME (fix this first):\n${fb}` : "")
      .replace(/\$([\w-]+)\.output/g, (_m, id: string) => run.nodes.find((n) => n.id === id)?.output ?? "(nothing)");
  }

  private async runNode(runId: string, def: FlowDef, node: FlowNode): Promise<void> {
    const run = this.get(runId);
    if (!run?.worktree) return;
    const kills = this.live.get(runId) ?? new Set<() => void>();
    this.live.set(runId, kills);
    const register = (stop: () => void) => {
      kills.add(stop);
      const off = this.stops.register(`flow-${runId}-${node.id}-${Date.now()}`, {
        label: `${run.flow}: ${node.id}`,
        stop,
      });
      return () => {
        kills.delete(stop);
        off();
      };
    };
    const runDir = this.wt(run);
    const workIn = (p: string) => (runDir.sub ? join(p, runDir.sub) : p);
    let own: { path: string; branch: string } | undefined;
    const log = (line: string) =>
      this.update(runId, node.id, (s) => {
        s.activity = line;
        s.log = [...s.log, line].slice(-MAX_LOG);
      });
    try {
      // Side-by-side nodes work in a copy of their own, branched from the run's branch.
      if (node.worktree === "own") {
        const branch = `${run.worktree.branch}-${node.id}-${Date.now().toString(36)}`;
        const path = join(this.worktreeDir, `${run.id}-${node.id}-${Date.now().toString(36)}`);
        mkdirSync(this.worktreeDir, { recursive: true });
        const added = git(run.worktree.path, ["worktree", "add", "-q", "-b", branch, path, run.worktree.branch]);
        if (!added.ok) throw new Error(`Couldn't make a copy for this step: ${added.err}`);
        own = { path, branch };
      }
      const cwd = workIn(own?.path ?? run.worktree.path);
      let output = "";
      let verdict: "pass" | "fail" | undefined;
      if (node.checks) {
        const results = await this.checks(cwd, register);
        const failed = results.filter((r) => !r.ok);
        output = results.length
          ? results
              .map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.command}${r.ok ? "" : `\n${r.output.slice(-2500)}`}`)
              .join("\n")
          : "No build, lint or test command was found in this project, so nothing could be checked.";
        verdict = results.length && !failed.length ? "pass" : failed.length ? "fail" : undefined;
        if (failed.length) throw Object.assign(new Error(output), { gate: true });
      } else if (node.bash) {
        const p = Bun.spawn(["sh", "-c", this.fill(node.bash, run, node.id)], {
          cwd,
          stdout: "pipe",
          stderr: "pipe",
          env: cleanEnv({ CI: "1" }),
        });
        const off = register(() => p.kill());
        const [out, err, code] = await Promise.all([
          new Response(p.stdout).text(),
          new Response(p.stderr).text(),
          p.exited,
        ]);
        off();
        output = `${out}${err}`.trim().slice(-4000);
        if (code !== 0) throw Object.assign(new Error(output || `exit ${code}`), { gate: true });
      } else if (node.prompt) {
        const persona: Persona | undefined = node.persona ? this.personas.get(node.persona) : undefined;
        const readOnly = node.review === true || persona?.tools === "read";
        const prompt = `${this.fill(node.prompt, run, node.id)}

You are one step ("${node.title ?? node.id}") of a team workflow in God Eye, working in a separate copy of the project on its own branch. Work only inside this folder. Never push, merge, publish or deploy. ${readOnly ? "Do not change any files." : "Leave your changes in the folder (God Eye commits them)."}
End with a short summary of what you did, for the next step.${node.review ? "\nYour very last line must be VERDICT: PASS or VERDICT: FAIL. FAIL only for problems that must be fixed before this can ship." : ""}`;
        output = await this.agent({
          cwd,
          prompt,
          system: persona ? this.personas.systemPrompt(persona, run.projectId, { notebook: false }) : undefined,
          model: run.model ?? node.model ?? persona?.model,
          readOnly,
          maxTurns: Math.min(run.limits?.maxTurns ?? 999, Math.max(persona?.maxTurns ?? 40, readOnly ? 30 : 80)),
          onActivity: log,
          register,
        });
        if (node.review) {
          const found = [...output.matchAll(/VERDICT:\s*(PASS|FAIL)/gi)].at(-1)?.[1]?.toLowerCase();
          verdict = found === "fail" ? "fail" : found === "pass" ? "pass" : undefined;
        }
        if (!readOnly) commitAll(cwd, `${node.title ?? node.id}: ${run.request.split("\n")[0]}`);
      }
      // Bring the copy's work into the run's branch.
      if (own) {
        commitAll(own.path, `${node.title ?? node.id}`);
        const merged = git(run.worktree.path, [
          ...identity(run.worktree.path),
          "merge",
          "--no-ff",
          "--no-edit",
          own.branch,
        ]);
        if (!merged.ok) {
          git(run.worktree.path, ["merge", "--abort"]);
          throw new Error(
            `The work of this step conflicts with another step's: ${merged.err || merged.out}`.slice(0, 600),
          );
        }
      }
      if (node.review && verdict === "fail" && node.on_fail)
        throw Object.assign(new Error(output.slice(-4000)), { gate: true, verdict });
      this.update(runId, node.id, (s) =>
        Object.assign(s, {
          status: "done",
          endedAt: Date.now(),
          output: output.slice(-6000),
          verdict,
          activity: undefined,
        }),
      );
    } catch (err) {
      const message = (err as Error).message;
      const current = this.get(runId);
      if (!current || current.status === "stopped") return;
      const state = current.nodes.find((n) => n.id === node.id) as FlowNodeState;
      // The plan's limit is full: nothing is lost, the step waits and the run goes on when it resets.
      if (LIMIT_REACHED.test(message) && !(err as { gate?: boolean }).gate) {
        Object.assign(state, {
          status: "waiting",
          attempts: Math.max(0, state.attempts - 1),
          activity: undefined,
          error: undefined,
        });
        current.status = "waiting_limit";
        current.resumeAt = Math.max(current.resumeAt ?? 0, limitResetAt(message));
        this.save(current);
        return;
      }
      Object.assign(state, {
        endedAt: Date.now(),
        output: message.slice(-6000),
        ...((err as { gate?: boolean }).gate ? { verdict: "fail" } : {}),
      });
      if (!this.sendBack(current, def, node, state, message))
        Object.assign(state, { status: "failed", error: message.slice(0, 600) });
      this.save(current);
    } finally {
      if (own) {
        git(run.worktree.path, ["worktree", "remove", "--force", own.path]);
        git(run.worktree.path, ["branch", "-D", own.branch]);
        rmSync(own.path, { recursive: true, force: true });
      }
    }
  }

  /** Runs cut off by a restart: their running steps failed; "Try again" picks them up. */
  recover(): void {
    for (const run of this.list()) {
      if (run.status !== "running") continue;
      for (const n of run.nodes)
        if (n.status === "running") Object.assign(n, { status: "failed", error: "God Eye restarted" });
      run.status = "failed";
      run.error = "God Eye restarted during the run";
      this.save(run);
    }
  }
}
