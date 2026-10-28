import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SETTINGS, type FlowRun, type ToolResult } from "@igrek/core";
import { Hono } from "hono";
import { Board } from "./board";
import { registerBotRoutes } from "./bot-routes";
import { Bots, handleOf } from "./bots";
import { Bus, StopRegistry } from "./bus";
import { openDb } from "./db";
import { type AgentRun, Flows } from "./flows";
import { Personas } from "./personas";
import { Store } from "./store";
import type { Sync } from "./sync/client";
import { Chat, channelId } from "./team-chat";
import { registerTeamChatRoutes } from "./team-chat-routes";

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "igrek-bot-"));
  const git = (...args: string[]) =>
    Bun.spawnSync(["git", "-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args]);
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "README.md"), "# shop\n");
  git("add", "-A");
  git("commit", "-qm", "first");
  return dir;
}

const pass: ToolResult = { kind: "test", command: "bun test", exitCode: 0, ok: true, ms: 1, at: 1, output: "" };

function setup() {
  const { sqlite } = openDb(":memory:");
  const store = new Store(sqlite);
  const projectId = store.addProject(repo());
  const bus = new Bus();
  const personas = new Personas(sqlite, store, bus, new StopRegistry(), () => DEFAULT_SETTINGS, "/tmp");
  const prompts: string[] = [];
  const agent: AgentRun = async ({ cwd, prompt }) => {
    prompts.push(prompt);
    writeFileSync(join(cwd, "pay.ts"), "export const pay = 1;\n");
    return "Rewrote the payment module.";
  };
  const flows = new Flows(
    sqlite,
    store,
    bus,
    new StopRegistry(),
    personas,
    mkdtempSync(join(tmpdir(), "igrek-wt-")),
    agent,
    async () => [pass],
  );
  const chat = new Chat(sqlite, bus);
  const bots = new Bots(sqlite, bus, flows, chat, (id) => !!personas.get(id));
  const board = new Board(sqlite, bus, flows);
  board.startByBot = (task) => {
    const bot = task.assignee?.kind === "persona" ? bots.forPersona(task.projectId, task.assignee.id) : undefined;
    return bot ? bots.start(bot.id, { projectId: task.projectId, request: task.title, taskId: task.id }).id : undefined;
  };
  flows.onChange = (run) => {
    board.followRun(run);
    bots.onRun(run);
  };
  const app = new Hono();
  registerBotRoutes(app, bots);
  registerTeamChatRoutes(app, {
    db: sqlite,
    chat,
    bots,
    files: {} as never,
    board,
    sync: {
      sharedProjectIds: () => [projectId],
      identity: () => ({ id: "u-ati", name: "Ati" }),
      mentionsIn: async () => [],
      memberList: () => [],
      flush: async () => undefined,
    } as unknown as Sync,
    projects: () => [{ id: projectId, name: "shop" }],
    language: () => "en",
    runnerDir: "/tmp",
    stops: new StopRegistry(),
  });
  const call = (url: string, body?: unknown, method?: string) =>
    app.request(url, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { bots, flows, chat, board, projectId, call, prompts };
}

async function until(get: () => FlowRun | undefined, ok: (r: FlowRun) => boolean): Promise<FlowRun> {
  for (let i = 0; i < 500; i++) {
    const r = get();
    if (r && ok(r)) return r;
    await Bun.sleep(10);
  }
  throw new Error(`timed out at ${get()?.status}`);
}

describe("team bots", () => {
  test("a bot needs a name, an expert it works as and a handle nobody else has, nor Igrek's own", async () => {
    const { call } = setup();
    const made = (await (
      await call("/api/bots", { name: "John Smith", persona: "backend", role: "Payments" })
    ).json()) as {
      handle: string;
      approval: string;
    };
    expect(made).toMatchObject({ handle: "john-smith", approval: "edits" });
    const again = await call("/api/bots", { name: "Other", handle: "@John-Smith", persona: "backend" });
    expect(((await again.json()) as { error: string }).error).toContain("already");
    expect((await call("/api/bots", { name: "AI", handle: "ai", persona: "backend" })).status).toBe(400);
    expect((await call("/api/bots", { name: "Nobody", persona: "no-such-expert" })).status).toBe(400);
    expect(handleOf("  @Ödeme Botu ")).toBe("ödeme-botu");
  });

  test("@john in a channel is John's job: it works in its own copy and says how it goes in that thread", async () => {
    const { call, bots, flows, chat, projectId, prompts } = setup();
    const john = bots.create({ name: "John", persona: "backend", role: "Payments", memory: "- Uses Stripe" });
    const general = encodeURIComponent(channelId(projectId, "general"));
    const asked = (await (
      await call(`/api/chat/channels/${general}/messages`, { text: "@john rewrite the payment module" })
    ).json()) as {
      id: string;
    };
    const [job] = bots.jobs(john.id);
    expect(job?.request).toBe("rewrite the payment module");
    const run = await until(
      () => flows.get(job?.runId ?? ""),
      (r) => r.status === "ready" || r.status === "failed",
    );
    expect(run.status).toBe("ready");
    expect(run.bot).toBe(john.id);
    // It was told who it is and what it remembers.
    expect(prompts[0]).toContain("You are John, a member of this team: Payments.");
    expect(prompts[0]).toContain("- Uses Stripe");
    const thread = chat.messages(channelId(projectId, "general"), asked.id).map((m) => m.text);
    expect(thread).toEqual([`igrek:bot:running:${run.id}:0`, `igrek:bot:ready:${run.id}:1`]);
    // Merging is the user's, and then the bot remembers the job in a line.
    flows.merge(run.id);
    await until(
      () => flows.get(run.id),
      (r) => r.status === "merged",
    );
    expect(bots.get(john.id)?.memory).toMatch(
      /- Uses Stripe\n- \d{4}-\d\d-\d\d rewrite the payment module: merged \(pay\.ts\)/,
    );
  });

  test("a card given to the bot's expert is the bot's job; a plan-only bot changes nothing", async () => {
    const { bots, board, flows, projectId } = setup();
    const ana = bots.create({ name: "Ana", persona: "architect", approval: "plan" });
    const card = board.add({ projectId, title: "Split the cart service" });
    board.assign(card.id, { kind: "persona", id: "architect", name: "Ana" });
    const moved = board.move(card.id, "doing");
    const run = flows.get(moved.runId ?? "");
    expect(run).toMatchObject({ flow: "plan", bot: ana.id, taskId: card.id });
    expect(bots.jobs(ana.id)).toHaveLength(1);
  });

  test("a bot of one project does not take jobs in another", () => {
    const { bots, projectId } = setup();
    const bot = bots.create({ name: "Only", persona: "backend", projectId });
    expect(() => bots.start(bot.id, { projectId: "elsewhere", request: "do it" })).toThrow(/another project/);
  });
});
