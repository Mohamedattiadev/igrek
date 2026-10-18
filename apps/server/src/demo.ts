import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Board } from "./board";
import type { Docs } from "./docs";
import type { Store } from "./store";

/** The demo's files, commit by commit, so its history looks like a real project. */
const COMMITS: { message: string; daysAgo: number; files: Record<string, string> }[] = [
  {
    message: "Start the todo API",
    daysAgo: 6,
    files: {
      "README.md": `# Todo API (Igrek demo)

A small todo list API to try Igrek safely. Nothing here talks to the internet.

Run it with \`bun src/server.ts\` and open http://localhost:3456/todos. Tests: \`bun test\`.
`,
      "package.json": `${JSON.stringify({ name: "igrek-demo", private: true, type: "module", scripts: { start: "bun src/server.ts", test: "bun test" } }, null, 2)}\n`,
      ".gitignore": "node_modules\n.env\n",
      "src/todos.ts": `export interface Todo {
  id: number;
  title: string;
  done: boolean;
  due?: string;
}

const todos: Todo[] = [];
let next = 1;

export function list(): Todo[] {
  return todos;
}

export function add(title: string, due?: string): Todo {
  const todo = { id: next++, title, done: false, ...(due ? { due } : {}) };
  todos.push(todo);
  return todo;
}
`,
      "src/server.ts": `import { add, list } from "./todos";

Bun.serve({
  port: 3456,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/todos" && req.method === "GET") return Response.json(list());
    if (url.pathname === "/todos" && req.method === "POST") {
      const body = (await req.json()) as { title?: string; due?: string };
      return Response.json(add(String(body.title), body.due), { status: 201 });
    }
    return new Response("Not found", { status: 404 });
  },
});
console.log("Todo API on http://localhost:3456");
`,
    },
  },
  {
    message: "Mark todos as done",
    daysAgo: 4,
    files: {
      "src/todos.ts": `export interface Todo {
  id: number;
  title: string;
  done: boolean;
  due?: string;
}

const todos: Todo[] = [];
let next = 1;

export function list(): Todo[] {
  return todos;
}

export function add(title: string, due?: string): Todo {
  const todo = { id: next++, title, done: false, ...(due ? { due } : {}) };
  todos.push(todo);
  return todo;
}

/** Marks a todo as done. (Left for Igrek to find: an unknown id crashes instead of saying so.) */
export function done(id: number): Todo {
  const todo = todos.find((t) => t.id === id) as Todo;
  todo.done = true;
  return todo;
}
`,
    },
  },
  {
    message: "Add tests",
    daysAgo: 2,
    files: {
      "src/todos.test.ts": `import { expect, test } from "bun:test";
import { add, done, list } from "./todos";

test("a new todo is not done", () => {
  const t = add("Buy milk");
  expect(t.done).toBe(false);
  expect(list()).toContainEqual(t);
});

test("done marks it", () => {
  const t = add("Write report");
  expect(done(t.id).done).toBe(true);
});
`,
    },
  },
];

function git(cwd: string, args: string[], env: Record<string, string> = {}): void {
  const p = Bun.spawnSync(["git", "-C", cwd, ...args], {
    stdout: "ignore",
    stderr: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Igrek Demo",
      GIT_AUTHOR_EMAIL: "demo@igrek.local",
      GIT_COMMITTER_NAME: "Igrek Demo",
      GIT_COMMITTER_EMAIL: "demo@igrek.local",
      ...env,
    },
  });
  if (p.exitCode !== 0) throw new Error(p.stderr.toString().trim().slice(0, 200) || "git failed");
}

/**
 * The demo project (plan.md 13.6): a small todo API with a short history, a bug left on purpose,
 * a wiki page with a diagram, board cards, a milestone and a few memory items, so every part of
 * Igrek can be tried without touching real work. It never talks to the internet.
 */
export function createDemo(
  deps: {
    store: Store;
    docs: Docs;
    board: Board;
    addMilestone: (projectId: string, title: string, at: number) => void;
  },
  parent?: string,
  language = "en",
  home = homedir(),
): { projectId: string; path: string } {
  const tr = language === "tr";
  const base = resolve(parent?.trim() || join(home, "Projects"));
  if (!base.startsWith(home)) throw new Error("Pick a folder inside your home folder");
  let path = join(base, "igrek-demo");
  for (let n = 2; existsSync(path); n++) path = join(base, `igrek-demo-${n}`);
  mkdirSync(path, { recursive: true });
  git(path, ["init", "-q", "-b", "main"]);
  for (const c of COMMITS) {
    for (const [file, text] of Object.entries(c.files)) {
      mkdirSync(dirname(join(path, file)), { recursive: true });
      writeFileSync(join(path, file), text);
    }
    const date = new Date(Date.now() - c.daysAgo * 86_400_000).toISOString();
    git(path, ["add", "-A"]);
    git(path, ["commit", "-q", "-m", c.message], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  }
  const projectId = deps.store.addProject(path);
  deps.store.addMemory(
    projectId,
    "decision",
    tr
      ? "Demo için yapılacaklar bellekte tutuluyor; gerçek sürüm SQLite kullanır."
      : "Todos are kept in memory for the demo; a real version would use SQLite.",
  );
  deps.store.addMemory(
    projectId,
    "convention",
    tr
      ? "src/todos.ts içindeki her fonksiyonun src/todos.test.ts içinde testi var."
      : "Every function in src/todos.ts has a test in src/todos.test.ts.",
  );
  deps.store.addMemory(
    projectId,
    "issue",
    tr
      ? "done() bilinmeyen bir id ile 404 dönmek yerine çöküyor."
      : "done() with an unknown id crashes instead of answering 404.",
  );
  const start = tr ? "Başlarken" : "Getting started";
  deps.docs.savePage(projectId, {
    title: tr ? "Mimari" : "Architecture",
    body: `# ${tr ? "Mimari" : "Architecture"}\n\n\`\`\`mermaid\nflowchart LR\n  C[Client] -->|HTTP| S[server.ts]\n  S --> T[todos.ts]\n\`\`\`\n\n${tr ? "Sunucu sadece yönlendirir; listeyi `todos.ts` tutar. Bkz." : "The server only routes; `todos.ts` keeps the list. See"} [[${start}]].`,
  });
  deps.docs.savePage(projectId, {
    title: start,
    body: tr
      ? "`bun src/server.ts` çalıştır, sonra `curl localhost:3456/todos`. Testler: `bun test`."
      : "Run `bun src/server.ts`, then `curl localhost:3456/todos`. Tests: `bun test`.",
  });
  deps.board.add({
    projectId,
    title: tr ? "Bilinmeyen id için 404 dön" : "Answer 404 when a todo id doesn't exist",
    description: tr ? "done() bilinmeyen id ile çöküyor." : "done() crashes on an unknown id.",
    origin: "demo",
  });
  deps.board.add({
    projectId,
    title: tr ? "Son tarihi doğrula" : "Validate the due date",
    description: tr ? "YYYY-MM-DD olmayan tarihleri reddet." : "Reject dates that aren't YYYY-MM-DD.",
    origin: "demo",
  });
  deps.board.add({ projectId, title: tr ? "Yapılacak silme" : "Delete a todo", origin: "demo" });
  deps.addMilestone(projectId, "Demo v1", Date.now() + 10 * 86_400_000);
  return { projectId, path };
}
