import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

function recognitionClass(): (new () => Recognition) | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/**
 * Speak instead of typing (plan.md 11). Uses the browser's own speech recognition; in Chrome the
 * audio is recognised by Google's service, so the tooltip says so. Hidden where the browser has none.
 */
export function MicButton({ onText, className }: { onText: (text: string) => void; className?: string }) {
  const { t, i18n } = useTranslation();
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string>();
  const rec = useRef<Recognition>(undefined);
  const Klass = recognitionClass();
  useEffect(() => () => rec.current?.stop(), []);
  if (!Klass) return null;
  const toggle = () => {
    if (on) {
      rec.current?.stop();
      return;
    }
    setError(undefined);
    const r = new Klass();
    r.lang = i18n.language;
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) onText(text);
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? t("voice.denied") : t("voice.failed"));
    r.onend = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={on ? t("voice.stop") : t("voice.start")}
      aria-pressed={on}
      data-tip={error ?? t("voice.tip")}
      className={cn(
        "rounded-md p-1.5",
        on ? "bg-danger-soft text-danger" : "text-fg-subtle hover:bg-bg-hover hover:text-fg",
        className,
      )}
    >
      {on ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
    </button>
  );
}
