import type { CodeHostInfo, HostIssue, HostPull, HostRun } from "@godeye/core";
import { CircleCheck, CircleDot, CircleX, ExternalLink, Eye, GitPullRequest, Loader, Play, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Badge, Button, Card, EmptyState } from "../../components/ui";
import { relativeTime } from "../../lib/format";
import { hostApi } from "../../lib/ops-api";

function useList<T>(load: (projectId: string) => Promise<T[]>, projectId: string): { data?: T[]; error?: string } {
  const [state, setState] = useState<{ data?: T[]; error?: string }>({});
  useEffect(() => {
    load(projectId)
      .then((data) => setState({ data }))
      .catch((err: Error) => setState({ error: err.message }));
  }, [load, projectId]);
  return state;
}

function Issues({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, error } = useList(hostApi.issues, projectId);
  const [busy, setBusy] = useState<number>();
  const [note, setNote] = useState<string>();
  const give = async (i: HostIssue, start: boolean) => {
    setBusy(i.number);
    try {
      const r = await hostApi.toTask(projectId, i.number, start);
      if (r.runId) void navigate(`/runs/${r.runId}`);
      else setNote(t("host.addedToBoard", { number: i.number }));
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-semibold">{t("host.issues", { count: data?.length ?? 0 })}</h3>
      {error && <p className="text-xs text-danger">{error}</p>}
      {note && <p className="text-xs text-fg-muted">{note}</p>}
      {data && !data.length ? (
        <p className="text-xs text-fg-subtle">{t("host.noIssues")}</p>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {(data ?? []).map((i) => (
              <li key={i.number} className="flex flex-wrap items-center gap-2 px-pad py-2">
                <CircleDot size={14} className="text-success" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <a
                    href={i.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-[13px] font-medium hover:underline"
                  >
                    {i.title}
                  </a>
                  <p className="text-[11px] text-fg-subtle">
                    #{i.number} · {i.author} · {relativeTime(Date.parse(i.updatedAt))}
                    {i.comments > 0 && ` · ${t("host.comments", { count: i.comments })}`}
                  </p>
                </div>
                {i.labels.slice(0, 3).map((l) => (
                  <Badge key={l}>{l}</Badge>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Plus}
                  disabled={busy === i.number}
                  onClick={() => void give(i, false)}
                >
                  {t("host.toBoard")}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={Play}
                  disabled={busy === i.number}
                  onClick={() => void give(i, true)}
                  data-tip={t("host.toTeamTip")}
                >
                  {t("host.toTeam")}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function Checks({ c }: { c: HostPull["checks"] }) {
  const { t } = useTranslation();
  if (!c.passed && !c.failed && !c.pending) return null;
  const tone = c.failed ? "danger" : c.pending ? "warning" : "success";
  return (
    <Badge tone={tone}>
      {c.failed
        ? t("host.checksFailed", { count: c.failed })
        : c.pending
          ? t("host.checksPending", { count: c.pending })
          : t("host.checksPassed")}
    </Badge>
  );
}

function Review({ projectId, number }: { projectId: string; number: number }) {
  const { t } = useTranslation();
  const [patch, setPatch] = useState<string>();
  const [text, setText] = useState("");
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    hostApi
      .prDiff(projectId, number)
      .then(setPatch)
      .catch((e: Error) => setError(e.message));
  }, [projectId, number]);
  const send = async (action: "approve" | "changes" | "comment") => {
    setBusy(true);
    setError(undefined);
    try {
      await hostApi.review(projectId, number, action, text);
      setNote(t(`host.sent_${action}`));
      setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="basis-full space-y-2 pt-1">
      {patch === undefined && !error && <p className="text-xs text-fg-subtle">{t("persona.loading")}</p>}
      {patch !== undefined && (
        <pre className="max-h-[50vh] overflow-auto rounded-ui border border-border bg-bg-subtle p-2 font-mono text-[11px] leading-relaxed">
          {patch
            .split("\n")
            .slice(0, 3000)
            .map((line, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: lines of one fixed patch
                key={i}
                className={
                  line.startsWith("+") && !line.startsWith("+++")
                    ? "block text-success"
                    : line.startsWith("-") && !line.startsWith("---")
                      ? "block text-danger"
                      : line.startsWith("@@")
                        ? "block text-accent"
                        : line.startsWith("diff ")
                          ? "mt-2 block font-semibold text-fg"
                          : "block"
                }
              >
                {line || " "}
              </span>
            ))}
        </pre>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={t("host.reviewPlaceholder")}
        aria-label={t("host.reviewPlaceholder")}
        className="w-full rounded-ui border border-border bg-bg p-2 text-[13px] outline-none focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void send("approve")}>
          {t("host.approve")}
        </Button>
        <Button size="sm" disabled={busy || !text.trim()} onClick={() => void send("changes")}>
          {t("host.requestChanges")}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy || !text.trim()} onClick={() => void send("comment")}>
          {t("host.comment")}
        </Button>
        <span className="text-[11px] text-fg-subtle">{t("host.reviewNote")}</span>
      </div>
      {note && <p className="text-xs text-success">{note}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function Pulls({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number>();
  const { data, error } = useList(hostApi.pulls, projectId);
  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-semibold">{t("host.pulls", { count: data?.length ?? 0 })}</h3>
      {error && <p className="text-xs text-danger">{error}</p>}
      {data && !data.length ? (
        <p className="text-xs text-fg-subtle">{t("host.noPulls")}</p>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {(data ?? []).map((p) => (
              <li key={p.number} className="flex flex-wrap items-center gap-2 px-pad py-2">
                <GitPullRequest size={14} className={p.draft ? "text-fg-subtle" : "text-accent"} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-[13px] font-medium hover:underline"
                  >
                    {p.title}
                  </a>
                  <p className="text-[11px] text-fg-subtle">
                    #{p.number} · {p.author} · <span className="font-mono">{p.branch}</span> ·{" "}
                    {relativeTime(Date.parse(p.updatedAt))}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Eye}
                  onClick={() => setOpen(open === p.number ? undefined : p.number)}
                >
                  {t("host.reviewIt")}
                </Button>
                {p.draft && <Badge>{t("host.draft")}</Badge>}
                {p.review && (
                  <Badge
                    tone={p.review === "APPROVED" ? "success" : p.review === "CHANGES_REQUESTED" ? "danger" : "neutral"}
                  >
                    {t(`host.review_${p.review}`, { defaultValue: p.review })}
                  </Badge>
                )}
                <Checks c={p.checks} />
                {open === p.number && <Review projectId={projectId} number={p.number} />}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function RunIcon({ r }: { r: HostRun }) {
  if (r.status !== "completed") return <Loader size={14} className="text-warning" aria-hidden="true" />;
  if (r.conclusion === "success") return <CircleCheck size={14} className="text-success" aria-hidden="true" />;
  return <CircleX size={14} className="text-danger" aria-hidden="true" />;
}

function Runs({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data, error } = useList(hostApi.runs, projectId);
  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-semibold">{t("host.runs")}</h3>
      {error && <p className="text-xs text-danger">{error}</p>}
      {data && !data.length ? (
        <p className="text-xs text-fg-subtle">{t("host.noRuns")}</p>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {(data ?? []).map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-pad py-1.5">
                <RunIcon r={r} />
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-[13px] hover:underline"
                >
                  {r.title}
                </a>
                <span className="hidden text-[11px] text-fg-subtle sm:inline">
                  {r.workflow} · <span className="font-mono">{r.branch}</span>
                </span>
                <span className="text-[11px] text-fg-subtle">{relativeTime(Date.parse(r.createdAt))}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

/** Issues, pull/merge requests and CI from GitHub or GitLab (plan.md 12). */
export function CodeHostTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<CodeHostInfo>();
  useEffect(() => {
    hostApi
      .info(projectId)
      .then(setInfo)
      .catch(() => setInfo({ host: "none", cliInstalled: false, signedIn: false }));
  }, [projectId]);
  if (!info) return <div className="h-40 animate-pulse rounded-ui bg-bg-subtle" />;
  if (info.host !== "github" && info.host !== "gitlab")
    return (
      <EmptyState
        icon={GitPullRequest}
        title={t("host.noRemoteTitle")}
        body={info.repo ? t("host.otherHost", { repo: info.repo }) : t("host.noRemoteBody")}
      />
    );
  if (!info.cliInstalled || !info.signedIn)
    return (
      <EmptyState
        icon={GitPullRequest}
        title={info.cliInstalled ? t("host.signInTitle", { cli: info.cli }) : t("host.installTitle", { cli: info.cli })}
        body={info.cliInstalled ? t("host.signInBody", { cli: info.cli }) : t(`host.install_${info.cli}`)}
      />
    );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Badge>{info.host === "github" ? "GitHub" : "GitLab"}</Badge>
        <a
          href={info.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono hover:underline"
        >
          {info.repo}
          <ExternalLink size={12} aria-hidden="true" />
        </a>
        <span className="text-xs text-fg-subtle">{t("host.readOnly")}</span>
      </div>
      <Issues projectId={projectId} />
      <Pulls projectId={projectId} />
      <Runs projectId={projectId} />
    </div>
  );
}
