import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BUILTIN_PERSONAS,
  CATEGORIES,
  type ChatEvent,
  DEFAULT_SETTINGS,
  extractNotebook,
  personaForCategory,
  personaPrompt,
} from "@igrek/core";
import { Bus, StopRegistry } from "./bus";
import { Chats } from "./chats";
import { openDb } from "./db";
import { Meetings, pickTeam } from "./meetings";
import { connectPersonaChats } from "./persona-routes";
import { Personas, sanitizePersona } from "./personas";
import { Store } from "./store";

function setup() {
  const { sqlite } = openDb(":memory:");
  const store = new Store(sqlite);
  const dir = mkdtempSync(join(tmpdir(), "godeye-persona-"));
  const projectId = store.addProject(dir);
  const personas = new Personas(sqlite, store, new Bus(), new StopRegistry(), () => DEFAULT_SETTINGS, dir);
  return { sqlite, store, personas, projectId, dir };
}

describe("built-in personas", () => {
  test("every insight part has an owner and every persona has a full profile", () => {
    for (const category of CATEGORIES) expect(personaForCategory(category)).toBeDefined();
    const ids = new Set<string>();
    for (const p of BUILTIN_PERSONAS) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.profile.bio.length).toBeGreaterThan(40);
      expect(p.profile.timeline.length).toBeGreaterThanOrEqual(3);
      expect(p.profile.reading.length).toBeGreaterThanOrEqual(3);
      expect(p.profile.checklist.length).toBeGreaterThanOrEqual(3);
    }
    // plan.md 6.2: Security only reads.
    expect(BUILTIN_PERSONAS.find((p) => p.id === "security")?.tools).toBe("read");
  });

  test("the prompt carries the rules, the notebook and the reply language", () => {
    const security = BUILTIN_PERSONAS.find((p) => p.id === "security");
    if (!security) throw new Error("missing");
    const prompt = personaPrompt(security, {
      language: "Turkish",
      displayName: "Security",
      role: "Security engineer",
      opinions: [
        {
          id: "op-1",
          personaId: "security",
          projectId: null,
          claim: "Sessions need httpOnly cookies",
          reasoning: "XSS",
          evidence: "OWASP",
          confidence: "high",
          createdAt: Date.UTC(2026, 2, 3),
        },
      ],
      notebook: true,
    });
    expect(prompt).toContain("Change your mind only with new evidence");
    expect(prompt).toContain("[op-1] Mar 2026: Sessions need httpOnly cookies");
    expect(prompt).toContain("<notebook>");
    expect(prompt).toContain("reply in Turkish");
    expect(prompt).toContain("You only read and advise");
  });
});

describe("opinions notebook", () => {
  test("the block is cut out of the visible text", () => {
    const reply =
      'Use Postgres.\n<notebook>{"opinions":[{"claim":"Postgres fits","reasoning":"joins","evidence":"DDIA ch.2","confidence":"medium"}]}</notebook>';
    const { text, entries } = extractNotebook(reply);
    expect(text).toBe("Use Postgres.");
    expect(entries).toEqual([
      {
        claim: "Postgres fits",
        reasoning: "joins",
        evidence: "DDIA ch.2",
        confidence: "medium",
        replaces: undefined,
        changedBecause: undefined,
      },
    ]);
    expect(extractNotebook("<notebook>not json").text).toBe("");
  });

  test("a change of mind needs new evidence", () => {
    const { personas, projectId } = setup();
    const first = personas.record(
      "database",
      projectId,
      [{ claim: "SQLite is enough", reasoning: "one user", evidence: "sqlite.org/whentouse", confidence: "high" }],
      "test",
      Date.UTC(2026, 2, 1),
    );
    expect(first.saved).toHaveLength(1);
    const old = first.saved[0]?.id ?? "";
    // The same claim again is not a new opinion.
    expect(
      personas.record(
        "database",
        projectId,
        [{ claim: "SQLite is enough", reasoning: "", evidence: "", confidence: "low" }],
        "t",
      ).saved,
    ).toHaveLength(0);
    // No new evidence: rejected, the old opinion stays.
    const lazy = personas.record(
      "database",
      projectId,
      [
        {
          claim: "Use Postgres",
          reasoning: "feels better",
          evidence: "none",
          confidence: "low",
          replaces: old,
          changedBecause: "",
        },
      ],
      "t",
    );
    expect(lazy).toEqual({ saved: [], rejected: 1 });
    expect(personas.opinions("database", projectId).map((o) => o.claim)).toEqual(["SQLite is enough"]);
    // With new evidence: the new one replaces the old.
    const changed = personas.record(
      "database",
      projectId,
      [
        {
          claim: "Use Postgres",
          reasoning: "five writers now",
          evidence: "write lock errors in the logs",
          confidence: "high",
          replaces: old,
          changedBecause: "The team grew to five people writing at once",
        },
      ],
      "t",
    );
    expect(changed.saved).toHaveLength(1);
    expect(personas.opinions("database", projectId).map((o) => o.claim)).toEqual(["Use Postgres"]);
    const all = personas.opinions("database", projectId, true);
    expect(all.find((o) => o.id === old)?.replacedBy).toBe(changed.saved[0]?.id);
    // Deleting the new one brings the old one back.
    personas.deleteOpinion(changed.saved[0]?.id ?? "");
    expect(personas.opinions("database", projectId).map((o) => o.claim)).toEqual(["SQLite is enough"]);
  });
});

