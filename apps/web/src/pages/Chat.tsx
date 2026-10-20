import {
  type ChatEvent,
  type ChatInfo,
  type ChatMode,
  extractNotebook,
  findSecrets,
  isWeakPrompt,
  STEP_CUT,
  suggestModel,
  type WeakPoint,
} from "@igrek/core";
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Bot,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  CornerDownRight,
  Cpu,
  FileEdit,
  FilePlus,
  FileText,
  Flag,
  FlaskConical,
  Gauge,
  Globe,
  Image as ImageIcon,
  ImagePlus,
  ListChecks,
  ListPlus,
  ListTodo,
  Maximize2,
  MessageSquare,
  MessageSquarePlus,
  Minimize2,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldQuestion,
  Square,
  SquareTerminal,
  Swords,
  Terminal,
  UsersRound,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { type ClipboardEvent, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { BackLink } from "../components/BackLink";
import { ChatCopy } from "../components/ChatCopy";
import { CHAT_MODELS, ChatSettings } from "../components/ChatSettings";
import { SplitPicker } from "../components/ChatSplit";
import { CheckpointRestore } from "../components/CheckpointRestore";
import { EnhanceButton, EnhanceHint, EnhancePanel, PromptCoach } from "../components/Enhance";
import { ExpertCard, ExpertPicker, MentionMenu, useExpertMentions } from "../components/Experts";
import { GateCard } from "../components/GateCard";
import { Markdown } from "../components/Markdown";
import { MicButton } from "../components/MicButton";
import { PromptPicker } from "../components/PromptPicker";
import { maskSecrets, SecretGuard } from "../components/SecretGuard";
import { filterSlash, type SlashItem, SlashMenu, useSlashItems } from "../components/SlashMenu";
import { TodoStrip } from "../components/TodoStrip";
import { Badge, Button, EmptyState, StatusDot } from "../components/ui";
import { actions } from "../lib/actions";
import { api } from "../lib/api";
import { lineDiff, useChat } from "../lib/chat";
import {
  DELEGATE_TOOLS,
  DETAIL_LEVELS,
  type DetailLevel,
  delegatedTo,
  EXPERT_TOOL,
  groupWork,
  workCounts,
} from "../lib/chat-log";
import { cn } from "../lib/cn";
import { compactNumber, modelName } from "../lib/format";
import { warmHighlighter } from "../lib/highlight";
import { usePageActions } from "../lib/page-actions";
import { PersonaIcon, usePersonaLabel, usePersonas } from "../lib/personas";
import { useSettings } from "../lib/settings";
import { latestTodos } from "../lib/todos";
import { useFullscreen } from "../lib/zen";
import { WeakPointList } from "./Meeting";

type Json = Record<string, unknown>;

/** First messages offered on an empty chat, as other chat apps do; picking one only fills the box. */
const STARTERS = [
  { key: "explain", icon: BookOpen },
  { key: "bugs", icon: Bug },
  { key: "tests", icon: FlaskConical },
  { key: "review", icon: Search },
  // Shown only where experts can be asked; it puts "@all" and a question in the box.
  { key: "experts", icon: UsersRound },
] as const;

/** A note on one line of a change, added to the next message (plan.md 16.1). */
interface LineComment {
  file?: string;
  line: string;
  text: string;
}
const CommentContext = createContext<((comment: LineComment) => void) | undefined>(undefined);

function Diff({ before, after, file }: { before: string; after: string; file?: string }) {
  const { t } = useTranslation();
  const lines = useMemo(() => lineDiff(before, after), [before, after]);
  const addComment = useContext(CommentContext);
  const [editing, setEditing] = useState<number>();
  const [draft, setDraft] = useState("");
  return (
    <pre className="max-h-72 overflow-auto rounded-md border border-border bg-bg font-mono text-[11.5px] leading-[1.55]">
      {lines.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no identity
        <div key={i}>
          <div
            className={cn(
              "group flex px-2",
              line.type === "add" && "bg-success-soft text-success",
              line.type === "del" && "bg-danger-soft text-danger",
            )}
          >
            <span className="min-w-0 flex-1 whitespace-pre">
              {line.type === "add" ? "+ " : line.type === "del" ? "- " : "  "}
              {line.text}
            </span>
            {addComment && line.text.trim() && (
              <button
                type="button"
                onClick={() => {
                  setEditing(i);
                  setDraft("");
                }}
                aria-label={t("chat.commentLine")}
                title={t("chat.commentLine")}
                className="shrink-0 text-fg-subtle hover:text-accent focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <MessageSquarePlus size={12} />
              </button>
            )}
          </div>
          {editing === i && addComment && (
            <form
              className="flex gap-1.5 bg-bg-subtle px-2 py-1 font-sans"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) addComment({ file, line: line.text.trim(), text: draft.trim() });
                setEditing(undefined);
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setEditing(undefined)}
                placeholder={t("chat.commentPlaceholder")}
                aria-label={t("chat.commentLine")}
                // biome-ignore lint/a11y/noAutofocus: the user just asked to write a comment
                autoFocus
                className="h-6 min-w-0 flex-1 rounded border border-border bg-bg px-1.5 text-[12px] outline-none focus:border-accent"
              />
              <Button size="sm" type="submit">
                {t("chat.commentAdd")}
              </Button>
            </form>
          )}
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
  const file = typeof input.file_path === "string" ? input.file_path : undefined;
  if (name === "Edit")
    return <Diff file={file} before={String(input.old_string ?? "")} after={String(input.new_string ?? "")} />;
  if (name === "MultiEdit" && Array.isArray(input.edits)) {
    return (
      <div className="space-y-1.5">
        {(input.edits as Json[]).map((edit, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: edits come in order
          <Diff key={i} file={file} before={String(edit.old_string ?? "")} after={String(edit.new_string ?? "")} />
        ))}
      </div>
    );
  }
  if (name === "Write") return <Diff file={file} before="" after={String(input.content ?? "").slice(0, 6000)} />;
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

const DETAIL_KEY = "igrek.chat.detail";

/** How much of the AI's work to show; remembered in this browser, Simple mode starts plain. */
function useDetailLevel(): [DetailLevel, (level: DetailLevel) => void] {
  const { settings } = useSettings();
  const [level, setLevel] = useState<DetailLevel>(() => {
    try {
      const saved = localStorage.getItem(DETAIL_KEY) as DetailLevel | null;
      if (saved && DETAIL_LEVELS.includes(saved)) return saved;
    } catch {
      // Private window: use the default.
    }
    return settings.mode === "simple" ? "plain" : "grouped";
  });
  return [
    level,
    (next) => {
      setLevel(next);
      try {
        localStorage.setItem(DETAIL_KEY, next);
      } catch {
        // Only a convenience.
      }
    },
  ];
}

/** A run of tool calls as one line ("read 3 files, edited 2"); open it for every step (plan.md 16.1). */
function ToolGroup({ tools, cwd, plain }: { tools: ToolEvent[]; cwd?: string; plain: boolean }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const running = tools.find((tool) => tool.status === "running");
  const failed = tools.filter((tool) => tool.status === "error").length;
  const line = workCounts(tools)
    .map(([kind, count]) => t(`chat.log_${kind}`, { count }))
    .join(", ");
  const header = (
    <>
      <ListChecks size={13} className="shrink-0 text-fg-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[12px] text-fg-muted">
        {line.charAt(0).toLocaleUpperCase(i18n.language) + line.slice(1)}
        {running && (
          <span className="ms-1.5 font-mono text-[11.5px] text-fg-subtle">
            · {toolSummary(running.name, (running.input ?? {}) as Json, cwd) || running.name}
          </span>
        )}
      </span>
      {failed > 0 && (
        <span className="flex items-center gap-0.5 text-[11px] text-danger">
          <XCircle size={12} aria-hidden="true" /> {failed}
        </span>
      )}
      {running ? (
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
      ) : (
        !failed && <Check size={12} className="shrink-0 text-success" aria-hidden="true" />
      )}
    </>
  );
  if (plain) return <div className="flex items-center gap-2 px-2.5 py-1">{header}</div>;
  return (
    <div className="rounded-ui border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-start"
      >
        {open ? (
          <ChevronDown size={12} className="shrink-0 text-fg-subtle" />
        ) : (
          <ChevronRight size={12} className="shrink-0 text-fg-subtle" />
        )}
        {header}
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border p-1.5">
          {tools.map((tool) => (
            <ToolCard key={tool.id} event={tool} cwd={cwd} />
          ))}
        </div>
      )}
    </div>
  );
}

