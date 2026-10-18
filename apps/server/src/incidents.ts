import type { Database } from "bun:sqlite";
import type { Incident } from "@igrek/core";
import type { AppErrors } from "./apperrors";
import type { Bus } from "./bus";
import type { Docs } from "./docs";
import type { Logs } from "./logs";
import type { Monitors } from "./monitors";
import type { Personas } from "./personas";
import type { Store } from "./store";

type Ask = (prompt: string, system?: string) => Promise<string>;

const HOUR = 3_600_000;

/**
 * Incident mode (plan.md 13.4): one click when the site is down. God Eye gathers what it knows
 * (uptime, the app's errors, error groups in the logs, recent deploys and commits) into a
 * timeline, and the DevOps/SRE persona reads it and says what is most likely wrong and what to
 * check first. Notes go on the timeline; "Resolved" writes the postmortem into the wiki.
 * Nothing is run on a server by this: suggested commands are for you to run.
 */
export class Incidents {
  constructor(
    private readonly db: Database,
    private readonly store: Store,
    private readonly bus: Bus,
    private readonly sources: { monitors: Monitors; errors: AppErrors; logs: Logs; docs: Docs; personas: Personas },
    private readonly ask: Ask,
  ) {}

  private save(i: Incident): void {
    const { id, projectId, startedAt, ...data } = i;
    this.db
      .query(
        "INSERT INTO incidents (id, project_id, data, started_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      )
      .run(id, projectId, JSON.stringify(data), startedAt);
    this.bus.publish({ type: "ops-changed", what: "incidents" });
  }

  list(projectId?: string): Incident[] {
    return (
      this.db
        .query(`SELECT * FROM incidents ${projectId ? "WHERE project_id = ?" : ""} ORDER BY started_at DESC LIMIT 50`)
        .all(...(projectId ? [projectId] : [])) as {
        id: string;
        project_id: string;
        data: string;
        started_at: number;
      }[]
    ).map((r) => ({
      ...(JSON.parse(r.data) as Omit<Incident, "id" | "projectId" | "startedAt">),
      id: r.id,
      projectId: r.project_id,
      startedAt: r.started_at,
    }));
  }

  get(id: string): Incident | undefined {
    const r = this.db.query("SELECT * FROM incidents WHERE id = ?").get(id) as {
      id: string;
      project_id: string;
      data: string;
      started_at: number;
    } | null;
    return r
      ? {
          ...(JSON.parse(r.data) as Omit<Incident, "id" | "projectId" | "startedAt">),
          id: r.id,
          projectId: r.project_id,
          startedAt: r.started_at,
        }
      : undefined;
  }

  /** What God Eye knows about the last hours of a project, as text and as timeline entries. */
  async gather(projectId: string, now = Date.now()): Promise<{ evidence: string; timeline: Incident["timeline"] }> {
    const since = now - 24 * HOUR;
    const lines: string[] = [];
    const timeline: Incident["timeline"] = [];
    const monitors = this.sources.monitors.list().filter((m) => m.projectId === projectId);
    if (monitors.length) {
      lines.push("Uptime:");
      for (const m of monitors) {
        lines.push(
          `- ${m.name} ${m.url}: ${m.up === false ? `DOWN since ${new Date(m.since ?? now).toISOString()} (${m.error ?? m.status ?? ""})` : `up, ${m.ms ?? "?"} ms`}`,
        );
        if (m.up === false && m.since)
          timeline.push({
            at: m.since,
            kind: "down",
            text: `${m.name} stopped answering (${m.error ?? m.status ?? ""})`,
          });
      }
    }
    const errors = this.sources.errors.list(projectId).filter((e) => e.status === "open" && e.lastAt >= since);
    if (errors.length) {
      lines.push("Errors the app reported (last 24 h):");
      for (const e of errors.slice(0, 10)) {
        lines.push(
          `- ${e.count}x "${e.message}" first ${new Date(e.firstAt).toISOString()}${e.firstRelease ? ` in release ${e.firstRelease}` : ""}\n  ${(e.stack ?? "").split("\n").slice(0, 3).join("\n  ")}`,
        );
        timeline.push({ at: e.firstAt, kind: "error", text: `${e.message.slice(0, 120)} (${e.count}x)` });
      }
    }
    const sources = this.sources.logs.saved(projectId).map((s) => s.source);
    if (sources.length) {
      const found = await this.sources.logs.search(sources, { level: "error", tail: 400 }).catch(() => undefined);
      if (found?.groups.length) {
        lines.push("Error groups in the logs:");
        for (const g of found.groups.slice(0, 10)) {
          lines.push(`- ${g.count}x in ${g.sources.join(", ")}: ${g.sample.split("\n")[0]?.slice(0, 300)}`);
          if (g.firstAt && g.firstAt >= since)
            timeline.push({
              at: g.firstAt,
              kind: "log",
              text: `${g.sample.split("\n")[0]?.slice(0, 120)} (${g.count}x)`,
            });
        }
      }
    }
    const deploys = this.db
      .query(
        "SELECT d.at, d.from_head, d.to_head, d.exit_code, e.name FROM deploys d LEFT JOIN project_envs e ON e.id = d.env_id WHERE d.project_id = ? AND d.at >= ? ORDER BY d.at",
      )
      .all(projectId, now - 72 * HOUR) as {
      at: number;
      from_head: string;
      to_head: string;
      exit_code: number;
      name: string | null;
    }[];
    if (deploys.length) {
      lines.push("Deploys (last 3 days):");
      for (const d of deploys) {
        lines.push(
          `- ${new Date(d.at).toISOString()} to ${d.name ?? "?"}: ${d.from_head} -> ${d.to_head}, exit ${d.exit_code}`,
        );
        timeline.push({
          at: d.at,
          kind: "deploy",
          text: `Deploy to ${d.name ?? "?"} ${d.from_head} → ${d.to_head}${d.exit_code ? ` (failed, ${d.exit_code})` : ""}`,
        });
      }
    }
    const commits = this.store.commitsBetween(projectId, since, now);
    if (commits.length) {
      lines.push("Commits (last 24 h):");
      for (const c of commits.slice(0, 20)) {
        lines.push(`- ${c.hash.slice(0, 7)} ${c.subject} (${c.author})`);
        timeline.push({ at: c.at, kind: "commit", text: `${c.hash.slice(0, 7)} ${c.subject}` });
      }
    }
    return {
      evidence: lines.join("\n") || "God Eye has no uptime, error, log or deploy data for this project yet.",
      timeline: timeline.sort((a, b) => a.at - b.at),
    };
  }

  async start(projectId: string, title: string, language = "en"): Promise<Incident> {
    if (!this.store.projectRow(projectId)) throw new Error("Project not found");
    const now = Date.now();
    const { evidence, timeline } = await this.gather(projectId, now);
    const incident: Incident = {
      id: crypto.randomUUID().slice(0, 10),
      projectId,
      title: title.trim().slice(0, 120) || "Incident",
      status: "open",
      startedAt: now,
      timeline: [...timeline, { at: now, kind: "start", text: "Incident opened" }],
      evidence,
      analyzing: true,
    };
    this.save(incident);
    void this.analyze(incident.id, language);
    return incident;
  }

  /** The SRE persona's read of the evidence: most likely cause, what to check, how to roll back. */
  async analyze(id: string, language = "en"): Promise<void> {
    const incident = this.get(id);
    if (!incident) return;
    const persona = this.sources.personas.get("devops");
    const system = persona
      ? this.sources.personas.systemPrompt(persona, incident.projectId, { notebook: false })
      : undefined;
    const notes = incident.timeline
      .filter((e) => e.kind === "note")
      .map((e) => `- ${new Date(e.at).toISOString()} ${e.text}`);
    try {
      const answer = await this.ask(
        [
          `Production incident in project "${this.store.projectRow(incident.projectId)?.name ?? ""}": ${incident.title}. You are the on-call SRE. Answer in the language with code "${language}".`,
          "From the evidence below: 1) what is happening, in two sentences; 2) the most likely causes, ranked, each tied to evidence; 3) what to check first, with exact read-only commands; 4) how to recover fast (roll back the last deploy if it lines up with the start, restart, feature flag). Say clearly when the evidence is not enough. Markdown.",
          "Evidence:",
          incident.evidence,
          notes.length ? `Notes from the team:\n${notes.join("\n")}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        system,
      );
      const now = this.get(id) ?? incident;
      this.save({
        ...now,
        analysis: answer.trim(),
        analyzing: false,
        timeline: [
          ...now.timeline,
          {
            at: Date.now(),
            kind: "analysis",
            text:
              answer
                .split("\n")
                .find((l) => l.trim())
                ?.replace(/^#+\s*/, "")
                .slice(0, 160) ?? "",
          },
        ],
      });
    } catch (err) {
      const now = this.get(id) ?? incident;
      this.save({ ...now, analyzing: false, analysis: `(${(err as Error).message})` });
    }
  }

  note(id: string, text: string): Incident {
    const incident = this.get(id);
    if (!incident) throw new Error("Not found");
    const clean = text.trim().slice(0, 2000);
    if (!clean) throw new Error("Write the note");
    const next = {
      ...incident,
      timeline: [...incident.timeline, { at: Date.now(), kind: "note" as const, text: clean }],
    };
    this.save(next);
    return next;
  }

  /** Closes the incident and writes the postmortem into the project's wiki. */
  async resolve(id: string, language: string): Promise<Incident> {
    const incident = this.get(id);
    if (!incident) throw new Error("Not found");
    const endedAt = Date.now();
    const timeline = [...incident.timeline, { at: endedAt, kind: "resolved" as const, text: "Resolved" }];
    const postmortem = (
      await this.ask(
        [
          `Write a blameless postmortem in the language with code "${language}" for this incident: ${incident.title}.`,
          `Started ${new Date(incident.startedAt).toISOString()}, resolved ${new Date(endedAt).toISOString()} (${Math.round((endedAt - incident.startedAt) / 60_000)} minutes).`,
          "Sections, with their headings written in that same language: Summary, Impact, Timeline (from the entries below), Root cause (or 'not confirmed' if the notes don't confirm one), What went well, What went wrong, Action items (owner left blank). Only what the material supports. Markdown, no code fence.",
          "Timeline:",
          ...timeline.map((e) => `- ${new Date(e.at).toISOString()} [${e.kind}] ${e.text}`),
          "Evidence:",
          incident.evidence,
          incident.analysis ? `SRE analysis:\n${incident.analysis}` : "",
        ].join("\n"),
      )
    ).trim();
    const next: Incident = { ...incident, status: "resolved", endedAt, timeline, postmortem };
    this.save(next);
    this.sources.docs.savePage(incident.projectId, {
      title: `Postmortem: ${incident.title} ${new Date(incident.startedAt).toISOString().slice(0, 10)} ${id.slice(0, 4)}`,
      body: postmortem,
    });
    return next;
  }
}
