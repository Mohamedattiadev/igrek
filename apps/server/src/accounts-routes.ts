import type { Database } from "bun:sqlite";
import { homedir } from "node:os";
import type { AiTool } from "@godeye/core";
import type { Hono } from "hono";
import type { Accounts } from "./accounts";
import { limitAlerts, limitsOverview } from "./limits";
import type { Terminals } from "./terminals";

const PROVIDERS: AiTool[] = ["claude", "codex"];

/** Accounts and Limits pages (plan.md Faz 3). */
export function registerAccountRoutes(
  app: Hono,
  { accounts, terminals, db }: { accounts: Accounts; terminals: Terminals; db: Database },
): void {
  app.get("/api/accounts", (c) => c.json(accounts.list()));

  app.post("/api/accounts", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { provider?: string; label?: string };
    const provider = PROVIDERS.find((p) => p === body.provider);
    if (!provider) return c.json({ error: "Choose Claude or Codex" }, 400);
    try {
      return c.json(accounts.add(provider, body.label ?? ""));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Opens a terminal running the tool's login inside this account's folder.
  app.post("/api/accounts/:id/login", (c) => {
    const account = accounts.get(c.req.param("id"));
    if (!account) return c.json({ error: "Account not found" }, 404);
    const [tool, ...args] = accounts.loginCommand(account);
    try {
      return c.json(
        terminals.start({
          projectId: `account:${account.id}`,
          cwd: homedir(),
          tool: tool === "codex" ? "codex" : "claude",
          title: `Login · ${account.label}`,
          args,
          env: accounts.env(account),
        }),
      );
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.post("/api/accounts/:id/refresh", async (c) => {
    const account = await accounts.refresh(c.req.param("id"));
    return account ? c.json(account) : c.json({ error: "Account not found" }, 404);
  });

  app.post("/api/accounts/:id/activate", (c) => {
    try {
      accounts.setActive(c.req.param("id"));
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  app.patch("/api/accounts/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { label?: string };
    if (body.label?.trim()) accounts.rename(c.req.param("id"), body.label);
    return c.json({ ok: true });
  });

  app.delete("/api/accounts/:id", (c) => {
    try {
      accounts.remove(c.req.param("id"));
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.put("/api/projects/:id/account", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { accountId?: string | null };
    accounts.setProjectAccount(c.req.param("id"), body.accountId ?? null);
    return c.json({ ok: true });
  });

  app.get("/api/limits", (c) => c.json(limitsOverview(db, accounts)));
  app.get("/api/limits/alerts", (c) => c.json(limitAlerts(accounts)));
}
