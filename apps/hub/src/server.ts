import { existsSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";
import type { ServerWebSocket } from "bun";
import { type Context, Hono } from "hono";
import { Calls } from "./calls";
import { type Hub, type HubUser, type ProjectRole, ROLES, type Role } from "./hub";
import { mailText, type SendMail } from "./mail";
import { Teams } from "./teams";

const MAX_EVENT_BYTES = 512 * 1024;
/** What a viewer (a client, an advisor) may still send (plan.md 20.6): words and marks, never work. */
const VIEWER_KINDS = new Set(["comment", "reaction", "seen", "org-post", "org-read"]);

type Ctx = { user: HubUser; deviceHash: string };
type HubEnv = { Variables: { auth: Ctx }; Bindings: BunServer };

interface SocketData {
  user: HubUser;
  device: string;
  projects: Set<string>;
  /** Meeting rooms it is in (calls.ts). */
  rooms?: Set<string>;
  /** A guest's socket: only this call's room. */
  guestRoom?: string;
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

export function createHubServer(
  hub: Hub,
  options: {
    trustProxy?: boolean;
    mail?: SendMail;
    mailFrom?: string;
    /** The built web app: the hub serves its web member page (plan.md 4.3) from here. */
    webDir?: string;
  } = {},
) {
  const app = new Hono<HubEnv>();
  const logins = new RateLimiter(8, 60_000);
  const sockets = new Set<ServerWebSocket<SocketData>>();
  // A name, picture or role changed: every open Igrek reloads the member list, so a rename shows
  // everywhere at once instead of with the next five-minute refresh.
  const membersChanged = () => {
    for (const ws of sockets) ws.send(JSON.stringify({ op: "members" }));
  };
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
    // API answers are never cached; the web page's own files say how long they keep.
    if (!c.res.headers.has("cache-control")) c.header("Cache-Control", "no-store");
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
      const updated = hub.updateProfile(
        c.get("auth").user.id,
        (await c.req.json().catch(() => ({}))) as Record<string, unknown>,
      );
      membersChanged();
      return c.json(updated);
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
  // A teammate's devices' public keys, so a direct message can be sealed for them alone
  // (plan.md 19.9): only their devices, and the sender's own, can open it; the hub cannot.
  app.get("/api/users/:id/device-keys", (c) => c.json(hub.deviceKeysOf(c.req.param("id"))));
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
        .map(({ id, username, displayName, role, avatar, language, generalManager }) => ({
          id,
          username,
          displayName,
          role,
          avatar,
          language,
          ...(generalManager ? { generalManager } : {}),
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

  // ---- meetings: one-time links for guests (plan.md 20.8) ---------------------------------
  const calls = new Calls(hub.db);
  app.post("/api/guest-links", async (c) => {
    if (c.get("auth").user.role === "viewer") return c.json({ error: "Viewers can't invite" }, 403);
    const body = (await c.req.json().catch(() => ({}))) as { room?: string; hours?: number };
    try {
      const token = calls.guestLink(String(body.room ?? ""), c.get("auth").user.id, Number(body.hours ?? 24));
      hub.audit(c.get("auth").user.id, "guest-link");
      return c.json({ token });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // ---- the company: teams and the general manager (plan.md 20.2) -------------------------
  const teams = new Teams(hub.db);
  const runsCompany = (u: HubUser) => u.role === "admin" || !!u.generalManager;
  /** Teams changed: everyone reloads them, and sockets drop the projects they may no longer read. */
  const orgChanged = () => {
    for (const ws of sockets) {
      for (const project of [...ws.data.projects])
        if (!hub.roleIn(hub.user(ws.data.user.id) ?? ws.data.user, project)) ws.data.projects.delete(project);
      ws.send(JSON.stringify({ op: "org" }));
    }
  };
  app.get("/api/org", (c) =>
    c.json({
      teams: teams.list(),
      generalManagers: hub
        .users()
        .filter((u) => u.generalManager && !u.disabled)
        .map((u) => u.id),
    }),
  );
  app.post("/api/org/teams", async (c) => {
    if (!runsCompany(c.get("auth").user)) return c.json({ error: "Only the general manager or an admin" }, 403);
    try {
      const team = teams.create((await c.req.json().catch(() => ({}))) as Record<string, unknown>);
      hub.audit(c.get("auth").user.id, "team-created", team.name);
      orgChanged();
      return c.json(team);
    } catch (err) {
      const message = (err as Error).message.includes("UNIQUE") ? "A team has that name" : (err as Error).message;
      return c.json({ error: message }, 400);
    }
  });
  app.patch("/api/org/teams/:id", async (c) => {
    if (!runsCompany(c.get("auth").user)) return c.json({ error: "Only the general manager or an admin" }, 403);
    try {
      const team = teams.update(c.req.param("id"), (await c.req.json().catch(() => ({}))) as Record<string, unknown>);
      hub.audit(c.get("auth").user.id, "team-updated", team.name);
      orgChanged();
      return c.json(team);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  app.delete("/api/org/teams/:id", (c) => {
    if (!runsCompany(c.get("auth").user)) return c.json({ error: "Only the general manager or an admin" }, 403);
    const team = teams.get(c.req.param("id"));
    teams.remove(c.req.param("id"));
    hub.audit(c.get("auth").user.id, "team-removed", team?.name);
    orgChanged();
    return c.json({ ok: true });
  });
  // The team's lead may add and remove its people too; projects stay with the general manager and admins.
  const memberRoute = (on: boolean) => (c: Context<HubEnv>) => {
    const me = c.get("auth").user;
    const id = c.req.param("id") ?? "";
    if (!runsCompany(me) && !teams.leads(id, me.id))
      return c.json({ error: "Only the lead or the general manager" }, 403);
    try {
      if (on) teams.addMember(id, c.req.param("user") ?? "");
      else teams.removeMember(id, c.req.param("user") ?? "");
      hub.audit(
        me.id,
        on ? "team-member-added" : "team-member-removed",
        `${teams.get(id)?.name}: ${hub.user(c.req.param("user") ?? "")?.username}`,
      );
      orgChanged();
      return c.json(teams.get(id));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  };
  app.put("/api/org/teams/:id/members/:user", memberRoute(true));
  app.delete("/api/org/teams/:id/members/:user", memberRoute(false));
  const projectRoute = (on: boolean) => (c: Context<HubEnv>) => {
    if (!runsCompany(c.get("auth").user)) return c.json({ error: "Only the general manager or an admin" }, 403);
    try {
      teams.setProject(c.req.param("id") ?? "", c.req.param("project") ?? "", on);
      hub.audit(
        c.get("auth").user.id,
        on ? "team-project-added" : "team-project-removed",
        teams.get(c.req.param("id") ?? "")?.name,
      );
      orgChanged();
      return c.json(teams.get(c.req.param("id") ?? ""));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  };
  app.put("/api/org/teams/:id/projects/:project", projectRoute(true));
  app.delete("/api/org/teams/:id/projects/:project", projectRoute(false));

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
      generalManager?: boolean;
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
      membersChanged();
      if (body.generalManager !== undefined) orgChanged();
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
  /** Sends an invite or a new sign-in code the admin's Igrek made (the hub only delivers it). */
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
  app.get(
    "/api/admin/audit",
    (c) => adminOnly(c) ?? c.json(hub.auditLog(Math.min(Math.max(Number(c.req.query("limit")) || 200, 1), 2000))),
  );
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

  // ---- the web member's page -----------------------------------------------------------
  // Only the page and its files; everything it shows comes over the API, still encrypted.
  if (options.webDir) {
    const root = resolve(options.webDir);
    // The page decrypts the team's work, so nothing but its own files may run or be reached.
    // Pictures and voice messages are decrypted into blob: addresses in the page itself.
    const csp =
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
    app.get("*", (c) => {
      const path = normalize(join(root, decodeURIComponent(c.req.path)));
      // Its own files, and the whiteboard's fonts (meetings, plan.md 20.8).
      const asset =
        (path.startsWith(join(root, "assets") + sep) || path.startsWith(join(root, "excalidraw") + sep)) &&
        existsSync(path);
      const file = asset ? path : join(root, "member.html");
      if (!existsSync(file)) return c.text("The web member page is not built into this hub.", 404);
      return new Response(Bun.file(file), {
        headers: {
          "content-security-policy": csp,
          "x-frame-options": "DENY",
          "cache-control": asset ? "public, max-age=31536000, immutable" : "no-cache",
          ...(asset ? {} : { "content-type": "text/html; charset=utf-8" }),
        },
      });
    });
  }

  // ---- realtime ----------------------------------------------------------------------
  const broadcast = (project: string, message: unknown, except?: ServerWebSocket<SocketData>) => {
    const text = JSON.stringify(message);
    for (const ws of sockets) if (ws !== except && ws.data.projects.has(project)) ws.send(text);
  };
  const onlineList = () => [...new Set([...sockets].filter((ws) => !ws.data.guestRoom).map((ws) => ws.data.user.id))];
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
      if (url.pathname === "/ws" && url.searchParams.has("guest")) {
        // A guest's link: a socket for that one call, with a made-up name and nothing else.
        const room = calls.guestRoom(url.searchParams.get("guest"));
        if (!room) return new Response("This link has expired", { status: 401 });
        const id = `guest:${crypto.randomUUID().slice(0, 8)}`;
        const user = {
          id,
          username: id,
          displayName: "guest",
          role: "viewer",
          disabled: false,
          createdAt: Date.now(),
          mustChangePassword: false,
          twoFactor: false,
        } as HubUser;
        const ok = server.upgrade(req, { data: { user, device: id, projects: new Set(), guestRoom: room } });
        return ok ? undefined : new Response("Upgrade failed", { status: 400 });
      }
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
        if (calls.handle(ws, msg)) return;
        // A guest may do nothing but take part in their call.
        if (ws.data.guestRoom) return;
        if (msg.op === "sub" && Array.isArray(msg.projects)) {
          const since = (msg.since ?? {}) as Record<string, number>;
          for (const project of msg.projects
            .filter((p): p is string => typeof p === "string" && /^[0-9a-f]{64}$/.test(p))
            .slice(0, 500)) {
            // Projects with an access list are only for the people on it.
            if (!hub.roleIn(ws.data.user, project)) continue;
            // What the general manager opened is on the record (plan.md 20.6), once per connection.
            if (ws.data.user.generalManager && ws.data.user.role !== "admin" && !ws.data.projects.has(project))
              hub.audit(ws.data.user.id, "project-opened", project.slice(0, 16));
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
          if (ws.data.user.role === "viewer" && !VIEWER_KINDS.has(String(msg.kind))) {
            ws.send(JSON.stringify({ op: "error", error: "Viewers can't share" }));
            return;
          }
          const project = String(msg.project ?? "");
          const data = String(msg.data ?? "");
          if (!/^[0-9a-f]{64}$/.test(project) || data.length > MAX_EVENT_BYTES || !ws.data.projects.has(project))
            return;
          if (hub.roleIn(ws.data.user, project) === "viewer" && !VIEWER_KINDS.has(String(msg.kind))) {
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
        calls.gone(ws);
        for (const key of [...presence.keys()]) if (key.startsWith(`${ws.data.device}:`)) presence.delete(key);
        const text = JSON.stringify({ op: "online", users: onlineList() });
        for (const other of sockets) other.send(text);
      },
    },
  };
}
