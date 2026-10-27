import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { type ChatMode, capabilitiesOf, historyEvents } from "@igrek/core";
import type { Hono } from "hono";
import type { Accounts } from "./accounts";
import type { Bus } from "./bus";
import { ChatTodos } from "./chat-todos";
import { ChatHistory, type ChatStart, type Chats, type SendHow } from "./chats";
import { checkpointChanges, checkpointFile, restoreCheckpointFile } from "./checkpoints";
import { cleanFound } from "./private-values";
import type { Store } from "./store";
import { isTrusted, projectExtensions, trust } from "./trust";
import { createWorktree, mergeWorktree, removeWorktree, type Worktree, workFolder, worktreeDiff } from "./worktrees";

const MODES: ChatMode[] = ["full", "normal", "acceptEdits", "auto", "plan"];

/**
 * What a session said, for a new chat that goes on with it because Claude's own file of it is not
 * on this computer: a teammate's (on their computer), or mine that was moved or cleaned up. Bounded.
 */
function earlierContext(store: Store, sessionId: string, author: string | null | undefined): string {
  const said = (store.sessionDetail(sessionId, 80)?.messages ?? [])
    .filter((m) => m.kind === "prompt" || m.kind === "text")
    .map((m) => `${m.kind === "prompt" ? (author ?? "Me") : "Claude"}: ${m.text}`)
    .join("\n\n");
  const intro = author
    ? `This chat goes on with ${author}'s session from their computer. Their conversation so far, for context (their files may differ from this computer's; check before relying on them):`
    : "This chat goes on with an earlier session whose saved conversation is no longer on this computer. What was said, for context:";
  return [intro, said.length > 30_000 ? `...${said.slice(-30_000)}` : said].join("\n\n");
}

/** A project's own hooks, MCP servers and skills load only once the user trusts them. */
function untrustedIn(store: Store, projectId: string, root: string) {
  const extensions = projectExtensions(root);
  return extensions && !isTrusted(store.db, projectId, extensions.fingerprint) ? extensions : undefined;
}

/**
 * How a chat goes on with a session. Ours resumes Claude's own file of it. A teammate's cannot:
 * that file is on their computer, so it goes on as a new chat in this project's folder, with their
 * conversation as its context.
 */
export function continuation(
  store: Store,
  resume: string | undefined,
  session: ReturnType<Store["sessionRow"]>,
): { resume?: string; cwd?: string; note?: string } {
  if (!resume) return {};
  // Claude's file of the session was read here once but is gone now (moved, cleaned up): Claude
  // would answer "No conversation found", so it goes on like a teammate's, from what we kept.
  const files = store.db.query("SELECT path FROM source_files WHERE session_id = ?").all(resume) as { path: string }[];
  const gone = files.length > 0 && !files.some((f) => existsSync(f.path));
  if (!session?.author_id && !gone) return { resume, cwd: session?.cwd ?? undefined };
  return { note: earlierContext(store, resume, session?.author_id ? session.author_name || "A teammate" : undefined) };
}

