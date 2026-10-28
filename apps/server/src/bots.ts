import type { Database } from "bun:sqlite";
import type { Bot, BotJob, FlowRun } from "@igrek/core";
import type { Bus } from "./bus";
import type { Flows } from "./flows";
import type { Chat } from "./team-chat";

type BotRow = {
  id: string;
  name: string;
  handle: string;
  persona: string;
  role: string;
  approval: Bot["approval"];
  flow: string | null;
  memory: string;
  project_id: string | null;
  created_at: number;
};

const APPROVALS: Bot["approval"][] = ["plan", "ask", "edits"];
/** The flow each approval mode runs, unless the bot has a team flow of its own. */
const FLOW_OF: Record<Bot["approval"], string> = { plan: "plan", ask: "careful", edits: "task" };
/** What a bot keeps from earlier jobs; the oldest lines go first. */
const MEMORY_LIMIT = 4000;
/** Statuses worth a line in the chat, once each. */
const TOLD: FlowRun["status"][] = ["needs_you", "ready", "done", "failed", "stopped", "merged", "discarded"];

const toBot = (r: BotRow): Bot => ({
  id: r.id,
  name: r.name,
  handle: r.handle,
  persona: r.persona,
  role: r.role,
  approval: r.approval,
  ...(r.flow ? { flow: r.flow } : {}),
  memory: r.memory,
  ...(r.project_id ? { projectId: r.project_id } : {}),
  createdAt: r.created_at,
});

