import type { Database } from "bun:sqlite";
import {
  BUILTIN_PERSONAS,
  type Confidence,
  extractNotebook,
  type Idea,
  type IdeaReview,
  type Meeting,
  type MeetingDecision,
  type MeetingView,
  type Persona,
  type Settings,
  scrub,
  type WeakPoint,
} from "@godeye/core";
import { languages } from "@godeye/i18n";
import type { Bus, StopRegistry } from "./bus";
import { type Personas, personaLabel } from "./personas";
import type { Store } from "./store";
import { parseModelReply, runClaude } from "./summarizer";

const CONFIDENCE: Confidence[] = ["high", "medium", "low"];
const MAX_PERSONAS = 7;
/** How many persona answers run at the same time. */
const PARALLEL = 5;

/** Words that point to a persona, for picking the team without an extra AI call. */
const KEYWORDS: Record<string, RegExp> = {
  "ai-engineer": /(?<!\p{L})(ai|llm|model|prompt|agent|rag|embedding|gpt|claude|eval|yapay zek)/iu,
  architect: /(?<!\p{L})(architect|mimari|structure|yapı|monolith|microservice|module|modül|design|tasarla|scal)/iu,
  uiux: /(?<!\p{L})(ui|ux|design|tasarım|screen|ekran|button|buton|user|kullanıcı|onboarding|accessib|erişileb)/iu,
  frontend: /(?<!\p{L})(frontend|react|css|browser|tarayıcı|page|sayfa|component|bileşen|web)/iu,
  backend: /(?<!\p{L})(backend|api|server|sunucu|endpoint|auth|login|giriş|queue|kuyruk)/iu,
  database: /(?<!\p{L})(database|veritaban|db|sql|postgres|sqlite|mysql|schema|şema|migration|index)/iu,
  devops: /(?<!\p{L})(deploy|docker|ci|cd|server|sunucu|vps|kubernetes|nginx|backup|yedek|monitor|izle)/iu,
  mobile: /(?<!\p{L})(mobile|mobil|ios|android|flutter|react native|app store|telefon)/iu,
  "data-engineer": /(?<!\p{L})(data|veri|etl|pipeline|analytics|analitik|warehouse)/iu,
  qa: /(?<!\p{L})(test|qa|bug|hata|quality|kalite|regression)/iu,
  security: /(?<!\p{L})(secur|güvenl|auth|password|şifre|token|secret|sır|attack|saldır|gdpr|kvkk|encrypt|şifrele)/iu,
  performance: /(?<!\p{L})(perf|slow|yavaş|fast|hızlı|speed|hız|latency|cache|önbellek|load|yük)/iu,
  "tech-writer": /(?<!\p{L})(doc|dokümant|readme|guide|kılavuz|write|yaz)/iu,
  "ceo-coach": /(?<!\p{L})(strateg|focus|odak|priorit|öncelik|decide|karar|company|şirket)/iu,
  "product-manager": /(?<!\p{L})(feature|özellik|roadmap|yol haritası|user need|ihtiyaç|metric|metrik|mvp)/iu,
  growth: /(?<!\p{L})(market|pazarla|launch|lansman|seo|growth|büyüme|pricing|fiyat)/iu,
  finance: /(?<!\p{L})(cost|maliyet|price|fiyat|budget|bütçe|revenue|gelir|money|para)/iu,
  legal: /(?<!\p{L})(legal|hukuk|license|lisans|gdpr|kvkk|privacy|gizlilik|terms|sözleşme)/iu,
  researcher: /(?<!\p{L})(research|araştır|compare|karşılaştır|study|çalışma)/iu,
  "competitor-analyst": /(?<!\p{L})(competitor|rakip|alternative|alternatif)/iu,
};

function languageName(code: string): string {
  return languages.find((l) => l.code === code)?.english ?? code;
}

