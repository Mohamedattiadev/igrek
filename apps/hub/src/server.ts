import type { ServerWebSocket } from "bun";
import { Hono } from "hono";
import { type Hub, type HubUser, type ProjectRole, ROLES, type Role } from "./hub";
import { mailText, type SendMail } from "./mail";

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

export function createHubServer(hub: Hub, options: { trustProxy?: boolean; mail?: SendMail; mailFrom?: string } = {}) {
  const app = new Hono<{ Variables: { auth: Ctx }; Bindings: BunServer }>();
  const logins = new RateLimiter(8, 60_000);
  const sockets = new Set<ServerWebSocket<SocketData>>();
  /** Latest encrypted presence per device, relayed but never stored. */
  const presence = new Map<
    string,
    { project: string; author: string; nonce: string; data: string; at: number; epoch: number }
  >();

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
    const body = (await c.req.json().catch(() => ({}))) as {
      username?: string;
      password?: string;
      device?: string;
      code?: string;
    };
    const result = await hub.login(body.username ?? "", body.password ?? "", body.device ?? "device", addr, body.code);
    if (!result) return c.json({ error: "Wrong username or password" }, 401);
    if ("needs2fa" in result)
      return c.json({ error: "Enter the 6-digit code from your authenticator app", needs2fa: true }, 401);
    return c.json({
      token: result.token,
      user: result.user,
      keyCheck: hub.keyCheck(0) ?? null,
      keyEpoch: hub.keyEpoch(),
      require2fa: hub.policies().require2fa,
    });
  });

  // Forgotten password: a code goes to the email on file. The answer is the same either way,
  // so nobody can probe which usernames exist.
  const resets = new RateLimiter(5, 15 * 60_000);
  app.post("/api/password-reset", async (c) => {
    if (!resets.allow(ip(c.req.raw, c.env))) return c.json({ error: "Too many attempts, wait a few minutes" }, 429);
    const body = (await c.req.json().catch(() => ({}))) as { login?: string };
    if (options.mail && body.login) {
      const started = await hub.startReset(body.login);
      if (started?.user.email) {
        const { subject, text } = mailText("code", started.user.language, {
          name: started.user.displayName,
          code: started.code,
        });
        await options.mail(started.user.email, subject, text).catch(() => undefined);
        hub.audit(started.user.id, "password-reset-requested", ip(c.req.raw, c.env));
      }
    }
    return c.json({ ok: true, email: !!options.mail });
  });
  app.post("/api/password-reset/confirm", async (c) => {
    const addr = ip(c.req.raw, c.env);
    if (!logins.allow(addr)) return c.json({ error: "Too many attempts, wait a minute" }, 429);
    const body = (await c.req.json().catch(() => ({}))) as { login?: string; code?: string; password?: string };
    try {
      const user = await hub.finishReset(body.login ?? "", body.code ?? "", body.password ?? "");
      if (!user) return c.json({ error: "That code is wrong or has expired" }, 400);
      hub.audit(user.id, "password-reset", addr);
      for (const ws of sockets) if (ws.data.user.id === user.id) ws.close(4001, "signed out");
      return c.json({ ok: true, username: user.username });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Everything below needs a device token.
  app.use("/api/*", async (c, next) => {
    const auth = hub.authenticate(c.req.header("authorization")?.replace(/^Bearer /, ""), ip(c.req.raw, c.env));
    if (!auth) return c.json({ error: "Not signed in" }, 401);
    c.set("auth", auth);
    return next();
  });
  const adminOnly = (c: { get: (k: "auth") => Ctx; json: (b: unknown, s?: number) => Response }) =>
    c.get("auth").user.role === "admin" ? undefined : c.json({ error: "Admins only" }, 403);

  app.get("/api/me", (c) =>
    c.json({
      user: c.get("auth").user,
      keyCheck: hub.keyCheck(0) ?? null,
      keyEpoch: hub.keyEpoch(),
      currentKeyCheck: hub.keyCheck() ?? null,
      require2fa: hub.policies().require2fa,
      minPassword: hub.policies().minPassword,
    }),
  );
  app.patch("/api/me", async (c) => {
    try {
      return c.json(
        hub.updateProfile(c.get("auth").user.id, (await c.req.json().catch(() => ({}))) as Record<string, unknown>),
      );
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Two-factor sign-in (TOTP).
  app.post("/api/2fa/start", (c) => c.json(hub.startTwoFactor(c.get("auth").user.id)));
  app.post("/api/2fa/confirm", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { code?: string };
    const ok = hub.confirmTwoFactor(c.get("auth").user.id, body.code ?? "");
    if (ok) hub.audit(c.get("auth").user.id, "2fa-enabled");
    return ok ? c.json({ ok: true }) : c.json({ error: "That code didn't match; try the next one" }, 400);
  });
  app.post("/api/2fa/disable", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { code?: string };
    if (hub.policies().require2fa) return c.json({ error: "Your team requires two-factor sign-in" }, 409);
    const ok = hub.disableTwoFactor(c.get("auth").user.id, body.code);
    if (ok) hub.audit(c.get("auth").user.id, "2fa-disabled");
    return ok ? c.json({ ok: true }) : c.json({ error: "That code didn't match" }, 400);
  });

  // Device keys: each device's public key, and the team key wrapped for it.
  app.post("/api/device-key", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { publicKey?: string };
    try {
      hub.setDeviceKey(c.get("auth").deviceHash, body.publicKey ?? "");
      notifyAdmins({ op: "key-request" });
      return c.json({ ok: true, keyEpoch: hub.keyEpoch() });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  app.get("/api/key-wraps", (c) => c.json({ keyEpoch: hub.keyEpoch(), wraps: hub.wrapsFor(c.get("auth").deviceHash) }));
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
        .map(({ id, username, displayName, role, avatar, language }) => ({
          id,
          username,
          displayName,
          role,
          avatar,
          language,
          lastSeen: hub.lastSeen(id),
        })),
    ),
  );

  /** Repairs a gap: one device's events, by chain position (plan.md 4.1). */
  app.get("/api/chain/:project", (c) => {
    const project = c.req.param("project");
    if (!/^[0-9a-f]{64}$/.test(project) || !hub.roleIn(c.get("auth").user, project))
      return c.json({ error: "Not found" }, 404);
    const from = Math.max(1, Number(c.req.query("from")) || 1);
    const to = Math.min(from + 499, Number(c.req.query("to")) || from);
    return c.json(hub.chain(project, String(c.req.query("device") ?? ""), from, to));
  });

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
      email?: string;
    };
    try {
      const user = await hub.createUser({
        username: body.username ?? "",
        password: body.password ?? "",
        displayName: body.displayName,
        email: body.email,
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
      email?: string;
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
  app.get("/api/admin/mail", (c) => adminOnly(c) ?? c.json({ configured: !!options.mail, from: options.mailFrom }));
  /** Sends an invite or a new sign-in code the admin's God Eye made (the hub only delivers it). */
  app.post("/api/admin/users/:id/email", async (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    if (!options.mail) return c.json({ error: "Email isn't set up on this hub (SMTP_HOST)" }, 400);
    const target = hub.user(c.req.param("id"));
    if (!target?.email) return c.json({ error: "This person has no email address" }, 400);
    const body = (await c.req.json().catch(() => ({}))) as { kind?: string; code?: string; team?: string };
    const kind = body.kind === "reset" ? "reset" : "invite";
    const code = String(body.code ?? "");
    if (!/^[A-Za-z0-9_-]{20,4000}$/.test(code)) return c.json({ error: "Invalid code" }, 400);
    const { subject, text } = mailText(kind, target.language, {
      name: target.displayName,
      from: c.get("auth").user.displayName,
      team: String(body.team ?? "").slice(0, 60),
      code,
    });
    try {
      await options.mail(target.email, subject, text);
    } catch (err) {
      return c.json({ error: `Couldn't send the email: ${(err as Error).message}` }, 502);
    }
    hub.audit(c.get("auth").user.id, `email-${kind}`, target.username);
    return c.json({ ok: true, to: target.email });
  });
  app.get("/api/admin/devices", (c) => adminOnly(c) ?? c.json(hub.devices()));
  app.delete("/api/admin/devices/:id", (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    hub.revokeDevice(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.get("/api/admin/audit", (c) => adminOnly(c) ?? c.json(hub.auditLog()));
  app.get("/api/admin/policies", (c) => adminOnly(c) ?? c.json(hub.policies()));
  app.put("/api/admin/policies", async (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    const next = hub.setPolicies((await c.req.json().catch(() => ({}))) as Record<string, never>);
    hub.audit(c.get("auth").user.id, "policies-changed", JSON.stringify(next));
    return c.json(next);
  });
  app.delete("/api/admin/users/:id/devices", (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    const id = c.req.param("id");
    const n = hub.signOutEverywhere(id);
    hub.audit(c.get("auth").user.id, "user-signed-out", `${hub.user(id)?.username}: ${n}`);
    for (const ws of sockets) if (ws.data.user.id === id) ws.close(4001, "signed out");
    return c.json({ ok: true, count: n });
  });
  app.delete("/api/admin/users/:id/2fa", (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    hub.disableTwoFactor(c.req.param("id"), undefined, true);
    hub.audit(c.get("auth").user.id, "2fa-cleared", hub.user(c.req.param("id"))?.username);
    return c.json({ ok: true });
  });
  app.get(
    "/api/admin/key-requests",
    (c) => adminOnly(c) ?? c.json({ keyEpoch: hub.keyEpoch(), requests: hub.keyRequests() }),
  );
  app.get("/api/admin/device-keys", (c) => adminOnly(c) ?? c.json(hub.activeDeviceKeys()));
  app.post("/api/admin/key-wraps", async (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as {
      wraps?: { deviceId: string; epoch: number; fromPublic: string; nonce: string; wrapped: string }[];
    };
    let stored = 0;
    for (const w of (body.wraps ?? []).slice(0, 500))
      if (hub.putWrap(w.deviceId, Number(w.epoch), String(w.fromPublic), String(w.nonce), String(w.wrapped))) stored++;
    if (stored) hub.audit(c.get("auth").user.id, "devices-approved", String(stored));
    for (const ws of sockets) ws.send(JSON.stringify({ op: "key-wraps" }));
    return c.json({ ok: true, stored });
  });
  app.post("/api/admin/key-rotate", async (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as { epoch?: number; keyCheck?: string };
    if (!hub.rotateKey(Number(body.epoch), String(body.keyCheck ?? "")))
      return c.json({ error: "Someone else changed the key; reload and try again" }, 409);
    hub.audit(c.get("auth").user.id, "key-rotated", String(body.epoch));
    return c.json({ ok: true, keyEpoch: hub.keyEpoch() });
  });
  app.get("/api/admin/access", (c) => adminOnly(c) ?? c.json(hub.access()));
  app.put("/api/admin/access", async (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as { project?: string; userId?: string; role?: string | null };
    try {
      hub.setAccess(body.project ?? "", body.userId ?? "", (body.role ?? null) as ProjectRole | null);
      hub.audit(
        c.get("auth").user.id,
        "access-changed",
        `${hub.user(body.userId ?? "")?.username}: ${body.role ?? "removed"}`,
      );
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  app.get("/api/admin/stats", (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    const mem = process.memoryUsage();
    return c.json({ ...hub.stats(), online: sockets.size, rssMb: Math.round(mem.rss / 1e6) });
  });

  app.get("/api/devices", (c) => c.json(hub.devices(c.get("auth").user.id)));
  // "Sign out everywhere else".
  app.delete("/api/devices", (c) => {
    const n = hub.signOutEverywhere(c.get("auth").user.id, c.get("auth").deviceHash);
    hub.audit(c.get("auth").user.id, "signed-out-everywhere", String(n));
    for (const ws of sockets)
      if (ws.data.user.id === c.get("auth").user.id && ws.data.device !== c.get("auth").deviceHash.slice(0, 16))
        ws.close(4001, "signed out");
    return c.json({ ok: true, count: n });
  });
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
  function notifyAdmins(message: unknown): void {
    const text = JSON.stringify(message);
    for (const ws of sockets) if (ws.data.user.role === "admin") ws.send(text);
  }
  hub.onAlert((alert) => notifyAdmins({ op: "alert", alert }));

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
        const auth = hub.authenticate(url.searchParams.get("token") ?? undefined, server.requestIP?.(req)?.address);
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
            // Projects with an access list are only for the people on it.
            if (!hub.roleIn(ws.data.user, project)) continue;
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
          if (hub.roleIn(ws.data.user, project) === "viewer") {
            ws.send(JSON.stringify({ op: "error", error: "Viewers can't share in this project" }));
            return;
          }
          const epoch = Number(msg.epoch ?? 0);
          if (!Number.isInteger(epoch) || epoch < 0 || epoch > hub.keyEpoch()) return;
          const n = msg.n === undefined ? null : Number(msg.n);
          const prev = msg.prev === undefined ? null : String(msg.prev);
          if ((n !== null && (!Number.isInteger(n) || n < 1)) || (prev !== null && !/^[0-9a-f]{0,64}$/.test(prev)))
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
            epoch,
            n,
            prev,
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
            epoch: Math.max(0, Math.min(hub.keyEpoch(), Number(msg.epoch ?? 0) || 0)),
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
