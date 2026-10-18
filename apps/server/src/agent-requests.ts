import { isAbsolute, normalize } from "node:path";
import type { InboxNotice } from "@godeye/core";
import type { Hono } from "hono";
import type { EnvFiles } from "./envfiles";
import type { Personas } from "./personas";
import type { Store } from "./store";
import type { Vault } from "./vault";

/** A secret an agent asked for: the user types it in God Eye; the agent only hears that it was stored. */
interface SecretRequest {
  id: string;
  projectId: string;
  projectName: string;
  key: string;
  reason: string;
  file: string;
  status: "pending" | "stored" | "declined";
  at: number;
}

/** A page an agent wanted to show: drawn sandboxed from the inbox. */
interface AgentReport {
  id: string;
  projectId?: string;
  projectName?: string;
  title: string;
  html: string;
  at: number;
}

const KEY = /^[A-Z][A-Z0-9_]{1,63}$/;
const KEEP = 30;

/** An env file inside the project: a relative path that does not climb out. */
function safeFile(file: unknown): string | undefined {
  const f = typeof file === "string" && file.trim() ? normalize(file.trim()) : ".env";
  return !isAbsolute(f) && !f.startsWith("..") && /(^|\/)\.env[\w.-]*$/.test(f) ? f : undefined;
}

/**
 * What agents may ask God Eye for beyond reading (plan.md 16.3): a secret the user provides
 * (stored in the vault and the project's env file, never shown to the agent) and a page to show.
 * Kept in memory: a restart drops open requests, and the agent is told to ask again.
 */
export class AgentRequests {
  private secrets = new Map<string, SecretRequest>();
  private reports = new Map<string, AgentReport>();

  constructor(
    private readonly store: Store,
    private readonly vault: Vault,
    private readonly env: EnvFiles,
    private readonly personas: Personas,
  ) {}

  requestSecret(input: { cwd?: unknown; key?: unknown; reason?: unknown; file?: unknown }): SecretRequest {
    const projectId = typeof input.cwd === "string" ? this.store.knownProjectFor(input.cwd) : undefined;
    const project = projectId ? this.store.projectRow(projectId) : undefined;
    if (!project) throw new Error("Open this from a project God Eye knows");
    const key = String(input.key ?? "").trim();
    if (!KEY.test(key)) throw new Error("The name must look like API_KEY (capital letters, digits, _)");
    const file = safeFile(input.file);
    if (!file) throw new Error("The file must be an env file inside the project, like .env or .env.local");
    const request: SecretRequest = {
      id: crypto.randomUUID().slice(0, 10),
      projectId: project.id,
      projectName: project.name,
      key,
      reason: String(input.reason ?? "").slice(0, 300),
      file,
      status: "pending",
      at: Date.now(),
    };
    this.secrets.set(request.id, request);
    this.trim(this.secrets);
    return request;
  }

  /** What the agent may see: never the value. */
  secretStatus(id: string): Pick<SecretRequest, "status" | "key" | "file"> | undefined {
    const r = this.secrets.get(id);
    return r ? { status: r.status, key: r.key, file: r.file } : undefined;
  }

  secretRequest(id: string): SecretRequest | undefined {
    return this.secrets.get(id);
  }

  async answerSecret(id: string, value: string | null): Promise<void> {
    const r = this.secrets.get(id);
    if (!r || r.status !== "pending") throw new Error("This request is no longer open");
    if (value === null) {
      r.status = "declined";
      return;
    }
    if (!value.trim()) throw new Error("Type the value, or decline");
    const root = this.store.projectRow(r.projectId)?.path;
    if (!root) throw new Error("Project not found");
    await this.vault.addItem({ name: r.key, value, projectId: r.projectId, note: r.reason });
    this.env.set(root, r.file, r.key, value);
    r.status = "stored";
  }

