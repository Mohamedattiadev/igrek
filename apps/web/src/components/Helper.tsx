import { type ChatInfo, capabilitiesOf, HELP_TOPICS, type ProjectListItem, type SessionListItem } from "@igrek/core";
import {
  ArrowRight,
  BookOpen,
  Bug,
  CircleHelp,
  Compass,
  LifeBuoy,
  MessageSquarePlus,
  Play,
  Send,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api, request } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { CHAT, findProject, fold, GUIDE, has, LAST, NEW, TERMINAL, TOUR, WHERE_TYPE } from "../lib/helper-match";
import { startTour } from "../lib/tour";
import { LazyMarkdown as Markdown } from "./LazyMarkdown";
import { ReportProblem } from "./ReportProblem";

/** Something the helper offers: a page to open or a thing to do. */
interface Action {
  label: string;
  hint?: string;
  icon?: typeof ArrowRight;
  to?: string;
  run?: () => Promise<string | undefined> | undefined;
}

interface Message {
  id: number;
  from: "you" | "helper";
  text: string;
  actions?: Action[];
}

/**
 * The little helper in the corner (plan.md 7.0): ask where something is or what to do and get a
 * link that opens it. Questions about your own work ("last chat in Igrek") are answered from your
 * data right here; anything else goes to the in-app guide.
 */
