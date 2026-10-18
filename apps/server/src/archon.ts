import type { FlowNodeState, FlowRun } from "@igrek/core";
import { cleanEnv } from "./env";
import type { Flows } from "./flows";

/** Archon steps that ship work (push, open a pull request): God Eye never runs those on its own. */
const SHIPS = /(git\s+push|gh\s+pr\s+create|create[-_ ]pr|pull request|open(s|ing)? a pr\b|\bpr\b.*\bopen)/i;

export function archonBin(): string | undefined {
  return Bun.which("archon") ?? undefined;
}

/** Archon prints "[node] Started", "[node] Completed (5s)", "[node] Failed: …" while it runs. */
export function parseArchonLine(
  line: string,
): { node: string; event: "start" | "done" | "fail" | "log"; text: string } | undefined {
  const m = line.match(/^\[([\w-]+)\]\s+(.*)$/);
  if (!m) return undefined;
  const [, node, rest] = m as unknown as [string, string, string];
  if (node === "workflow") return undefined;
  if (/^Started\b/.test(rest)) return { node, event: "start", text: rest };
  if (/^Completed\b/.test(rest)) return { node, event: "done", text: rest };
  if (/^(Failed|Error)\b/i.test(rest)) return { node, event: "fail", text: rest };
  return { node, event: "log", text: rest };
}

async function run(bin: string, args: string[], cwd: string): Promise<{ code: number; out: string }> {
  const p = Bun.spawn([bin, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: cleanEnv({ CLAUDE_USE_GLOBAL_AUTH: "true" }),
  });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { code, out: `${out}${err}` };
}

/** Archon's workflows for a project, when Archon is installed (plan.md Faz 8: Archon adapter). */
export async function archonWorkflows(
  cwd: string,
  bin = archonBin(),
): Promise<{ name: string; description: string }[]> {
  if (!bin) return [];
  const { code, out } = await run(bin, ["workflow", "list", "--json"], cwd);
  if (code !== 0) return [];
  try {
    const parsed = JSON.parse(out.slice(out.indexOf("["))) as { name?: string; description?: string }[];
    return parsed
      .filter((w) => w.name)
      .map((w) => ({ name: String(w.name), description: String(w.description ?? "") }));
  } catch {
    return [];
  }
}

/**
 * Runs an Archon workflow and follows it as a God Eye run: its steps show up as nodes as they start.
 * Workflows that push or open pull requests are refused (God Eye never ships on its own); Archon
 * uses your Claude Code login (CLAUDE_USE_GLOBAL_AUTH), no API key.
 */
export async function startArchon(
  flows: Flows,
  args: { projectId: string; cwd: string; workflow: string; request: string },
  bin = archonBin(),
): Promise<FlowRun> {
  if (!bin) throw new Error("Archon is not installed on this computer");
  const detail = await run(bin, ["workflow", "list", args.workflow, "--full"], args.cwd);
  if (detail.code !== 0) throw new Error("Archon doesn't know this workflow");
  if (SHIPS.test(detail.out))
    throw new Error(
      "This Archon workflow pushes or opens a pull request; God Eye never ships on its own. Use a workflow that stops at a commit.",
    );
  const now = Date.now();
  const flowRun: FlowRun = {
    id: crypto.randomUUID().slice(0, 10),
    projectId: args.projectId,
    flow: `archon:${args.workflow}`,
    request: args.request,
    engine: "archon",
    status: "running",
    nodes: [],
    createdAt: now,
    updatedAt: now,
  };
  flows.save(flowRun);
  const proc = Bun.spawn([bin, "workflow", "run", args.workflow, args.request], {
    cwd: args.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: cleanEnv({ CLAUDE_USE_GLOBAL_AUTH: "true" }),
  });
  void (async () => {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let current: FlowNodeState | undefined;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!line || line.startsWith("{")) continue;
        const event = parseArchonLine(line);
        const r = flows.get(flowRun.id);
        if (!r) return;
        if (event) {
          let node = r.nodes.find((n) => n.id === event.node);
          if (!node) {
            node = { id: event.node, status: "waiting", attempts: 0, log: [], dependsOn: current ? [current.id] : [] };
            r.nodes.push(node);
          }
          if (event.event === "start")
            Object.assign(node, { status: "running", startedAt: Date.now(), attempts: node.attempts + 1 });
          if (event.event === "done") Object.assign(node, { status: "done", endedAt: Date.now() });
          if (event.event === "fail") Object.assign(node, { status: "failed", endedAt: Date.now(), error: event.text });
          node.log = [...node.log, event.text].slice(-60);
          current = node;
        } else if (current) {
          const node = r.nodes.find((n) => n.id === current?.id);
          if (node) {
            node.log = [...node.log, line].slice(-60);
            node.activity = line.slice(0, 160);
            node.output = `${node.output ?? ""}\n${line}`.slice(-4000);
          }
        }
        flows.save(r);
      }
    }
    const code = await proc.exited;
    const r = flows.get(flowRun.id);
    if (!r) return;
    r.status = code === 0 ? "done" : "failed";
    if (code !== 0)
      r.error = (await new Response(proc.stderr).text()).trim().slice(-600) || `Archon exited with ${code}`;
    flows.save(r);
  })();
  return flowRun;
}
