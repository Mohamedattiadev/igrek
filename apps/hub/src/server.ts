import type { ServerWebSocket } from "bun";
import { Hono } from "hono";
import { type Hub, type HubUser, ROLES, type Role } from "./hub";

const MAX_EVENT_BYTES = 512 * 1024;

type Ctx = { user: HubUser; deviceHash: string };

interface SocketData {
  user: HubUser;
  device: string;
  projects: Set<string>;
}

/** Simple fixed-window limiter for login attempts per IP. */
class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}
  allow(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.reset < now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.max;
  }
}

type BunServer = { requestIP?: (r: Request) => { address: string } | null };

export function createHubServer(hub: Hub, options: { trustProxy?: boolean } = {}) {
  const app = new Hono<{ Variables: { auth: Ctx }; Bindings: BunServer }>();
  const logins = new RateLimiter(8, 60_000);
  const sockets = new Set<ServerWebSocket<SocketData>>();
  /** Latest encrypted presence per device, relayed but never stored. */
  const presence = new Map<string, { project: string; author: string; nonce: string; data: string; at: number }>();

  /** Client address; X-Forwarded-For is only believed behind a proxy we control (Caddy). */
  const ip = (req: Request, server?: BunServer) =>
    (options.trustProxy ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined) ??
    server?.requestIP?.(req)?.address ??
    "?";

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cache-Control", "no-store");
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/api/login", async (c) => {
    const addr = ip(c.req.raw, c.env);
    if (!logins.allow(addr)) return c.json({ error: "Too many attempts, wait a minute" }, 429);
    const body = (await c.req.json().catch(() => ({}))) as { username?: string; password?: string; device?: string };
    const result = await hub.login(body.username ?? "", body.password ?? "", body.device ?? "device", addr);
    if (!result) return c.json({ error: "Wrong username or password" }, 401);
    return c.json({ token: result.token, user: result.user, keyCheck: hub.keyCheck() ?? null });
  });

  // Everything below needs a device token.
  app.use("/api/*", async (c, next) => {
    const auth = hub.authenticate(c.req.header("authorization")?.replace(/^Bearer /, ""));
    if (!auth) return c.json({ error: "Not signed in" }, 401);
    c.set("auth", auth);
    await next();
  });
  const adminOnly = (c: { get: (k: "auth") => Ctx; json: (b: unknown, s?: number) => Response }) =>
    c.get("auth").user.role === "admin" ? undefined : c.json({ error: "Admins only" }, 403);

  app.get("/api/me", (c) => c.json({ user: c.get("auth").user, keyCheck: hub.keyCheck() ?? null }));
  app.post("/api/logout", (c) => {
    hub.logout(c.get("auth").deviceHash);
    return c.json({ ok: true });
  });
  app.post("/api/password", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { password?: string };
    try {
      await hub.setPassword(c.get("auth").user.id, body.password ?? "", false, c.get("auth").deviceHash);
      hub.audit(c.get("auth").user.id, "password-changed");
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  // The first admin to connect registers the team key's check value.
  app.post("/api/key-check", async (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as { value?: string };
    if (!body.value || !/^[0-9a-f]{64}$/.test(body.value)) return c.json({ error: "Invalid" }, 400);
    return hub.setKeyCheck(body.value) ? c.json({ ok: true }) : c.json({ error: "The team already has a key" }, 409);
  });

  app.get("/api/members", (c) =>
    c.json(
      hub
        .users()
        .filter((u) => !u.disabled)
        .map(({ id, username, displayName, role }) => ({ id, username, displayName, role })),
    ),
  );

  // ---- admin -------------------------------------------------------------------------
  app.get("/api/admin/users", (c) => adminOnly(c) ?? c.json(hub.users()));
  app.post("/api/admin/users", async (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as {
      username?: string;
      password?: string;
      displayName?: string;
      role?: string;
    };
    try {
      const user = await hub.createUser({
        username: body.username ?? "",
        password: body.password ?? "",
        displayName: body.displayName,
        role: (ROLES.includes(body.role as Role) ? body.role : "member") as Role,
      });
      hub.audit(c.get("auth").user.id, "user-created", user.username);
      return c.json(user);
    } catch (err) {
      const message = (err as Error).message.includes("UNIQUE") ? "That username is taken" : (err as Error).message;
      return c.json({ error: message }, 400);
    }
  });
  app.patch("/api/admin/users/:id", async (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      role?: string;
      disabled?: boolean;
      displayName?: string;
      password?: string;
    };
    // Never leave the hub without an active admin.
    const target = hub.user(id);
    if (
      target?.role === "admin" &&
      hub.adminCount() <= 1 &&
      (body.disabled === true || (body.role && body.role !== "admin"))
    ) {
      return c.json({ error: "Keep at least one admin" }, 409);
    }
    try {
      if (body.password) await hub.setPassword(id, body.password, true);
      hub.updateUser(id, body);
      hub.audit(c.get("auth").user.id, "user-updated", `${target?.username}: ${Object.keys(body).join(",")}`);
      if (body.disabled || body.password)
        for (const ws of sockets) if (ws.data.user.id === id) ws.close(4001, "signed out");
      return c.json(hub.user(id));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  app.delete("/api/admin/users/:id", (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    const id = c.req.param("id");
    const target = hub.user(id);
    if (target?.role === "admin" && hub.adminCount() <= 1) return c.json({ error: "Keep at least one admin" }, 409);
    hub.deleteUser(id);
    hub.audit(c.get("auth").user.id, "user-deleted", target?.username);
    for (const ws of sockets) if (ws.data.user.id === id) ws.close(4001, "removed");
    return c.json({ ok: true });
  });
  app.get("/api/admin/devices", (c) => adminOnly(c) ?? c.json(hub.devices()));
  app.delete("/api/admin/devices/:id", (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    hub.revokeDevice(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.get("/api/admin/audit", (c) => adminOnly(c) ?? c.json(hub.auditLog()));
  app.get("/api/admin/stats", (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    const mem = process.memoryUsage();
    return c.json({ ...hub.stats(), online: sockets.size, rssMb: Math.round(mem.rss / 1e6) });
  });

  app.get("/api/devices", (c) => c.json(hub.devices(c.get("auth").user.id)));
  app.delete("/api/devices/:id", (c) => {
    hub.revokeDevice(c.req.param("id"), c.get("auth").user.id);
    return c.json({ ok: true });
  });

  // ---- realtime ----------------------------------------------------------------------
  const broadcast = (project: string, message: unknown, except?: ServerWebSocket<SocketData>) => {
    const text = JSON.stringify(message);
    for (const ws of sockets) if (ws !== except && ws.data.projects.has(project)) ws.send(text);
  };
  const onlineList = () => [...new Set([...sockets].map((ws) => ws.data.user.id))];

  return {
    fetch(
      req: Request,
      server: {
        upgrade: (r: Request, o: { data: SocketData }) => boolean;
        requestIP?: (r: Request) => { address: string } | null;
      },
    ) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        const auth = hub.authenticate(url.searchParams.get("token") ?? undefined);
        if (!auth) return new Response("Not signed in", { status: 401 });
        const ok = server.upgrade(req, {
          data: { user: auth.user, device: auth.deviceHash.slice(0, 16), projects: new Set() },
        });
        return ok ? undefined : new Response("Upgrade failed", { status: 400 });
      }
      return app.fetch(req, server);
    },
    websocket: {
      maxPayloadLength: MAX_EVENT_BYTES * 2,
      open(ws: ServerWebSocket<SocketData>) {
        sockets.add(ws);
        const text = JSON.stringify({ op: "online", users: onlineList() });
        for (const other of sockets) other.send(text);
      },
      message(ws: ServerWebSocket<SocketData>, raw: string | Buffer) {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (msg.op === "sub" && Array.isArray(msg.projects)) {
          const since = (msg.since ?? {}) as Record<string, number>;
          for (const project of msg.projects
            .filter((p): p is string => typeof p === "string" && /^[0-9a-f]{64}$/.test(p))
            .slice(0, 500)) {
            ws.data.projects.add(project);
            let cursor = Number(since[project] ?? 0);
            for (;;) {
              const batch = hub.since(project, cursor);
              if (batch.length === 0) break;
              ws.send(JSON.stringify({ op: "events", project, events: batch }));
              cursor = batch.at(-1)?.seq ?? cursor;
              if (batch.length < 500) break;
            }
            for (const p of presence.values())
              if (p.project === project) ws.send(JSON.stringify({ op: "presence", ...p }));
          }
          return;
        }
        if (msg.op === "pub") {
          if (ws.data.user.role === "viewer") {
            ws.send(JSON.stringify({ op: "error", error: "Viewers can't share" }));
            return;
          }
          const project = String(msg.project ?? "");
          const data = String(msg.data ?? "");
          if (!/^[0-9a-f]{64}$/.test(project) || data.length > MAX_EVENT_BYTES || !ws.data.projects.has(project))
            return;
          const event = hub.append({
            project,
            kind: String(msg.kind ?? "event").slice(0, 32),
            author: ws.data.user.id,
            device: ws.data.device,
            id: String(msg.id ?? "").slice(0, 64),
            at: Date.now(),
            nonce: String(msg.nonce ?? "").slice(0, 64),
            data,
          });
          ws.send(JSON.stringify({ op: "ack", id: msg.id, seq: event?.seq ?? null }));
          if (event) broadcast(project, { op: "events", project, events: [event] }, ws);
          return;
        }
        if (msg.op === "presence") {
          const project = String(msg.project ?? "");
          if (!ws.data.projects.has(project)) return;
          const entry = {
            project,
            author: ws.data.user.id,
            nonce: String(msg.nonce ?? ""),
            data: String(msg.data ?? "").slice(0, 16_000),
            at: Date.now(),
          };
          presence.set(`${ws.data.device}:${project}`, entry);
          broadcast(project, { op: "presence", ...entry }, ws);
        }
      },
      close(ws: ServerWebSocket<SocketData>) {
        sockets.delete(ws);
        for (const key of [...presence.keys()]) if (key.startsWith(`${ws.data.device}:`)) presence.delete(key);
        const text = JSON.stringify({ op: "online", users: onlineList() });
        for (const other of sockets) other.send(text);
      },
    },
  };
}
