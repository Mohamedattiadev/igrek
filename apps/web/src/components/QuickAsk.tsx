import { findSecrets, type QuickAnswer } from "@igrek/core";
import { Copy, CornerDownLeft, Paperclip, Send, Trash2, X, Zap } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { actions, contextFromPath } from "../lib/actions";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useTerminals } from "../lib/live";
import { EnhanceButton, EnhancePanel } from "./Enhance";
import { MicButton } from "./MicButton";
import { maskSecrets, SecretGuard } from "./SecretGuard";
import { Badge, Kbd, Segmented } from "./ui";

interface Turn {
  q: string;
  a?: string;
  error?: string;
  context?: QuickAnswer["context"];
  attachment?: string;
}

const STORAGE = "igrek.quickAsk";

function loadTurns(key: string): Turn[] {
  try {
    return JSON.parse(localStorage.getItem(`${STORAGE}.${key}`) ?? "[]") as Turn[];
  } catch {
    return [];
  }
}

/**
 * Ctrl+Space side panel (plan.md 2.6): its own little conversation that knows
 * what you're working on, but never writes into the main session.
 */
export function QuickAsk() {
  const { t } = useTranslation();
  const location = useLocation();
  const terminals = useTerminals();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"quick" | "full">("quick");
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<{ name: string; text: string }>();
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string>();
  const [enhancing, setEnhancing] = useState<string>();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const route = contextFromPath(location.pathname);
  const terminal = route.terminalId ? terminals.find((term) => term.id === route.terminalId) : undefined;
  const projectId = route.projectId ?? terminal?.projectId;
  const key = projectId ?? "general";
  const [turns, setTurns] = useState<Turn[]>(() => loadTurns(key));

  useEffect(() => setTurns(loadTurns(key)), [key]);
  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE}.${key}`, JSON.stringify(turns.slice(-30)));
    } catch {
      // Storage full or disabled: history just won't persist.
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, key]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Inside the code editor Ctrl+Space stays autocomplete; Ctrl+Shift+Space works everywhere.
      const inEditor = event.target instanceof Element && !!event.target.closest(".monaco-editor");
      if (event.ctrlKey && event.code === "Space" && (event.shiftKey || !inEditor)) {
        event.preventDefault();
        setOpen((v) => !v);
      } else if (event.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Ctrl+Space pressed in another program, passed on by the desktop app.
    const fromDesktop = () => setOpen(true);
    window.addEventListener("igrek:quick-ask", fromDesktop);
    const off = actions.on("quick-ask", (request) => {
      setOpen(true);
      if (request.attachment) setAttachment(request.attachment);
      if (request.question) setInput(request.question);
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("igrek:quick-ask", fromDesktop);
      off();
    };
  }, [open]);

  // Focus in the same frame the panel appears, so the first keystrokes aren't lost.
  useLayoutEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const [guarded, setGuarded] = useState<string>();
  const ask = async (override?: string, allowSecrets = false) => {
    const question = override ?? input.trim();
    if (!question || busy) return;
    if (!allowSecrets && findSecrets(question).length) {
      setGuarded(question);
      return;
    }
    setGuarded(undefined);
    setInput("");
    setBusy(true);
    const turn: Turn = { q: question, attachment: attachment?.name };
    setTurns((all) => [...all, turn]);
    try {
      const result = await api.quickAsk({
        question,
        projectId,
        sessionId: route.sessionId,
        mode,
        history: turns.filter((x) => x.a).map((x) => ({ q: x.q, a: x.a ?? "" })),
        attachment,
      });
      setTurns((all) => all.map((x) => (x === turn ? { ...x, a: result.answer, context: result.context } : x)));
    } catch (err) {
      setTurns((all) => all.map((x) => (x === turn ? { ...x, error: (err as Error).message } : x)));
    } finally {
      setBusy(false);
      setAttachment(undefined);
    }
  };

  const note = (message: string) => {
    setFlash(message);
    setTimeout(() => setFlash(undefined), 1800);
  };

  const sendToSession = async (text: string) => {
    if (terminal && terminal.status !== "exited") {
      await api.terminalInput(terminal.id, text);
      note(t("quick.sent"));
    } else {
      await navigator.clipboard?.writeText(text);
      note(t("quick.copied"));
    }
  };

  if (!open) return null;
  return (
    <aside className="fixed inset-y-0 end-0 z-40 flex w-[min(420px,100vw)] flex-col border-s border-border bg-bg shadow-ui">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <Zap size={15} className="text-accent" />
        <h2 className="flex-1 text-[13px] font-semibold">{t("quick.title")}</h2>
        <Kbd>Ctrl Space</Kbd>
        <button
          type="button"
          onClick={() => setTurns([])}
          aria-label={t("quick.clear")}
          className="p-1 text-fg-subtle hover:text-fg"
        >
          <Trash2 size={14} />
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("term.close")}
          className="p-1 text-fg-subtle hover:text-fg"
        >
          <X size={15} />
        </button>
      </header>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px] text-fg-muted">
        <Badge tone="accent">{turns.at(-1)?.context?.project ?? (projectId ? "…" : t("quick.noContext"))}</Badge>
        <div className="flex-1" />
        <span title={mode === "full" ? t("quick.fullHint") : undefined}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "quick", label: t("quick.quick") },
              { value: "full", label: t("quick.full") },
            ]}
          />
        </span>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {turns.length === 0 && <p className="py-8 text-center text-[13px] text-fg-subtle">{t("quick.hint")}</p>}
        {turns.map((turn, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: turns are append-only
          <div key={i} className="space-y-1.5">
            <p className="rounded-ui bg-accent-soft px-3 py-2 text-[13px]">
              {turn.attachment && (
                <span className="mb-1 flex items-center gap-1 text-[11px] text-accent">
                  <Paperclip size={11} />
                  {turn.attachment}
                </span>
              )}
              {turn.q}
            </p>
            {turn.a !== undefined ? (
              <div className="group">
                <p className="whitespace-pre-wrap px-1 text-[13px] leading-relaxed">{turn.a}</p>
                <div className="mt-1 flex gap-2 px-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => sendToSession(turn.a ?? "")}
                    className="flex items-center gap-1 text-[11px] text-fg-subtle hover:text-accent"
                  >
                    <CornerDownLeft size={11} />
                    {t("quick.sendToSession")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(turn.a ?? "");
                      note(t("quick.copied"));
                    }}
                    className="flex items-center gap-1 text-[11px] text-fg-subtle hover:text-accent"
                  >
                    <Copy size={11} />
                    {t("quick.copy")}
                  </button>
                </div>
              </div>
            ) : turn.error ? (
              <p className="px-1 text-xs text-danger">{turn.error}</p>
            ) : (
              <p className="flex items-center gap-1.5 px-1 text-xs text-fg-muted">
                <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
                {t("quick.thinking")}
              </p>
            )}
          </div>
        ))}
      </div>
      {flash && <p className="px-3 pb-1 text-center text-[11px] text-success">{flash}</p>}
      <div className="border-t border-border p-2">
        {attachment && (
          <p className="mb-1.5 flex items-center gap-1 px-1 text-[11px] text-accent">
            <Paperclip size={11} />
            {attachment.name}
            <button
              type="button"
              onClick={() => setAttachment(undefined)}
              aria-label={t("chat.removeImage")}
              className="ms-1 text-fg-subtle"
            >
              <X size={11} />
            </button>
          </p>
        )}
        {guarded !== undefined && (
          <SecretGuard
            text={guarded}
            onMask={() => void ask(maskSecrets(guarded), true)}
            onSendAnyway={() => void ask(guarded, true)}
            onCancel={() => setGuarded(undefined)}
          />
        )}
        {enhancing !== undefined && (
          <div className="mb-2">
            <EnhancePanel
              key={enhancing}
              text={enhancing}
              target={{ projectId, sessionId: route.sessionId }}
              onClose={() => setEnhancing(undefined)}
              onUse={(prompt) => {
                setInput(prompt);
                setEnhancing(undefined);
                inputRef.current?.focus();
              }}
            />
          </div>
        )}
        <div className="flex items-end gap-2 rounded-ui border border-border bg-bg-subtle p-1.5 focus-within:border-accent">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask();
              }
            }}
            rows={2}
            placeholder={t("quick.placeholder")}
            className="min-w-0 flex-1 resize-none bg-transparent px-1.5 text-[13px] outline-none placeholder:text-fg-subtle"
          />
          <MicButton onText={(text) => setInput((v) => (v ? `${v} ${text}` : text))} />
          <EnhanceButton onClick={() => input.trim() && setEnhancing(input.trim())} disabled={!input.trim()} />
          <button
            type="button"
            onClick={() => void ask()}
            disabled={!input.trim() || busy}
            aria-label={t("quick.title")}
            className={cn("rounded-md p-1.5", input.trim() && !busy ? "bg-accent text-accent-fg" : "text-fg-subtle")}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
