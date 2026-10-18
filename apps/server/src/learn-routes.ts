import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { languages } from "@igrek/i18n";
import { pick, STAGES, type Title, titleOf } from "@igrek/learn";
import type { Hono } from "hono";
import type { AppErrors } from "./apperrors";
import type { Environments } from "./environments";
import type { Flows } from "./flows";
import type { Insight } from "./insight";
import type { Learn } from "./learn";
import { stageChecks } from "./learn";
import type { Monitors } from "./monitors";
import type { Store } from "./store";

function languageName(code: string): string {
  return languages.find((l) => l.code === code)?.english ?? code;
}

function commits(path: string): number {
  const p = Bun.spawnSync(["git", "-C", path, "rev-list", "--count", "HEAD"], { stdout: "pipe", stderr: "ignore" });
  return p.exitCode === 0 ? Number(p.stdout.toString().trim()) || 0 : 0;
}

/** Built, packaged or containerized: something a deploy can take. */
function packaged(path: string): boolean {
  if (["Dockerfile", "compose.yaml", "docker-compose.yml", "Containerfile"].some((f) => existsSync(join(path, f))))
    return true;
  try {
    const pkg = JSON.parse(readFileSync(join(path, "package.json"), "utf8")) as { scripts?: Record<string, string> };
    if (pkg.scripts?.build) return true;
  } catch {
    // No package.json, or not valid JSON: not a Node build.
  }
  try {
    if (readFileSync(join(path, "pyproject.toml"), "utf8").includes("[build-system]")) return true;
  } catch {
    // No pyproject.toml: not a Python build.
  }
  return existsSync(join(path, "Cargo.toml")) || existsSync(join(path, "go.mod"));
}

