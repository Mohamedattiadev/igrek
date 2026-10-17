import { randomBytes } from "node:crypto";
import type { ShareLevel } from "@godeye/core";
import type { Hono } from "hono";
import type { Store } from "./store";
import type { Sync } from "./sync/client";
import { encodeInvite } from "./sync/crypto";

const fail = (err: unknown) => ({ error: (err as Error).message });

/** Team page (plan.md Faz 4): connect, invite, admin panel, sharing, presence. */
export function registerTeamRoutes(app: Hono, sync: Sync, store: Store): void {
  app.get("/api/team", (c) => c.json(sync.status()));

  app.post("/api/team/connect", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      hub?: string;
      username?: string;
      password?: string;
      invite?: string;
      newPassword?: string;
      code?: string;
      recovery?: string;
    };
    try {
      return c.json(await sync.connect(body));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.post("/api/team/disconnect", async (c) => {
    await sync.me("/logout", { method: "POST" }).catch(() => undefined);
    sync.disconnect();
    return c.json({ ok: true });
  });

  /** Shown again on request, so an admin can store it somewhere safe. */
  app.get("/api/team/recovery-key", (c) => {
    const status = sync.status();
    if (status.user?.role !== "admin") return c.json({ error: "Admins only" }, 403);
    return c.json({ key: sync.recoveryKey() });
  });

  // Admin: create the account on the hub and hand back one code to send to the teammate.
  app.post("/api/team/invite", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      username?: string;
      displayName?: string;
      role?: string;
      password?: string;
    };
    const status = sync.status();
    const key = sync.teamKey();
    if (!status.hub || !key) return c.json({ error: "Connect to your team first" }, 400);
    const password = body.password || randomBytes(12).toString("base64url");
    try {
      const user = await sync.admin<{ id: string; username: string }>("/users", {
        method: "POST",
        body: JSON.stringify({ username: body.username, displayName: body.displayName, role: body.role, password }),
      });
      // No team key inside: the new device gets it once an admin approves it.
      return c.json({ user, invite: encodeInvite({ hub: status.hub, username: user.username, password }) });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  // Admin: new temporary password, handed over as a fresh invite code.
  app.post("/api/team/admin/users/:id/reset", async (c) => {
    const status = sync.status();
    const key = sync.teamKey();
    if (!status.hub || !key) return c.json({ error: "Connect to your team first" }, 400);
    const password = randomBytes(12).toString("base64url");
    try {
      const user = await sync.admin<{ id: string; username: string }>(
        `/users/${encodeURIComponent(c.req.param("id"))}`,
        {
          method: "PATCH",
          body: JSON.stringify({ password }),
        },
      );
      return c.json({ user, invite: encodeInvite({ hub: status.hub, username: user.username, password }) });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  // Device approval and key replacement (plan.md 4.2).
  app.get("/api/team/key-requests", async (c) => {
    try {
      return c.json(await sync.keyRequests());
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/team/key-requests/:device/approve", async (c) => {
    try {
      return c.json({ ok: true, keys: await sync.approveDevice(c.req.param("device")) });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/team/rotate-key", async (c) => {
    try {
      return c.json({ recoveryKey: await sync.rotateKey() });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.get("/api/team/alerts", (c) => c.json(sync.alerts));
  app.get("/api/team/projects", async (c) => c.json(await sync.projectKeys()));

  // Own account on the hub: profile, two-factor sign-in, signing out other devices.
  app.patch("/api/team/me", async (c) => {
    try {
      return c.json(
        await sync.me("/me", { method: "PATCH", body: JSON.stringify(await c.req.json().catch(() => ({}))) }),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/team/2fa/:step{start|confirm|disable}", async (c) => {
    try {
      return c.json(
        await sync.me(`/2fa/${c.req.param("step")}`, {
          method: "POST",
          body: JSON.stringify(await c.req.json().catch(() => ({}))),
        }),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/team/devices", async (c) => {
    try {
      return c.json(await sync.me("/devices", { method: "DELETE" }));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.get("/api/team/whoami", async (c) => {
    try {
      return c.json(await sync.me("/me"));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  // Admin pass-through. Only these paths, only these methods.
  const proxy = async (path: string, method: string, body?: unknown) => {
    const init: RequestInit = { method };
    if (body !== undefined) init.body = JSON.stringify(body);
    return sync.admin(path, init);
  };
  app.get("/api/team/admin/:what{users|devices|audit|stats|policies|access}", async (c) => {
    try {
      return c.json(await proxy(`/${c.req.param("what")}`, "GET"));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.put("/api/team/admin/:what{policies|access}", async (c) => {
    try {
      return c.json(await proxy(`/${c.req.param("what")}`, "PUT", await c.req.json().catch(() => ({}))));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/team/admin/users/:id/:what{devices|2fa}", async (c) => {
    try {
      return c.json(await proxy(`/users/${encodeURIComponent(c.req.param("id"))}/${c.req.param("what")}`, "DELETE"));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.patch("/api/team/admin/users/:id", async (c) => {
    try {
      return c.json(
        await proxy(`/users/${encodeURIComponent(c.req.param("id"))}`, "PATCH", await c.req.json().catch(() => ({}))),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/team/admin/:what{users|devices}/:id", async (c) => {
    try {
      return c.json(await proxy(`/${c.req.param("what")}/${encodeURIComponent(c.req.param("id"))}`, "DELETE"));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.patch("/api/sessions/:id/private", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { private?: boolean };
    const projectId = store.setSessionPrivate(c.req.param("id"), body.private === true);
    if (projectId && body.private) await sync.forgetSession(projectId, c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/api/projects/:id/share-preview", (c) => c.json(sync.preview(c.req.param("id"))));

  app.get("/api/team/presence", (c) => c.json(sync.presenceList(c.req.query("project") || undefined)));

  app.put("/api/projects/:id/share", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { share?: ShareLevel };
    try {
      sync.setShare(c.req.param("id"), body.share ?? "off");
      return c.json({ ok: true });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
}
