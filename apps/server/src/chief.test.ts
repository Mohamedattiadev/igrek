import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatEvent, ChatInfo, FlowRun } from "@igrek/core";
import type { Chats } from "./chats";
import { Chief, threadOf } from "./chief";

/** Just enough of Chats: chats that start, run and stop, and the events added to them. */
function fakeChats() {
  const infos = new Map<string, ChatInfo>();
  const added: [string, ChatEvent][] = [];
  const chats = {
    get: (id: string) => infos.get(id),
    attach: () => ({ detach: () => undefined }),
    addEvent: (id: string, event: ChatEvent) => added.push([id, event]),
    send: () => undefined,
    snapshot: () => undefined,
    answer: () => undefined,
  } as unknown as Chats;
  const start = (cwd: string, resume?: string): ChatInfo => {
    const info = {
      id: `chat-${infos.size + 1}`,
      projectId: "chief",
      cwd,
      title: "Chief",
      mode: "normal",
      status: "idle",
      startedAt: 1,
      focus: "chief",
      ...(resume ? { sessionId: resume } : {}),
    } as ChatInfo;
    infos.set(info.id, info);
    return info;
  };
  return { chats, infos, added, start };
}

const run = (status: FlowRun["status"], by?: "chief"): FlowRun =>
  ({ id: "r1", projectId: "p1", status, by, changes: [{ path: "a.ts", added: 1, removed: 0 }] }) as FlowRun;

describe("chief", () => {
  test("its folder tells Claude Code what it is and brings the notebook in", () => {
    const dir = mkdtempSync(join(tmpdir(), "chief-"));
    const { chats, start } = fakeChats();
    const chief = new Chief(dir, chats, start, () => "Shop");
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toContain("@NOTES.md");
    chief.setNotes("# What I remember\n\n- Prefers short answers\n");
    expect(chief.notes()).toContain("short answers");
  });

  test("one chat stays open; a stopped one continues its session", () => {
    const { chats, infos, start } = fakeChats();
    const chief = new Chief(mkdtempSync(join(tmpdir(), "chief-")), chats, start, () => "Shop");
    const first = chief.open();
    expect(chief.open().id).toBe(first.id);
    infos.set(first.id, { ...first, status: "exited", sessionId: "s-1" });
    const next = chief.open();
    expect(next.id).not.toBe(first.id);
    expect(next.sessionId).toBe("s-1");
  });

  test("a run it started reports its result once per state; other runs say nothing", () => {
    const { chats, added, start } = fakeChats();
    const chief = new Chief(mkdtempSync(join(tmpdir(), "chief-")), chats, start, () => "Shop");
    chief.onRun(run("ready"));
    chief.onRun(run("running", "chief"));
    chief.onRun(run("ready", "chief"));
    chief.onRun(run("ready", "chief"));
    expect(added.flatMap(([, e]) => (e.kind === "notice" ? [e.code, e.text] : []))).toEqual(["run", "r1|ready|Shop|1"]);
  });

  test("each project has its own thread, and a run reports to its project's thread", () => {
    const { chats, added, start } = fakeChats();
    const chief = new Chief(mkdtempSync(join(tmpdir(), "chief-")), chats, start, () => "Shop");
    const general = chief.open();
    const shop = chief.open("p1");
    expect(shop.id).not.toBe(general.id);
    expect(chief.open("p1").id).toBe(shop.id);
    expect(chief.list()).toEqual(["general", "p1"]);
    expect(chief.threadName("p1")).toBe("Shop");
    chief.onRun({ ...run("ready", "chief"), id: "r2" });
    expect(added.at(-1)?.[0]).toBe(shop.id);
  });

  test("what was started from the box is kept newest first, short, without private details", () => {
    const { chats, start } = fakeChats();
    const chief = new Chief(mkdtempSync(join(tmpdir(), "chief-")), chats, start, () => "Shop");
    chief.addStarted("Add a cart page", { chatId: "c1", projectId: "p1" });
    chief.addStarted("Maaşım 85.000 TL, IBAN TR33 0006 1005 1978 6457 8413 26 için bir dilekçe yaz", { chatId: "c2" });
    const [last, first] = chief.started();
    expect(first).toMatchObject({ text: "Add a cart page", chatId: "c1", projectId: "p1" });
    expect(last?.projectId).toBeUndefined();
    expect(last?.text).not.toContain("85.000");
    expect(last?.text).not.toContain("TR33");
    chief.addStarted("x".repeat(500), { chatId: "c3" });
    expect(chief.started()[0]?.text.length).toBe(160);
    chief.addStarted("Update React everywhere", { runs: ["r1", "r2"] });
    expect(chief.started()[0]).toMatchObject({ runs: ["r1", "r2"] });
    expect(chief.started()[0]?.chatId).toBeUndefined();
  });
});

describe("a server's own AI thread", () => {
  const find = {
    server: (id: string) => (id === "s1" ? { name: "prod-vps", target: "root@1.2.3.4", tag: "prod" } : undefined),
    project: (id: string) => (id === "p1" ? { id: "p1", name: "shop", path: "/work/shop" } : undefined),
  };
  test("stays on that server, runs through igrek_server_run, and says changes wait for approval", () => {
    const thread = threadOf("server:s1", find);
    expect(thread.title).toBe("prod-vps");
    expect(thread.note).toContain('igrek_server_run (server "prod-vps")');
    expect(thread.note).toContain("changes wait for the user's approval");
    expect(thread.note).toContain("PRODUCTION");
  });
  test("a project's thread and the general one are told apart; an unknown server is an error", () => {
    expect(threadOf("p1", find).title).toBe("shop");
    expect(threadOf(undefined, find)).toEqual({ title: "Chief" });
    expect(() => threadOf("server:gone", find)).toThrow("Server not found");
  });
});