  showReport(input: { cwd?: unknown; title?: unknown; html?: unknown }): AgentReport {
    const projectId = typeof input.cwd === "string" ? this.store.knownProjectFor(input.cwd) : undefined;
    const html = String(input.html ?? "");
    if (!html.trim()) throw new Error("The page is empty");
    const report: AgentReport = {
      id: crypto.randomUUID().slice(0, 10),
      projectId,
      projectName: projectId ? this.store.projectRow(projectId)?.name : undefined,
      title: String(input.title ?? "Report").slice(0, 120),
      html: html.slice(0, 400_000),
      at: Date.now(),
    };
    this.reports.set(report.id, report);
    this.trim(this.reports);
    return report;
  }

  report(id: string): AgentReport | undefined {
    return this.reports.get(id);
  }

  /** A persona's profile and what it has written down, for an agent to work in its spirit. */
  persona(id: string, cwd?: string) {
    const persona = this.personas.get(id);
    if (!persona) return undefined;
    const projectId = cwd ? this.store.knownProjectFor(cwd) : undefined;
    return {
      id: persona.id,
      style: persona.profile.style,
      checklist: persona.profile.checklist,
      pitfalls: persona.profile.pitfalls,
      rules: persona.profile.rules,
      opinions: this.personas
        .opinions(persona.id, projectId ?? null)
        .slice(0, 20)
        .map((o) => o.claim),
    };
  }

  notices(): InboxNotice[] {
    return [
      ...[...this.secrets.values()]
        .filter((r) => r.status === "pending")
        .map((r) => ({
          id: `secret-request:${r.id}`,
          kind: "secretRequest" as const,
          projectId: r.projectId,
          projectName: r.projectName,
          detail: `${r.key}${r.reason ? `: ${r.reason}` : ""}`,
          at: r.at,
          link: `/agent/secret/${r.id}`,
        })),
      ...[...this.reports.values()].map((r) => ({
        id: `agent-report:${r.id}`,
        kind: "agentReport" as const,
        projectId: r.projectId ?? "",
        projectName: r.projectName ?? "",
        detail: r.title,
        at: r.at,
        link: `/agent/report/${r.id}`,
      })),
    ];
  }

  private trim<T>(map: Map<string, T>): void {
    for (const key of [...map.keys()].slice(0, Math.max(0, map.size - KEEP))) map.delete(key);
  }
}

export function registerAgentRequestRoutes(app: Hono, requests: AgentRequests): void {
  const guard = async (fn: () => unknown) => {
    try {
      return { ok: true as const, value: await fn() };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  };
  // The agent side (God Eye's MCP server): ask, then poll; never sees a value.
  app.post("/api/agent/secrets", async (c) => {
    const r = await guard(async () => requests.requestSecret(await c.req.json().catch(() => ({}))));
    return r.ok ? c.json({ id: (r.value as SecretRequest).id }) : c.json({ error: r.error }, 400);
  });
  app.get("/api/agent/secrets/:id", (c) => {
    const status = requests.secretStatus(c.req.param("id"));
    return status ? c.json(status) : c.json({ error: "Not found" }, 404);
  });
  app.post("/api/agent/reports", async (c) => {
    const r = await guard(async () => requests.showReport(await c.req.json().catch(() => ({}))));
    return r.ok ? c.json({ id: (r.value as AgentReport).id }) : c.json({ error: r.error }, 400);
  });
  app.get("/api/agent/personas/:id", (c) => {
    const p = requests.persona(c.req.param("id"), c.req.query("cwd"));
    return p ? c.json(p) : c.json({ error: "Not found" }, 404);
  });
  // The user side.
  app.get("/api/secret-requests/:id", (c) => {
    const r = requests.secretRequest(c.req.param("id"));
    return r ? c.json(r) : c.json({ error: "Not found" }, 404);
  });
  app.post("/api/secret-requests/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { value?: unknown; decline?: unknown };
    const r = await guard(() =>
      requests.answerSecret(c.req.param("id"), body.decline === true ? null : String(body.value ?? "")),
    );
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, 400);
  });
  app.get("/api/agent-reports/:id", (c) => {
    const r = requests.report(c.req.param("id"));
    return r ? c.json(r) : c.json({ error: "Not found" }, 404);
  });
}
