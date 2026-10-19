import type { Database } from "bun:sqlite";
import { CORE_EXPERTS, type ExpertsState, type ExpertView, extractNotebook, type Persona } from "@igrek/core";
import type { StopRegistry } from "./bus";
import { type Personas, personaLabel } from "./personas";
import type { Store } from "./store";
import { runClaude } from "./summarizer";

/**
 * Experts on call (plan.md 6): a chat asks one of the personas a question in the background,
 * the persona reads the project (read-only) and answers, and the chat goes on with the answer.
 * The same call writes each persona's view of a project for the project's Experts tab.
 */

/** How an expert answers a colleague's question: short, grounded in the code, no changes. */
const ASK_RULES = `You are consulted by another AI agent that is working with the user in this project.
Answer only the question, from your own field, in at most 250 words. Read the code you need
(Read, Grep, Glob); you cannot change anything. Name files as path:line when you rely on them.
Say plainly when the code does not tell you enough.`;

/** The view a persona gives of the whole project on the Experts tab. */
const VIEW_QUESTION = `Describe this project from your field, for its owner. Start with one plain sentence
that sums up your view for someone with no time (no heading, no label, nothing before it). Then these
short sections: what is there today (how it is built in your area), what works well, the main risks or
gaps, and the three most useful next steps. Ground it in the code (path:line), plain words, at most 350 words.`;

/** How many experts read a project at the same time when several are asked at once. */
const PARALLEL = 3;

type Ask = (prompt: string, cwd: string, model: string, system: string) => Promise<string>;

export class Experts {
  /** Told when a project's views, or who is reading it, change (the Experts tab updates live). */
  onChange: (projectId: string) => void = () => undefined;
  /** "project persona" pairs being read now or waiting their turn. */
  private readonly running = new Set<string>();
  private readonly errors = new Map<string, string>();
  private readonly queue: { projectId: string; personaId: string }[] = [];
  private active = 0;

  constructor(
    private readonly db: Database,
    private readonly personas: Personas,
    private readonly store: Store,
    stops: StopRegistry,
    /** Injectable model call so tests never run the real CLI. */
    private readonly run: Ask = (prompt, cwd, model, system) =>
      runClaude(prompt, cwd, stops, model, [
        "--tools",
        "Read,Grep,Glob",
        "--allowedTools",
        "Read",
        "Grep",
        "Glob",
        "--max-turns",
        "12",
        "--append-system-prompt",
        system,
      ]),
  ) {}

  /** The experts a chat may call: id, name and what each is for, one per line. */
  roster(): string {
    return this.personas
      .list()
      .map((p) => {
        const { name, role } = personaLabel(p);
        return `- ${p.id}: ${name}${role && role !== name ? ` (${role})` : ""}`;
      })
      .join("\n");
  }

  private resolve(projectId: string, personaId: string): { persona: Persona; path: string } {
    const persona = this.personas.get(personaId);
    if (!persona)
      throw new Error(
        `No expert called ${personaId}. Known: ${this.personas
          .list()
          .map((p) => p.id)
          .join(", ")}`,
      );
    const project = this.store.projectRow(projectId);
    if (!project) throw new Error("Project not found");
    return { persona, path: project.path };
  }

  /** One question to one expert; its notebook entries are kept for this project. */
  async ask(projectId: string, personaId: string, question: string): Promise<{ name: string; answer: string }> {
    const q = question.trim();
    if (q.length < 3) throw new Error("Ask the expert a question");
    const { persona, path } = this.resolve(projectId, personaId);
    const system = `${this.personas.systemPrompt(persona, projectId, { notebook: true })}\n\n${ASK_RULES}`;
    const reply = await this.run(q.slice(0, 4000), path, persona.model, system);
    const { text, entries } = extractNotebook(reply);
    if (entries.length) this.personas.record(persona.id, projectId, entries, "expert");
    return { name: personaLabel(persona).name, answer: text.trim() };
  }

  /** The Experts tab's state: views, who is reading now, and why a last look failed. */
  state(projectId: string): ExpertsState {
    const mine = (key: string) => key.startsWith(`${projectId} `);
    const persona = (key: string) => key.slice(projectId.length + 1);
    return {
      views: this.views(projectId),
      running: [...this.running].filter(mine).map(persona),
      errors: Object.fromEntries(
        [...this.errors].filter(([key]) => mine(key)).map(([key, why]) => [persona(key), why]),
      ),
    };
  }

  /**
   * Starts views in the background (all core experts when none are named), a few at a time. The
   * page can close meanwhile: the state stays here and onChange says when something finished.
   */
  start(projectId: string, personaIds: string[] = CORE_EXPERTS): ExpertsState {
    for (const personaId of personaIds) this.resolve(projectId, personaId);
    for (const personaId of personaIds) {
      const key = `${projectId} ${personaId}`;
      if (this.running.has(key)) continue;
      this.running.add(key);
      this.errors.delete(key);
      this.queue.push({ projectId, personaId });
    }
    this.next();
    this.onChange(projectId);
    return this.state(projectId);
  }

  private next(): void {
    while (this.active < PARALLEL && this.queue.length) {
      const job = this.queue.shift();
      if (!job) return;
      this.active++;
      const key = `${job.projectId} ${job.personaId}`;
      void this.refreshView(job.projectId, job.personaId)
        .catch((err: Error) => this.errors.set(key, err.message))
        .finally(() => {
          this.active--;
          this.running.delete(key);
          this.onChange(job.projectId);
          this.next();
        });
    }
  }

  views(projectId: string): ExpertView[] {
    return (
      this.db.query("SELECT persona, text, created_at FROM persona_views WHERE project_id = ?").all(projectId) as {
        persona: string;
        text: string;
        created_at: number;
      }[]
    ).map((r) => ({ personaId: r.persona, text: r.text, at: r.created_at }));
  }

  /** Writes (or rewrites) one persona's view of the project. */
  async refreshView(projectId: string, personaId: string, now = Date.now()): Promise<ExpertView> {
    const { answer } = await this.ask(projectId, personaId, VIEW_QUESTION);
    this.db
      .query(
        `INSERT INTO persona_views (project_id, persona, text, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (project_id, persona) DO UPDATE SET text = excluded.text, created_at = excluded.created_at`,
      )
      .run(projectId, personaId, answer, now);
    return { personaId, text: answer, at: now };
  }
}

/** What a chat is told about its experts, so it consults them on its own when it helps. */
export function expertsHint(roster: string): string {
  return `Experts on call: you can consult Igrek's expert personas with the igrek_ask_expert tool
(expert id + a self-contained question). Each one reads this project read-only and answers from its
field. Ask one when the user's request needs a specialist judgement you are unsure of (architecture,
security, UI/UX, database, performance, tests, ...), or whenever the user names one with @<id>.
Ask several in parallel when the question spans fields. "@all" means: ask each of these in parallel,
${CORE_EXPERTS.join(", ")}. Weigh their answers; you decide and tell the
user briefly whom you asked and what they said. Do not consult anyone for small, clear tasks.
Experts:
${roster}`;
}
