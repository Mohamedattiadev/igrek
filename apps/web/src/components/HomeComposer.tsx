import { Bot, Send } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

/** What was typed and not sent yet: it waits for the user when they come back (a tester lost hers). */
const DRAFT = "igrek.home.draft";

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
 * One line on the home page to the chief, who knows every project and hands the work to the right
 * one. It replaced a big box with its own project and mode pickers, which testers found out of place.
 */
export function ChiefLine() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [text, setTextState] = useState(readDraft);
  const setText = (value: string) => {
    setTextState(value);
    keepDraft(value);
  };
  const send = () => {
    const value = text.trim();
    if (!value) return;
    keepDraft("");
    void navigate(`/chief?draft=${encodeURIComponent(value)}&send=1`);
  };
  return (
    <form
      data-tour="composer"
      aria-label={t("home.chiefLabel")}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="flex h-10 items-center gap-2 rounded-ui border border-border bg-bg-subtle px-3 focus-within:border-accent"
    >
      <Bot size={16} className="shrink-0 text-accent" aria-hidden="true" />
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("home.chiefPlaceholder")}
        aria-label={t("home.chiefLabel")}
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-subtle"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        aria-label={t("home.chiefSend")}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-accent hover:bg-bg-hover disabled:opacity-40"
      >
        <Send size={14} aria-hidden="true" />
      </button>
    </form>
  );
}