/** "John Smith" → "john-smith": letters, digits and dashes, as @mentions are written. */
export function handleOf(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^\p{L}\p{N}.-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/**
 * Team bots (plan.md 19.2), after OpenBot (CopilotKit, MIT) and Open Duet (Apache-2.0); no code was
 * taken from either, the ideas are: a named coworker with a role and a memory you can read and edit,
 * an approval mode per bot (plan only, ask first, accept edits), jobs from the chat or the board
 * done in the bot's own copy of the repository (Igrek's team flows), a lead with specialists through
 * a team flow, scheduled jobs, and every step written back where the job was asked. Igrek's own
 * rule stays above all of it: nothing reaches the user's branch until they merge it.
 */
export class Bots {
  constructor(
    private readonly db: Database,
    private readonly bus: Bus,
    private readonly flows: Flows,
    private readonly chat: Chat,
    private readonly hasPersona: (id: string) => boolean,
  ) {}

  /** Every bot, or those that work in a project (its own and those of every project). */
  list(projectId?: string): Bot[] {
    const rows = (
      projectId
        ? this.db
            .query(
              `SELECT id, name, handle, persona, role, approval, flow, memory, project_id, created_at FROM bots WHERE project_id = ?
               UNION ALL SELECT id, name, handle, persona, role, approval, flow, memory, project_id, created_at FROM bots WHERE project_id IS NULL ORDER BY name`,
            )
            .all(projectId)
        : this.db
            .query(
              "SELECT id, name, handle, persona, role, approval, flow, memory, project_id, created_at FROM bots ORDER BY name",
            )
            .all()
    ) as BotRow[];
    return rows.map(toBot);
  }

  get(id: string): Bot | undefined {
    const row = this.db
      .query(
        "SELECT id, name, handle, persona, role, approval, flow, memory, project_id, created_at FROM bots WHERE id = ?",
      )
      .get(id) as BotRow | null;
    return row ? toBot(row) : undefined;
  }

  private changed(): void {
    this.bus.publish({ type: "bots-changed" });
  }

  private check(bot: Pick<Bot, "name" | "handle" | "persona" | "approval" | "id">): void {
    if (!bot.name.trim()) throw new Error("A bot needs a name");
    if (bot.handle.length < 2) throw new Error("A bot needs a handle of two letters or more");
    if (["ai", "igrek", "here", "channel", "everyone"].includes(bot.handle))
      throw new Error(`@${bot.handle} is taken by Igrek itself`);
    if (!this.hasPersona(bot.persona)) throw new Error("Pick the expert the bot works as");
    if (!APPROVALS.includes(bot.approval)) throw new Error("Unknown approval mode");
    const taken = this.db.query("SELECT id FROM bots WHERE handle = ? AND id != ?").get(bot.handle, bot.id);
    if (taken) throw new Error(`@${bot.handle} is already a bot`);
  }

  create(input: Partial<Bot>): Bot {
    const bot: Bot = {
      id: crypto.randomUUID().slice(0, 12),
      name: String(input.name ?? "")
        .trim()
        .slice(0, 40),
      handle: handleOf(input.handle || input.name || ""),
      persona: String(input.persona ?? ""),
      role: String(input.role ?? "").slice(0, 500),
      approval: (input.approval ?? "edits") as Bot["approval"],
      ...(input.flow ? { flow: String(input.flow) } : {}),
      memory: String(input.memory ?? "").slice(-MEMORY_LIMIT),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      createdAt: Date.now(),
    };
    this.check(bot);
    this.db
      .query(
        `INSERT INTO bots (id, name, handle, persona, role, approval, flow, memory, project_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        bot.id,
        bot.name,
        bot.handle,
        bot.persona,
        bot.role,
        bot.approval,
        bot.flow ?? null,
        bot.memory,
        bot.projectId ?? null,
        bot.createdAt,
      );
    this.changed();
    return bot;
  }

  update(id: string, patch: Partial<Bot>): Bot {
    const bot = this.get(id);
    if (!bot) throw new Error("Bot not found");
    const next: Bot = {
      ...bot,
      ...(patch.name !== undefined ? { name: String(patch.name).trim().slice(0, 40) } : {}),
      ...(patch.handle !== undefined ? { handle: handleOf(String(patch.handle)) } : {}),
      ...(patch.persona !== undefined ? { persona: String(patch.persona) } : {}),
      ...(patch.role !== undefined ? { role: String(patch.role).slice(0, 500) } : {}),
      ...(patch.approval !== undefined ? { approval: patch.approval } : {}),
      ...(patch.memory !== undefined ? { memory: String(patch.memory).slice(-MEMORY_LIMIT) } : {}),
    };
    if ("flow" in patch) next.flow = patch.flow || undefined;
    this.check(next);
    this.db
      .query(
        "UPDATE bots SET name = ?, handle = ?, persona = ?, role = ?, approval = ?, flow = ?, memory = ? WHERE id = ?",
      )
      .run(next.name, next.handle, next.persona, next.role, next.approval, next.flow ?? null, next.memory, id);
    this.changed();
    return next;
  }

  remove(id: string): void {
    this.db.query("DELETE FROM bots WHERE id = ?").run(id);
    this.changed();
  }

  /** The bots a message calls (@john), for this project. */
  mentioned(projectId: string, text: string): Bot[] {
    const handles = new Set(
      [...text.matchAll(/(?:^|\s)@([\p{L}\p{N}.-]{2,32})/gu)].map((m) => (m[1] ?? "").toLowerCase()),
    );
    return this.list(projectId).filter((b) => handles.has(b.handle));
  }

  /** What the bot gets: who it is, what it remembers, then the job. */
  private request(bot: Bot, job: string): string {
    return [
      `You are ${bot.name}, a member of this team${bot.role ? `: ${bot.role}` : ""}.`,
      bot.memory.trim() ? `What you remember from earlier jobs here:\n${bot.memory.trim()}` : "",
      `The job:\n${job}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  /** A job for the bot: from a chat message (it answers in that thread), the board, a schedule or by hand. */
  start(
    botId: string,
    job: {
      projectId: string;
      request: string;
      channel?: string;
      thread?: string;
      taskId?: string;
      scheduleId?: string;
      limits?: { maxMinutes?: number; maxTurns?: number };
    },
  ): FlowRun {
    const bot = this.get(botId);
    if (!bot) throw new Error("Bot not found");
    if (bot.projectId && bot.projectId !== job.projectId) throw new Error(`${bot.name} works in another project`);
    const run = this.flows.start({
      projectId: job.projectId,
      flow: bot.flow ?? FLOW_OF[bot.approval],
      request: this.request(bot, job.request),
      persona: bot.persona,
      bot: bot.id,
      ...(job.taskId ? { taskId: job.taskId } : {}),
      ...(job.scheduleId ? { scheduleId: job.scheduleId } : {}),
      ...(job.limits ? { limits: job.limits } : {}),
    });
    this.db
      .query(
        `INSERT INTO bot_jobs (run_id, bot_id, request, channel, thread, told, created_at)
         VALUES (?, ?, ?, ?, ?, '', ?)`,
      )
      .run(run.id, bot.id, job.request.slice(0, 4000), job.channel ?? null, job.thread ?? null, Date.now());
    if (job.channel) this.tell(bot, run, job.channel, job.thread, "running");
    this.changed();
    return run;
  }

  /** The bot that works as this persona in this project, for a card given to that persona. */
  forPersona(projectId: string, persona: string): Bot | undefined {
    return this.list(projectId).find((b) => b.persona === persona);
  }

  /** A bot's jobs, newest first, with how each run stands now. */
  jobs(botId: string): BotJob[] {
    const rows = this.db
      .query(
        "SELECT run_id, bot_id, request, channel, created_at FROM bot_jobs WHERE bot_id = ? ORDER BY created_at DESC LIMIT 50",
      )
      .all(botId) as { run_id: string; bot_id: string; request: string; channel: string | null; created_at: number }[];
    return rows.flatMap((r) => {
      const run = this.flows.get(r.run_id);
      if (!run) return [];
      return [
        {
          runId: r.run_id,
          botId: r.bot_id,
          projectId: run.projectId,
          request: r.request,
          status: run.status,
          ...(r.channel ? { channel: r.channel } : {}),
          ...(run.changes ? { changes: run.changes } : {}),
          createdAt: r.created_at,
          updatedAt: run.updatedAt,
        },
      ];
    });
  }

  /** "John is on it", "John needs you", "John is done": a line in the thread the job was asked in. */
  private tell(
    bot: Bot,
    run: FlowRun,
    channel: string,
    thread: string | null | undefined,
    status: FlowRun["status"],
  ): void {
    const files = (run.changes ?? []).length;
    const parent = thread && this.chat.message(thread) ? thread : undefined;
    this.chat.post({
      projectId: run.projectId,
      channel,
      ...(parent ? { parentId: parent } : {}),
      // Worded by the page in each reader's language: igrek:bot:<status>:<run>:<files changed>.
      text: `igrek:bot:${status}:${run.id}:${files}`,
      author: bot.name,
      mentions: [],
      bot: true,
    });
  }

  /**
   * A run moved (flows.onChange): its bot says so in the chat once per status, and when the job is
   * over it remembers it in a line.
   */
  onRun(run: FlowRun): void {
    if (!run.bot || !TOLD.includes(run.status)) return;
    const job = this.db
      .query("SELECT bot_id, request, channel, thread, told FROM bot_jobs WHERE run_id = ?")
      .get(run.id) as {
      bot_id: string;
      request: string;
      channel: string | null;
      thread: string | null;
      told: string;
    } | null;
    const bot = job ? this.get(job.bot_id) : undefined;
    if (!job || !bot || job.told === run.status) return;
    this.db.query("UPDATE bot_jobs SET told = ? WHERE run_id = ?").run(run.status, run.id);
    if (job.channel) this.tell(bot, run, job.channel, job.thread, run.status);
    if (["merged", "discarded", "failed"].includes(run.status)) this.remember(bot, run, job.request);
    this.changed();
  }

  private remember(bot: Bot, run: FlowRun, request: string): void {
    const day = new Date().toISOString().slice(0, 10);
    const files = (run.changes ?? [])
      .map((c) => c.path)
      .slice(0, 6)
      .join(", ");
    const line = `- ${day} ${request.split("\n")[0]?.slice(0, 120)}: ${run.status}${files ? ` (${files})` : ""}`;
    const memory = `${bot.memory.trim()}\n${line}`.trim().slice(-MEMORY_LIMIT);
    this.db.query("UPDATE bots SET memory = ? WHERE id = ?").run(memory, bot.id);
  }
}
