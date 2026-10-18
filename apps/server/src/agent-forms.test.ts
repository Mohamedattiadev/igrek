import { describe, expect, test } from "bun:test";
import { checkAnswers, formFields } from "@igrek/core";
import { AgentRequests } from "./agent-requests";
import type { EnvFiles } from "./envfiles";
import type { Personas } from "./personas";
import type { Store } from "./store";
import type { Vault } from "./vault";

const schema = {
  type: "object",
  properties: {
    db: { type: "string", title: "Database", enum: ["postgres", "sqlite"] },
    users: { type: "integer", title: "Users", minimum: 1, maximum: 1000 },
    auth: { type: "boolean", title: "Login needed", default: true },
    notes: { type: "string", maxLength: 2000 },
    nested: { type: "object", properties: {} },
    list: { type: "array" },
  },
  required: ["db", "users"],
};

describe("agent forms", () => {
  test("keeps only the flat field types MCP elicitation allows", () => {
    const fields = formFields(schema);
    expect(fields.map((f) => f.key)).toEqual(["db", "users", "auth", "notes"]);
    expect(fields[0]).toMatchObject({ label: "Database", options: ["postgres", "sqlite"], required: true });
    expect(fields[2]?.default).toBe(true);
    expect(fields[3]?.multiline).toBe(true);
    expect(() => formFields({ type: "object", properties: { x: { type: "array" } } })).toThrow();
  });

  test("answers are checked against the fields and extra keys are dropped", () => {
    const fields = formFields(schema);
    expect(checkAnswers(fields, { db: "sqlite", users: "12", auth: false, extra: "x" })).toEqual({
      db: "sqlite",
      users: 12,
      auth: false,
    });
    expect(() => checkAnswers(fields, { users: 3 })).toThrow("Database: required");
    expect(() => checkAnswers(fields, { db: "mysql", users: 3 })).toThrow();
    expect(() => checkAnswers(fields, { db: "sqlite", users: 2.5 })).toThrow();
    expect(() => checkAnswers(fields, { db: "sqlite", users: 5000 })).toThrow();
  });
});

describe("form requests", () => {
  const store = { knownProjectFor: () => "p1", projectRow: () => ({ name: "demo" }) } as unknown as Store;
  const requests = new AgentRequests(store, {} as Vault, {} as EnvFiles, {} as Personas);

  test("a form waits in the inbox until answered, then the agent reads checked answers", () => {
    const form = requests.askForm({ cwd: "/x", title: "Setup", schema });
    expect(requests.notices().some((n) => n.kind === "agentForm" && n.link === `/agent/form/${form.id}`)).toBe(true);
    expect(() => requests.answerForm(form.id, { users: 2 })).toThrow();
    requests.answerForm(form.id, { db: "postgres", users: 2 });
    expect(requests.form(form.id)).toMatchObject({ status: "answered", answers: { db: "postgres", users: 2 } });
    expect(requests.notices().some((n) => n.kind === "agentForm")).toBe(false);
    expect(() => requests.answerForm(form.id, null)).toThrow("no longer open");
  });
});