describe("persona definitions", () => {
  test("a built-in can be changed and reset; an own persona is checked", () => {
    const { personas } = setup();
    const edited = personas.save({ model: "haiku", maxTurns: 999, categories: ["security", "nope"] }, "security");
    expect(edited).toMatchObject({ id: "security", builtin: true, edited: true, model: "haiku", maxTurns: 200 });
    expect(edited.categories).toEqual(["security"]);
    personas.remove("security");
    expect(personas.get("security")?.edited).toBeUndefined();

    expect(() => sanitizePersona({ id: "Bad Id!" })).toThrow();
    const own = personas.save({
      id: "seo-expert",
      name: "SEO",
      role: "Search expert",
      tools: "edit",
      icon: "<script>",
    });
    expect(own).toMatchObject({ builtin: false, name: "SEO", icon: "UserRound", tools: "edit" });
    expect(() => personas.save({ id: "seo-expert" })).toThrow("already exists");
  });

  test("exports Claude Code agent files", () => {
    const { personas, projectId, dir } = setup();
    const files = personas.exportClaude(projectId, ["security", "frontend"]);
    expect(files).toEqual([".claude/agents/frontend.md", ".claude/agents/security.md"]);
    const security = readFileSync(join(dir, ".claude/agents/security.md"), "utf8");
    expect(security).toStartWith("---\nname: security\n");
    expect(security).toContain("tools: Read, Grep, Glob");
    expect(security).toContain("model: opus");
    // The notebook protocol only makes sense inside God Eye.
    expect(security).not.toContain("<notebook>");
    expect(readFileSync(join(dir, ".claude/agents/frontend.md"), "utf8")).not.toContain("tools:");
  });
});

describe("team meeting", () => {
  test("picks about five people, always with a devil's advocate", () => {
    const team = pickTeam(
      "Login sayfasına şifre sıfırlama ekleyelim mi? Güvenlik ve veritabanı nasıl olur?",
      BUILTIN_PERSONAS,
    );
    expect(team.length).toBe(5);
    expect(team).toContain("security");
    expect(team).toContain("database");
    expect(team).toContain("devils-advocate");
    expect(team).not.toContain("pm-lead");
  });

  test("asks everyone in parallel, writes a decision and saves it to memory", async () => {
    const { sqlite, store, personas, projectId, dir } = setup();
    const asked: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const meetings = new Meetings(
      sqlite,
      personas,
      store,
      new Bus(),
      new StopRegistry(),
      () => DEFAULT_SETTINGS,
      dir,
      async (prompt, _model, system) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await Bun.sleep(10);
        running--;
        asked.push(system.split(",")[0] ?? "");
        if (prompt.startsWith("You chaired"))
          return '{"decision":"Add reset by email","why":"Most agreed","agreements":["email"],"disagreements":[],"actions":["Write the token table"],"openQuestions":[],"confidence":"medium"}';
        if (prompt.startsWith("Find the weak points"))
          return '{"points":[{"point":"Email can fail","why":"spam","test":"send 10","severity":"major"}]}';
        return '{"view":"Fine","objections":[],"risks":["token leak"],"recommendation":"Short-lived tokens","confidence":"high"}\n<notebook>{"opinions":[{"claim":"Reset tokens expire in 15 minutes","reasoning":"limits leaks","evidence":"OWASP Forgot Password Cheat Sheet","confidence":"high"}]}</notebook>';
      },
    );
    const meeting = meetings.start({
      question: "Şifre sıfırlama ekleyelim mi?",
      projectId,
      personaIds: ["security", "backend", "qa"],
    });
    for (let i = 0; i < 100 && meetings.get(meeting.id)?.status !== "done"; i++) await Bun.sleep(10);
    const done = meetings.get(meeting.id);
    expect(done?.status).toBe("done");
    expect(done?.views.every((v) => v.status === "done" && v.risks?.[0] === "token leak")).toBe(true);
    expect(done?.decision?.decision).toBe("Add reset by email");
    expect(maxRunning).toBeGreaterThan(1);
    // The team lead wrote the decision.
    expect(asked.at(-1)).toContain("Team Lead");
    // Each persona's opinion went into its own notebook.
    expect(personas.opinions("security", projectId)[0]?.claim).toBe("Reset tokens expire in 15 minutes");

    const committed = meetings.commit(meeting.id);
    expect(committed.memoryId).toBeTruthy();
    expect(store.listMemory(projectId, false).some((m) => m.text.startsWith("Add reset by email"))).toBe(true);
    const weak = await meetings.meetingWeakPoints(meeting.id);
    expect(weak.weaknesses?.[0]).toMatchObject({ point: "Email can fail", severity: "major" });
  });
});

