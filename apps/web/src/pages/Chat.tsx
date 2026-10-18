import {
  type ChatEvent,
  type ChatMode,
  extractNotebook,
  findSecrets,
  isWeakPrompt,
  suggestModel,
  type WeakPoint,
} from "@godeye/core";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  FileEdit,
  FilePlus,
  FileText,
  Flag,
  Globe,
  Image as ImageIcon,
  ImagePlus,
  ListTodo,
  MessageSquare,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldQuestion,
  Square,
  SquareTerminal,
  Swords,
  Terminal,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { marked } from "marked";
import { type ClipboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ChatCopy } from "../components/ChatCopy";
import { CheckpointRestore } from "../components/CheckpointRestore";
import { EnhanceButton, EnhanceHint, EnhancePanel, PromptCoach } from "../components/Enhance";
import { MicButton } from "../components/MicButton";
import { PromptPicker } from "../components/PromptPicker";
import { maskSecrets, SecretGuard } from "../components/SecretGuard";
import { filterSlash, type SlashItem, SlashMenu, useSlashItems } from "../components/SlashMenu";
import { Badge, Button, EmptyState, Segmented, StatusDot } from "../components/ui";
import { api } from "../lib/api";
import { lineDiff, useChat } from "../lib/chat";
import { cn } from "../lib/cn";
import { modelName } from "../lib/format";
import { PersonaIcon, usePersonaLabel, usePersonas } from "../lib/personas";
import { useSettings } from "../lib/settings";
import { WeakPointList } from "./Meeting";

type Json = Record<string, unknown>;

const MODES: ChatMode[] = ["normal", "acceptEdits", "auto", "plan"];
const MODELS = ["", "opus", "sonnet", "haiku"];

function Markdown({ text }: { text: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false })), [text]);
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized with DOMPurify
  return <div className="prose-godeye prose-chat" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Diff({ before, after }: { before: string; after: string }) {
  const lines = useMemo(() => lineDiff(before, after), [before, after]);
  return (
    <pre className="max-h-72 overflow-auto rounded-md border border-border bg-bg font-mono text-[11.5px] leading-[1.55]">
      {lines.map((line, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no identity
          key={i}
          className={cn(
            "px-2",
            line.type === "add" && "bg-success-soft text-success",
            line.type === "del" && "bg-danger-soft text-danger",
          )}
        >
          {line.type === "add" ? "+ " : line.type === "del" ? "- " : "  "}
          {line.text}
        </div>
      ))}
    </pre>
  );
}

function toolIcon(name: string) {
  if (name === "Bash") return Terminal;
  if (name === "Edit" || name === "MultiEdit") return FileEdit;
  if (name === "Write") return FilePlus;
  if (name === "Read") return FileText;
  if (name === "Grep" || name === "Glob") return Search;
  if (name === "WebFetch" || name === "WebSearch") return Globe;
  if (name === "TodoWrite") return ListTodo;
  return Wrench;
}

/** One-line summary of what a tool call does. */
function toolSummary(name: string, input: Json, cwd?: string): string {
  const rel = (path: unknown) =>
    typeof path === "string" && cwd && path.startsWith(cwd) ? path.slice(cwd.length + 1) : String(path ?? "");
  if (name === "Bash") return String(input.description ?? input.command ?? "");
  if (["Read", "Edit", "Write", "MultiEdit", "NotebookEdit"].includes(name))
    return rel(input.file_path ?? input.notebook_path);
  if (name === "Grep" || name === "Glob") return String(input.pattern ?? "");
  if (name === "WebFetch") return String(input.url ?? "");
  if (name === "WebSearch") return String(input.query ?? "");
  if (name === "Task" || name === "Agent") return String(input.description ?? "");
  return "";
}

