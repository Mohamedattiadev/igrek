import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ChatMode } from "@godeye/core";
import type { Hono } from "hono";
import type { Accounts } from "./accounts";
import type { Bus } from "./bus";
import { ChatHistory, type ChatStart, type Chats, type SendHow } from "./chats";
import type { Store } from "./store";
import { isTrusted, projectExtensions, trust } from "./trust";
import { createWorktree, mergeWorktree, removeWorktree, type Worktree, workFolder, worktreeDiff } from "./worktrees";

const MODES: ChatMode[] = ["normal", "acceptEdits", "auto", "plan"];

export function registerChatRoutes(
  app: Hono,
  {
    chats,
    bus,
    store,
    accounts,
    worktreeDir,
    persona,
    godeyeMcp,
    richUi,
  }: {
    chats: Chats;
    bus: Bus;
    store: Store;
    accounts: Accounts;
    worktreeDir: string;
    /** Builds the persona part of a chat (prompt, tools, turn limit) and its default model. */
    persona?: (
      personaId: string,
      projectId: string,
    ) => { start: NonNullable<ChatStart["persona"]>; model: string } | undefined;
    /** God Eye's MCP server, given to every chat. */
    godeyeMcp?: ChatStart["godeyeMcp"];
    /** OpenUI instructions when rich answers are on (plan.md 16.2). */
    richUi?: () => string | undefined;
  },
): void {
  const account = (projectId: string, sessionAccount?: string | null) =>
    (sessionAccount && accounts.get(sessionAccount)) || accounts.forProject("claude", projectId);
  app.get("/api/chats", (c) => c.json(chats.list()));

  // Remember every chat with a saved session, so it can be continued after a restart.
  const history = new ChatHistory(store.db);
  registerProjectRules(app, chats, store);
  history.record(chats.list());
  bus.subscribe((message) => {
    if (message.type === "chats") history.record(message.chats);
  });
  app.get("/api/chats/recent", (c) => c.json(history.recent(30, new Set(chats.list().map((chat) => chat.id)))));
  app.get("/api/chats/recent/:id", (c) => {
    const chat = history.get(c.req.param("id"));
    return chat ? c.json(chat) : c.json({ error: "Chat not found" }, 404);
  });
  app.delete("/api/chats/recent/:id", (c) => {
    history.forget(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.post("/api/chats", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      projectId?: string;
      resume?: string;
      model?: string;
      mode?: string;
      /** For a new chat only: a resumed session must stay in the account that holds it. */
      accountId?: string;
      /** Work in a separate copy (default for auto mode). */
      isolate?: boolean;
      /** Talk to one persona (plan.md 6.3). */
      personaId?: string;
    };
    const project = body.projectId ? store.projectRow(body.projectId) : undefined;
    if (!project) return c.json({ error: "Project not found" }, 404);
    const session = body.resume ? store.sessionRow(body.resume) : undefined;
    if (body.resume && session?.tool !== "claude")
      return c.json({ error: "Only Claude sessions can be continued in chat" }, 400);
    const mode = MODES.find((m) => m === body.mode);
    // A session that ran as a persona continues as that persona.
    const personaId =
      typeof body.personaId === "string" ? body.personaId : body.resume ? store.sessionPersona(body.resume) : undefined;
    const as = personaId && persona ? persona(personaId, project.id) : undefined;
    if (typeof body.personaId === "string" && !as) return c.json({ error: "Persona not found" }, 404);
    let worktree: Worktree | undefined;
    try {
      if (!body.resume && (body.isolate ?? mode === "auto"))
        worktree = createWorktree(project.path, crypto.randomUUID().slice(0, 8), worktreeDir);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
    // A project's own hooks, MCP servers and skills load only once the user trusts them.
    const extensions = projectExtensions(project.path);
    const untrusted = extensions && !isTrusted(store.db, project.id, extensions.fingerprint) ? extensions : undefined;
    try {
      const started = chats.start({
        projectId: project.id,
        untrusted,
        richUi: richUi?.(),
        cwd: worktree ? workFolder(worktree) : (session?.cwd ?? project.path),
        worktree,
        title: session?.title ?? undefined,
        resume: body.resume,
        model:
          typeof body.model === "string" && /^[\w.[\]-]+$/.test(body.model) ? body.model : (as?.model ?? undefined),
        mode,
        persona: as?.start,
        godeyeMcp,
        ...(() => {
          const picked = !session && body.accountId ? accounts.get(body.accountId) : undefined;
          const chosen = picked?.provider === "claude" ? picked : account(project.id, session?.account_id);
          return { accountId: chosen?.id, env: accounts.env(chosen) };
        })(),
      });
      // Messages queued in the chat this one continues (before a restart) come along.
      if (body.resume) chats.restoreQueue(started.id, history.takeQueue(body.resume));
      return c.json(chats.get(started.id) ?? started);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // The auto-mode copy: see what changed, bring it in (you approve by clicking), or throw it away.
  const withCopy = (id: string) => {
    const info = chats.get(id);
    const project = info ? store.projectRow(info.projectId) : undefined;
    return info?.worktree && project ? { info, wt: info.worktree, project } : undefined;
  };
  app.get("/api/chats/:id/worktree", (c) => {
    const found = withCopy(c.req.param("id"));
    return found ? c.json(worktreeDiff(found.wt)) : c.json({ error: "Not found" }, 404);
  });
  app.post("/api/chats/:id/worktree/merge", (c) => {
    const found = withCopy(c.req.param("id"));
    if (!found) return c.json({ error: "Not found" }, 404);
    const result = mergeWorktree(found.project.path, found.wt, found.info.title);
    return result.merged ? c.json(result) : c.json({ error: result.message }, 409);
  });
  app.delete("/api/chats/:id/worktree", (c) => {
    const found = withCopy(c.req.param("id"));
    if (!found) return c.json({ error: "Not found" }, 404);
    chats.close(found.info.id);
    removeWorktree(found.project.path, found.wt);
    return c.json({ ok: true });
  });

  // Custom slash commands: the project's .claude/commands and each Claude account's own (for the "/" menu).
  app.get("/api/projects/:id/slash-commands", (c) => {
    const project = store.projectRow(c.req.param("id"));
    if (!project) return c.json([]);
    const dirs: [string, "project" | "user"][] = [[join(project.path, ".claude", "commands"), "project"]];
    for (const a of accounts.list().filter((x) => x.provider === "claude"))
      dirs.push([join(a.configDir || join(homedir(), ".claude"), "commands"), "user"]);
    const seen = new Set<string>();
    const out: { name: string; description: string; source: "project" | "user" }[] = [];
    const walk = (dir: string, prefix: string, source: "project" | "user", depth: number) => {
      let entries: import("node:fs").Dirent[] = [];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isDirectory() && depth < 2) walk(join(dir, e.name), `${prefix}${e.name}:`, source, depth + 1);
        if (!e.isFile() || !e.name.endsWith(".md")) continue;
        const name = `${prefix}${e.name.slice(0, -3)}`;
        if (seen.has(name)) continue;
        seen.add(name);
        let description = "";
        try {
          const text = readFileSync(join(dir, e.name), "utf8").slice(0, 2000);
          description =
            text.match(/^description:\s*(.+)$/m)?.[1]?.trim() ??
            text
              .replace(/^---[\s\S]*?---/, "")
              .trim()
              .split("\n")[0]
              ?.replace(/^#+\s*/, "")
              .slice(0, 120) ??
            "";
        } catch {
          // unreadable: still listed by name
        }
        out.push({ name, description, source });
      }
    };
    for (const [dir, source] of dirs) walk(dir, "", source, 0);
    return c.json(out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200));
  });

  // Switching model means restarting on the same saved session.
  app.post("/api/chats/:id/model", async (c) => {
    const info = chats.get(c.req.param("id"));
    const body = (await c.req.json().catch(() => ({}))) as { model?: string };
    if (!info?.sessionId) return c.json({ error: "Send a first message before switching model" }, 409);
    if (!body.model || !/^[\w.[\]-]+$/.test(body.model)) return c.json({ error: "Invalid model" }, 400);
    chats.close(info.id);
    const root = store.projectRow(info.projectId)?.path ?? info.cwd;
    const extensions = projectExtensions(root);
    return c.json(
      chats.start({
        projectId: info.projectId,
        untrusted: extensions && !isTrusted(store.db, info.projectId, extensions.fingerprint) ? extensions : undefined,
        cwd: info.cwd,
        title: info.title,
        resume: info.sessionId,
        model: body.model,
        mode: info.mode,
        persona: info.persona && persona ? persona(info.persona.id, info.projectId)?.start : undefined,
        godeyeMcp,
        accountId: info.accountId,
        env: accounts.env(info.accountId ? accounts.get(info.accountId) : undefined),
      }),
    );
  });

  app.delete("/api/chats/:id", (c) => {
    chats.close(c.req.param("id"));
    return c.json({ ok: true });
  });
}

/** Messages the browser sends over /ws/chat/:id. */
type ChatClientMessage =
  | { op: "send"; text: string; images?: { mediaType: string; data: string }[]; how?: SendHow }
  | { op: "unqueue"; queuedId: string }
  | { op: "resumeAtReset"; text: string }
  | { op: "cancelResume" }
  | { op: "sendQueued"; queuedId: string }
  | {
      op: "permission";
      requestId: string;
      decision: "allow" | "deny" | "always" | "project";
      message?: string;
      answers?: Record<string, string>;
    }
  | { op: "interrupt" }
  | { op: "mode"; mode: ChatMode };

/** Per-project decisions: steps always allowed (plan.md 16.1) and trusted extensions (plan.md 16.4). */
function registerProjectRules(app: Hono, chats: Chats, store: Store): void {
  // "Always allow in this project" rules, kept per project.
  chats.projectRules = (projectId) =>
    (
      store.db.query("SELECT rule FROM tool_rules WHERE project_id = ? ORDER BY rule").all(projectId) as {
        rule: string;
      }[]
    ).map((r) => r.rule);
  chats.addProjectRule = (projectId, rule) =>
    store.db
      .query("INSERT OR IGNORE INTO tool_rules (project_id, rule, created_at) VALUES (?, ?, ?)")
      .run(projectId, rule, Date.now());
  app.get("/api/projects/:id/trust", (c) => {
    const project = store.projectRow(c.req.param("id"));
    if (!project) return c.json({ error: "Project not found" }, 404);
    const extensions = projectExtensions(project.path) ?? null;
    return c.json({ extensions, trusted: !!extensions && isTrusted(store.db, project.id, extensions.fingerprint) });
  });
  app.post("/api/projects/:id/trust", async (c) => {
    const project = store.projectRow(c.req.param("id"));
    if (!project) return c.json({ error: "Project not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { trust?: boolean };
    // Trust what is there now: the fingerprint comes from the files, not from the browser.
    const extensions = projectExtensions(project.path);
    trust(store.db, project.id, body.trust === false || !extensions ? null : extensions.fingerprint);
    return c.json({ ok: true });
  });
  app.get("/api/projects/:id/tool-rules", (c) => c.json(chats.projectRules(c.req.param("id"))));
  app.delete("/api/projects/:id/tool-rules", (c) => {
    store.db
      .query("DELETE FROM tool_rules WHERE project_id = ? AND rule = ?")
      .run(c.req.param("id"), c.req.query("rule") ?? "");
    return c.json({ ok: true });
  });
}

/** Only text answers, a few and short: they go straight into the AI's input. */
function cleanAnswers(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [question, answer] of Object.entries(raw as Record<string, unknown>).slice(0, 10))
    if (typeof answer === "string") out[question.slice(0, 500)] = answer.slice(0, 2000);
  return Object.keys(out).length ? out : undefined;
}

export function handleChatMessage(chats: Chats, id: string, raw: string): string | undefined {
  let msg: ChatClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    return undefined;
  }
  try {
    if (msg.op === "send") {
      const images = (msg.images ?? [])
        .filter((img) => /^image\/(png|jpeg|gif|webp)$/.test(img.mediaType) && typeof img.data === "string")
        .slice(0, 8);
      chats.send(id, String(msg.text ?? "").slice(0, 100_000), images, msg.how === "steer" ? "steer" : "queue");
    } else if (msg.op === "unqueue") chats.unqueue(id, String(msg.queuedId));
    else if (msg.op === "resumeAtReset") chats.resumeAtReset(id, String(msg.text ?? ""));
    else if (msg.op === "cancelResume") chats.cancelResume(id);
    else if (msg.op === "sendQueued") {
      chats.sendQueued(id, String(msg.queuedId));
    } else if (msg.op === "permission" && ["allow", "deny", "always", "project"].includes(msg.decision))
      chats.answer(
        id,
        msg.requestId,
        msg.decision,
        msg.message ? String(msg.message).slice(0, 2000) : undefined,
        cleanAnswers(msg.answers),
      );
    else if (msg.op === "interrupt") chats.interrupt(id);
    else if (msg.op === "mode" && MODES.includes(msg.mode)) chats.setMode(id, msg.mode);
  } catch (err) {
    return (err as Error).message;
  }
  return undefined;
}