export function registerChatRoutes(
  app: Hono,
  {
    chats,
    bus,
    store,
    accounts,
    worktreeDir,
    persona,
    igrekMcp,
    subagents,
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
    /** Igrek's MCP server, given to every chat. */
    igrekMcp?: ChatStart["igrekMcp"];
    /** The experts as subagents for a project's chats (a file path), when experts are on. */
    subagents?: (projectId: string) => string | undefined;
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
  registerChatChanges(app, chats);
  registerChatTodos(app, chats, history, new ChatTodos(store.db));
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
      /** Reverse-engineering mode, only with the user's word that they may examine the target. */
      focus?: string;
      authorized?: boolean;
    };
    const project = body.projectId ? store.projectRow(body.projectId) : undefined;
    if (!project) return c.json({ error: "Project not found" }, 404);
    const session = body.resume ? store.sessionRow(body.resume) : undefined;
    const goOn = continuation(store, body.resume, session);
    if (body.resume && !capabilitiesOf(session?.tool ?? "").chat)
      return c.json({ error: "Only Claude sessions can be continued in chat" }, 400);
    // A new chat starts in full control unless another mode was picked (plan.md 19.8).
    const mode = MODES.find((m) => m === body.mode) ?? "full";
    if (body.focus === "reverse" && body.authorized !== true)
      return c.json({ error: "Confirm that you own the software or may examine it" }, 400);
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
    const untrusted = untrustedIn(store, project.id, project.path);
    try {
      const started = chats.start({
        projectId: project.id,
        untrusted,
        richUi: richUi?.(),
        ...goOn,
        cwd: worktree ? workFolder(worktree) : (goOn.cwd ?? project.path),
        worktree,
        title: session?.title ?? undefined,
        history: body.resume ? historyEvents(store.sessionDetail(body.resume, 120)?.messages ?? []) : undefined,
        // A persona's own chat works alone; other chats can hand work to the experts.
        agents: as ? undefined : subagents?.(project.id),
        model:
          typeof body.model === "string" && /^[\w.[\]-]+$/.test(body.model) ? body.model : (as?.model ?? undefined),
        mode,
        persona: as?.start,
        ...(body.focus === "reverse" ? { focus: "reverse" as const } : {}),
        igrekMcp,
        ...(() => {
          const picked = !session && body.accountId ? accounts.get(body.accountId) : undefined;
          const chosen = picked?.provider === "claude" ? picked : account(project.id, session?.account_id);
          return { accountId: chosen?.id, env: accounts.env(chosen) };
        })(),
      });
      // Messages queued in the chat this one continues (before a restart) come along.
      if (goOn.resume) chats.restoreQueue(started.id, history.takeQueue(goOn.resume));
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
    // The conversation so far stays on screen in the restarted chat.
    const before = chats.snapshot(info.id)?.events;
    chats.close(info.id);
    const root = store.projectRow(info.projectId)?.path ?? info.cwd;
    return c.json(
      chats.start({
        projectId: info.projectId,
        untrusted: untrustedIn(store, info.projectId, root),
        cwd: info.cwd,
        title: info.title,
        resume: info.sessionId,
        history: before,
        model: body.model,
        mode: info.mode,
        persona: info.persona && persona ? persona(info.persona.id, info.projectId)?.start : undefined,
        igrekMcp,
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
  | { op: "mode"; mode: ChatMode }
  | { op: "hideOnce"; found: unknown };

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
    else if (msg.op === "hideOnce") chats.hideOnce(id, cleanFound(msg.found));
  } catch (err) {
    return (err as Error).message;
  }
  return undefined;
}

/** Text or not: a NUL byte near the start means a binary file, which gets no line diff. */
const isBinary = (bytes: Buffer) => bytes.subarray(0, 8000).includes(0);

/**
 * The files a chat changed (plan.md 2.2): everything that differs from the checkpoint taken
 * before its first message, whichever tool made the change, with the diff and a one-file undo.
 */
function registerChatChanges(app: Hono, chats: Chats): void {
  const base = (id: string) => {
    const snap = chats.snapshot(id);
    const first = snap?.events.find((e) => e.kind === "checkpoint");
    return snap && first?.kind === "checkpoint" ? { info: snap.info, checkpointId: first.checkpointId } : undefined;
  };
  app.get("/api/chats/:id/changes", (c) => {
    const found = base(c.req.param("id"));
    if (!found) return c.json({ files: [] });
    try {
      return c.json({ checkpointId: found.checkpointId, files: checkpointChanges(found.info.cwd, found.checkpointId) });
    } catch {
      return c.json({ files: [] });
    }
  });
  app.get("/api/chats/:id/changes/diff", (c) => {
    const found = base(c.req.param("id"));
    const path = c.req.query("path") ?? "";
    // Only paths inside the chat's folder, as git names them.
    if (!found || !path || isAbsolute(path) || path.split(/[\\/]/).includes(".."))
      return c.json({ error: "Not found" }, 404);
    const before = checkpointFile(found.info.cwd, found.checkpointId, path);
    const full = join(found.info.cwd, path);
    const now = existsSync(full) ? readFileSync(full) : undefined;
    const binary = (before && isBinary(before)) || (now && isBinary(now));
    return c.json({
      original: binary ? "" : (before?.toString("utf8") ?? ""),
      modified: binary ? "" : (now?.toString("utf8") ?? ""),
      binary: !!binary,
      added: before === undefined,
      deleted: now === undefined,
    });
  });
  app.post("/api/chats/:id/changes/revert", async (c) => {
    const found = base(c.req.param("id"));
    if (!found) return c.json({ error: "This chat has no checkpoint to go back to" }, 404);
    if (found.info.status === "working" || found.info.status === "waiting")
      return c.json({ error: "The AI is working in this chat; stop it first" }, 409);
    const body = (await c.req.json().catch(() => ({}))) as { path?: unknown };
    const path = typeof body.path === "string" ? body.path : "";
    const result = restoreCheckpointFile(found.info.cwd, found.checkpointId, path);
    return result.ok ? c.json(result) : c.json({ error: result.error }, 409);
  });
}

/**
 * A chat's own to-do list. It belongs to the conversation (its session id), so a chat continued
 * after a restart, or opened from the recent list, shows the same list.
 */
function registerChatTodos(app: Hono, chats: Chats, history: ChatHistory, todos: ChatTodos): void {
  const keyOf = (id: string) => {
    const live = chats.get(id);
    const session = live?.sessionId || history.get(id)?.sessionId;
    if (session) {
      todos.adopt(`chat:${id}`, session);
      return session;
    }
    return live ? `chat:${id}` : undefined;
  };
  // The AI's plan steps land on the list too (a user asked whether it fills itself).
  chats.onPlan = (id, plan) => {
    const key = keyOf(id);
    if (key) todos.fromPlan(key, plan);
  };
  const withKey = (id: string, run: (key: string) => unknown) => {
    const key = keyOf(id);
    if (!key) return Response.json({ error: "Chat not found" }, { status: 404 });
    try {
      return Response.json(run(key));
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400 });
    }
  };
  app.get("/api/chats/:id/todos", (c) => withKey(c.req.param("id"), (key) => todos.list(key)));
  app.post("/api/chats/:id/todos", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
    return withKey(c.req.param("id"), (key) => todos.add(key, typeof body.text === "string" ? body.text : ""));
  });
  app.patch("/api/chats/:id/todos/:todo", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { done?: unknown; text?: unknown };
    return withKey(c.req.param("id"), (key) =>
      todos.update(key, c.req.param("todo"), {
        done: typeof body.done === "boolean" ? body.done : undefined,
        text: typeof body.text === "string" ? body.text : undefined,
      }),
    );
  });
  app.delete("/api/chats/:id/todos/:todo", (c) =>
    withKey(c.req.param("id"), (key) => todos.remove(key, c.req.param("todo"))),
  );
}