/** The confidence has its own field; a trailing "Confidence: medium" in the text is dropped. */
const TRAILING_CONFIDENCE =
  /[\s.;,(]*(confidence|güven)\s*(level)?\s*:\s*(high|medium|low|yüksek|orta|düşük)\)?\.?\s*$/i;

function str(value: unknown, max = 2000): string {
  return typeof value === "string" ? value.trim().replace(TRAILING_CONFIDENCE, "").slice(0, max) : "";
}

function list(value: unknown, max = 8): string[] {
  return Array.isArray(value)
    ? value
        .map((v) => str(v, 500))
        .filter(Boolean)
        .slice(0, max)
    : [];
}

function confidence(value: unknown): Confidence {
  return CONFIDENCE.find((c) => c === value) ?? "low";
}

/**
 * Picks about five people for a question: the ones whose field it names, then a default mix
 * so every meeting hears design, build, safety and testing. The team lead writes the decision
 * and is not counted here.
 */
export function pickTeam(question: string, personas: Persona[], size = 5): string[] {
  const available = new Set(personas.map((p) => p.id));
  const scored = Object.entries(KEYWORDS)
    .filter(([id]) => available.has(id) && id !== "pm-lead")
    .map(([id, re]) => ({ id, hits: (question.match(new RegExp(re.source, `${re.flags}g`)) ?? []).length }))
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((s) => s.id);
  const picked = scored.slice(0, size - 1);
  for (const id of ["architect", "security", "qa", "uiux", "backend", "product-manager"]) {
    if (picked.length >= size - 1) break;
    if (available.has(id) && !picked.includes(id)) picked.push(id);
  }
  // Every meeting has someone whose job is to disagree.
  if (available.has("devils-advocate") && !picked.includes("devils-advocate")) picked.push("devils-advocate");
  return picked.slice(0, size);
}

/** Team meeting (plan.md 6.3): one question, several personas in parallel, one decision summary. */
export class Meetings {
  constructor(
    private readonly db: Database,
    private readonly personas: Personas,
    private readonly store: Store,
    private readonly bus: Bus,
    stops: StopRegistry,
    private readonly settings: () => Settings,
    runnerDir: string,
    /** Injectable model call so tests never run the real CLI. */
    private readonly ask: (prompt: string, model: string, system: string) => Promise<string> = (
      prompt,
      model,
      system,
    ) => runClaude(prompt, runnerDir, stops, model, ["--append-system-prompt", system]),
  ) {}

