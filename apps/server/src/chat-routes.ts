import type { ChatMode } from "@godeye/core";
import type { Hono } from "hono";
import type { Accounts } from "./accounts";
import type { Chats } from "./chats";
import type { Store } from "./store";

const MODES: ChatMode[] = ["normal", "acceptEdits", "auto", "plan"];

export function registerChatRoutes(
  app: Hono,
  { chats, store, accounts }: { chats: Chats; store: Store; accounts: Accounts },
): void {
  const account = (projectId: string, sessionAccount?: string | null) =>
    (sessionAccount && accounts.get(sessionAccount)) || accounts.forProject("claude", projectId);
  app.get("/api/chats", (c) => c.json(chats.list()));

  app.post("/api/chats", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      projectId?: string;
      resume?: string;
      model?: string;
      mode?: string;
    };
    const project = body.projectId ? store.projectRow(body.projectId) : undefined;
    if (!project) return c.json({ error: "Project not found" }, 404);
    const session = body.resume ? store.sessionRow(body.resume) : undefined;
    if (body.resume && session?.tool !== "claude")
      return c.json({ error: "Only Claude sessions can be continued in chat" }, 400);
    try {
      return c.json(
        chats.start({
          projectId: project.id,
          cwd: session?.cwd ?? project.path,
          title: session?.title ?? undefined,
          resume: body.resume,
          model: typeof body.model === "string" && /^[\w.[\]-]+$/.test(body.model) ? body.model : undefined,
          mode: MODES.find((m) => m === body.mode),
          ...(() => {
            const chosen = account(project.id, session?.account_id);
            return { accountId: chosen?.id, env: accounts.env(chosen) };
          })(),
        }),
      );
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Switching model means restarting on the same saved session.
  app.post("/api/chats/:id/model", async (c) => {
    const info = chats.get(c.req.param("id"));
    const body = (await c.req.json().catch(() => ({}))) as { model?: string };
    if (!info?.sessionId) return c.json({ error: "Send a first message before switching model" }, 409);
    if (!body.model || !/^[\w.[\]-]+$/.test(body.model)) return c.json({ error: "Invalid model" }, 400);
    chats.close(info.id);
    return c.json(
      chats.start({
        projectId: info.projectId,
        cwd: info.cwd,
        title: info.title,
        resume: info.sessionId,
        model: body.model,
        mode: info.mode,
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
export type ChatClientMessage =
  | { op: "send"; text: string; images?: { mediaType: string; data: string }[] }
  | { op: "permission"; requestId: string; decision: "allow" | "deny" | "always"; message?: string }
  | { op: "interrupt" }
  | { op: "mode"; mode: ChatMode };

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
      chats.send(id, String(msg.text ?? "").slice(0, 100_000), images);
    } else if (msg.op === "permission") chats.answer(id, msg.requestId, msg.decision, msg.message);
    else if (msg.op === "interrupt") chats.interrupt(id);
    else if (msg.op === "mode" && MODES.includes(msg.mode)) chats.setMode(id, msg.mode);
  } catch (err) {
    return (err as Error).message;
  }
  return undefined;
}
