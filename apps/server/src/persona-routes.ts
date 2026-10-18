import { homedir } from "node:os";
import { join } from "node:path";
import { extractNotebook, type Idea, personaToolList } from "@igrek/core";
import type { Hono } from "hono";
import type { Accounts } from "./accounts";
import type { Chats } from "./chats";
import type { Meetings } from "./meetings";
import { type Personas, personaLabel } from "./personas";

export function registerPersonaRoutes(
  app: Hono,
  {
    personas,
    meetings,
    accounts,
    ideas,
  }: {
    personas: Personas;
    meetings: Meetings;
    accounts: Accounts;
    /** The idea box and project names, for the CEO advisor's review. */
    ideas: () => { list: Idea[]; projects: Map<string, string> };
  },
): void {
  const fail = (err: unknown, status: 400 | 404 | 409 = 400) =>
    new Response(JSON.stringify({ error: (err as Error).message }), {
      status,
      headers: { "content-type": "application/json" },
    });

  app.get("/api/personas", (c) => c.json(personas.list()));
  app.get("/api/personas/scores", (c) => c.json(personas.scores()));

  app.post("/api/personas", async (c) => {
    try {
      return c.json(personas.save(await c.req.json()));
    } catch (err) {
      return fail(err);
    }
  });
  app.put("/api/personas/:id", async (c) => {
    try {
      return c.json(personas.save(await c.req.json(), c.req.param("id")));
    } catch (err) {
      return fail(err);
    }
  });
  // Own persona: deleted. Built-in: back to how it shipped.
  app.delete("/api/personas/:id", (c) => {
    personas.remove(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.post("/api/personas/draft", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { description?: unknown };
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (description.length < 8) return c.json({ error: "Describe the persona in a sentence" }, 400);
    try {
      return c.json(await personas.draft(description));
    } catch (err) {
      return fail(err);
    }
  });

  /** What the persona reads before it starts, for the "show prompt" view. */
  app.get("/api/personas/:id/prompt", (c) => {
    const persona = personas.get(c.req.param("id"));
    if (!persona) return c.json({ error: "Not found" }, 404);
    return c.json({ prompt: personas.systemPrompt(persona, c.req.query("projectId") || null) });
  });

  app.get("/api/personas/:id/opinions", (c) =>
    c.json(personas.opinions(c.req.param("id"), c.req.query("projectId") || null, c.req.query("all") === "1")),
  );
  app.delete("/api/persona-opinions/:id", (c) => {
    personas.deleteOpinion(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.post("/api/personas/export", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { target?: unknown; projectId?: unknown; ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : undefined;
    try {
      if (body.target === "codex") {
        const codex = accounts.list().find((a) => a.provider === "codex" && a.active);
        return c.json({ files: personas.exportCodex(codex?.configDir || join(homedir(), ".codex"), ids) });
      }
      if (typeof body.projectId !== "string") return c.json({ error: "Pick a project" }, 400);
      return c.json({ files: personas.exportClaude(body.projectId, ids) });
    } catch (err) {
      return fail(err);
    }
  });

  // ---- team meetings ----------------------------------------------------------------

  app.get("/api/meetings", (c) => c.json(meetings.list(c.req.query("projectId") || null)));
  app.get("/api/meetings/:id", (c) => {
    const meeting = meetings.get(c.req.param("id"));
    return meeting ? c.json(meeting) : c.json({ error: "Not found" }, 404);
  });
  app.post("/api/meetings/suggest", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { question?: unknown };
    return c.json({ personaIds: meetings.suggest(typeof body.question === "string" ? body.question : "") });
  });
  app.post("/api/meetings", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      question?: unknown;
      projectId?: unknown;
      personaIds?: unknown;
    };
    try {
      return c.json(
        meetings.start({
          question: typeof body.question === "string" ? body.question : "",
          projectId: typeof body.projectId === "string" ? body.projectId : null,
          personaIds: Array.isArray(body.personaIds)
            ? body.personaIds.filter((x): x is string => typeof x === "string")
            : undefined,
        }),
      );
    } catch (err) {
      return fail(err);
    }
  });
  app.post("/api/meetings/:id/commit", (c) => {
    try {
      return c.json(meetings.commit(c.req.param("id")));
    } catch (err) {
      return fail(err, 409);
    }
  });
  app.post("/api/meetings/:id/project", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { projectId?: unknown };
    try {
      return c.json(meetings.setProject(c.req.param("id"), String(body.projectId ?? "")));
    } catch (err) {
      return fail(err);
    }
  });
  app.post("/api/meetings/:id/weak-points", async (c) => {
    try {
      return c.json(await meetings.meetingWeakPoints(c.req.param("id")));
    } catch (err) {
      return fail(err);
    }
  });
  app.delete("/api/meetings/:id", (c) => {
    meetings.remove(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.post("/api/ideas/review", async (c) => {
    const { list, projects } = ideas();
    try {
      return c.json(await meetings.reviewIdeas(list, projects));
    } catch (err) {
      return fail(err);
    }
  });

  /** Devil's advocate on any plan (plan.md 6.3: "Zayıf noktaları bul"). */
  app.post("/api/weak-points", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown; projectId?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 20) return c.json({ error: "There is no plan to look at yet" }, 400);
    try {
      return c.json({
        points: await meetings.weakPoints(text, typeof body.projectId === "string" ? body.projectId : null),
      });
    } catch (err) {
      return fail(err);
    }
  });
}

/** Wires personas into chats: the start options, session links and the notebook. */
export function connectPersonaChats(
  chats: Chats,
  personas: Personas,
  linkSession: (sessionId: string, personaId: string) => void,
  /** How to start God Eye's MCP server (library_search); none in tests. */
  mcp?: { command: string; args: string[]; env: Record<string, string> },
) {
  chats.onSession = (info) => {
    if (info.persona && info.sessionId) linkSession(info.sessionId, info.persona.id);
  };
  chats.onPersonaTurn = (info, text) => {
    if (!info.persona) return { saved: 0, rejected: 0 };
    const { entries } = extractNotebook(text);
    const result = personas.record(info.persona.id, info.projectId, entries, `chat:${info.sessionId ?? info.id}`);
    return { saved: result.saved.length, rejected: result.rejected };
  };
  return (personaId: string, projectId: string) => {
    const persona = personas.get(personaId);
    if (!persona) return undefined;
    const { name } = personaLabel(persona);
    return {
      model: persona.model,
      start: {
        id: persona.id,
        name: persona.builtin ? undefined : name,
        tools: persona.tools,
        // The persona reads memory, its notebook and its own parts of the project before it starts.
        systemPrompt: personas.systemPrompt(persona, projectId, { notebook: true, libraryTool: !!mcp }),
        toolList: personaToolList(persona),
        maxTurns: persona.maxTurns,
        ...(mcp
          ? {
              mcpConfig: JSON.stringify({ mcpServers: { godeye: mcp } }),
              allowTools: [
                "mcp__godeye__library_search",
                "mcp__godeye__godeye_project_memory",
                "mcp__godeye__godeye_wiki",
              ],
            }
          : {}),
      },
    };
  };
}