/** A stand-in `claude` that saves its arguments and answers with a notebook block. */
function fakeClaude(argsFile: string): string {
  const dir = mkdtempSync(join(tmpdir(), "godeye-fakeclaude-"));
  const script = `#!${process.execPath}
require("node:fs").writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
out({ type: "system", subtype: "init", session_id: "sess-p", model: "claude-test" });
for await (const chunk of Bun.stdin.stream()) {
  if (!new TextDecoder().decode(chunk).includes('"user"')) continue;
  const note = '<notebook>{"opinions":[{"claim":"Rate-limit the login","reasoning":"brute force","evidence":"OWASP ASVS 2.2.1","confidence":"high"},{"claim":"x","reasoning":"","evidence":"none","confidence":"low","replaces":"op-missing","changedBecause":"no"}]}</notebook>';
  out({ type: "assistant", message: { id: "m1", content: [{ type: "text", text: "Looks fine.\\n" + note }] } });
  out({ type: "result", subtype: "success", duration_ms: 5 });
}
`;
  writeFileSync(join(dir, "claude"), script);
  chmodSync(join(dir, "claude"), 0o755);
  return dir;
}

describe("persona chat", () => {
  test("runs with the persona's prompt, tools and turn limit, and fills its notebook", async () => {
    const { personas, projectId, dir, store } = setup();
    const argsFile = join(dir, "args.json");
    const bin = fakeClaude(argsFile);
    const chats = new Chats(new Bus(), new StopRegistry(), () => join(bin, "claude"));
    const start = connectPersonaChats(chats, personas, (s, p) => personas.linkSession(s, p));
    const as = start("security", projectId);
    if (!as) throw new Error("no persona");
    const info = chats.start({ projectId, cwd: dir, persona: as.start, model: as.model });
    expect(info.persona).toEqual({ id: "security", name: undefined, tools: "read" });
    const events = new Map<string, ChatEvent>();
    chats.attach(info.id, (op) => {
      if (op.op === "upsert") events.set(op.event.id, op.event);
    });
    chats.send(info.id, "Review the login");
    for (let i = 0; i < 200 && chats.get(info.id)?.status !== "idle"; i++) await Bun.sleep(10);
    await Bun.sleep(20);

    const args = JSON.parse(readFileSync(argsFile, "utf8")) as string[];
    expect(args[args.indexOf("--tools") + 1]).toBe("Read,Grep,Glob");
    expect(args).toContain("--strict-mcp-config");
    expect(args[args.indexOf("--max-turns") + 1]).toBe("25");
    expect(args[args.indexOf("--model") + 1]).toBe("opus");
    expect(args[args.indexOf("--append-system-prompt") + 1]).toContain("You only read and advise");

    const notices = [...events.values()].filter((e) => e.kind === "notice");
    expect(notices.map((n) => (n.kind === "notice" ? `${n.code}:${n.text}` : ""))).toEqual([
      "notebook:1",
      "notebookRejected:1",
    ]);
    expect(personas.opinions("security", projectId)[0]?.claim).toBe("Rate-limit the login");
    expect(store.sessionPersona("sess-p")).toBe("security");
    chats.stopAll();
  });
});

describe("meeting text", () => {
  test("a trailing confidence word is dropped from the texts", async () => {
    const { sqlite, store, personas, dir } = setup();
    const meetings = new Meetings(
      sqlite,
      personas,
      store,
      new Bus(),
      new StopRegistry(),
      () => DEFAULT_SETTINGS,
      dir,
      async (prompt) =>
        prompt.startsWith("You chaired")
          ? '{"decision":"Do it. Confidence: medium","why":"Because (Güven: yüksek)","agreements":[],"disagreements":[],"actions":[],"openQuestions":[],"confidence":"medium"}'
          : '{"view":"Fine. Confidence: high","objections":[],"risks":[],"recommendation":"Go","confidence":"high"}',
    );
    const m = meetings.start({ question: "Should we?", personaIds: ["qa"] });
    for (let i = 0; i < 100 && meetings.get(m.id)?.status !== "done"; i++) await Bun.sleep(5);
    const done = meetings.get(m.id);
    expect(done?.decision?.decision).toBe("Do it");
    expect(done?.decision?.why).toBe("Because");
    expect(done?.views[0]?.view).toBe("Fine");
  });
});