/** What a step would do, shown before you approve it and inside tool cards. */
function ToolPreview({ name, input }: { name: string; input: Json }) {
  if (name === "Edit") return <Diff before={String(input.old_string ?? "")} after={String(input.new_string ?? "")} />;
  if (name === "MultiEdit" && Array.isArray(input.edits)) {
    return (
      <div className="space-y-1.5">
        {(input.edits as Json[]).map((edit, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: edits come in order
          <Diff key={i} before={String(edit.old_string ?? "")} after={String(edit.new_string ?? "")} />
        ))}
      </div>
    );
  }
  if (name === "Write") return <Diff before="" after={String(input.content ?? "").slice(0, 6000)} />;
  if (name === "Bash") {
    return (
      <pre className="overflow-x-auto rounded-md bg-bg-muted p-2 font-mono text-[12px]">
        {String(input.command ?? "")}
      </pre>
    );
  }
  if (name === "TodoWrite" && Array.isArray(input.todos)) {
    return (
      <ul className="space-y-0.5 text-[12.5px]">
        {(input.todos as Json[]).map((todo, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: todos come in order
          <li key={i} className="flex items-center gap-2">
            <span
              className={cn(
                "size-3 shrink-0 rounded-sm border",
                todo.status === "completed"
                  ? "border-success bg-success"
                  : todo.status === "in_progress"
                    ? "border-accent"
                    : "border-border-strong",
              )}
            />
            <span className={todo.status === "completed" ? "text-fg-subtle line-through" : ""}>
              {String(todo.content ?? "")}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <pre className="max-h-48 overflow-auto rounded-md bg-bg-muted p-2 font-mono text-[11px]">
      {JSON.stringify(input, null, 2)}
    </pre>
  );
}

function ToolCard({ event, cwd }: { event: Extract<ChatEvent, { kind: "tool" }>; cwd?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(event.name === "TodoWrite");
  const Icon = toolIcon(event.name);
  const input = (event.input ?? {}) as Json;
  return (
    <div className="ms-9 rounded-ui border border-border bg-bg-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-start"
      >
        {open ? (
          <ChevronDown size={12} className="text-fg-subtle" />
        ) : (
          <ChevronRight size={12} className="text-fg-subtle" />
        )}
        <Icon size={13} className={event.status === "error" ? "text-danger" : "text-fg-muted"} />
        <span className="text-[12px] font-medium">{event.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-muted">
          {toolSummary(event.name, input, cwd)}
        </span>
        {event.status === "running" ? (
          <span className="size-1.5 animate-pulse rounded-full bg-accent" />
        ) : event.status === "error" ? (
          <XCircle size={12} className="text-danger" />
        ) : (
          <Check size={12} className="text-success" />
        )}
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-2.5">
          <ToolPreview name={event.name} input={input} />
          {event.result && (
            <details open={event.status === "error"}>
              <summary className="cursor-pointer text-[11px] text-fg-subtle">{t("chat.toolOutput")}</summary>
              <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-fg-muted">
                {event.result}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function PermissionCard({
  event,
  onAnswer,
}: {
  event: Extract<ChatEvent, { kind: "permission" }>;
  onAnswer: (decision: "allow" | "deny" | "always") => void;
}) {
  const { t } = useTranslation();
  const input = (event.input ?? {}) as Json;
  const pending = event.status === "pending";
  return (
    <div
      className={cn(
        "ms-9 space-y-2 rounded-ui border p-3",
        pending ? "border-warning bg-warning-soft/40" : "border-border opacity-70",
      )}
    >
      <p className="flex items-center gap-2 text-[12.5px]">
        <ShieldQuestion size={14} className="text-warning" />
        <span className="font-semibold">Claude</span>
        <span className="text-fg-muted">{t("chat.wants")}</span>
        <Badge>{event.toolName}</Badge>
        {event.description && <span className="min-w-0 truncate text-fg-muted">{event.description}</span>}
      </p>
      <ToolPreview name={event.toolName} input={input} />
      {event.guard && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <ShieldAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t(`chat.guard_${event.guard}`)}
        </p>
      )}
      {pending ? (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => onAnswer("allow")} autoFocus>
            {t("chat.allow")}
          </Button>
          {!event.guard && (
            <Button size="sm" onClick={() => onAnswer("always")}>
              {t("chat.always")}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onAnswer("deny")}>
            {t("chat.deny")}
          </Button>
        </div>
      ) : (
        <Badge tone={event.status === "allowed" ? "success" : "danger"}>
          {event.status === "allowed" ? t("chat.allowed") : t("chat.denied")}
        </Badge>
      )}
    </div>
  );
}

function readImage(file: File): Promise<{ mediaType: string; data: string; name: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ mediaType: file.type, data: String(reader.result).split(",")[1] ?? "", name: file.name });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** "Find the weak points" under a plan (plan.md 6.3): the devil's advocate reads it. */
function WeakPointsButton({ text, projectId }: { text: string; projectId: string }) {
  const { t } = useTranslation();
  const [points, setPoints] = useState<WeakPoint[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (points)
    return (
      <div className="ms-9">
        <WeakPointList points={points} />
      </div>
    );
  return (
    <div className="ms-9">
      <Button
        size="sm"
        variant="ghost"
        icon={Swords}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            setPoints((await api.weakPoints(text, projectId)).points);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t("meeting.looking") : t("meeting.weakPoints")}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Chat with Claude in a project (plan.md 2.2): live text, tool cards, approvals as buttons. */
export function ChatPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { chatId = "" } = useParams();
  const chat = useChat(chatId);
  const info = chat.info;
  const [searchParams, setSearchParams] = useSearchParams();
  // A prompt prepared elsewhere (a "Fix" button) waits in the box; nothing is sent until the user does.
  const [text, setText] = useState(() => searchParams.get("draft") ?? "");
  /** Typed on the home page and sent from there: goes out once the chat is ready. */
  const [autoSend, setAutoSend] = useState(() => searchParams.get("send") === "1");
  // biome-ignore lint/correctness/useExhaustiveDependencies: drop the draft from the URL once it's in the box
  useEffect(() => {
    if (searchParams.has("draft")) setSearchParams({}, { replace: true });
  }, []);
  const { settings } = useSettings();
  const slashItems = useSlashItems(chat.info?.projectId);
  const slashMatches = filterSlash(slashItems, text);
  const [slashActive, setSlashActive] = useState(0);
  const pickSlash = (item: SlashItem) => {
    setText(item.insert);
    setSlashActive(0);
  };
  const suggestedModel = text.trim() ? suggestModel(text) : undefined;
  const currentModel = MODELS.find((m) => m && info?.model?.includes(m));
  /** Restart on the suggested model, keeping the session (if any) and the typed text. */
  const switchModel = async (model: string) => {
    if (!info) return;
    const draft = encodeURIComponent(text);
    if (info.sessionId) {
      const next = await api.chatModel(info.id, model);
      navigate(`/c/${next.id}?draft=${draft}`, { replace: true });
    } else {
      const next = await api.startChat({ projectId: info.projectId, model, mode: info.mode });
      void api.closeChat(info.id).catch(() => undefined);
      navigate(`/c/${next.id}?draft=${draft}`, { replace: true });
    }
  };
  /**
   * Auto mode belongs in a separate copy. A fresh chat moves into one; a chat that already has
   * a conversation keeps its folder (shipping still always asks).
   */
  const changeMode = async (mode: ChatMode) => {
    if (mode === "auto" && info && !info.worktree && !info.sessionId) {
      const next = await api
        .startChat({ projectId: info.projectId, model: info.model, mode: "auto" })
        .catch(() => undefined);
      if (next) {
        void api.closeChat(info.id).catch(() => undefined);
        navigate(`/c/${next.id}?draft=${encodeURIComponent(text)}`, { replace: true });
        return;
      }
    }
    chat.setMode(mode);
  };
  /** A message held back because it seems to contain a secret. */
  const [guarded, setGuarded] = useState<string>();
  /** The text the enhancer was opened with; undefined while closed. */
  const [enhancing, setEnhancing] = useState<string>();
  const [images, setImages] = useState<{ mediaType: string; data: string; name: string }[]>([]);
  const list = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every new event
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [chat.events]);

  const openEnhancer = () => text.trim() && setEnhancing(text.trim());
  const send = (override?: string, allowSecrets = false) => {
    const value = override ?? text.trim();
    if (!value && images.length === 0) return;
    // Prompt firewall: a key or password in the message waits for the user's choice.
    if (!allowSecrets && findSecrets(value).length) {
      setGuarded(value);
      return;
    }
    setGuarded(undefined);
    // "auto": a weak prompt opens the enhancer first instead of going out as is.
    if (override === undefined && settings.enhanceMode === "auto" && isWeakPrompt(value)) {
      setEnhancing(value);
      return;
    }
    setEnhancing(undefined);
    chat.send(
      value,
      images.map(({ mediaType, data }) => ({ mediaType, data })),
    );
    setText("");
    setImages([]);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: send once, when the chat has started
  useEffect(() => {
    if (!autoSend || !info || info.status !== "idle" || !text.trim()) return;
    setAutoSend(false);
    send();
  }, [autoSend, info?.status]);

  const onPaste = async (event: ClipboardEvent) => {
    const files = [...event.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    event.preventDefault();
    setImages([...images, ...(await Promise.all(files.map(readImage)))]);
  };

  const { personas } = usePersonas();
  const personaLabel = usePersonaLabel();
  const persona = info?.persona ? personas.find((p) => p.id === info.persona?.id) : undefined;
  const personaName = info?.persona ? info.persona.name || personaLabel(persona, info.persona.id).name : undefined;
  /** A fresh chat can switch persona: it restarts as that persona, keeping the typed text. */
  const switchPersona = async (personaId: string) => {
    if (!info) return;
    const next = await api.startChat({ projectId: info.projectId, personaId: personaId || undefined, mode: info.mode });
    void api.closeChat(info.id).catch(() => undefined);
    navigate(`/c/${next.id}?draft=${encodeURIComponent(text)}`, { replace: true });
  };
  // The last answer of a finished turn can be checked for weak points.
  const lastText = [...chat.events].reverse().find((e) => e.kind === "text");
  const lastIsAnswer =
    info?.status === "idle" &&
    chat.events
      .slice(chat.events.findIndex((e) => e.id === lastText?.id) + 1)
      .every((e) => e.kind === "result" || e.kind === "notice");

  const working = info?.status === "working";
  const status = info?.status ?? "idle";
  const tone = status === "working" ? "success" : status === "waiting" ? "warning" : "neutral";

  if (chat.gone) {
    const known = chat.gone === true ? undefined : chat.gone;
    return (
      <EmptyState
        icon={MessageSquare}
        title={t("chat.goneTitle")}
        body={known ? t("chat.goneBody", { title: known.title }) : t("chat.goneUnknown")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {known?.sessionId && (
              <Button
                variant="primary"
                icon={RotateCcw}
                onClick={async () => {
                  const next = await api.startChat({ projectId: known.projectId, resume: known.sessionId });
                  navigate(`/c/${next.id}`, { replace: true });
                }}
              >
                {t("chat.goneResume")}
              </Button>
            )}
            {known?.sessionId && (
              <Button onClick={() => navigate(`/p/${known.projectId}/s/${known.sessionId}`)}>
                {t("chat.goneOpen")}
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate(known ? `/p/${known.projectId}` : "/")}>
              {known ? t("chat.goneProject") : t("helper.home")}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <Link
          to={info ? `/p/${info.projectId}` : "/terminals"}
          className="text-fg-subtle hover:text-fg"
          aria-label={t("term.project")}
        >
          <ArrowLeft size={15} className="rtl:rotate-180" />
        </Link>
        <StatusDot tone={tone} pulse={status === "working" || status === "waiting"} />
        {info?.persona && (
          <Link
            to={`/personas/${info.persona.id}`}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-bg-muted py-0.5 ps-0.5 pe-2 text-[12px] hover:bg-bg-hover"
            data-tip={info.persona.tools === "read" ? t("persona.tools_read") : undefined}
          >
            <PersonaIcon persona={persona} size={12} className="size-5 rounded-full" />
            {personaName}
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{info?.title ?? "…"}</h1>
        <span className="text-[11px] text-fg-subtle">{t(`chat.${status}`)}</span>
        <select
          value={MODELS.find((m) => m && info?.model?.includes(m)) ?? ""}
          onChange={async (e) => {
            if (!info || !e.target.value) return;
            const next = await api.chatModel(info.id, e.target.value);
            navigate(`/c/${next.id}`, { replace: true });
          }}
          aria-label={t("chat.model")}
          className="h-7 rounded-md border border-border bg-bg px-1.5 text-[12px]"
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {m ? modelName(`claude-${m}`) : info?.model ? modelName(info.model) : t("chat.modelDefault")}
            </option>
          ))}
        </select>
        {info?.sessionId && (
          <Button
            size="sm"
            variant="ghost"
            icon={SquareTerminal}
            onClick={async () => {
              const term = await api.startTerminal({
                projectId: info.projectId,
                tool: "claude",
                resume: info.sessionId,
              });
              navigate(`/t/${term.id}`);
            }}
          >
            <span className="hidden lg:inline">{t("chat.openInTerminal")}</span>
          </Button>
        )}
      </header>
      {info?.worktree && <ChatCopy info={info} />}

      <div ref={list} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-3 px-4 py-5">
          {chat.events.length === 0 && (
            <div className="py-20 text-center">
              <Bot size={28} className="mx-auto mb-3 text-fg-subtle" />
              <p className="text-[15px] font-semibold">{t("chat.empty")}</p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-fg-muted">{t("chat.emptyBody")}</p>
            </div>
          )}
          {chat.events.map((event) => {
            switch (event.kind) {
              case "user":
                return (
                  <div key={event.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-ee-sm bg-accent px-3.5 py-2 text-[13.5px] text-accent-fg">
                      {event.images > 0 && (
                        <p className="mb-1 flex items-center gap-1 text-[11px] opacity-80">
                          <ImageIcon size={12} aria-hidden="true" /> {event.images} {t("chat.image")}
                        </p>
                      )}
                      {event.text}
                    </div>
                  </div>
                );
              case "text": {
                // A persona's notebook block is for God Eye, not for reading.
                const shown = info?.persona ? extractNotebook(event.text).text : event.text;
                const isLast = event.id === lastText?.id && lastIsAnswer;
                return (
                  <div key={event.id} className="space-y-2">
                    <div className="flex gap-3">
                      {persona ? (
                        <PersonaIcon persona={persona} size={13} />
                      ) : (
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-bg-muted text-fg-muted">
                          <Bot size={13} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 text-[13.5px]">
                        <Markdown text={shown} />
                      </div>
                    </div>
                    {isLast && info && shown.length > 300 && info.persona?.id !== "devils-advocate" && (
                      <WeakPointsButton key={event.id} text={shown} projectId={info.projectId} />
                    )}
                  </div>
                );
              }
              case "tool":
                return <ToolCard key={event.id} event={event} cwd={info?.cwd} />;
              case "permission":
                return (
                  <PermissionCard key={event.id} event={event} onAnswer={(d) => chat.answer(event.requestId, d)} />
                );
              case "result":
                return (
                  <p
                    key={event.id}
                    className={cn("ms-9 text-[11px]", event.isError ? "text-danger" : "text-fg-subtle")}
                  >
                    {event.isError
                      ? `${t("chat.failed")}${event.text ? `: ${event.text}` : ""}`
                      : t("chat.done", { s: ((event.durationMs ?? 0) / 1000).toFixed(1) })}
                  </p>
                );
              case "checkpoint":
                return (
                  <div key={event.id} className="flex items-center justify-end gap-2 text-[11px] text-fg-subtle">
                    <span className="flex items-center gap-1">
                      <Flag size={11} aria-hidden="true" /> {t("checkpoint.saved")}
                    </span>
                    <CheckpointRestore compact projectId={event.projectId} checkpointId={event.checkpointId} />
                  </div>
                );
              case "notice":
                if (event.code === "notebook" || event.code === "notebookRejected")
                  return (
                    <p key={event.id} className="ms-9 flex items-center gap-1.5 text-[11px] text-fg-subtle">
                      <BookOpen size={12} aria-hidden="true" />
                      {t(`chat.notice_${event.code}`, { count: Number(event.text) || 1 })}
                    </p>
                  );
                if (event.code)
                  return (
                    <p
                      key={event.id}
                      className="ms-9 flex items-start gap-2 rounded-md border border-warning bg-warning-soft p-2 text-xs"
                    >
                      <ShieldAlert size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                      {t(`chat.notice_${event.code}`)}
                    </p>
                  );
                return (
                  <pre
                    key={event.id}
                    className="ms-9 whitespace-pre-wrap rounded-md bg-danger-soft p-2 font-mono text-[11px] text-danger"
                  >
                    {event.text}
                  </pre>
                );
              default:
                return null;
            }
          })}
          {working && (
            <p className="ms-9 flex items-center gap-1.5 text-xs text-fg-muted">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              {t("chat.working")}
            </p>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-border bg-bg-subtle p-3">
        <div className="mx-auto max-w-3xl space-y-2">
          {chat.error && <p className="text-xs text-danger">{chat.error}</p>}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((image, i) => (
                <span key={image.data.slice(0, 32) + image.data.length} className="relative">
                  <img
                    src={`data:${image.mediaType};base64,${image.data}`}
                    alt={image.name}
                    className="h-14 w-14 rounded-md border border-border object-cover"
                  />
                  <button
                    type="button"
                    aria-label={t("chat.removeImage")}
                    onClick={() => setImages(images.filter((_, j) => j !== i))}
                    className="absolute -end-1.5 -top-1.5 rounded-full bg-fg p-0.5 text-bg"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {guarded !== undefined && (
            <SecretGuard
              text={guarded}
              onMask={() => send(maskSecrets(guarded), true)}
              onSendAnyway={() => send(guarded, true)}
              onCancel={() => setGuarded(undefined)}
            />
          )}
          {enhancing !== undefined && info && (
            <div className="mb-2">
              <EnhancePanel
                key={enhancing}
                text={enhancing}
                target={{ projectId: info.projectId, sessionId: info.sessionId, tool: "claude" }}
                onClose={() => setEnhancing(undefined)}
                onUse={(prompt) => send(prompt)}
                onPlanMode={info.mode === "plan" ? undefined : () => chat.setMode("plan")}
              />
            </div>
          )}
          {enhancing === undefined && text.trim() && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              <EnhanceHint text={text} onEnhance={openEnhancer} />
              <PromptCoach text={text} />
              {suggestedModel && suggestedModel !== currentModel && !working && (
                <button
                  type="button"
                  onClick={() => void switchModel(suggestedModel)}
                  data-tip={t(`chat.suggestTip_${suggestedModel}`)}
                  className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2 py-0.5 text-[11px] text-fg-muted hover:text-fg"
                >
                  <Cpu size={11} aria-hidden="true" />{" "}
                  {t("chat.suggestModel", { model: modelName(`claude-${suggestedModel}`) })}
                </button>
              )}
            </div>
          )}
          <SlashMenu
            items={slashMatches}
            active={Math.min(slashActive, Math.max(0, slashMatches.length - 1))}
            onPick={pickSlash}
          />
          <div className="rounded-ui border border-border bg-bg p-1.5 focus-within:border-accent">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (slashMatches.length) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const step = e.key === "ArrowDown" ? 1 : -1;
                    setSlashActive((i) => (i + step + slashMatches.length) % slashMatches.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    const item = slashMatches[Math.min(slashActive, slashMatches.length - 1)];
                    if (item) pickSlash(item);
                    return;
                  }
                  if (e.key === "Escape") {
                    setText("");
                    return;
                  }
                }
                if (e.key === "Enter" && e.shiftKey && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  openEnhancer();
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={Math.min(8, Math.max(2, text.split("\n").length))}
              placeholder={t("chat.placeholder")}
              disabled={info?.status === "exited"}
              className="w-full resize-none bg-transparent px-2 py-1 text-[13.5px] outline-none placeholder:text-fg-subtle"
            />
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                aria-label={t("chat.image")}
                className="rounded-md p-1.5 text-fg-subtle hover:bg-bg-hover hover:text-fg"
              >
                <ImagePlus size={15} />
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                hidden
                onChange={async (e) => {
                  const files = [...(e.target.files ?? [])];
                  setImages([...images, ...(await Promise.all(files.map(readImage)))]);
                  e.target.value = "";
                }}
              />
              <PromptPicker onUse={(prompt) => setText((v) => (v ? `${v}\n${prompt}` : prompt))} />
              <MicButton onText={(spoken) => setText((v) => (v ? `${v} ${spoken}` : spoken))} />
              {info && !info.sessionId && chat.events.length === 0 && personas.length > 0 && (
                <select
                  value={info.persona?.id ?? ""}
                  onChange={(e) => void switchPersona(e.target.value)}
                  aria-label={t("persona.picker")}
                  className="h-7 max-w-40 rounded-md border border-border bg-bg px-1.5 text-[12px] text-fg-muted"
                >
                  <option value="">{t("persona.none")}</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {personaLabel(p).name}
                    </option>
                  ))}
                </select>
              )}
              {settings.enhanceMode !== "off" && <EnhanceButton onClick={openEnhancer} disabled={!text.trim()} />}
              <div className="ms-auto flex min-w-0 max-w-full items-center gap-1">
                <span title={t(`chat.modeHint_${info?.mode ?? "normal"}`)} className="flex min-w-0">
                  <Segmented
                    value={info?.mode ?? "normal"}
                    onChange={(mode) => void changeMode(mode)}
                    options={MODES.map((mode) => ({ value: mode, label: t(`chat.mode_${mode}`) }))}
                  />
                </span>
                {working ? (
                  <Button size="sm" variant="danger" icon={Square} onClick={chat.interrupt}>
                    {t("chat.stop")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={Send}
                    onClick={() => send()}
                    disabled={!text.trim() && images.length === 0}
                  >
                    {t("chat.send")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
