import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CodeHostInfo, HostIssue, HostPull, HostRun } from "@godeye/core";
import type { Board } from "./board";
import type { Store } from "./store";

type Runner = (cmd: string[], cwd?: string) => Promise<{ code: number; out: string; err: string }>;

const run: Runner = async (cmd, cwd) => {
  try {
    const proc = Bun.spawn(cmd, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" },
    });
    const timer = setTimeout(() => proc.kill(), 30_000);
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    return { code, out, err };
  } catch (err) {
    return { code: 127, out: "", err: (err as Error).message };
  }
};

/** owner/repo and the host from a git remote (https or ssh form). */
export function parseRemote(url: string): { host: CodeHostInfo["host"]; repo?: string; web?: string } {
  const m = url
    .trim()
    .match(/^(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/(?:[^@/]+@)?|[^@\s]+@)([^/:]+)[/:](.+?)(?:\.git)?\/?$/);
  if (!m?.[1] || !m[2]) return { host: url ? "other" : "none" };
  const domain = m[1].toLowerCase().replace(/:\d+$/, "");
  const host = domain === "github.com" ? "github" : domain.includes("gitlab") ? "gitlab" : "other";
  return { host, repo: m[2], web: `https://${domain}/${m[2]}` };
}

const rollup = (checks: { status?: string; conclusion?: string; state?: string }[] = []) => {
  const out = { passed: 0, failed: 0, pending: 0 };
  for (const c of checks) {
    const state = (c.conclusion || c.state || c.status || "").toUpperCase();
    if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(state)) out.passed++;
    else if (["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(state))
      out.failed++;
    else out.pending++;
  }
  return out;
};

/**
 * GitHub and GitLab (plan.md 12): issues, pull/merge requests and CI of a project's remote, read
 * with your own `gh` / `glab` login. An issue becomes a board card the persona team works on in
 * its own copy; nothing is pushed or commented on your behalf.
 */
export class CodeHost {
  private cache = new Map<string, { at: number; info: CodeHostInfo }>();

  constructor(
    private readonly store: Store,
    private readonly board: Board,
    private readonly runner: Runner = run,
  ) {}

  async info(projectId: string): Promise<CodeHostInfo> {
    const hit = this.cache.get(projectId);
    if (hit && Date.now() - hit.at < 60_000) return hit.info;
    const project = this.store.projectRow(projectId);
    if (!project || !existsSync(join(project.path, ".git")))
      return { host: "none", cliInstalled: false, signedIn: false };
    const remote = (await this.runner(["git", "-C", project.path, "remote", "get-url", "origin"])).out.trim();
    const parsed = parseRemote(remote);
    if (parsed.host !== "github" && parsed.host !== "gitlab")
      return {
        host: parsed.host,
        ...(parsed.repo ? { repo: parsed.repo, url: parsed.web } : {}),
        cliInstalled: false,
        signedIn: false,
      };
    const cli = parsed.host === "github" ? "gh" : "glab";
    const status = await this.runner([cli, "auth", "status"]);
    const info: CodeHostInfo = {
      host: parsed.host,
      repo: parsed.repo,
      url: parsed.web,
      cli,
      cliInstalled: status.code !== 127,
      signedIn: status.code === 0,
      ...(status.code !== 0 && status.code !== 127
        ? { error: (status.err || status.out).trim().split("\n")[0]?.slice(0, 200) }
        : {}),
    };
    this.cache.set(projectId, { at: Date.now(), info });
    return info;
  }

  private async ready(projectId: string): Promise<CodeHostInfo & { repo: string; cli: "gh" | "glab" }> {
    const info = await this.info(projectId);
    if (!info.repo || !info.cli) throw new Error("This project has no GitHub or GitLab remote");
    if (!info.cliInstalled) throw new Error(`${info.cli} is not installed`);
    if (!info.signedIn) throw new Error(`Sign in with: ${info.cli} auth login`);
    return info as CodeHostInfo & { repo: string; cli: "gh" | "glab" };
  }

  private async json<T>(cmd: string[]): Promise<T> {
    const r = await this.runner(cmd);
    if (r.code !== 0) throw new Error((r.err || r.out).trim().split("\n").slice(-2).join(" ").slice(0, 300));
    return JSON.parse(r.out || "[]") as T;
  }

  async issues(projectId: string): Promise<HostIssue[]> {
    const { cli, repo } = await this.ready(projectId);
    if (cli === "gh") {
      const list = await this.json<
        {
          number: number;
          title: string;
          author: { login: string };
          labels: { name: string }[];
          url: string;
          updatedAt: string;
          comments: unknown[];
        }[]
      >([
        "gh",
        "issue",
        "list",
        "-R",
        repo,
        "--state",
        "open",
        "--limit",
        "50",
        "--json",
        "number,title,author,labels,url,updatedAt,comments",
      ]);
      return list.map((i) => ({
        number: i.number,
        title: i.title,
        author: i.author?.login ?? "",
        labels: i.labels.map((l) => l.name),
        url: i.url,
        updatedAt: i.updatedAt,
        comments: i.comments?.length ?? 0,
      }));
    }
    const list = await this.json<
      {
        iid: number;
        title: string;
        author: { username: string };
        labels: string[];
        web_url: string;
        updated_at: string;
        user_notes_count: number;
      }[]
    >(["glab", "issue", "list", "-R", repo, "--per-page", "50", "--output", "json"]);
    return list.map((i) => ({
      number: i.iid,
      title: i.title,
      author: i.author?.username ?? "",
      labels: i.labels ?? [],
      url: i.web_url,
      updatedAt: i.updated_at,
      comments: i.user_notes_count ?? 0,
    }));
  }

  async issue(projectId: string, number: number): Promise<HostIssue> {
    const { cli, repo } = await this.ready(projectId);
    if (cli === "gh") {
      const i = await this.json<{
        number: number;
        title: string;
        body: string;
        author: { login: string };
        labels: { name: string }[];
        url: string;
        updatedAt: string;
        comments: unknown[];
      }>([
        "gh",
        "issue",
        "view",
        String(number),
        "-R",
        repo,
        "--json",
        "number,title,body,author,labels,url,updatedAt,comments",
      ]);
      return {
        number: i.number,
        title: i.title,
        body: i.body,
        author: i.author?.login ?? "",
        labels: i.labels.map((l) => l.name),
        url: i.url,
        updatedAt: i.updatedAt,
        comments: i.comments?.length ?? 0,
      };
    }
    const i = await this.json<{
      iid: number;
      title: string;
      description: string;
      author: { username: string };
      labels: string[];
      web_url: string;
      updated_at: string;
      user_notes_count: number;
    }>(["glab", "issue", "view", String(number), "-R", repo, "--output", "json"]);
    return {
      number: i.iid,
      title: i.title,
      body: i.description,
      author: i.author?.username ?? "",
      labels: i.labels ?? [],
      url: i.web_url,
      updatedAt: i.updated_at,
      comments: i.user_notes_count ?? 0,
    };
  }

  async pulls(projectId: string): Promise<HostPull[]> {
    const { cli, repo } = await this.ready(projectId);
    if (cli === "gh") {
      const list = await this.json<
        {
          number: number;
          title: string;
          author: { login: string };
          headRefName: string;
          state: string;
          isDraft: boolean;
          reviewDecision: string;
          statusCheckRollup: { status?: string; conclusion?: string; state?: string }[];
          url: string;
          updatedAt: string;
        }[]
      >([
        "gh",
        "pr",
        "list",
        "-R",
        repo,
        "--state",
        "open",
        "--limit",
        "30",
        "--json",
        "number,title,author,headRefName,state,isDraft,reviewDecision,statusCheckRollup,url,updatedAt",
      ]);
      return list.map((p) => ({
        number: p.number,
        title: p.title,
        author: p.author?.login ?? "",
        branch: p.headRefName,
        state: p.state,
        draft: p.isDraft,
        review: p.reviewDecision ?? "",
        checks: rollup(p.statusCheckRollup),
        url: p.url,
        updatedAt: p.updatedAt,
      }));
    }
    const list = await this.json<
      {
        iid: number;
        title: string;
        author: { username: string };
        source_branch: string;
        state: string;
        draft: boolean;
        web_url: string;
        updated_at: string;
        head_pipeline?: { status: string };
      }[]
    >(["glab", "mr", "list", "-R", repo, "--per-page", "30", "--output", "json"]);
    return list.map((m) => ({
      number: m.iid,
      title: m.title,
      author: m.author?.username ?? "",
      branch: m.source_branch,
      state: m.state,
      draft: m.draft,
      review: "",
      checks: rollup(
        m.head_pipeline
          ? [
              {
                status:
                  m.head_pipeline.status === "success"
                    ? "SUCCESS"
                    : m.head_pipeline.status === "failed"
                      ? "FAILURE"
                      : "PENDING",
              },
            ]
          : [],
      ),
      url: m.web_url,
      updatedAt: m.updated_at,
    }));
  }

  async runs(projectId: string): Promise<HostRun[]> {
    const { cli, repo } = await this.ready(projectId);
    if (cli === "gh") {
      const list = await this.json<
        {
          databaseId: number;
          displayTitle: string;
          workflowName: string;
          headBranch: string;
          status: string;
          conclusion: string;
          url: string;
          createdAt: string;
        }[]
      >([
        "gh",
        "run",
        "list",
        "-R",
        repo,
        "--limit",
        "15",
        "--json",
        "databaseId,displayTitle,workflowName,headBranch,status,conclusion,url,createdAt",
      ]);
      return list.map((r) => ({
        id: r.databaseId,
        title: r.displayTitle,
        workflow: r.workflowName,
        branch: r.headBranch,
        status: r.status,
        conclusion: r.conclusion ?? "",
        url: r.url,
        createdAt: r.createdAt,
      }));
    }
    const list = await this.json<{ id: number; ref: string; status: string; web_url: string; created_at: string }[]>([
      "glab",
      "ci",
      "list",
      "-R",
      repo,
      "--per-page",
      "15",
      "--output",
      "json",
    ]);
    return list.map((p) => ({
      id: p.id,
      title: `#${p.id}`,
      workflow: "pipeline",
      branch: p.ref,
      status: ["success", "failed", "canceled", "skipped"].includes(p.status) ? "completed" : p.status,
      conclusion:
        p.status === "success"
          ? "success"
          : p.status === "failed"
            ? "failure"
            : p.status === "canceled"
              ? "cancelled"
              : "",
      url: p.web_url,
      createdAt: p.created_at,
    }));
  }

  /** "Give it to the team": the issue becomes a board card; with `start`, the team begins right away. */
  async issueToTask(projectId: string, number: number, start: boolean): Promise<{ taskId: string; runId?: string }> {
    const issue = await this.issue(projectId, number);
    const card = this.board.add({
      projectId,
      title: issue.title,
      description:
        `${issue.body?.trim() || ""}\n\nFrom issue #${issue.number}: ${issue.url}\nWhen it's done, the commit message can say "Fixes #${issue.number}" (you push it yourself).`.trim(),
      origin: `issue #${issue.number}`,
    });
    if (!start) return { taskId: card.id };
    const flow = issue.labels.some((l) => /bug|fix|defect|hata/i.test(l)) ? "fix" : "feature";
    const moved = this.board.move(card.id, "doing", undefined, flow);
    return { taskId: card.id, ...(moved.runId ? { runId: moved.runId } : {}) };
  }
}