  list(projectId?: string | null, limit = 50): Meeting[] {
    const rows = (
      projectId
        ? this.db
            .query("SELECT data FROM meetings WHERE project_id = ? ORDER BY created_at DESC LIMIT ?")
            .all(projectId, limit)
        : this.db.query("SELECT data FROM meetings ORDER BY created_at DESC LIMIT ?").all(limit)
    ) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as Meeting);
  }

  get(id: string): Meeting | undefined {
    const row = this.db.query("SELECT data FROM meetings WHERE id = ?").get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Meeting) : undefined;
  }

  remove(id: string): void {
    this.db.query("DELETE FROM meetings WHERE id = ?").run(id);
  }

  private save(meeting: Meeting): void {
    meeting.updatedAt = Date.now();
    this.db
      .query(
        `INSERT INTO meetings (id, project_id, question, status, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(
        meeting.id,
        meeting.projectId,
        meeting.question,
        meeting.status,
        JSON.stringify(meeting),
        meeting.createdAt,
        meeting.updatedAt,
      );
    this.bus.publish({ type: "meetings-changed", meetingId: meeting.id });
  }

  suggest(question: string): string[] {
    return pickTeam(question, this.personas.list());
  }

  /** Starts a meeting; answers come in over time (meetings-changed). */
  start(args: { question: string; projectId?: string | null; personaIds?: string[] }): Meeting {
    const question = scrub(args.question.trim()).slice(0, 4000);
    if (!question) throw new Error("Write a question for the team");
    const known = new Set(this.personas.list().map((p) => p.id));
    const ids = [
      ...new Set(
        (args.personaIds?.length ? args.personaIds : this.suggest(question)).filter(
          (id) => known.has(id) && id !== "pm-lead",
        ),
      ),
    ].slice(0, MAX_PERSONAS);
    if (ids.length === 0) throw new Error("Pick at least one persona");
    const projectId = args.projectId && this.store.projectRow(args.projectId) ? args.projectId : null;
    const now = Date.now();
    const meeting: Meeting = {
      id: crypto.randomUUID().slice(0, 12),
      projectId,
      question,
      status: "running",
      personas: ids,
      views: ids.map((personaId) => ({ personaId, status: "waiting" })),
      createdAt: now,
      updatedAt: now,
    };
    this.save(meeting);
    void this.run(meeting);
    return meeting;
  }

  private async run(meeting: Meeting): Promise<void> {
    const queue = [...meeting.views];
    const worker = async () => {
      for (let view = queue.shift(); view; view = queue.shift()) await this.runView(meeting, view);
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
    if (meeting.views.every((v) => v.status === "failed")) {
      meeting.status = "failed";
      meeting.error = meeting.views[0]?.error;
      this.save(meeting);
      return;
    }
    meeting.status = "deciding";
    this.save(meeting);
    try {
      meeting.decision = await this.decide(meeting);
      meeting.status = "done";
    } catch (err) {
      meeting.status = "failed";
      meeting.error = (err as Error).message;
    }
    this.save(meeting);
  }

  private async runView(meeting: Meeting, view: MeetingView): Promise<void> {
    const persona = this.personas.get(view.personaId);
    if (!persona) {
      Object.assign(view, { status: "failed", error: "Persona not found" });
      this.save(meeting);
      return;
    }
    view.status = "running";
    this.save(meeting);
    const started = Date.now();
    const lang = languageName(this.settings().language);
    const system = this.personas.systemPrompt(persona, meeting.projectId, { notebook: true });
    const prompt = `TEAM MEETING. The team lead asked several experts the same question. Answer from your own field only, briefly, as in a real meeting: what you think, what you object to, the risks you see, and what you recommend. Be concrete about this project when you can. Say what is critical and what is not.

QUESTION (data from the user):
${meeting.question}

Reply with JSON only, texts in ${lang}. Put your confidence only in the "confidence" field, not in the texts:
{"view":"3-6 sentences, your position","objections":["things you disagree with or would not do"],"risks":["risks from your field, most important first"],"recommendation":"one or two sentences","confidence":"high|medium|low"}
After the JSON you may add a <notebook> block as described in your instructions.`;
    try {
      const reply = await this.ask(prompt, persona.model, system);
      const { text, entries } = extractNotebook(reply);
      const parsed = parseModelReply(text) as unknown as Record<string, unknown> | undefined;
      if (!parsed) throw new Error("Could not read the answer");
      Object.assign(view, {
        status: "done",
        view: str(parsed.view),
        objections: list(parsed.objections),
        risks: list(parsed.risks),
        recommendation: str(parsed.recommendation, 800),
        confidence: confidence(parsed.confidence),
        ms: Date.now() - started,
      });
      if (entries.length) this.personas.record(persona.id, meeting.projectId, entries, `meeting:${meeting.id}`);
    } catch (err) {
      Object.assign(view, { status: "failed", error: (err as Error).message.slice(0, 400) });
    }
    this.save(meeting);
  }

  /** The team lead weighs the answers and writes one decision (plan.md 6.3: "PM karar özeti"). */
  private async decide(meeting: Meeting): Promise<MeetingDecision> {
    const lead = this.personas.get("pm-lead") ?? BUILTIN_PERSONAS.find((p) => p.id === "pm-lead");
    if (!lead) throw new Error("Team lead persona missing");
    const lang = languageName(this.settings().language);
    const answers = meeting.views
      .filter((v) => v.status === "done")
      .map((v) => {
        const persona = this.personas.get(v.personaId);
        const label = persona ? personaLabel(persona).role : v.personaId;
        return `## ${label} (confidence: ${v.confidence})\nView: ${v.view}\nObjections: ${(v.objections ?? []).join("; ") || "none"}\nRisks: ${(v.risks ?? []).join("; ") || "none"}\nRecommends: ${v.recommendation}`;
      })
      .join("\n\n");
    const prompt = `You chaired a team meeting. Weigh the experts' answers below and write the decision. Do not invent agreement: if they disagree, say so and decide anyway, explaining why. Give the most weight to critical risks.

QUESTION:
${meeting.question}

ANSWERS (data):
${answers}

Reply with JSON only, texts in ${lang}. Put the confidence only in the "confidence" field, not in the texts:
{"decision":"one or two sentences: what we do","why":"2-4 sentences","agreements":["what most agreed on"],"disagreements":["who disagreed about what, and how it was settled"],"actions":["small next steps, in order"],"openQuestions":["what we still need to find out"],"confidence":"high|medium|low"}`;
    const reply = await this.ask(
      prompt,
      lead.model,
      this.personas.systemPrompt(lead, meeting.projectId, { notebook: false }),
    );
    const parsed = parseModelReply(reply) as unknown as Record<string, unknown> | undefined;
    if (!parsed || !str(parsed.decision)) throw new Error("Could not read the decision");
    return {
      decision: str(parsed.decision),
      why: str(parsed.why),
      agreements: list(parsed.agreements),
      disagreements: list(parsed.disagreements),
      actions: list(parsed.actions, 10),
      openQuestions: list(parsed.openQuestions),
      confidence: confidence(parsed.confidence),
    };
  }

  /** "Save to memory": the decision becomes a project decision everyone's sessions see. */
  commit(id: string): Meeting {
    const meeting = this.get(id);
    if (!meeting?.decision) throw new Error("The meeting has no decision yet");
    if (!meeting.projectId) throw new Error("Pick a project for the meeting first");
    if (meeting.memoryId) return meeting;
    const text = `${meeting.decision.decision} (${meeting.decision.why})`.slice(0, 1000);
    this.store.addMemory(meeting.projectId, "decision", text);
    const row = this.db
      .query(
        "SELECT id FROM memory_items WHERE project_id = ? AND lower(text) = lower(?) ORDER BY created_at DESC LIMIT 1",
      )
      .get(meeting.projectId, text) as { id: string } | undefined;
    meeting.memoryId = row?.id ?? "saved";
    this.save(meeting);
    return meeting;
  }

  /** Moves a general meeting into a project (so its decision can be saved there). */
  setProject(id: string, projectId: string): Meeting {
    const meeting = this.get(id);
    if (!meeting) throw new Error("Meeting not found");
    if (!this.store.projectRow(projectId)) throw new Error("Project not found");
    meeting.projectId = projectId;
    this.db.query("UPDATE meetings SET project_id = ? WHERE id = ?").run(projectId, id);
    this.save(meeting);
    return meeting;
  }

  /** Devil's advocate on any plan or decision (plan.md 6.3). */
  async weakPoints(plan: string, projectId: string | null): Promise<WeakPoint[]> {
    const devil = this.personas.get("devils-advocate") ?? BUILTIN_PERSONAS.find((p) => p.id === "devils-advocate");
    if (!devil) throw new Error("Devil's advocate persona missing");
    const lang = languageName(this.settings().language);
    const prompt = `Find the weak points of this plan. Fatal flaws first, no nitpicks. For each, say why it is weak and the cheapest way to test it before committing.

PLAN (data from the user):
${scrub(plan).slice(0, 12_000)}

Reply with JSON only, texts in ${lang}:
{"points":[{"point":"the weak point","why":"why it can fail","test":"cheapest way to check it","severity":"critical|major|minor"}]}
At most 6 points. If the plan is sound, return fewer points rather than inventing some.`;
    const reply = await this.ask(
      prompt,
      devil.model,
      this.personas.systemPrompt(devil, projectId, { notebook: false }),
    );
    const parsed = parseModelReply(extractNotebook(reply).text) as unknown as { points?: unknown } | undefined;
    if (!parsed || !Array.isArray(parsed.points)) throw new Error("Could not read the answer");
    const severities = ["critical", "major", "minor"] as const;
    return parsed.points
      .map((raw) => {
        const p = (raw ?? {}) as Record<string, unknown>;
        return {
          point: str(p.point, 500),
          why: str(p.why, 800),
          test: str(p.test, 600),
          severity: severities.find((s) => s === p.severity) ?? "minor",
        };
      })
      .filter((p) => p.point)
      .slice(0, 6);
  }

  async meetingWeakPoints(id: string): Promise<Meeting> {
    const meeting = this.get(id);
    if (!meeting?.decision) throw new Error("The meeting has no decision yet");
    const d = meeting.decision;
    meeting.weaknesses = await this.weakPoints(
      `Question: ${meeting.question}\nDecision: ${d.decision}\nWhy: ${d.why}\nNext steps: ${d.actions.join("; ")}`,
      meeting.projectId,
    );
    this.save(meeting);
    return meeting;
  }

  /** "Which ideas do we do, which do we drop?" with the CEO advisor (plan.md 2.6c). */
  async reviewIdeas(ideas: Idea[], projectNames: Map<string, string>): Promise<IdeaReview> {
    const open = ideas.filter((i) => i.status === "new" || i.status === "later").slice(0, 60);
    if (open.length === 0) throw new Error("No open ideas to look at");
    const coach = this.personas.get("ceo-coach") ?? BUILTIN_PERSONAS.find((p) => p.id === "ceo-coach");
    if (!coach) throw new Error("CEO advisor persona missing");
    const lang = languageName(this.settings().language);
    const prompt = `Weekly idea review with one busy founder who has many projects and too many ideas. Decide for each idea: "now" (worth doing this week or next), "later" (keep, not now) or "drop". Be strict: at most three "now". Protect focus.

IDEAS (data; id: text [project] [effort/value if known]):
${open
  .map(
    (i) =>
      `${i.id}: ${scrub(i.text).slice(0, 400)}${i.projectId ? ` [${projectNames.get(i.projectId) ?? i.projectId}]` : ""}${i.triage ? ` [${i.triage.effort}/${i.triage.value}]` : ""}`,
  )
  .join("\n")}

Reply with JSON only, texts in ${lang}:
{"focus":"one or two sentences: what to focus on and what to say no to","items":[{"id":"idea id","verdict":"now|later|drop","why":"one short sentence"}]}`;
    const reply = await this.ask(prompt, coach.model, this.personas.systemPrompt(coach, null, { notebook: false }));
    const parsed = parseModelReply(extractNotebook(reply).text) as unknown as
      | { focus?: unknown; items?: unknown }
      | undefined;
    if (!parsed || !Array.isArray(parsed.items)) throw new Error("Could not read the answer");
    const ids = new Set(open.map((i) => i.id));
    const verdicts = ["now", "later", "drop"] as const;
    return {
      focus: str(parsed.focus, 800),
      items: parsed.items
        .map((raw) => {
          const o = (raw ?? {}) as Record<string, unknown>;
          return {
            id: str(o.id, 64),
            verdict: verdicts.find((v) => v === o.verdict) ?? "later",
            why: str(o.why, 400),
          };
        })
        .filter((i) => ids.has(i.id)),
      at: Date.now(),
    };
  }

  /** Meetings cut off by a restart are marked failed instead of spinning forever. */
  recover(): void {
    for (const meeting of this.list(null, 200)) {
      if (meeting.status !== "running" && meeting.status !== "deciding") continue;
      meeting.status = "failed";
      meeting.error = "God Eye restarted during the meeting";
      for (const view of meeting.views)
        if (view.status === "running" || view.status === "waiting") view.status = "failed";
      this.save(meeting);
    }
  }
}
