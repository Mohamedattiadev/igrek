import type { Database } from "bun:sqlite";
import { type ArenaMatch, type ArenaStat, arenaCategory } from "@godeye/core";
import type { Flows } from "./flows";

/** Models a match can use. Codex only when its CLI is installed. */
export function arenaModels(): string[] {
  return ["sonnet", "opus", "haiku", ...(Bun.which("codex") ? ["codex"] : [])];
}

/**
 * Model arena (plan.md 13.1): the same task goes to two models, each in its own copy of the
 * project (the "task" flow with one model for every step). You compare the results side by side
 * and pick the winner, which is merged; the other copy is thrown away. Wins per kind of work add
 * up to statistics: which model is better at what, on your own projects.
 */
export class Arena {
  constructor(
    private readonly db: Database,
    private readonly flows: Flows,
  ) {}

  private toMatch(r: { id: string; data: string; created_at: number }): ArenaMatch {
    return { ...(JSON.parse(r.data) as Omit<ArenaMatch, "id" | "createdAt">), id: r.id, createdAt: r.created_at };
  }

  list(projectId?: string): ArenaMatch[] {
    return (
      this.db.query("SELECT * FROM arena_matches ORDER BY created_at DESC LIMIT 100").all() as {
        id: string;
        data: string;
        created_at: number;
      }[]
    )
      .map((r) => this.toMatch(r))
      .filter((m) => !projectId || m.projectId === projectId);
  }

  get(id: string): ArenaMatch | undefined {
    const r = this.db.query("SELECT * FROM arena_matches WHERE id = ?").get(id) as {
      id: string;
      data: string;
      created_at: number;
    } | null;
    return r ? this.toMatch(r) : undefined;
  }

  start(input: { projectId: string; request: string; models: string[] }): ArenaMatch {
    const models = [...new Set(input.models)].filter((m) => arenaModels().includes(m)).slice(0, 2);
    if (models.length !== 2) throw new Error("Pick two different models");
    const sides = models.map((model) => ({
      model,
      runId: this.flows.start({ projectId: input.projectId, flow: "task", request: input.request, model }).id,
    }));
    const id = crypto.randomUUID().slice(0, 10);
    const match = {
      projectId: input.projectId,
      request: input.request.trim(),
      category: arenaCategory(input.request),
      sides,
    };
    this.db
      .query("INSERT INTO arena_matches (id, data, created_at) VALUES (?, ?, ?)")
      .run(id, JSON.stringify(match), Date.now());
    return this.get(id) as ArenaMatch;
  }

  /** The winner's work is merged into your branch; the other side is thrown away. */
  pick(id: string, model: string): ArenaMatch {
    const match = this.get(id);
    if (!match || match.winner) throw new Error("Nothing to pick here");
    const win = match.sides.find((s) => s.model === model);
    if (!win) throw new Error("Unknown side");
    const run = this.flows.get(win.runId);
    if (run?.status === "ready") this.flows.merge(win.runId);
    for (const s of match.sides) {
      const other = this.flows.get(s.runId);
      if (s.model !== model && other && ["ready", "failed", "stopped", "done"].includes(other.status))
        this.flows.discard(s.runId);
    }
    const { id: _id, createdAt: _c, ...data } = { ...match, winner: model };
    this.db.query("UPDATE arena_matches SET data = ? WHERE id = ?").run(JSON.stringify(data), id);
    return this.get(id) as ArenaMatch;
  }

  stats(): ArenaStat[] {
    const out = new Map<string, ArenaStat>();
    for (const m of this.list()) {
      if (!m.winner) continue;
      for (const s of m.sides) {
        const key = `${m.category}:${s.model}`;
        const stat = out.get(key) ?? { category: m.category, model: s.model, wins: 0, played: 0 };
        stat.played++;
        if (s.model === m.winner) stat.wins++;
        out.set(key, stat);
      }
    }
    return [...out.values()].sort((a, b) => a.category.localeCompare(b.category) || b.wins - a.wins);
  }
}