type ToolEvent = Extract<ChatEvent, { kind: "tool" }>;

function ToolCard({ event, cwd }: { event: ToolEvent; cwd?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(event.name === "TodoWrite");
  const Icon = toolIcon(event.name);
  const input = (event.input ?? {}) as Json;
  return (
    <div className={"rounded-ui border border-border bg-bg-subtle"}>
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
                {event.result === STEP_CUT ? t("chat.stepCut") : event.result}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

type Question = {
  question: string;
  header?: string;
  options?: { label: string; description?: string }[];
  multiSelect?: boolean;
};

/** Claude asks with AskUserQuestion: options to pick, or your own answer (plan.md 16.1). */
function QuestionCard({
  event,
  ended,
  onAnswer,
}: {
  event: Extract<ChatEvent, { kind: "permission" }>;
  ended: boolean;
  onAnswer: (decision: "allow" | "deny", message?: string, answers?: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  const questions = ((event.input as Json | undefined)?.questions as Question[] | undefined) ?? [];
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const pending = event.status === "pending" && !ended;
  const answerOf = (q: Question) =>
    [...(picked[q.question] ?? []), ...(other[q.question]?.trim() ? [other[q.question]?.trim() ?? ""] : [])].join(", ");
  const complete = questions.length > 0 && questions.every((q) => answerOf(q));
  const pick = (q: Question, label: string) => {
    const now = picked[q.question] ?? [];
    setPicked({
      ...picked,
      [q.question]: q.multiSelect ? (now.includes(label) ? now.filter((l) => l !== label) : [...now, label]) : [label],
    });
    if (!q.multiSelect) setOther({ ...other, [q.question]: "" });
  };
  return (
    <div
      className={cn(
        "space-y-3 rounded-ui border p-3",
        pending ? "border-accent bg-accent-soft/40" : "border-border opacity-70",
      )}
    >
      <p className="flex items-center gap-2 text-[12.5px] font-semibold">
        <MessageSquare size={14} className="text-accent" aria-hidden="true" />
        {t("chat.asks")}
      </p>
      {questions.map((q) => (
        <fieldset key={q.question} className="space-y-1.5" disabled={!pending}>
          <legend className="text-[13px]">
            {q.header && <Badge>{q.header}</Badge>} <span className="font-medium">{q.question}</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {(q.options ?? []).map((o) => {
              const on = picked[q.question]?.includes(o.label) ?? false;
              return (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(q, o.label)}
                  data-tip={o.description}
                  className={cn(
                    "rounded-ui border px-2.5 py-1 text-start text-[12.5px]",
                    on ? "border-accent bg-accent text-accent-fg" : "border-border bg-bg hover:border-accent",
                  )}
                >
                  {o.label}
                  {o.description && <span className="block text-[11px] opacity-75">{o.description}</span>}
                </button>
              );
            })}
          </div>
          <input
            value={other[q.question] ?? ""}
            onChange={(e) => {
              setOther({ ...other, [q.question]: e.target.value });
              if (!q.multiSelect && e.target.value) setPicked({ ...picked, [q.question]: [] });
            }}
            placeholder={t("chat.askOther")}
            aria-label={`${q.question} ${t("chat.askOther")}`}
            className="h-7 w-full max-w-md rounded-md border border-border bg-bg px-2 text-[12.5px] outline-none focus:border-accent"
          />
        </fieldset>
      ))}
      {pending ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={!complete}
            onClick={() =>
              onAnswer("allow", undefined, Object.fromEntries(questions.map((q) => [q.question, answerOf(q)])))
            }
          >
            {t("chat.askSend")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAnswer("deny", "The user skipped the question.")}>
            {t("chat.askSkip")}
          </Button>
        </div>
      ) : event.status === "pending" ? (
        <p className="text-xs text-fg-muted">{t("chat.permissionEnded")}</p>
      ) : (
        <Badge tone={event.status === "allowed" ? "success" : "neutral"}>
          {event.status === "allowed" ? t("chat.askAnswered") : t("chat.askSkipped")}
        </Badge>
      )}
    </div>
  );
}

/**
 * The project has its own hooks, MCP servers or skills that this chat left out (plan.md 16.4):
 * say what they are, and trust them to start again with them.
 */
function TrustBanner({ info, go }: { info: ChatInfo; go: (chatId: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ext = info.untrusted;
  if (!ext) return null;
  const parts = [
    ext.hooks.length ? t("trust.hooks", { count: ext.hooks.length }) : "",
    ext.mcpServers.length ? t("trust.mcp", { count: ext.mcpServers.length }) : "",
    ext.skills.length ? t("trust.skills", { count: ext.skills.length }) : "",
  ].filter(Boolean);
  return (
    <div className="shrink-0 border-b border-warning bg-warning-soft px-4 py-2 text-[12.5px]">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
        <ShieldAlert size={14} className="shrink-0 text-warning" aria-hidden="true" />
        <span className="min-w-0 flex-1">{t("trust.left", { what: parts.join(", ") })}</span>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {t("trust.show")}
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.setProjectTrust(info.projectId, true);
              // Pick the conversation up again; a session Igrek has not read yet starts fresh.
              const next = await api
                .startChat({ projectId: info.projectId, resume: info.sessionId })
                .catch(() => api.startChat({ projectId: info.projectId }));
              void api.closeChat(info.id).catch(() => undefined);
              go(next.id);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("trust.trust")}
        </Button>
      </div>
      {open && (
        <ul className="mx-auto mt-1.5 max-w-3xl space-y-0.5 font-mono text-[11.5px] text-fg-muted">
          {[...ext.hooks, ...ext.mcpServers.map((m) => `MCP: ${m}`), ...ext.skills.map((s) => `skill: ${s}`)].map(
            (line) => (
              <li key={line} className="truncate">
                {line}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

/** "15:30" in the interface's language. */
function clockTime(at: number, lang: string): string {
  return new Date(at).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
}

/** How full the AI's working memory is, and how long since its last answer (plan.md 16.1). */
function ContextMeter({ context }: { context: NonNullable<ChatInfo["context"]> }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const fill = Math.min(1, context.tokens / context.window);
  const minutes = Math.floor((now - context.at) / 60_000);
  const cold = minutes >= 5;
  return (
    <span
      className="hidden items-center gap-1.5 sm:flex"
      data-tip={`${t("chat.contextTip", {
        used: compactNumber(context.tokens),
        window: compactNumber(context.window),
        cached: compactNumber(context.cacheRead),
      })} ${t("chat.cacheTip", { count: minutes })}`}
    >
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-bg-muted">
        <span
          className={cn(
            "block h-full rounded-full",
            fill >= 0.8 ? "bg-danger" : fill >= 0.5 ? "bg-warning" : "bg-success",
          )}
          style={{ width: `${Math.max(3, Math.round(fill * 100))}%` }}
        />
      </span>
      <span className="text-[11px] text-fg-subtle">
        {t("chat.context", { pct: Math.round(fill * 100) })}
        {cold && <span className="ms-1 text-warning">· {t("chat.cacheCold")}</span>}
      </span>
    </span>
  );
}

function PermissionCard({
  event,
  ended,
  onAnswer,
}: {
  event: Extract<ChatEvent, { kind: "permission" }>;
  /** The chat's process is gone: a pending request can no longer be answered. */
  ended: boolean;
  onAnswer: (decision: "allow" | "deny" | "always" | "project", message?: string) => void;
}) {
  const { t } = useTranslation();
  const input = (event.input ?? {}) as Json;
  const pending = event.status === "pending" && !ended;
  const [why, setWhy] = useState<string>();
  return (
    <div
      className={cn(
        "space-y-2 rounded-ui border p-3",
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
      {pending && why !== undefined ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onAnswer("deny", why.trim() || undefined);
          }}
        >
          <input
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder={t("chat.denyWhyPlaceholder")}
            aria-label={t("chat.denyWhy")}
            // biome-ignore lint/a11y/noAutofocus: the user just asked to write a reason
            autoFocus
            className="h-7 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-[12.5px] outline-none focus:border-accent"
          />
          <Button size="sm" type="submit">
            {t("chat.deny")}
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setWhy(undefined)}>
            {t("persona.cancel")}
          </Button>
        </form>
      ) : pending ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => onAnswer("allow")} autoFocus>
            {t("chat.allow")}
          </Button>
          {!event.guard && (
            <Button size="sm" onClick={() => onAnswer("always")} data-tip={t("chat.alwaysTip")}>
              {t("chat.always")}
            </Button>
          )}
          {!event.guard && event.rule && (
            <Button
              size="sm"
              onClick={() => onAnswer("project")}
              data-tip={t("chat.alwaysProjectTip", { rule: event.rule })}
            >
              {t("chat.alwaysProject")}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onAnswer("deny")}>
            {t("chat.deny")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setWhy("")}>
            {t("chat.denyWhy")}
          </Button>
        </div>
      ) : event.status === "pending" ? (
        <p className="text-xs text-fg-muted">{t("chat.permissionEnded")}</p>
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
      <div>
        <WeakPointList points={points} />
      </div>
    );
  return (
    <div>
      <Button
        usesModel
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
const HEADER_ICON = "rounded-full p-1.5 text-fg-subtle hover:bg-bg-hover hover:text-fg";

interface PaneProps {
  chatId: string;
  /** The left (or only) chat: it owns the page's shortcuts and the "send to chat" buttons. */
  primary: boolean;
  draft?: string;
  autoSend?: boolean;
  /** Put another chat in this pane's place (a restart on a new model, persona or mode). */
  go: (chatId: string, draft?: string) => void;
  /** Two chats side by side: open a second one, or close this one. */
  split?: () => void;
  close?: () => void;
}

function ChatPane({ chatId, primary, draft, autoSend: sendDraft, go, split, close }: PaneProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const chat = useChat(chatId);
  const [full, toggleFull] = useFullscreen();
  const [comments, setComments] = useState<LineComment[]>([]);
  // A button in an answer (OpenUI) asks a follow-up in this chat.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one listener per chat
  useEffect(() => (primary ? actions.onSendToChat((text) => text && chat.send(text)) : undefined), [chatId]);
  const [detail, setDetail] = useDetailLevel();
  usePageActions(
    primary
      ? [
          { id: "chat-stop", label: t("chat.stop"), icon: Square, keys: "Mod+.", run: chat.interrupt },
          { id: "chat-compact", label: t("chat.compact"), icon: Minimize2, run: () => chat.send("/compact") },
          {
            id: "chat-detail",
            label: t("chat.detailNext"),
            icon: ListChecks,
            keys: "Alt+D",
            run: () =>
              setDetail(DETAIL_LEVELS[(DETAIL_LEVELS.indexOf(detail) + 1) % DETAIL_LEVELS.length] ?? "grouped"),
          },
        ]
      : undefined,
  );
  // The plan sits pinned above the box (TodoStrip), so its updates stay out of the conversation.
  const todos = useMemo(() => latestTodos(chat.events), [chat.events]);
  const units = useMemo(
    () =>
      groupWork(
        chat.events.filter((e) => !(e.kind === "tool" && e.name === "TodoWrite")),
        detail,
      ),
    [chat.events, detail],
  );
  // Answers often carry code: have the highlighter ready before the first block arrives.
  useEffect(() => warmHighlighter(), []);
  const info = chat.info;
  // A prompt prepared elsewhere (a "Fix" button) waits in the box; nothing is sent until the user does.
  const [text, setText] = useState(draft ?? "");
  /** Typed on the home page and sent from there: goes out once the chat is ready. */
  const [autoSend, setAutoSend] = useState(!!sendDraft);
  const { settings } = useSettings();
  const slashItems = useSlashItems(chat.info?.projectId);
  const slashMatches = filterSlash(slashItems, text);
  const [slashActive, setSlashActive] = useState(0);
  const pickSlash = (item: SlashItem) => {
    setText(item.insert);
    setSlashActive(0);
  };
  const suggestedModel = text.trim() ? suggestModel(text) : undefined;
  const currentModel = CHAT_MODELS.find((m) => m && info?.model?.includes(m));
  /** Restart on the suggested model, keeping the session (if any) and the typed text. */
  const switchModel = async (model: string) => {
    if (!info) return;
    if (info.sessionId) {
      const next = await api.chatModel(info.id, model);
      go(next.id, text);
    } else {
      const next = await api.startChat({ projectId: info.projectId, model, mode: info.mode });
      void api.closeChat(info.id).catch(() => undefined);
      go(next.id, text);
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
        go(next.id, text);
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
  const input = useRef<HTMLTextAreaElement>(null);
  // "@" brings in an expert, only where experts can be asked: not inside a persona's own chat.
  const mentions = useExpertMentions(text, setText, input, settings.consultExperts && !info?.persona);
  const fileInput = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every new event
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [chat.events]);

  const openEnhancer = () => text.trim() && setEnhancing(text.trim());
  const send = (override?: string, allowSecrets = false, how: "queue" | "steer" = "queue") => {
    const typed = override ?? text.trim();
    // Comments on diff lines go with the next message, file and line first.
    const value = comments.length
      ? [
          typed,
          `${t("chat.commentsHeader")}\n${comments
            .map((c) => `- ${c.file ? `${c.file}, ` : ""}\`${c.line.slice(0, 200)}\`: ${c.text}`)
            .join("\n")}`,
        ]
          .filter(Boolean)
          .join("\n\n")
      : typed;
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
      how,
    );
    setText("");
    setImages([]);
    setComments([]);
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
    go(next.id, text);
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
                  go(next.id);
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

  const empty = chat.events.length === 0;
  const composer = (
    <div className="mx-auto w-full max-w-3xl space-y-2">
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
            target={{
              projectId: info.projectId,
              sessionId: info.sessionId,
              tool: "claude",
              personaId: info.persona?.id,
            }}
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
      <MentionMenu items={mentions.items} active={mentions.active} onPick={mentions.pick} />
      {todos && <TodoStrip todos={todos} working={working} />}
      {info?.limit && !working && (
        <div className="mb-1.5 flex flex-wrap items-center gap-2 rounded-ui border border-danger bg-danger-soft px-2.5 py-1.5 text-[12.5px]">
          <Gauge size={14} className="shrink-0 text-danger" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {info.limit.resumeAt
              ? t("chat.limitResumes", { time: clockTime(info.limit.resumeAt, i18n.language) })
              : info.limit.resetsAt
                ? t("chat.limitResets", { time: clockTime(info.limit.resetsAt, i18n.language) })
                : t("chat.limitHit")}
          </span>
          {info.limit.resumeAt ? (
            <Button size="sm" variant="ghost" onClick={chat.cancelResume}>
              {t("chat.limitCancel")}
            </Button>
          ) : (
            info.limit.resetsAt && (
              <Button size="sm" onClick={() => chat.resumeAtReset(t("chat.limitResumeText"))}>
                {t("chat.limitResume")}
              </Button>
            )
          )}
          <Link to="/limits" className="shrink-0 text-[12px] text-accent-hover underline">
            {t("chat.limitOther")}
          </Link>
        </div>
      )}
      {info?.context && info.context.tokens / info.context.window >= 0.7 && !working && (
        <div className="mb-1.5 flex flex-wrap items-center gap-2 rounded-ui border border-warning bg-warning-soft px-2.5 py-1.5 text-[12.5px]">
          <span className="min-w-0 flex-1">
            {t("chat.compactHint", { pct: Math.round((info.context.tokens / info.context.window) * 100) })}
          </span>
          <Button size="sm" onClick={() => chat.send("/compact")}>
            {t("chat.compact")}
          </Button>
        </div>
      )}
      {comments.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {comments.map((c, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: comments are only added and removed here
              key={i}
              className="flex max-w-full items-center gap-1 rounded-full border border-border bg-bg ps-2.5 pe-1 text-[12px]"
            >
              <MessageSquarePlus size={12} className="shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0 truncate">
                <code className="font-mono text-[11px]">{c.line.slice(0, 40)}</code> {c.text}
              </span>
              <button
                type="button"
                onClick={() => setComments((all) => all.filter((_, j) => j !== i))}
                aria-label={t("chat.commentRemove")}
                title={t("chat.commentRemove")}
                className="shrink-0 rounded-full p-0.5 text-fg-subtle hover:text-danger"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {info?.queued && info.queued.length > 0 && (
        <div className="mb-1.5 rounded-ui border border-border bg-bg-subtle p-1.5">
          <p className="flex items-center gap-1.5 px-1 pb-1 text-[11px] font-medium text-fg-subtle">
            <ListPlus size={12} aria-hidden="true" />
            {working ? t("chat.queuedWhile") : t("chat.queuedIdle")}
          </p>
          {info.queued.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-[12.5px] hover:bg-bg-hover">
              <span className="min-w-0 flex-1 truncate">
                {item.images > 0 && <ImageIcon size={12} className="me-1 inline text-fg-subtle" aria-hidden="true" />}
                {item.text}
              </span>
              <button
                type="button"
                onClick={() => chat.sendQueued(item.id)}
                className="shrink-0 rounded px-1.5 py-0.5 text-[11.5px] text-accent-hover hover:bg-bg-active"
              >
                {working ? t("chat.steer") : t("chat.send")}
              </button>
              <button
                type="button"
                onClick={() => chat.unqueue(item.id)}
                aria-label={t("chat.unqueue")}
                title={t("chat.unqueue")}
                className="shrink-0 text-fg-subtle hover:text-danger"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-3xl border border-border bg-bg-subtle px-2.5 pt-2.5 pb-2 shadow-[0_2px_16px_rgb(0_0_0/0.08)] transition-colors focus-within:border-fg-subtle">
        <textarea
          ref={input}
          // biome-ignore lint/a11y/noAutofocus: the box is what an empty chat is for, as in other chat apps
          autoFocus={empty}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            mentions.track(e);
          }}
          onSelect={mentions.track}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (mentions.onKeyDown(e)) return;
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
          rows={Math.min(10, Math.max(empty ? 2 : 1, text.split("\n").length))}
          placeholder={t("chat.placeholder")}
          disabled={info?.status === "exited"}
          className="w-full resize-none bg-transparent px-2 py-1 text-[14.5px] leading-relaxed outline-none placeholder:text-fg-subtle"
        />
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label={t("chat.image")}
            title={t("chat.image")}
            className="rounded-full p-1.5 text-fg-subtle hover:bg-bg-hover hover:text-fg"
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
          {settings.consultExperts && !info?.persona && (
            <ExpertPicker
              onMeeting={() =>
                void navigate(
                  `/personas?${new URLSearchParams({ tab: "meetings", question: text.trim(), project: info?.projectId ?? "" })}`,
                )
              }
              onPick={(mention) => {
                setText((v) => (v.includes(mention) ? v : v ? `${v.trimEnd()} ${mention} ` : `${mention} `));
                input.current?.focus();
              }}
            />
          )}
          <MicButton onText={(spoken) => setText((v) => (v ? `${v} ${spoken}` : spoken))} />
          {settings.enhanceMode !== "off" && <EnhanceButton onClick={openEnhancer} disabled={!text.trim()} />}
          <div className="ms-auto flex min-w-0 max-w-full items-center gap-1">
            <ChatSettings
              info={info}
              fresh={!!info && !info.sessionId && chat.events.length === 0}
              detail={detail}
              onDetail={setDetail}
              onMode={(mode) => void changeMode(mode)}
              onModel={(model) => void switchModel(model)}
              onPersona={(id) => void switchPersona(id)}
            />
            {working ? (
              <>
                {(text.trim() || images.length > 0) && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={CornerDownRight}
                      onClick={() => send(undefined, false, "steer")}
                      data-tip={t("chat.steerTip")}
                    >
                      <span className="hidden sm:inline">{t("chat.steer")}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={ListPlus}
                      onClick={() => send()}
                      data-tip={t("chat.queueTip")}
                    >
                      <span className="hidden sm:inline">{t("chat.queue")}</span>
                    </Button>
                  </>
                )}
                <button
                  type="button"
                  onClick={chat.interrupt}
                  aria-label={t("chat.stop")}
                  title={t("chat.stop")}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fg text-bg transition-opacity hover:opacity-85"
                >
                  <Square size={12} fill="currentColor" aria-hidden="true" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => send()}
                disabled={!text.trim() && images.length === 0 && comments.length === 0}
                aria-label={t("chat.send")}
                title={t("chat.send")}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fg text-bg transition-opacity hover:opacity-85 disabled:cursor-default disabled:opacity-25"
              >
                <ArrowUp size={16} strokeWidth={2.4} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        <BackLink
          to={info ? `/p/${info.projectId}` : "/terminals"}
          className="text-fg-subtle hover:text-fg"
          aria-label={t("term.project")}
        >
          <ArrowLeft size={15} className="rtl:rotate-180" />
        </BackLink>
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
        {info?.context && <ContextMeter context={info.context} />}
        <span className="text-[11px] text-fg-subtle">{t(`chat.${status}`)}</span>
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
              void navigate(`/t/${term.id}`);
            }}
          >
            <span className="hidden lg:inline">{t("chat.openInTerminal")}</span>
          </Button>
        )}
        {split && (
          <button
            type="button"
            onClick={split}
            aria-label={t("chat.split")}
            data-tip={t("chat.split")}
            className={HEADER_ICON}
          >
            <Columns2 size={15} aria-hidden="true" />
          </button>
        )}
        {primary && (
          <button
            type="button"
            onClick={toggleFull}
            aria-label={full ? t("chat.fullscreenExit") : t("chat.fullscreen")}
            data-tip={full ? t("chat.fullscreenExit") : t("chat.fullscreen")}
            className={HEADER_ICON}
          >
            {full ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
          </button>
        )}
        {close && (
          <button
            type="button"
            onClick={close}
            aria-label={t("chat.closePane")}
            data-tip={t("chat.closePane")}
            className={HEADER_ICON}
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </header>
      {info?.worktree && <ChatCopy info={info} />}
      {info?.untrusted && <TrustBanner info={info} go={go} />}

      <CommentContext.Provider
        value={(c) => {
          const cwd = info?.cwd;
          const file = cwd && c.file?.startsWith(`${cwd}/`) ? c.file.slice(cwd.length + 1) : c.file;
          setComments((all) => [...all, { ...c, file }]);
        }}
      >
        {empty ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-[12vh]">
            <div className="w-full max-w-3xl">
              <div className="mb-7 text-center">
                {persona ? (
                  <PersonaIcon persona={persona} size={18} className="mx-auto mb-4 size-10 rounded-full" />
                ) : (
                  <Bot size={30} className="mx-auto mb-4 text-fg-subtle" aria-hidden="true" />
                )}
                <h2 className="text-[26px] font-semibold tracking-tight">{t("chat.empty")}</h2>
                <p className="mx-auto mt-2 max-w-md text-[13.5px] text-fg-muted">{t("chat.emptyBody")}</p>
              </div>
              {composer}
              {info?.status !== "exited" && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {STARTERS.filter(({ key }) => key !== "experts" || (settings.consultExperts && !info?.persona)).map(
                    ({ key, icon: Icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setText(key === "experts" ? t("chat.starterText_experts") : t(`chat.starter_${key}`));
                          input.current?.focus();
                        }}
                        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12.5px] text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
                      >
                        <Icon size={13} aria-hidden="true" />
                        {t(`chat.starter_${key}`)}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div ref={list} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
              {units.map((unit) => {
                if (unit.kind === "group")
                  return <ToolGroup key={unit.id} tools={unit.tools} cwd={info?.cwd} plain={detail === "plain"} />;
                const event = unit.event;
                switch (event.kind) {
                  case "user":
                    return (
                      <div key={event.id} className="flex justify-end">
                        <div className="max-w-[80%] whitespace-pre-wrap rounded-3xl bg-bg-muted px-4 py-2.5 text-[14px] leading-relaxed text-fg">
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
                    // A persona's notebook block is for Igrek, not for reading.
                    const shown = info?.persona ? extractNotebook(event.text).text : event.text;
                    const isLast = event.id === lastText?.id && lastIsAnswer;
                    return (
                      <div key={event.id} className="space-y-2">
                        <div className="min-w-0">
                          {persona && (
                            <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-fg-muted">
                              <PersonaIcon persona={persona} size={11} className="size-5 rounded-full" />
                              {personaName}
                            </p>
                          )}
                          <Markdown text={shown} streaming={working && event.id === lastText?.id} />
                        </div>
                        {isLast && info && shown.length > 300 && info.persona?.id !== "devils-advocate" && (
                          <WeakPointsButton key={event.id} text={shown} projectId={info.projectId} />
                        )}
                      </div>
                    );
                  }
                  case "tool":
                    if (event.name === EXPERT_TOOL) return <ExpertCard key={event.id} event={event} />;
                    if (DELEGATE_TOOLS.has(event.name) && personas.some((p) => p.id === delegatedTo(event)))
                      return <ExpertCard key={event.id} event={event} delegated />;
                    return <ToolCard key={event.id} event={event} cwd={info?.cwd} />;
                  case "permission":
                    if (event.toolName === "AskUserQuestion")
                      return (
                        <QuestionCard
                          key={event.id}
                          event={event}
                          ended={info?.status === "exited"}
                          onAnswer={(d, message, answers) => chat.answer(event.requestId, d, message, answers)}
                        />
                      );
                    return (
                      <PermissionCard
                        key={event.id}
                        event={event}
                        ended={info?.status === "exited"}
                        onAnswer={(d, message) => chat.answer(event.requestId, d, message)}
                      />
                    );
                  case "result":
                    return (
                      <p key={event.id} className={cn("text-[11px]", event.isError ? "text-danger" : "text-fg-subtle")}>
                        {event.isError
                          ? `${t("chat.failed")}${event.text ? `: ${event.text.replace(/\|\d{10}\b/, "")}` : ""}`
                          : t("chat.done", { s: ((event.durationMs ?? 0) / 1000).toFixed(1) })}
                      </p>
                    );
                  case "checkpoint":
                    return (
                      <div key={event.id} className="flex items-center justify-end gap-2 text-[11px] text-fg-subtle">
                        <span className="flex items-center gap-1">
                          <Flag size={11} aria-hidden="true" /> {t("checkpoint.saved")}
                        </span>
                        <CheckpointRestore
                          compact
                          busy={working}
                          projectId={event.projectId}
                          checkpointId={event.checkpointId}
                        />
                      </div>
                    );
                  case "gate":
                    return <GateCard key={event.id} event={event} onSend={(text) => chat.send(text)} />;
                  case "notice":
                    if (event.code === "history")
                      return (
                        <div key={event.id} className="flex items-center gap-3 py-1 text-[11.5px] text-fg-subtle">
                          <span className="h-px flex-1 bg-border" />
                          {t("chat.notice_history", { count: Number(event.text) || 0 })}
                          <span className="h-px flex-1 bg-border" />
                        </div>
                      );
                    if (event.code === "loop")
                      return (
                        <p
                          key={event.id}
                          className="flex items-start gap-2 rounded-md border border-warning bg-warning-soft p-2 text-xs"
                        >
                          <RotateCcw size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                          <span className="min-w-0 flex-1">{t("chat.notice_loop", { tool: event.text })}</span>
                          <button
                            type="button"
                            onClick={chat.interrupt}
                            className="shrink-0 font-medium text-warning underline"
                          >
                            {t("chat.stop")}
                          </button>
                        </p>
                      );
                    if (event.code === "notebook" || event.code === "notebookRejected")
                      return (
                        <p key={event.id} className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
                          <BookOpen size={12} aria-hidden="true" />
                          {t(`chat.notice_${event.code}`, { count: Number(event.text) || 1 })}
                        </p>
                      );
                    if (event.code)
                      return (
                        <p
                          key={event.id}
                          className="flex items-start gap-2 rounded-md border border-warning bg-warning-soft p-2 text-xs"
                        >
                          <ShieldAlert size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                          {t(`chat.notice_${event.code}`)}
                        </p>
                      );
                    return (
                      <pre
                        key={event.id}
                        className="whitespace-pre-wrap rounded-md bg-danger-soft p-2 font-mono text-[11px] text-danger"
                      >
                        {event.text}
                      </pre>
                    );
                  default:
                    return null;
                }
              })}
              {working && (
                <p className="flex items-center gap-2 text-xs text-fg-muted" aria-live="polite">
                  <span className="flex gap-1" aria-hidden="true">
                    <span className="size-1.5 animate-bounce rounded-full bg-fg-subtle [animation-delay:-0.3s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-fg-subtle [animation-delay:-0.15s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-fg-subtle" />
                  </span>
                  {t("chat.working")}
                </p>
              )}
            </div>
          </div>
        )}
      </CommentContext.Provider>

      {!empty && <footer className="shrink-0 px-4 pt-1 pb-4">{composer}</footer>}
    </div>
  );
}

/** `/c/<id>` with the chat beside it (`?with=<id>`) and the text each box should start with. */
function chatUrl(left: string, right?: string, drafts: { left?: string; right?: string } = {}): string {
  const query = new URLSearchParams();
  if (right) query.set("with", right);
  if (drafts.left) query.set("draft", drafts.left);
  if (drafts.right) query.set("draft2", drafts.right);
  const rest = query.toString();
  return `/c/${left}${rest ? `?${rest}` : ""}`;
}

/** One chat, or two side by side (`?with=`): each keeps its own box, shortcuts stay with the left one. */
export function ChatPage() {
  const { chatId = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const other = params.get("with") ?? undefined;
  const [picking, setPicking] = useState(false);
  // Drafts and "send" are read once by the box they belong to, then leave the address.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the address changes
  useEffect(() => {
    if (params.has("draft") || params.has("draft2") || params.has("send"))
      void navigate(chatUrl(chatId, other), { replace: true });
  }, [params]);
  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatPane
          key={chatId}
          chatId={chatId}
          primary
          draft={params.get("draft") ?? undefined}
          autoSend={params.get("send") === "1"}
          go={(id, draft) => void navigate(chatUrl(id, other, { left: draft }), { replace: true })}
          split={other ? undefined : () => setPicking(true)}
        />
      </div>
      {other && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-border border-t lg:border-t-0 lg:border-s">
          <ChatPane
            key={other}
            chatId={other}
            primary={false}
            draft={params.get("draft2") ?? undefined}
            go={(id, draft) => void navigate(chatUrl(chatId, id, { right: draft }), { replace: true })}
            close={() => void navigate(chatUrl(chatId))}
          />
        </div>
      )}
      <SplitPicker
        open={picking}
        current={chatId}
        onClose={() => setPicking(false)}
        onPick={(id) => {
          setPicking(false);
          void navigate(chatUrl(chatId, id));
        }}
      />
    </div>
  );
}
