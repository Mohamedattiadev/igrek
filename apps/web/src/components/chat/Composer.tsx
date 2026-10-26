import type { TeamMember } from "@igrek/core";
import { Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { Button } from "../ui";

type Suggestion = { name: string; label: string; ai?: boolean };

/** People whose name starts with what follows the last "@", and Igrek itself as @ai. */
function suggestionsFor(text: string, members: TeamMember[], aiLabel: string): Suggestion[] {
  const typed = text.match(/(?:^|\s)@([\w.-]*)$/)?.[1];
  if (typed === undefined) return [];
  const lower = typed.toLowerCase();
  const people = members
    .filter((m) => m.username.toLowerCase().startsWith(lower) || m.displayName.toLowerCase().startsWith(lower))
    .map((m) => ({ name: m.username, label: m.displayName || m.username }));
  const ai = "ai".startsWith(lower) ? [{ name: "ai", label: aiLabel, ai: true }] : [];
  return [...ai, ...people].slice(0, 6);
}

/**
 * Where a message is written: Enter sends, Shift+Enter is a new line, "@" offers teammates and
 * @ai (Igrek answers in the thread with the writer's own Claude).
 */
export function Composer({
  placeholder,
  members,
  onSend,
  autoFocus,
}: {
  placeholder: string;
  members: TeamMember[];
  onSend: (text: string) => Promise<unknown>;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  // A thread opens with its reply box ready: focused once, when it opens.
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  const suggestions = suggestionsFor(text, members, t("teamChat.aiName"));
  const choose = (s: Suggestion) => {
    setText(text.replace(/@[\w.-]*$/, `@${s.name} `));
    setPicked(0);
    input.current?.focus();
  };
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSend(text.trim());
      setText("");
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setPicked((i) => (i + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
    } else if (suggestions.length && (e.key === "Tab" || e.key === "Enter")) {
      e.preventDefault();
      const s = suggestions[picked];
      if (s) choose(s);
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };
  return (
    <div className="relative">
      {suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label={t("teamChat.mention")}
          className="absolute bottom-full mb-1 w-64 overflow-hidden rounded-ui border border-border bg-bg shadow-ui"
        >
          {suggestions.map((s, i) => (
            <button
              key={s.name}
              type="button"
              role="option"
              aria-selected={i === picked}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-start text-[13px]",
                i === picked ? "bg-bg-active" : "hover:bg-bg-hover",
              )}
            >
              {s.ai && <Sparkles size={13} className="text-accent" aria-hidden="true" />}
              <span className="font-medium">@{s.name}</span>
              <span className="truncate text-fg-subtle">{s.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-border bg-bg px-3 py-2 focus-within:border-accent">
        <textarea
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPicked(0);
          }}
          onKeyDown={onKey}
          rows={Math.min(8, Math.max(1, text.split("\n").length))}
          placeholder={placeholder}
          aria-label={placeholder}
          className="max-h-48 min-h-6 flex-1 resize-none bg-transparent text-[13.5px] leading-relaxed outline-none"
        />
        <Button
          size="sm"
          variant="primary"
          icon={Send}
          disabled={!text.trim() || busy}
          onClick={() => void send()}
          aria-label={t("teamChat.send")}
        />
      </div>
      <p className="mt-1 px-1 text-[11px] text-fg-subtle">{t("teamChat.composerHint")}</p>
    </div>
  );
}
