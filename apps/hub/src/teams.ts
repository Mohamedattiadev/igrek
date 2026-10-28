import type { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";

/**
 * The company's teams on the hub (plan.md 20.2): "QA", "Backend", "Servers", each with what it is
 * for, a lead, its people and the projects it owns. The hub keeps only this structure (names, who is
 * in which team, opaque project ids); everything a team says or plans stays end-to-end encrypted.
 */
export interface HubTeam {
  id: string;
  name: string;
  description: string;
  leadId?: string;
  members: string[];
  projects: string[];
  createdAt: number;
}

export class Teams {
  constructor(private readonly db: Database) {}

  list(): HubTeam[] {
    const teams = this.db.query("SELECT * FROM teams ORDER BY name").all() as {
      id: string;
      name: string;
      description: string;
      lead_id: string | null;
      created_at: number;
    }[];
    const members = this.db.query("SELECT team_id, user_id FROM team_members").all() as {
      team_id: string;
      user_id: string;
    }[];
    const projects = this.db.query("SELECT team_id, project FROM team_projects").all() as {
      team_id: string;
      project: string;
    }[];
    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      ...(t.lead_id ? { leadId: t.lead_id } : {}),
      members: members.filter((m) => m.team_id === t.id).map((m) => m.user_id),
      projects: projects.filter((p) => p.team_id === t.id).map((p) => p.project),
      createdAt: t.created_at,
    }));
  }

  get(id: string): HubTeam | undefined {
    return this.list().find((t) => t.id === id);
  }

  create(input: { name?: unknown; description?: unknown; leadId?: unknown }): HubTeam {
    const name = String(input.name ?? "")
      .trim()
      .slice(0, 40);
    if (!name) throw new Error("A team needs a name");
    const id = randomBytes(6).toString("hex");
    this.db
      .query("INSERT INTO teams (id, name, description, lead_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, name, String(input.description ?? "").slice(0, 400), this.userOrNull(input.leadId), Date.now());
    const lead = this.userOrNull(input.leadId);
    if (lead) this.addMember(id, lead);
    return this.get(id) as HubTeam;
  }

  update(id: string, patch: { name?: unknown; description?: unknown; leadId?: unknown }): HubTeam {
    if (!this.get(id)) throw new Error("No such team");
    if (typeof patch.name === "string" && patch.name.trim())
      this.db.query("UPDATE teams SET name = ? WHERE id = ?").run(patch.name.trim().slice(0, 40), id);
    if (typeof patch.description === "string")
      this.db.query("UPDATE teams SET description = ? WHERE id = ?").run(patch.description.slice(0, 400), id);
    if (patch.leadId !== undefined) {
      const lead = this.userOrNull(patch.leadId);
      this.db.query("UPDATE teams SET lead_id = ? WHERE id = ?").run(lead, id);
      // A lead is one of the team.
      if (lead) this.addMember(id, lead);
    }
    return this.get(id) as HubTeam;
  }

  remove(id: string): void {
    this.db.query("DELETE FROM teams WHERE id = ?").run(id);
  }

  addMember(id: string, userId: string): void {
    if (!this.userOrNull(userId)) throw new Error("No such person");
    this.db.query("INSERT OR IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)").run(id, userId);
  }

  /** Out of the team; a lead who leaves leaves the team without a lead. */
  removeMember(id: string, userId: string): void {
    this.db.transaction(() => {
      this.db.query("DELETE FROM team_members WHERE team_id = ? AND user_id = ?").run(id, userId);
      this.db.query("UPDATE teams SET lead_id = NULL WHERE id = ? AND lead_id = ?").run(id, userId);
    })();
  }

  setProject(id: string, project: string, on: boolean): void {
    if (!/^[0-9a-f]{64}$/.test(project)) throw new Error("Unknown project");
    if (on) this.db.query("INSERT OR IGNORE INTO team_projects (team_id, project) VALUES (?, ?)").run(id, project);
    else this.db.query("DELETE FROM team_projects WHERE team_id = ? AND project = ?").run(id, project);
  }

  /** Whether someone leads this team (they may then add and remove its people). */
  leads(id: string, userId: string): boolean {
    return !!this.db.query("SELECT 1 FROM teams WHERE id = ? AND lead_id = ?").get(id, userId);
  }

  private userOrNull(value: unknown): string | null {
    if (typeof value !== "string" || !value) return null;
    return this.db.query("SELECT 1 FROM users WHERE id = ?").get(value) ? value : null;
  }
}
