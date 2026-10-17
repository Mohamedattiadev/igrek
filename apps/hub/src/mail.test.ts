import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hub } from "./hub";
import { mailFromEnv, mailText } from "./mail";
import { createHubServer } from "./server";

const hub = new Hub(join(mkdtempSync(join(tmpdir(), "godeye-mail-")), "hub.db"));
const sent: { to: string; subject: string; text: string }[] = [];
const handler = createHubServer(hub, {
  mail: async (to, subject, text) => {
    sent.push({ to, subject, text });
  },
});
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler.fetch, websocket: handler.websocket });
const url = `http://127.0.0.1:${server.port}`;
afterAll(() => server.stop(true));

const post = (path: string, body: unknown, token?: string) =>
  fetch(url + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

describe("email", () => {
  test("SMTP settings come from the environment; none means no email", () => {
    expect(mailFromEnv({})).toBeUndefined();
    expect(mailFromEnv({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_USER: "me@gmail.com" })).toMatchObject({
      secure: true,
      from: "me@gmail.com",
    });
    expect(mailFromEnv({ SMTP_HOST: "smtp.example.com" })).toMatchObject({ port: 587, secure: false });
  });

  test("messages are in the reader's language and a subject can't carry new lines", () => {
    expect(mailText("invite", "tr", { from: "Ayşe", team: "Shop", name: "Ali", code: "x" }).subject).toContain(
      "davet etti",
    );
    expect(mailText("invite", "de", { from: "A\r\nBcc: x", team: "", name: "", code: "" }).subject).not.toMatch(
      /[\r\n]/,
    );
  });

  test("an admin emails an invite code to a new member", async () => {
    await hub.createUser({ username: "boss", password: "boss-password-1", role: "admin", mustChange: false });
    const { token } = (await (await post("/api/login", { username: "boss", password: "boss-password-1" })).json()) as {
      token: string;
    };
    const created = (await (
      await post("/api/admin/users", { username: "ali", password: "temp-password-1", email: "ali@example.com" }, token)
    ).json()) as { id: string; email: string };
    expect(created.email).toBe("ali@example.com");
    const bad = await post("/api/admin/users", { username: "veli", password: "temp-password-1", email: "nope" }, token);
    expect(bad.status).toBe(400);

    const res = await post(`/api/admin/users/${created.id}/email`, { kind: "invite", code: "a".repeat(40) }, token);
    expect(res.status).toBe(200);
    expect(sent.at(-1)).toMatchObject({ to: "ali@example.com" });
    expect(sent.at(-1)?.text).toContain("a".repeat(40));
    // Teammates don't see each other's email.
    const members = (await (
      await fetch(`${url}/api/members`, { headers: { authorization: `Bearer ${token}` } })
    ).json()) as Record<string, unknown>[];
    expect(members.every((m) => !("email" in m))).toBe(true);
  });

  test("forgot password: a code by email, then a new password; unknown names look the same", async () => {
    const unknown = (await (await post("/api/password-reset", { login: "nobody" })).json()) as { ok: boolean };
    expect(unknown.ok).toBe(true);
    const before = sent.length;
    await post("/api/password-reset", { login: "ali@example.com" });
    expect(sent.length).toBe(before + 1);
    const code = sent.at(-1)?.text.match(/\n\n([A-Z2-9]{8})\n\n/)?.[1] ?? "";
    expect(code).toHaveLength(8);

    const wrong = await post("/api/password-reset/confirm", {
      login: "ali",
      code: "AAAAAAAA",
      password: "new-password-1",
    });
    expect(wrong.status).toBe(400);
    const ok = await post("/api/password-reset/confirm", { login: "ali", code, password: "new-password-1" });
    expect(ok.status).toBe(200);
    // One use only.
    const again = await post("/api/password-reset/confirm", { login: "ali", code, password: "new-password-2" });
    expect(again.status).toBe(400);
    const login = await post("/api/login", { username: "ali", password: "new-password-1" });
    expect(login.status).toBe(200);
  });
});