export function Helper() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const list = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every new message
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener("igrek:helper", openIt);
    return () => window.removeEventListener("igrek:helper", openIt);
  }, []);

  // Esc closes it from anywhere in it, and focus goes back to its button (a screen reader user was stuck).
  const toggle = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const say = (from: Message["from"], body: string, actions?: Action[]) =>
    setMessages((m) => [...m, { id: nextId.current++, from, text: body, actions }]);

  const go = (to: string) => {
    void navigate(to);
    setOpen(false);
  };

  const resumeAction = (s: SessionListItem): Action => ({
    label: t("helper.resume"),
    icon: Play,
    run: async () => {
      const chat = await api.startChat({ projectId: s.projectId ?? "", resume: s.id });
      go(`/c/${chat.id}`);
      return undefined;
    },
  });

  /** What you did last, in one project or anywhere. */
  const lastWork = async (project: ProjectListItem | undefined, projects: ProjectListItem[]) => {
    const chats = await api.chats().catch(() => [] as ChatInfo[]);
    const target = project ?? [...projects].sort((a, b) => b.lastActivity - a.lastActivity)[0];
    if (!target) return say("helper", t("helper.noProjects"), [{ label: t("nav.projects"), to: "/" }]);
    const detail = await api.project(target.id).catch(() => undefined);
    const chat = chats.filter((c) => c.projectId === target.id).sort((a, b) => b.startedAt - a.startedAt)[0];
    const session = detail?.recentSessions[0];
    const actions: Action[] = [];
    if (chat)
      actions.push({
        label: chat.title || t("helper.chat"),
        hint: `${t("helper.openChat")} · ${relativeTime(chat.startedAt)}`,
        icon: ArrowRight,
        to: `/c/${chat.id}`,
      });
    if (session) {
      actions.push({
        label: session.title,
        hint: `${t("helper.openSession")} · ${relativeTime(session.updatedAt)}`,
        icon: ArrowRight,
        to: `/p/${target.id}/s/${session.id}`,
      });
      if (capabilitiesOf(session.tool).chat) actions.push(resumeAction(session));
    }
    actions.push({ label: t("helper.openProject", { name: target.name }), icon: ArrowRight, to: `/p/${target.id}` });
    say(
      "helper",
      chat || session ? t("helper.lastIn", { name: target.name }) : t("helper.nothingIn", { name: target.name }),
      actions,
    );
  };

  const newChat = (project: ProjectListItem): Action => ({
    label: t("helper.newChatIn", { name: project.name }),
    icon: MessageSquarePlus,
    run: async () => {
      const chat = await api.startChat({ projectId: project.id });
      go(`/c/${chat.id}`);
      return undefined;
    },
  });

  const answer = async (question: string) => {
    const q = fold(question);
    const projects = await api.projects().catch(() => [] as ProjectListItem[]);
    const project = findProject(q, projects);
    if (has(q, WHERE_TYPE))
      return say("helper", t("helper.whereType"), [
        { label: t("helper.home"), hint: t("home.title"), icon: ArrowRight, to: "/" },
        ...(project ? [newChat(project)] : []),
      ]);
    if (has(q, TOUR)) return say("helper", t("helper.tour"), [tourAction()]);
    if (has(q, GUIDE)) return say("helper", t("helper.guide"), [guideAction(), tourAction()]);
    if (has(q, LAST) && (has(q, CHAT) || project || has(q, ["kaldigim", "devam", "resume", "continue", "donerim"])))
      return lastWork(project, projects);
    if (has(q, NEW) && has(q, CHAT)) {
      if (project) return say("helper", t("helper.newChat"), [newChat(project)]);
      return say("helper", t("helper.pickProject"), [{ label: t("helper.home"), icon: ArrowRight, to: "/" }]);
    }
    if (has(q, TERMINAL))
      return say("helper", t("helper.terminal"), [
        ...(project
          ? [{ label: t("helper.openProject", { name: project.name }), icon: ArrowRight, to: `/p/${project.id}` }]
          : []),
        { label: t("nav.terminals"), icon: ArrowRight, to: "/terminals" },
      ]);
    if (project)
      return say("helper", t("helper.project", { name: project.name }), [
        { label: t("helper.openProject", { name: project.name }), icon: ArrowRight, to: `/p/${project.id}` },
        newChat(project),
      ]);
    // Pages of the guide whose words match.
    const words = q.split(" ").filter((w) => w.length > 2);
    const topics = HELP_TOPICS.map((topic) => {
      // A word in the page's name or keywords says more than one in its description.
      const name = fold(`${t(`help.t_${topic.id}`)} ${topic.words}`);
      const about = fold(t(`help.d_${topic.id}`));
      return { topic, score: words.reduce((sum, w) => sum + (name.includes(w) ? 3 : about.includes(w) ? 1 : 0), 0) };
    })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    try {
      const reply = await request<{ answer: string; topics: string[] }>("/api/help", {
        method: "POST",
        body: JSON.stringify({ question }),
      });
      const ids = [...new Set([...reply.topics, ...topics.map((x) => x.topic.id)])].slice(0, 4);
      return say(
        "helper",
        reply.answer,
        ids.flatMap((id) => topicAction(id)),
      );
    } catch {
      if (topics.length)
        return say(
          "helper",
          t("helper.found"),
          topics.flatMap((x) => topicAction(x.topic.id)),
        );
      return say("helper", t("helper.unknown"), [guideAction(), tourAction()]);
    }
  };

  const topicAction = (id: string): Action[] => {
    const topic = HELP_TOPICS.find((x) => x.id === id);
    return topic ? [{ label: t(`help.t_${id}`), hint: t(`help.d_${id}`), icon: ArrowRight, to: topic.path }] : [];
  };
  const tourAction = (): Action => ({
    label: t("helper.startTour"),
    icon: Compass,
    run: () => {
      setOpen(false);
      void navigate("/");
      setTimeout(startTour, 300);
      return undefined;
    },
  });
  const guideAction = (): Action => ({ label: t("guide.title"), icon: BookOpen, to: "/guide" });

  const ask = async (question: string) => {
    const value = question.trim();
    if (!value || busy) return;
    setText("");
    say("you", value);
    setBusy(true);
    try {
      await answer(value);
    } catch (err) {
      say("helper", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (action: Action) => {
    if (action.to) return go(action.to);
    try {
      const note = await action.run?.();
      if (note) say("helper", note);
    } catch (err) {
      say("helper", (err as Error).message);
    }
  };

  // On chat and terminal pages the corner holds the send button; sit higher there, and on a phone
  // stay out of the way altogether (the helper is still on every other page).
  const starters = ["continue", "newChat", "where", "tour"] as const;

  let panel: ReactNode = null;
  if (open)
    panel = (
      <section
        role="dialog"
        aria-label={t("helper.title")}
        className={cn(
          // Under the top bar, where its button is: nothing on the page is covered until it is opened.
          "fixed end-3 top-12 z-50 flex h-[min(540px,calc(100vh-5rem))] w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-ui",
        )}
      >
        <header className="flex items-center gap-2 border-b border-border bg-bg-subtle px-3 py-2.5">
          <CircleHelp size={16} className="shrink-0 text-fg-muted" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13.5px] font-semibold">{t("helper.title")}</h2>
            <p className="truncate text-[11px] text-fg-subtle">{t("helper.subtitle")}</p>
          </div>
          <a
            href="https://github.com/Mohamedattiadev/igrek/discussions"
            target="_blank"
            rel="noreferrer"
            aria-label={t("report.community")}
            data-tip={t("report.community")}
            className="rounded-md p-1 text-fg-subtle hover:bg-bg-hover hover:text-fg"
          >
            <LifeBuoy size={15} aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={() => setReporting(true)}
            aria-label={t("report.title")}
            data-tip={t("report.title")}
            className="rounded-md p-1 text-fg-subtle hover:bg-bg-hover hover:text-fg"
          >
            <Bug size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={close}
            aria-label={t("helper.close")}
            className="rounded-md p-1 text-fg-subtle hover:bg-bg-hover hover:text-fg"
          >
            <X size={15} />
          </button>
        </header>
        <div ref={list} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <div className="rounded-xl rounded-ss-sm bg-bg-subtle px-3 py-2 text-[13px] leading-relaxed">
            {t("helper.hello")}
          </div>
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {starters.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => void ask(t(`helper.q_${key}`))}
                  className="rounded-full border border-border bg-bg px-2.5 py-1 text-[12px] text-fg-muted transition-colors hover:border-accent hover:text-fg"
                >
                  {t(`helper.q_${key}`)}
                </button>
              ))}
            </div>
          )}
          {messages.map((m) =>
            m.from === "you" ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-ee-sm bg-accent px-3 py-1.5 text-[13px] text-accent-fg">
                  {m.text}
                </p>
              </div>
            ) : (
              <div key={m.id} className="space-y-1.5">
                <div className="rounded-xl rounded-ss-sm bg-bg-subtle px-3 py-2 text-[13px] leading-relaxed">
                  <Markdown
                    text={m.text}
                    className="prose-igrek prose-chat text-[13px] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                  />
                </div>
                {m.actions?.map((a) => (
                  <button
                    key={`${a.label}${a.to ?? ""}`}
                    type="button"
                    onClick={() => void runAction(a)}
                    className="flex w-full items-center gap-2 rounded-ui border border-border bg-bg px-3 py-2 text-start transition-colors hover:border-accent hover:bg-accent-soft/40"
                  >
                    {a.icon && <a.icon size={14} className="shrink-0 text-accent" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{a.label}</span>
                      {a.hint && <span className="block truncate text-[11px] text-fg-subtle">{a.hint}</span>}
                    </span>
                  </button>
                ))}
              </div>
            ),
          )}
          {busy && (
            <p className="flex items-center gap-1.5 text-xs text-fg-muted">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              {t("helper.thinking")}
            </p>
          )}
        </div>
        <form
          className="flex items-center gap-2 border-t border-border p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(text);
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("helper.placeholder")}
            aria-label={t("helper.placeholder")}
            // biome-ignore lint/a11y/noAutofocus: the panel was opened to type in it
            autoFocus
            className="h-9 min-w-0 flex-1 rounded-ui border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!text.trim() || busy}
            aria-label={t("helper.send")}
            className="flex size-9 shrink-0 items-center justify-center rounded-ui bg-accent text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </form>
      </section>
    );

  return (
    <>
      {panel}
      <ReportProblem open={reporting} onClose={() => setReporting(false)} />
      <button
        ref={toggle}
        type="button"
        data-tour="helper"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("helper.title")}
        aria-expanded={open}
        data-tip={open ? undefined : t("helper.title")}
        className={cn(
          // In the top bar, not floating in a corner: it sat on send buttons and the last row of lists.
          "flex size-8 shrink-0 items-center justify-center rounded-ui text-fg-muted hover:bg-bg-hover hover:text-fg print:hidden",
          open && "bg-bg-active text-fg",
        )}
      >
        {open ? <X size={17} aria-hidden="true" /> : <CircleHelp size={17} aria-hidden="true" />}
      </button>
    </>
  );
}
