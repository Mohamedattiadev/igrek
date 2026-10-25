import type { ProjectListItem, SessionDetail } from "@igrek/core";
import { ArrowRight, FileUp, Laptop, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api, type HandoffItem, type HandoffProblem } from "../lib/api";
import { useServerEvent } from "../lib/live";
import { Button, Card } from "./ui";

/**
 * On the computer that has the chat: send it to the user's other computers and teammates through the
 * hub, or save it as a file. The other computer goes on with the same session and the same code
 * (apps/server/src/handoff.ts).
 */
export function ElsewhereButton({ session }: { session: SessionDetail }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean }>();
  if (session.author || session.tool !== "claude") return null;
  const send = async (via: "team" | "file") => {
    setOpen(false);
    setNote(undefined);
    try {
      const result = await api.sendHandoff(session.id, via);
      if ("problem" in result) return setNote({ text: t(`handoff.problem_${result.problem.code}`), error: true });
      if (via === "file") {
        // A file the user carries over (a USB stick, a chat to themselves) and opens on the Projects page.
        const blob = new Blob([JSON.stringify(result)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${(session.title || "chat").replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40)}.igrek-handoff`;
        a.click();
        URL.revokeObjectURL(a.href);
        return setNote({ text: t("handoff.saved") });
      }
      setNote({ text: t("handoff.sent") });
    } catch (err) {
      setNote({ text: (err as Error).message, error: true });
    }
  };
  return (
    <div className="relative flex items-center gap-1">
      {note && (
        <span className={note.error ? "me-2 text-xs text-danger" : "me-2 text-xs text-success"}>{note.text}</span>
      )}
      <Button size="sm" variant="ghost" icon={Laptop} onClick={() => setOpen((v) => !v)} data-tip={t("handoff.tip")}>
        <span className="hidden lg:inline">{t("handoff.button")}</span>
      </Button>
      {open && (
        <div className="absolute end-0 top-full z-20 mt-1 w-72 rounded-ui border border-border bg-bg p-1 shadow-ui">
          <button
            type="button"
            onClick={() => void send("team")}
            className="block w-full rounded-md px-2 py-1.5 text-start text-[13px] hover:bg-bg-hover"
          >
            {t("handoff.viaTeam")}
            <span className="block text-[11.5px] text-fg-subtle">{t("handoff.viaTeamHint")}</span>
          </button>
          <button
            type="button"
            onClick={() => void send("file")}
            className="block w-full rounded-md px-2 py-1.5 text-start text-[13px] hover:bg-bg-hover"
          >
            {t("handoff.viaFile")}
            <span className="block text-[11.5px] text-fg-subtle">{t("handoff.viaFileHint")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** One received chat: check first, then put the code and the session in place and resume the chat. */
function HandoffRow({ item, projects }: { item: HandoffItem; projects: ProjectListItem[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // From a file there is no project yet: the one with the same folder name is the likely one.
  const [projectId, setProjectId] = useState(item.projectId ?? "");
  useEffect(() => {
    if (projectId || item.projectId) return;
    const match = projects.find((p) => p.path.split(/[\\/]/).pop() === item.folder);
    if (match) setProjectId(match.id);
  }, [projects, item.folder, item.projectId, projectId]);
  const [problem, setProblem] = useState<HandoffProblem>();
  const [busy, setBusy] = useState(false);
  const go = async (stash: boolean) => {
    if (!projectId) return;
    setBusy(true);
    setProblem(undefined);
    try {
      if (!stash) {
        const check = await api.checkHandoff(item.id, projectId);
        if ("problem" in check) return setProblem(check.problem);
      }
      const done = await api.continueHandoff(item.id, projectId, stash);
      if ("problem" in done) return setProblem(done.problem);
      const chat = await api.startChat({ projectId, resume: done.sessionId });
      void navigate(`/c/${chat.id}`);
    } catch (err) {
      setProblem({ code: "apply-failed", detail: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="space-y-2 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Laptop size={15} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium">{item.title || t("handoff.untitled")}</span>
          <span className="block text-[12px] text-fg-subtle">
            {t("handoff.meta", { from: item.from, branch: item.branch, count: item.changes })}
          </span>
        </span>
        {!item.projectId && (
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label={t("handoff.which")}
            className="h-7 rounded-md border border-border bg-bg px-1.5 text-[12px]"
          >
            <option value="">{t("handoff.which")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <Button
          size="sm"
          variant="primary"
          icon={ArrowRight}
          disabled={!projectId || busy}
          onClick={() => void go(false)}
        >
          {t("handoff.continue")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          aria-label={t("handoff.remove")}
          onClick={() => void api.removeHandoff(item.id)}
        />
      </div>
      {problem && (
        <div className="rounded-ui border border-warning bg-warning-soft p-2.5 text-[12.5px]">
          <p>{t(`handoff.problem_${problem.code}`)}</p>
          {problem.code === "dirty" && (
            <>
              <p className="mt-1 font-mono text-[11.5px] text-fg-muted">{problem.files.join(", ")}</p>
              <Button size="sm" className="mt-2" disabled={busy} onClick={() => void go(true)}>
                {t("handoff.stashAndContinue")}
              </Button>
            </>
          )}
          {problem.code === "apply-failed" && <p className="mt-1 font-mono text-[11.5px]">{problem.detail}</p>}
        </div>
      )}
    </li>
  );
}

/**
 * On the other computer: chats waiting to go on here, from the hub or from a file. Shown on the Projects
 * page only when there is one, with a way to open a hand-off file.
 */
export function HandoffsPanel() {
  const { t } = useTranslation();
  const [items, setItems] = useState<HandoffItem[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(() => {
    void api
      .handoffs()
      .then(setItems)
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    void api
      .projects()
      .then((list) => setProjects(list.filter((p) => !p.hidden)))
      .catch(() => undefined);
  }, []);
  useServerEvent("handoffs-changed", load);
  const open = (file: File) =>
    void file
      .text()
      .then((text) => api.importHandoff(JSON.parse(text)))
      .then(load)
      .catch(() => setError(t("handoff.badFile")));
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".igrek-handoff,application/json"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && open(e.target.files[0])}
      />
      <Button
        size="sm"
        variant="ghost"
        icon={FileUp}
        onClick={() => input.current?.click()}
        data-tip={t("handoff.openTip")}
      >
        <span className="hidden md:inline">{t("handoff.open")}</span>
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
      {items.length > 0 && (
        <Card className="fixed inset-x-4 bottom-12 z-40 mx-auto max-w-2xl p-pad shadow-ui sm:inset-x-auto sm:end-20">
          <p className="flex items-center gap-1.5 text-[13.5px] font-semibold">
            <Upload size={14} className="text-accent" aria-hidden="true" />
            {t("handoff.waiting")}
          </p>
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <HandoffRow key={item.id} item={item} projects={projects} />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
