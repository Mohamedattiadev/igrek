import type { ChatEvent, ChatMode } from "@godeye/core";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  FileEdit,
  FilePlus,
  FileText,
  Globe,
  ImagePlus,
  ListTodo,
  Search,
  Send,
  ShieldQuestion,
  Square,
  SquareTerminal,
  Terminal,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { marked } from "marked";
import { type ClipboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { PromptPicker } from "../components/PromptPicker";
import { Badge, Button, Segmented, StatusDot } from "../components/ui";
import { api } from "../lib/api";
import { lineDiff, useChat } from "../lib/chat";
import { cn } from "../lib/cn";
import { modelName } from "../lib/format";

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
      {pending ? (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => onAnswer("allow")} autoFocus>
            {t("chat.allow")}
          </Button>
          <Button size="sm" onClick={() => onAnswer("always")}>
            {t("chat.always")}
          </Button>
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

/** Chat with Claude in a project (plan.md 2.2): live text, tool cards, approvals as buttons. */
export function ChatPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { chatId = "" } = useParams();
  const chat = useChat(chatId);
  const [text, setText] = useState("");
  const [images, setImages] = useState<{ mediaType: string; data: string; name: string }[]>([]);
  const list = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const info = chat.info;

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every new event
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [chat.events]);

  const send = () => {
    if (!text.trim() && images.length === 0) return;
    chat.send(
      text.trim(),
      images.map(({ mediaType, data }) => ({ mediaType, data })),
    );
    setText("");
    setImages([]);
  };

  const onPaste = async (event: ClipboardEvent) => {
    const files = [...event.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    event.preventDefault();
    setImages([...images, ...(await Promise.all(files.map(readImage)))]);
  };

  const working = info?.status === "working";
  const status = info?.status ?? "idle";
  const tone = status === "working" ? "success" : status === "waiting" ? "warning" : "neutral";

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
                        <p className="mb-1 text-[11px] opacity-80">
                          🖼 {event.images} {t("chat.image")}
                        </p>
                      )}
                      {event.text}
                    </div>
                  </div>
                );
              case "text":
                return (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-bg-muted text-fg-muted">
                      <Bot size={13} />
                    </div>
                    <div className="min-w-0 flex-1 text-[13.5px]">
                      <Markdown text={event.text} />
                    </div>
                  </div>
                );
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
              case "notice":
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
          <div className="rounded-ui border border-border bg-bg p-1.5 focus-within:border-accent">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
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
            <div className="flex items-center gap-1">
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
              <div className="flex-1" />
              <span title={t(`chat.modeHint_${info?.mode ?? "normal"}`)}>
                <Segmented
                  value={info?.mode ?? "normal"}
                  onChange={chat.setMode}
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
                  onClick={send}
                  disabled={!text.trim() && images.length === 0}
                >
                  {t("chat.send")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
