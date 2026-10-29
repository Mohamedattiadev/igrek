import { type ProjectListItem, playbookFor, playbookText, type TerminalTool } from "@igrek/core";
import { Bot, ChevronDown, ListChecks, MessageSquare, Send, SquareTerminal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useAccounts } from "../lib/live";
import { field } from "./ui";

/** What was typed and not sent yet: it waits for the user when they come back (a tester lost hers). */
const DRAFT = "igrek.home.draft";
const TOOLS: TerminalTool[] = ["claude", "codex", "gemini", "pi", "opencode", "shell"];

function readDraft(): string {
  try {
    return sessionStorage.getItem(DRAFT) ?? "";
  } catch {
    return "";
  }
}

function keepDraft(value: string): void {
  try {
    if (value) sessionStorage.setItem(DRAFT, value);
    else sessionStorage.removeItem(DRAFT);
  } catch {
    // Keeping the draft is only a convenience.
  }
}

/**
 * The other ways to start in a project that the "New chat" button had: an empty chat, a chat in one
 * of several Claude accounts, or a terminal with one of the AI tools.
 */
function OtherWays({ projectId, onError }: { projectId: string; onError: (message: string) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);
  const claudeAccounts = useAccounts().filter((a) => a.provider === "claude");

  useEffect(() => {
    if (!open) return;
    api
      .system()
      .then((s) => setInstalled(Object.fromEntries(s.tools.map((tool) => [tool.id, tool.found]))))
      .catch(() => undefined);
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const go = (start: () => Promise<string>) => {
    setOpen(false);
    start()
      .then((path) => navigate(path))
      .catch((err: Error) => onError(err.message));
  };
  const item = "flex h-8 w-full items-center gap-2 rounded-md px-2 text-start text-[13px] hover:bg-bg-hover";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("chat.otherWays")}
        aria-expanded={open}
        data-tip={t("chat.otherWays")}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-bg-hover"
      >
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-20 mt-1 w-56 rounded-ui border border-border bg-bg p-1 shadow-ui">
          <button
            type="button"
            className={item}
            onClick={() => go(async () => `/c/${(await api.startChat({ projectId })).id}`)}
          >
            <MessageSquare size={14} className="text-accent" aria-hidden="true" />
            <span className="flex-1">{t("start.empty")}</span>
          </button>
          {/* With more than one Claude account, start in a chosen one (a running session stays in its own). */}
          {claudeAccounts.length > 1 &&
            claudeAccounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => go(async () => `/c/${(await api.startChat({ projectId, accountId: account.id })).id}`)}
                className={`${item} ps-8 text-[12px] text-fg-muted`}
                data-tip={account.email ?? account.label}
              >
                <span className="flex-1 truncate">{t("chat.newIn", { account: account.label })}</span>
              </button>
            ))}
          <div className="my-1 border-t border-border" />
          {TOOLS.map((tool) => {
            const ok = tool === "shell" || installed[tool] !== false;
            return (
              <button
                key={tool}
                type="button"
                disabled={!ok}
                onClick={() => go(async () => `/t/${(await api.startTerminal({ projectId, tool })).id}`)}
                className={`${item} disabled:opacity-40`}
              >
                <SquareTerminal size={14} className="text-fg-subtle" aria-hidden="true" />
                <span className="flex-1">{t(`term.${tool}`)}</span>
                {!ok && <span className="text-[10px] text-fg-subtle">{t("term.notInstalled")}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** What the user typed, without the way of working added to it: that is what the history shows. */
const typed = (text: string) => text.split("\n\n## How to work\n")[0] ?? text;

/** The target that sends one task to several projects at once. */
const MANY = "*many";

/**
 * One task for several projects (plan.md 13, what one agent alone cannot do): a run per project, each
 * in its own copy, nothing merged without the user; the batch page shows them side by side.
 */
async function startMany(text: string, projectIds: string[]): Promise<string> {
  const runs = await Promise.all(
    projectIds.map((projectId) => api.startFlow({ projectId, flow: "task", request: text })),
  );
  const ids = runs.map((r) => r.id);
  await api.addStarted({ text: typed(text), runs: ids }).catch(() => undefined);
  return `/batch?runs=${ids.join(",")}`;
}

/** Where a message goes: the chosen project's new chat, or the chief, who knows every project. */
async function startFrom(text: string, projectId: string): Promise<string> {
  const draft = encodeURIComponent(text);
  const chat = projectId ? await api.startChat({ projectId }) : await api.chief();
  // The chief's page lists what was started here; a failed note must not stop the work.
  await api
    .addStarted({ text: typed(text), chatId: chat.id, projectId: projectId || undefined })
    .catch(() => undefined);
  return projectId ? `/c/${chat.id}?draft=${draft}&send=1` : `/chief?draft=${draft}&send=1`;
}

/**
 * "What do you want to do?" on the home page (plan.md 7.2): to the chief, who hands it to the right
 * project, unless a project (or several) is picked. Inside a project the "New chat" button stays: the
 * user found the box there more confusing than the button.
 */
export function StartBox({ projectId: fixed }: { projectId?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [text, setTextState] = useState(readDraft);
  const [target, setTarget] = useState(fixed ?? "");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [picked, setPicked] = useState<string[]>([]);
  const many = target === MANY;
  // A task for a project gets its way of working (after pstack); the chief plans its own hand-offs.
  const [withPlaybook, setWithPlaybook] = useState(true);
  const kind = target ? playbookFor(text) : undefined;
  useEffect(() => {
    let current = true;
    api
      .projects()
      .then((list) => current && setProjects(list.filter((p) => !p.hidden && p.status !== "archived")))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => setTarget(fixed ?? ""), [fixed]);
  const setText = (value: string) => {
    setTextState(value);
    keepDraft(value);
  };
  const send = () => {
    const value = text.trim();
    if (!value || busy || (many && picked.length === 0)) return;
    const task = kind && withPlaybook ? `${value}\n\n${playbookText(kind)}` : value;
    setBusy(true);
    setError(undefined);
    (many ? startMany(task, picked) : startFrom(task, target))
      .then((path) => {
        keepDraft("");
        void navigate(path);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };
  return (
    <div>
      <form
        data-tour="composer"
        aria-label={t("start.label")}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="flex h-10 items-center gap-2 rounded-ui border border-border bg-bg-subtle px-2 focus-within:border-accent"
      >
        <Bot size={16} className="ms-1 shrink-0 text-accent" aria-hidden="true" />
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={target && !many ? t("start.placeholderProject") : t("start.placeholder")}
          aria-label={t("start.label")}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-subtle"
        />
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          aria-label={t("start.where")}
          data-tip={t("start.whereTip")}
          className={cn(field, "h-7 px-1.5 text-[12px] max-w-40 shrink-0 truncate text-fg-muted")}
        >
          <option value="">{t("start.chief")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {projects.length > 1 && <option value={MANY}>{t("start.many")}</option>}
        </select>
        <button
          type="submit"
          disabled={!text.trim() || busy}
          aria-label={t("start.send")}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-accent hover:bg-bg-hover disabled:opacity-40"
        >
          <Send size={14} aria-hidden="true" />
        </button>
        {target && !many && <OtherWays projectId={target} onError={setError} />}
      </form>
      {kind && (
        <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-fg-muted">
          <ListChecks size={12} className="text-accent" aria-hidden="true" />
          {withPlaybook ? t(`start.playbook_${kind}`) : t("start.playbookOff")}
          <button
            type="button"
            onClick={() => setWithPlaybook((v) => !v)}
            className="inline-flex items-center gap-0.5 text-accent hover:underline"
            data-tip={t("start.playbookTip")}
          >
            {withPlaybook && <X size={11} aria-hidden="true" />}
            {withPlaybook ? t("start.playbookRemove") : t("start.playbookAdd")}
          </button>
        </p>
      )}
      {many && (
        <fieldset className="mt-2 rounded-ui border border-border p-2 text-[12.5px]">
          <legend className="px-1 text-[11.5px] text-fg-muted">{t("start.manyPick")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {projects.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={picked.includes(p.id)}
                  onChange={(e) =>
                    setPicked((list) => (e.target.checked ? [...list, p.id] : list.filter((id) => id !== p.id)))
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-fg-subtle">{t("start.manyNote", { count: picked.length })}</p>
        </fieldset>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