export function registerLearnRoutes(
  hono: Hono,
  deps: {
    learn: Learn;
    store: Store;
    insight: Insight;
    environments: Environments;
    monitors: Monitors;
    errors: AppErrors;
    flows: Flows;
    language: () => string;
    home?: string;
  },
): void {
  const { learn, store } = deps;
  const lang = (c: { req: { query: (k: string) => string | undefined } }) => c.req.query("lang") || deps.language();
  /** Turkish and English titles are written; other languages use the cached translation, else English. */
  const served = <T extends { title: Title }>(doc: T, l: string, translation?: Record<string, string>) => ({
    ...doc,
    title: (l !== "en" && l !== "tr" && translation?.title) || titleOf(doc.title, l),
  });

  hono.get("/api/learn", (c) => c.json({ ...learn.index(lang(c)), state: learn.state(), errors: learn.errors.length }));
  hono.get("/api/sessions/:id/api-versions", (c) => {
    const session = store.sessionDetail(c.req.param("id"), 1);
    if (!session) return c.json({ error: "Not found" }, 404);
    const root = (session.projectId ? store.projectRow(session.projectId)?.path : undefined) ?? session.cwd;
    return c.json(root ? learn.apiCheck(root, session.filesTouched) : []);
  });
  hono.get("/api/learn/search", (c) => c.json(learn.search(c.req.query("q") ?? "", 40, lang(c))));
  hono.get("/api/learn/sheets/:id", (c) => {
    const sheet = learn.sheet(c.req.param("id"));
    if (!sheet) return c.json({ error: "Not found" }, 404);
    const l = lang(c);
    const translation = l === "en" || l === "tr" ? undefined : learn.translation("sheet", sheet.id, l);
    return c.json({ sheet: served(sheet, l, translation), translation });
  });
  hono.get("/api/learn/roadmaps/:id", (c) => {
    const roadmap = learn.roadmap(c.req.param("id"));
    if (!roadmap) return c.json({ error: "Not found" }, 404);
    const l = lang(c);
    const translation = l === "en" || l === "tr" ? undefined : learn.translation("roadmap", roadmap.id, l);
    return c.json({ roadmap: served(roadmap, l, translation), translation });
  });
  hono.post("/api/learn/translate", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { kind?: string; id?: string; lang?: string };
    const kind = body.kind === "roadmap" ? "roadmap" : "sheet";
    const l = String(body.lang ?? deps.language());
    try {
      return c.json(await learn.translate(kind, String(body.id ?? ""), l, languageName(l)));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  hono.post("/api/learn/mark", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { kind?: string; key?: string; value?: string | boolean };
    const kind = body.kind as "favorite" | "note" | "report" | "done";
    if (!["favorite", "note", "report", "done"].includes(kind)) return c.json({ error: "Unknown mark" }, 400);
    try {
      return c.json(learn.mark(kind, String(body.key ?? ""), body.value ?? ""));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  hono.post("/api/learn/latest", async (c) => c.json(await learn.checkLatest(true)));
  hono.post("/api/learn/what", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { code?: string; fileLang?: string; explain?: boolean };
    try {
      return c.json(await learn.whatIs(String(body.code ?? ""), body.fileLang, deps.language(), Boolean(body.explain)));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  /** What a project uses, with versions, so its sheets come first. */
  hono.get("/api/projects/:id/learn", (c) => {
    const project = store.projectRow(c.req.param("id"));
    if (!project) return c.json({ error: "Not found" }, 404);
    return c.json(learn.techs(project.path));
  });

  /** "Which step is this project at?": each roadmap stage judged from what Igrek knows. */
  hono.get("/api/projects/:id/learn/stages", (c) => {
    const project = store.projectRow(c.req.param("id"));
    if (!project) return c.json({ error: "Not found" }, 404);
    const scan = deps.insight.latest(project.id);
    const categories = "categories" in scan ? scan.categories : [];
    const scores = Object.fromEntries(categories.map((k) => [k.category, k.score]));
    const testing = categories.find((k) => k.category === "testing");
    return c.json(
      stageChecks(project.id, {
        commits: commits(project.path),
        scores,
        apis: "apis" in scan ? (scan.apis?.endpoints?.length ?? 0) : 0,
        hasTests: (testing?.fileCount ?? 0) > 0,
        packaged: packaged(project.path),
        environments: deps.environments.list(project.id).length,
        deploys: deps.environments.deploys({ projectId: project.id }, 100).length,
        monitors: deps.monitors.list().filter((m) => m.projectId === project.id).length,
        errorTracking: deps.errors.list(project.id).length > 0,
      }),
    );
  });

  /**
   * The practice project of a roadmap: a new git repository in ~/Projects/learn-<roadmap> with a
   * README that says what will be built. It is added to Igrek like any project.
   */
  hono.post("/api/learn/practice", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { roadmap?: string; parent?: string };
    const roadmap = learn.roadmap(String(body.roadmap ?? ""));
    if (!roadmap) return c.json({ error: "Not found" }, 404);
    const home = deps.home ?? homedir();
    const base = resolve(body.parent?.trim() || join(home, "Projects"));
    if (!base.startsWith(home)) return c.json({ error: "Pick a folder inside your home folder" }, 400);
    const path = join(base, `learn-${roadmap.id}`);
    const existing = store.projectForCwd(path);
    if (existing) return c.json({ projectId: existing, path });
    try {
      if (!existsSync(path)) mkdirSync(path, { recursive: true });
      const git = (args: string[]) => {
        const p = Bun.spawnSync(["git", "-C", path, ...args], { stdout: "ignore", stderr: "pipe" });
        if (p.exitCode !== 0) throw new Error(p.stderr.toString().trim().slice(0, 200) || "git failed");
      };
      if (!existsSync(join(path, ".git"))) {
        git(["init", "-q", "-b", "main"]);
        const l = deps.language();
        writeFileSync(
          join(path, "README.md"),
          `# ${titleOf(roadmap.title, l)}\n\n${pick(roadmap.project, l)}\n\n${pick(roadmap.summary, l)}\n`,
        );
        writeFileSync(join(path, ".gitignore"), "node_modules\n.env\n__pycache__\n.venv\ndist\nbuild\ntarget\n");
        git(["add", "-A"]);
        git(["commit", "-q", "-m", `Start the ${titleOf(roadmap.title, "en")} practice project`]);
      }
      return c.json({ projectId: store.addProject(path), path });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  /**
   * "Do this step for me": the step's instructions go to a team run in its own copy (worktree) of
   * the practice project. Nothing reaches the main branch until the user reviews and merges.
   */
  hono.post("/api/learn/do", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { roadmap?: string; step?: string; projectId?: string };
    const roadmap = learn.roadmap(String(body.roadmap ?? ""));
    const step = roadmap?.steps.find((s) => s.id === body.step);
    if (!roadmap || !step) return c.json({ error: "Not found" }, 404);
    const l = deps.language();
    const code = (step.code ?? []).map((f) => `--- ${f.file} (${f.lang})\n${f.text}`).join("\n\n");
    const request = [
      `Learning roadmap "${titleOf(roadmap.title, l)}", step ${STAGES.indexOf(step.stage)}: ${pick(step.title, l)}.`,
      `Project: ${pick(roadmap.project, "en")}`,
      `Do this step in the project, as a teacher would for a beginner who will read every change:\n${step.do.en}`,
      code ? `Example code from the step (adapt it to the project as it is now):\n${code}` : "",
      "Keep it as small and clear as the step. Add short comments that explain why. Write a few lines at the end of the README under a heading for this step: what was done and how to try it.",
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      const run = deps.flows.start({ projectId: String(body.projectId ?? ""), flow: "task", request });
      return c.json({ runId: run.id });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
}
